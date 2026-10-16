import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store";
import { simulationRepository } from "../lib/simulation/repository";
import {
  improvementRepository,
  profileKey,
} from "../lib/improvement/persistence";
import {
  createCampaign,
  previewCampaign,
  advanceCampaign,
  controlCampaign,
  recoverCampaigns,
  adoptGeneration,
} from "../lib/improvement/engine";
import { assess, exactPairedPValue } from "../lib/improvement/evaluation";
import { parseGeneration, generationInput } from "../lib/improvement/proposals";
import {
  exportImprovement,
  exportSimulation,
  importPortable,
} from "../lib/improvement/portable";
import { executeRound, reserve } from "../lib/simulation/runner";
import { advance } from "../lib/simulation/engine";
import { ROLES } from "../lib/domain";
import type {
  Campaign,
  EvidenceBundle,
  Generation,
} from "../lib/improvement/types";
import type { Run } from "../lib/simulation/types";

function setup(provider = "mock") {
  const store = createStore(":memory:");
  store.initialize();
  const repo = simulationRepository(store);
  repo.ensureDefault();
  const db = improvementRepository(repo),
    strategy = db.strategy({
      label: "Results first",
      formationId: "formation-112-r1",
      brief: "Win through coordinated progression",
      roleGuidance: { MID: "Support the ball" },
      protectedInstructions: ["Keep the assigned formation."],
      sourceIds: [store.read().sources[0].id],
    });
  const input = {
    teamId: "team-provisional",
    strategyId: strategy.id,
    scenarioId: repo.scenarios()[0].id,
    provider,
    models: Object.fromEntries(ROLES.map((r) => [r, "gpt-6-luna"])),
    duration: 1,
    seed: 42,
    requestLimit: 10000,
    inputTokenLimit: 100000000,
    costLimitUsd: 10,
    maxGenerations: 1,
  };
  return { store, repo, db, strategy, input };
}
async function complete(
  repo: ReturnType<typeof simulationRepository>,
  run: Run,
  goals = 0,
  against = 0,
) {
  const result = await executeRound(
    repo,
    run,
    {
      kind: run.config.provider,
      async decide() {
        return {
          choice: "hold",
          confidence: null,
          probabilities: null,
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    },
    new AbortController().signal,
  );
  const frames = advance(
    run.state,
    Object.fromEntries(result.traces.map((t) => [t.playerId, t.selected])),
    run.config.duration,
  );
  repo.saveRound(run, {
    round: 0,
    frames,
    traces: result.traces,
    measurements: [],
    waitingMs: 0,
  });
  run.state.stats[run.config.teamSide].goals = goals;
  run.state.stats[run.config.teamSide === "home" ? "away" : "home"].goals =
    against;
  run.status = "completed";
  repo.saveRun(run);
}
async function completePending(
  f: ReturnType<typeof setup>,
  candidateWins = false,
) {
  for (const r of f.repo.runs().filter((r) => r.status === "queued"))
    await complete(
      f.repo,
      r,
      candidateWins &&
        !!f.store.read().teams.find((t) => t.id === r.config.team.id)
          ?.campaignId
        ? 1
        : 0,
    );
}
async function toScreening(f: ReturnType<typeof setup>, createResponse?: any) {
  const c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  await completePending(f);
  await advanceCampaign(f.repo, c.id, createResponse);
  return c;
}
const fakeResponse = (f: ReturnType<typeof setup>) => async () => {
  const c = f.db.campaigns()[0],
    g = f.db.generations(c.id)[0],
    bundle = f.db.evidence(g.evidenceId!)!;
  return {
    status: "completed",
    id: "offline-test",
    model: "gpt-6-luna",
    usage: { input_tokens: 50, output_tokens: 100 },
    output_text: JSON.stringify({
      outcome: "proposal",
      role: "MID",
      text:
        f.store.read().prompts.find((p) => p.id === "provisional-MID")!.text +
        "\nKeep the assigned formation.\nTest a closer support angle.",
      rationale: "Controlled offline test",
      evidenceIds: [bundle.runs[0].id],
      sourceIds: [],
      uncertainties: ["Fixture outcomes"],
    }),
  };
};

test("campaign preview freezes settings and accounts for all planned matches", () => {
  const f = setup();
  const p = previewCampaign(f.repo, {
    ...f.input,
    duration: 60,
    maxGenerations: 3,
  });
  assert.equal(p.schedule.normalRequestsPerGeneration, 14401);
  assert.equal(p.schedule.maximumPlannedRequests, 45003);
  assert.equal(p.test.alpha, 0.05 / 3);
  assert.equal(f.db.campaigns().length, 0);
  const c = createCampaign(f.repo, f.input);
  assert.throws(() => createCampaign(f.repo, f.input), /already exists/);
  const copy = f.db.campaign(c.id)!;
  copy.manifest.baseline.team.models.GK = "changed";
  assert.equal(
    f.db.campaign(c.id)!.manifest.baseline.team.models.GK,
    "gpt-6-luna",
  );
  f.store.db.close();
});
test("strategy revisions preserve parents, sources and protected instructions", () => {
  const f = setup();
  const next = f.db.strategy({
    ...f.strategy,
    label: "Revision",
    parentId: f.strategy.id,
    brief: "Keep winning",
  });
  assert.equal(f.db.strategies().length, 2);
  assert.equal(
    f.db.get<any>("lab_strategies", f.strategy.id).brief,
    f.strategy.brief,
  );
  assert.equal(next.parentId, f.strategy.id);
  assert.throws(
    () => f.db.strategy({ ...f.strategy, sourceIds: ["invented"] }),
    /Unknown strategy source/,
  );
  assert.throws(
    () => f.db.strategy({ ...f.strategy, protectedInstructions: [""] }),
    /Protected/,
  );
  f.store.db.close();
});
test("mock loop creates one immutable role revision and rejects tied results", async () => {
  const f = setup();
  const c = await toScreening(f);
  let g = f.db.generations(c.id)[0];
  assert.equal(g.stage, "screening");
  assert.equal(f.store.read().prompts.length, 11);
  const old = f.store.read().teams.find((t) => t.id === g.incumbentTeamId)!,
    candidate = f.store.read().teams.find((t) => t.id === g.challengerTeamId)!;
  assert.deepEqual(
    ROLES.filter((r) => old.promptIds[r] !== candidate.promptIds[r]),
    ["MID"],
  );
  assert.equal(f.db.totals(c.id).requests, 1);
  assert.equal(f.db.totals(c.id).costUsd, 0);
  assert.equal(f.db.evidence(g.evidenceId!)!.author, "machine");
  assert.equal(f.store.read().annotations.length, 0);
  await completePending(f);
  await advanceCampaign(f.repo, c.id);
  g = f.db.generations(c.id)[0];
  assert.equal(g.outcome, "rejected");
  assert.equal(f.db.campaign(c.id)!.status, "completed");
  assert.equal(f.db.list("lab_active").length, 0);
  assert.equal(f.store.read().decisions.length, 0);
  f.store.db.close();
});
test("fresh validation passes on consistent paired wins but fixtures never adopt", async () => {
  const f = setup();
  const c = await toScreening(f);
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  let g = f.db.generations(c.id)[0];
  assert.equal(g.stage, "validation");
  assert.equal(f.repo.seriesById(g.seriesId!)!.runIds.length, 36);
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  g = f.db.generations(c.id)[0];
  assert.equal(g.assessments?.at(-1)?.outcome, "pass");
  assert.equal(g.assessments?.at(-1)?.pValue, 1 / 512);
  assert.equal(g.outcome, "inconclusive");
  assert.equal(f.db.list("lab_active").length, 0);
  f.store.db.close();
});
test("offline provider evidence can adopt locally without changing portal champions", async () => {
  process.env.OPENAI_API_KEY = "offline-test-only";
  const f = setup("responses");
  const c = await toScreening(f, fakeResponse(f));
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  const g = f.db.generations(c.id)[0];
  assert.equal(g.outcome, "adopted");
  assert.equal(f.db.active(c.manifest.profile)?.teamId, g.challengerTeamId);
  assert.equal(f.store.read().decisions.length, 0);
  assert.equal(f.db.list<any>("lab_adoptions")[0].actor, "automatic");
  f.store.db.close();
});
test("paired statistics treat ties and insufficient evidence honestly", () => {
  assert.equal(exactPairedPValue([0, 0, 0]), 1);
  assert.equal(exactPairedPValue([1, 1, 1]), 1 / 8);
  assert.equal(exactPairedPValue([-1, -1, -1]), 1);
  assert.throws(() => exactPairedPValue([]));
});
test("incomplete, mismatched, missing statistics and failed decisions cannot qualify", async () => {
  const f = setup();
  const c = await toScreening(f);
  let g = f.db.generations(c.id)[0],
    s = f.repo.seriesById(g.seriesId!)!,
    seed = f.repo.run(s.runIds[0])!.config.seed;
  assert.equal(
    assess(
      f.repo,
      c,
      s.runIds,
      g.incumbentTeamId,
      g.challengerTeamId!,
      "screening",
      [seed],
    ).outcome,
    "inconclusive",
  );
  await completePending(f, true);
  const r = f.repo.run(s.runIds[0])!,
    original = structuredClone(r);
  r.config.interval = 2;
  f.repo.saveRun(r);
  assert.match(
    assess(
      f.repo,
      c,
      s.runIds,
      g.incumbentTeamId,
      g.challengerTeamId!,
      "screening",
      [seed],
    ).reason,
    /mismatch/,
  );
  f.repo.saveRun(original);
  (original.state.stats.home as any).shots = null;
  f.repo.saveRun(original);
  assert.match(
    assess(
      f.repo,
      c,
      s.runIds,
      g.incumbentTeamId,
      g.challengerTeamId!,
      "screening",
      [seed],
    ).reason,
    /missing/,
  );
  original.state.stats.home.shots = 0;
  f.repo.saveRun(original);
  const row = f.repo.rounds(r.id)[0];
  row.traces
    .filter((t) => t.provider !== "scripted")
    .forEach((t) => (t.error = "timeout"));
  f.repo.db
    .prepare("UPDATE sim_rounds SET body=? WHERE run_id=? AND round=0")
    .run(JSON.stringify(row), r.id);
  assert.match(
    assess(
      f.repo,
      c,
      s.runIds,
      g.incumbentTeamId,
      g.challengerTeamId!,
      "screening",
      [seed],
    ).reason,
    /Failed decision rate/,
  );
  f.store.db.close();
});
test("proposal validation rejects missing protected text and fabricated citations", async () => {
  const f = setup();
  const c = await toScreening(f),
    g = f.db.generations(c.id)[0],
    b = f.db.evidence(g.evidenceId!)!,
    proposal = g.proposal!;
  assert.throws(
    () =>
      parseGeneration(
        JSON.stringify({ ...proposal, text: "No protected text" }),
        c,
        b,
      ),
    /protected/,
  );
  assert.throws(
    () =>
      parseGeneration(
        JSON.stringify({ ...proposal, evidenceIds: ["invented"] }),
        c,
        b,
      ),
    /unsupported/,
  );
  assert.throws(
    () =>
      parseGeneration(
        JSON.stringify({ ...proposal, sourceIds: ["invented"] }),
        c,
        b,
      ),
    /unsupported/,
  );
  assert.equal(
    parseGeneration(
      JSON.stringify({
        ...proposal,
        outcome: "insufficient_evidence",
        text: "",
        evidenceIds: [],
      }),
      c,
      b,
    ).outcome,
    "insufficient_evidence",
  );
  assert(
    generationInput(c, b, f.store.read(), g.incumbentTeamId)
      .reservedInputTokens < 50000,
  );
  f.store.db.close();
});
test("campaign reservations are atomic across proposal and concurrent player dispatch", async () => {
  const f = setup(),
    c = createCampaign(f.repo, {
      ...f.input,
      requestLimit: 3,
      costLimitUsd: 0.3,
    });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      Promise.resolve(
        f.db.reserve(
          c.id,
          `reservation-${i}`,
          10,
          0.1,
          i ? "decision" : "proposal",
        ),
      ),
    ),
  );
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(f.db.totals(c.id).requests, 3);
  assert(f.db.totals(c.id).costUsd <= 0.300000001);
  f.db.settle("reservation-0", 1, 1, 0.01);
  assert.equal(f.db.reserve(c.id, "new", 1, 0, "proposal"), false);
  assert.equal(f.db.totals(c.id).reservedInputTokens, 20);
  f.db.settle("reservation-1", null, 0);
  assert.equal(f.db.totals(c.id).reservedInputTokens, 20);
  f.store.db.close();
});
test("pause stop and uncertain generation recovery prevent further dispatch", async () => {
  const f = setup();
  const c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  controlCampaign(f.repo, c.id, "pause");
  assert.equal(f.db.reserve(c.id, "paused", 1, 0, "decision"), false);
  assert(f.repo.runs().every((r) => r.command === "pause"));
  controlCampaign(f.repo, c.id, "run");
  assert(f.repo.runs().every((r) => r.command === "run"));
  const g = f.db.generations(c.id)[0];
  g.stage = "generating";
  f.db.put("lab_generations", g);
  recoverCampaigns(f.repo);
  assert.equal(f.db.campaign(c.id)!.status, "paused");
  assert.throws(() => controlCampaign(f.repo, c.id, "run"), /uncertain/);
  controlCampaign(f.repo, c.id, "stop");
  assert.equal(f.db.campaign(c.id)!.status, "stopped");
  f.store.db.close();
});
test("manual override is append-only and stale adoption cannot overwrite it", async () => {
  process.env.OPENAI_API_KEY = "offline-test-only";
  const f = setup("responses");
  const c = await toScreening(f, fakeResponse(f));
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  await completePending(f, true);
  f.db.changeActive(
    c.manifest.profile,
    "team-baseline",
    0,
    "Manual strategy change",
    { actor: "human" },
  );
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.campaign(c.id)!.status, "paused");
  assert.equal(f.db.active(c.manifest.profile)?.teamId, "team-baseline");
  assert.match(f.db.campaign(c.id)!.reason!, /stale adoption/);
  f.db.changeActive(c.manifest.profile, "team-provisional", 1, "Rollback", {
    action: "rollback",
  });
  assert.equal(f.db.list("lab_adoptions").length, 2);
  assert.throws(
    () => f.db.changeActive(c.manifest.profile, "team-baseline", 1, "Stale"),
    /stale/,
  );
  f.store.db.close();
});
test("review mode waits for an explicit choice after fresh validation", async () => {
  process.env.OPENAI_API_KEY = "offline-test-only";
  const f = setup("responses");
  (f.input as any).reviewBeforeAdoption = true;
  const c = await toScreening(f, fakeResponse(f));
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  await completePending(f, true);
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.campaign(c.id)!.status, "review");
  assert.equal(f.db.active(c.manifest.profile), undefined);
  controlCampaign(f.repo, c.id, "approve");
  assert.equal(f.db.generations(c.id)[0].outcome, "adopted");
  f.store.db.close();
});
test("portable campaigns preserve linked history and imported jobs remain paused", async () => {
  const f = setup();
  const c = await toScreening(f);
  const manifest = {
    schemaVersion: 1,
    records: f.store.read(),
    simulation: exportSimulation(f.repo),
    improvement: exportImprovement(f.repo),
  };
  const s = createStore(":memory:"),
    repo = simulationRepository(s);
  importPortable(repo, manifest);
  const db = improvementRepository(repo);
  assert.equal(s.read().prompts.length, 11);
  assert.equal(db.campaign(c.id)!.status, "paused");
  assert.equal(
    db.generations(c.id)[0].promptId,
    f.db.generations(c.id)[0].promptId,
  );
  assert(
    repo
      .runs()
      .filter((r) => r.status !== "completed")
      .every((r) => r.command === "pause"),
  );
  assert.equal(db.list("lab_active").length, 0);
  const before = s.read().teams.length,
    bad = structuredClone(manifest);
  bad.improvement.tables.lab_generations[0].challengerTeamId = "missing";
  assert.throws(() => importPortable(repo, bad));
  assert.equal(s.read().teams.length, before);
  s.db.close();
  f.store.db.close();
});
test("selected in-flight runs are awaited and frozen manifests reject other settings", async () => {
  const f = setup();
  const base = f.repo.buildConfig({
      ...f.input,
      bot: "balanced",
      teamSide: "home",
      interval: 1,
    }),
    run = f.repo.create(base);
  const c = createCampaign(f.repo, { ...f.input, selectedRunIds: [run.id] });
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.generations(c.id)[0].stage, "observe");
  assert.equal(f.repo.series().length, 0);
  await complete(f.repo, run);
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.generations(c.id)[0].stage, "screening");
  const wrong = f.repo.create({ ...base, duration: 2 });
  assert.throws(
    () => previewCampaign(f.repo, { ...f.input, selectedRunIds: [wrong.id] }),
    /does not match/,
  );
  f.store.db.close();
});

test("generation failures keep reservations and never retry or save a prompt", async () => {
  const f = setup("responses"),
    c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  await completePending(f);
  let calls = 0;
  await advanceCampaign(f.repo, c.id, async () => {
    calls++;
    throw new Error("Offline timeout");
  });
  assert.equal(calls, 1);
  assert.equal(f.store.read().prompts.length, 10);
  assert.equal(f.db.campaign(c.id)!.status, "paused");
  assert(f.db.totals(c.id).reservedCostUsd > 0);
  assert.throws(() => controlCampaign(f.repo, c.id, "run"), /uncertain/);
  f.store.db.close();
});
test("insufficient evidence stops after two generations without adoption", async () => {
  const f = setup();
  (f.input as any).maxGenerations = 3;
  const c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  await completePending(f);
  const insufficient = async () => ({
    status: "completed",
    id: "none",
    model: "gpt-6-luna",
    usage: { input_tokens: 0, output_tokens: 0 },
    output_text: JSON.stringify({
      outcome: "insufficient_evidence",
      role: "GK",
      text: "",
      rationale: "No repeated opportunity",
      evidenceIds: [],
      sourceIds: [],
      uncertainties: ["Too little evidence"],
    }),
  });
  await advanceCampaign(f.repo, c.id, insufficient);
  await advanceCampaign(f.repo, c.id, insufficient);
  assert.equal(f.db.campaign(c.id)!.status, "completed");
  assert.equal(f.db.generations(c.id).length, 2);
  assert.equal(f.store.read().prompts.length, 10);
  f.store.db.close();
});
test("stopping during a proposal cannot revive the campaign or dispatch comparison jobs", async () => {
  const f = setup(),
    c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  await completePending(f);
  let release: (value: any) => void = () => {};
  const response = new Promise((resolve) => (release = resolve));
  const pending = advanceCampaign(f.repo, c.id, () => response);
  assert.equal(f.db.generations(c.id)[0].stage, "generating");
  controlCampaign(f.repo, c.id, "stop");
  release(await fakeResponse(f)());
  await pending;
  assert.equal(f.db.campaign(c.id)!.status, "stopped");
  assert(
    f.repo
      .runs()
      .every((r) => r.status === "completed" || r.status === "stopped"),
  );
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.generations(c.id).length, 1);
  f.store.db.close();
});
test("an active local team applies only to newly prepared matching runs", async () => {
  const { resolveActiveTeam } = await import("../lib/improvement/local-team");
  const f = setup("responses"),
    c = createCampaign(f.repo, f.input),
    config = structuredClone(c.manifest.baseline),
    saved = f.repo.create(config);
  f.db.changeActive(c.manifest.profile, "team-baseline", 0, "Manual choice");
  const next = resolveActiveTeam(f.repo, config, true);
  assert.equal(next.team.id, "team-baseline");
  assert.equal(f.repo.run(saved.id)!.config.team.id, "team-provisional");
  assert.equal(
    resolveActiveTeam(f.repo, config, false).team.id,
    "team-provisional",
  );
  assert.equal(
    resolveActiveTeam(f.repo, { ...config, duration: 2 }, true).team.id,
    "team-provisional",
  );
  const reversed = {
    ...config,
    team: {
      ...config.team,
      models: Object.fromEntries(
        Object.entries(config.team.models).reverse(),
      ) as any,
    },
  };
  assert.equal(profileKey(reversed), profileKey(config));
  f.store.db.close();
});
test("fresh portable imports are idempotent and do not reactivate jobs", async () => {
  const f = setup();
  await toScreening(f);
  const input = {
    schemaVersion: 1,
    records: f.store.read(),
    simulation: exportSimulation(f.repo),
    improvement: exportImprovement(f.repo),
  };
  const store = createStore(":memory:"),
    repo = simulationRepository(store);
  importPortable(repo, input);
  assert.equal(importPortable(repo, input), 0);
  assert.equal(improvementRepository(repo).campaigns()[0].status, "paused");
  store.db.close();
  f.store.db.close();
});
test("proposal budget exhaustion is terminal and produces no candidate", async () => {
  const f = setup("responses"),
    c = createCampaign(f.repo, { ...f.input, costLimitUsd: 0.000001 });
  await advanceCampaign(f.repo, c.id);
  // Discovery outcomes can be provided without inference; the next proposal still reserves its entire planned usage.
  for (const r of f.repo.runs()) {
    r.config.provider = "mock";
    f.repo.saveRun(r);
    await complete(f.repo, r);
    r.config.provider = "responses";
    f.repo.saveRun(r);
  }
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.campaign(c.id)!.status, "limited");
  assert.equal(f.store.read().prompts.length, 10);
  assert.equal(f.db.totals(c.id).requests, 0);
  f.store.db.close();
});

test("unavailable campaign models stop their suite without substitutions", async () => {
  const { play } = await import("../lib/simulation/runner");
  const f = setup("responses"),
    c = createCampaign(f.repo, f.input);
  await advanceCampaign(f.repo, c.id);
  const run = f.repo.runs().find((r) => r.status === "queued")!;
  await play(f.repo, run, "offline-worker", {
    kind: "responses",
    async decide() {
      throw Object.assign(new Error("Unavailable"), { status: 403 });
    },
  });
  assert(f.repo.runs().every((r) => r.status === "failed"));
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.campaign(c.id)!.status, "paused");
  assert.equal(f.db.generations(c.id)[0].outcome, "inconclusive");
  assert.equal(f.db.totals(c.id).requests, 5);
  f.store.db.close();
});

test("later generations learn prior outcomes and cannot repeat the same revision", async () => {
  const f = setup();
  (f.input as any).maxGenerations = 3;
  const c = await toScreening(f);
  await completePending(f);
  await advanceCampaign(f.repo, c.id);
  assert.equal(f.db.campaign(c.id)!.status, "running");
  await advanceCampaign(f.repo, c.id);
  const gs = f.db.generations(c.id),
    e = f.db.evidence(gs[1].evidenceId!)!;
  assert.equal(e.previousAttempts?.[0].outcome, "rejected");
  assert.equal(gs[1].outcome, "insufficient");
  assert.equal(f.store.read().prompts.length, 11);
  assert.equal(f.db.campaign(c.id)!.status, "completed");
  f.store.db.close();
});
