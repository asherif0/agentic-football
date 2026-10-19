import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store";
import { seed } from "../lib/seed";
import {
  ROLES,
  PHASES,
  DIMENSIONS,
  compareConditions,
  summarize,
  promptDiff,
  latestAnnotations,
} from "../lib/domain";
import { manualPortal } from "../lib/portal";
function fixture() {
  const s = createStore(":memory:");
  s.initialize();
  return s;
}
function experiment(
  s: ReturnType<typeof fixture>,
  teamId = "team-baseline",
  synthetic = true,
  overrides: any = {},
) {
  return s.save("experiments", {
    label: "Controlled match",
    teamId,
    comparatorTeamId: null,
    opponent: "Benchmark FC",
    models: Object.fromEntries(ROLES.map((r) => [r, "fixed-model"])),
    setup: "Same starting setup",
    shouts: "",
    variable: "Baseline",
    expectedOutcome: "Observe execution",
    hypothesisIds: [],
    synthetic,
    ...overrides,
  });
}
function match(
  s: ReturnType<typeof fixture>,
  experimentId: string,
  synthetic = true,
  overrides: any = {},
) {
  return s.save("matches", {
    label: "Match",
    experimentId,
    synthetic,
    goalsFor: null,
    goalsAgainst: null,
    shotsFor: null,
    shotsAgainst: null,
    onTargetFor: null,
    onTargetAgainst: null,
    dangerousTurnovers: null,
    replayUrl: "",
    attachmentIds: [],
    ...overrides,
  });
}
test("seed preserves original five prompts and has no evidence or champions", () => {
  const s = fixture(),
    w = s.read();
  assert.equal(w.prompts.length, 10);
  assert.equal(w.decisions.length, 0);
  assert.equal(w.matches.length, 0);
  assert(w.prompts.every((p) => p.text.length < 6000));
  assert.equal(w.sources.length, 5);
  s.db.close();
});
test("immutable history and reference validation", () => {
  const s = fixture(),
    w = s.read();
  assert.throws(() => s.save("prompts", w.prompts[0]));
  assert.throws(
    () =>
      s.save("teams", {
        label: "Bad",
        formationId: "formation-112-r1",
        promptIds: { GK: "baseline-GK" },
      }),
    /Unknown prompts/,
  );
  assert.throws(
    () =>
      s.save("prompts", {
        ...w.prompts[0],
        id: "long",
        text: "x".repeat(6001),
      }),
    /6,000/,
  );
  s.db.close();
});
test("activation rejects incomplete phase duties", () => {
  const s = fixture(),
    f = structuredClone(s.read().formations[0]);
  delete f.roles.MID.phases[PHASES[0]];
  assert.throws(
    () => s.save("formations", { ...f, id: "bad", family: "bad" }),
    /MID/,
  );
  s.db.close();
});
test("2-1-1 and 3-0-1 work entirely through configuration with fresh prompts and teams", () => {
  const s = fixture();
  for (const family of ["2-1-1", "3-0-1"]) {
    const original = s.read().formations[0];
    const f = s.save("formations", {
      ...original,
      id: `formation-${family}`,
      family,
      name: family,
      parentId: original.id,
      compatibility: "unconfirmed",
      questions: [
        { id: `${family}-cover`, role: "DEF", text: "Did cover remain?" },
      ],
    });
    const promptIds: any = {};
    for (const r of ROLES) {
      const p = s.save("prompts", {
        label: `${family} ${r}`,
        role: r,
        formationId: f.id,
        parentId: `baseline-${r}`,
        text: `Role for ${family}: ${r}`,
        rationale: "Copied provenance; fresh testing needed",
        hypothesisIds: [],
        status: "draft",
      });
      promptIds[r] = p.id;
    }
    const t = s.save("teams", {
      label: family,
      formationId: f.id,
      parentId: null,
      promptIds,
    });
    const e = experiment(s, t.id);
    const m = match(s, e.id);
    s.save("annotations", {
      matchId: m.id,
      timestamp: "00:12",
      role: "DEF",
      phase: PHASES[3],
      observation: "Cover held",
      diagnosis: "Synthetic check",
      scores: { Security: 2, [`${family}-cover`]: 1 },
      evidenceIds: [],
    });
    assert.equal(manualPortal.prepare(e, s.read()).ready, false);
    assert.equal(
      s.read().decisions.filter((d) => d.family === family).length,
      0,
    );
    assert.equal(summarize(t.id, s.read()).results.matches, 0);
  }
  s.db.close();
});
test("prompts and hypotheses cannot cross formation revisions", () => {
  const s = fixture();
  const f = s.save("formations", {
    ...s.read().formations[0],
    id: "r2",
    revision: 2,
    parentId: "formation-112-r1",
  });
  assert.throws(
    () =>
      s.save("teams", {
        label: "Bad revision",
        formationId: f.id,
        promptIds: s.read().teams[0].promptIds,
      }),
    /Invalid GK/,
  );
  assert.throws(
    () =>
      s.save("prompts", {
        ...s.read().prompts[0],
        id: "bad-hypothesis",
        hypothesisIds: ["h-MID"],
      }),
    /role/,
  );
  s.db.close();
});
test("comparison flags surrounding condition changes", () => {
  const s = fixture();
  const a = experiment(s),
    b = experiment(s, "team-provisional", true, {
      opponent: "Fort Knox Athletic",
      shouts: "Press",
    });
  assert.deepEqual(compareConditions(a, b, s.read()).mismatches, [
    "opponent",
    "shouts",
  ]);
  s.db.close();
});
test("unknown data stays unknown and synthetic data is excluded", () => {
  const s = fixture();
  const e = experiment(s);
  match(s, e.id, true, { goalsFor: 9, goalsAgainst: 0 });
  const real = experiment(s, "team-baseline", false);
  match(s, real.id, false);
  const out = summarize("team-baseline", s.read());
  assert.equal(out.results.matches, 1);
  assert.equal(out.results.scored, 0);
  assert.equal(out.results.goalDifference, null);
  assert.equal(out.supporting.onTargetFor.total, null);
  assert.equal(out.execution.Shape.mean, null);
  s.db.close();
});
test("execution aggregates assessed scores only and results count known scores", () => {
  const s = fixture();
  const e = experiment(s, "team-baseline", false);
  const m = match(s, e.id, false, {
    goalsFor: 2,
    goalsAgainst: 1,
    onTargetFor: 3,
  });
  for (const score of [2, null, 0])
    s.save("annotations", {
      matchId: m.id,
      timestamp: "00:12",
      role: "MID",
      phase: PHASES[3],
      observation: "Recovery",
      diagnosis: "Partial recovery",
      scores: { Recovery: score },
      evidenceIds: [],
    });
  const out = summarize("team-baseline", s.read());
  assert.deepEqual(out.execution.Recovery, { n: 2, mean: 1 });
  assert.equal(out.results.wins, 1);
  assert.equal(out.results.goalDifference, 1);
  s.db.close();
});
test("annotation and statistics validation", () => {
  const s = fixture();
  const e = experiment(s);
  assert.throws(() => match(s, e.id, false), /synthetic/);
  assert.throws(
    () => match(s, e.id, true, { shotsFor: 1, onTargetFor: 2 }),
    /exceed/,
  );
  const m = match(s, e.id);
  assert.throws(
    () =>
      s.save("annotations", {
        matchId: m.id,
        timestamp: "00:12",
        role: "MID",
        phase: PHASES[3],
        observation: "x",
        diagnosis: "x",
        scores: { Recovery: 3 },
        evidenceIds: [],
      }),
    /Invalid score/,
  );
  s.db.close();
});
test("promotions require real evidence and never occur automatically", () => {
  const s = fixture();
  const e = experiment(s);
  const m = match(s, e.id, true, { goalsFor: 5, goalsAgainst: 0 });
  assert.equal(s.read().decisions.length, 0);
  assert.throws(
    () =>
      s.save("decisions", {
        family: "1-1-2",
        teamId: "team-baseline",
        outcome: "champion",
        reason: "Win",
        matchIds: [m.id],
      }),
    /real/,
  );
  const real = experiment(s, "team-baseline", false),
    rm = match(s, real.id, false);
  s.save("decisions", {
    family: "1-1-2",
    teamId: "team-baseline",
    outcome: "tested",
    reason: "Observed",
    matchIds: [rm.id],
  });
  s.db.close();
});
test("export/import round trip, idempotency, conflict and rollback", () => {
  const a = fixture(),
    b = createStore(":memory:");
  const data = { schemaVersion: 1, records: a.read() };
  b.importData(data);
  assert.deepEqual(b.read(), a.read());
  assert.equal(b.importData(data), 0);
  const conflict = structuredClone(data);
  conflict.records.prompts[0].text = "changed";
  assert.throws(() => b.importData(conflict), /conflict/);
  assert.deepEqual(b.read(), a.read());
  const invalid = structuredClone(data);
  invalid.records.sources.push({
    ...invalid.records.sources[0],
    id: "new-source",
  });
  invalid.records.teams.push({
    id: "bad",
    createdAt: "today",
    label: "bad",
    formationId: "absent",
  });
  assert.throws(() => b.importData(invalid));
  assert.equal(b.read().sources.length, a.read().sources.length);
  a.db.close();
  b.db.close();
});
test("prompt diff identifies additions and removals", () => {
  assert.deepEqual(promptDiff("a\nb", "a\nc"), {
    removed: ["b"],
    added: ["c"],
  });
});
test("critical events may omit a diagnosis and gain one as a reviewed version", () => {
  const s = fixture();
  const e = experiment(s);
  const m = match(s, e.id),
    other = match(s, e.id);
  const base = {
    matchId: m.id,
    timestamp: "5.00s",
    role: "MID",
    phase: PHASES[2],
    observation: "5.0 s · Ball won back",
    diagnosis: "",
    scores: { Recovery: null },
    evidenceIds: [],
  };
  const auto = s.save("annotations", base);
  const reviewed = s.save("annotations", {
    ...base,
    parentId: auto.id,
    diagnosis: "Recovered behind the ball",
    scores: { Recovery: 2 },
  });
  assert.throws(
    () =>
      s.save("annotations", { ...base, matchId: other.id, parentId: auto.id }),
    /same match/,
  );
  assert.throws(
    () => s.save("annotations", { ...base, diagnosis: undefined }),
    /diagnosis/,
  );
  const latest = latestAnnotations(s.read());
  assert.ok(latest.some((a) => a.id === reviewed.id));
  assert.ok(!latest.some((a) => a.id === auto.id));
  s.db.close();
});
