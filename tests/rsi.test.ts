import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { createStore } from "../lib/store";
import { simulationRepository } from "../lib/simulation/repository";
import { persistEvidence } from "../lib/simulation/runner";
import { analytics } from "../lib/simulation/analytics";
import { ROLES } from "../lib/domain";
import { rsiRepository } from "../lib/rsi/persistence";
import {
  advanceRsi,
  controlRsi,
  createRsi,
  previewRsi,
  recoverRsi,
} from "../lib/rsi/engine";
import { compare, earlyReject, evaluate, isBetter } from "../lib/rsi/score";
import { parseRewrite, requestRewrite, sameText } from "../lib/rsi/rewrite";
import type { MatchResult } from "../lib/rsi/types";
import type { Run } from "../lib/simulation/types";

function setup() {
  const store = createStore(":memory:");
  store.initialize();
  const repo = simulationRepository(store);
  repo.ensureDefault();
  const scenarioId = repo
    .scenarios()
    .find((s) => s.formationId === "formation-112-r1")!.id;
  const input = (over: Record<string, unknown> = {}) => ({
    teamId: "team-provisional",
    scenarioId,
    provider: "mock",
    model: "gpt-6-luna",
    bot: "balanced",
    duration: 10,
    matchesPerRound: 2,
    costLimitUsd: 1,
    maxRounds: 3,
    patience: 3,
    ...over,
  });
  return { store, repo, db: rsiRepository(repo), input };
}

/** Finish a queued match with a given score (from our side) and cost. */
function complete(
  repo: ReturnType<typeof simulationRepository>,
  run: Run,
  goals: number,
  against: number,
  costUsd = 0,
) {
  const live = repo.run(run.id)!;
  const ours = live.config.teamSide,
    them = ours === "home" ? "away" : "home";
  live.state.stats[ours].goals = goals;
  live.state.stats[them].goals = against;
  live.status = "completed";
  live.estimatedCostUsd = costUsd;
  repo.saveRun(live);
}
const queued = (repo: ReturnType<typeof simulationRepository>) =>
  repo
    .runs()
    .filter((r) => r.status === "queued")
    .reverse();

/** A fake writer that returns the given prompts by role, one answer per call. */
function writer(answers: Record<string, string>[]) {
  let i = 0;
  return async () => {
    const prompts = answers[Math.min(i, answers.length - 1)];
    return {
      status: "completed",
      id: `resp-${i++}`,
      model: "gpt-6-luna",
      usage: { input_tokens: 1000, output_tokens: 200 },
      output_text: JSON.stringify({
        prompts: Object.entries(prompts).map(([role, text]) => ({
          role,
          text,
        })),
        changes: Object.keys(prompts).map((role) => ({
          role,
          change: `Tightened ${role} passing rules.`,
        })),
        rationale: "Evidence shows passes into pressure in our third.",
      }),
    };
  };
}

const result = (
  seed: number,
  side: "home" | "away",
  points: number,
  goalDiff = 0,
): MatchResult => ({
  runId: `${seed}-${side}`,
  seed,
  side,
  status: "completed",
  goalsFor: Math.max(0, goalDiff),
  goalsAgainst: Math.max(0, -goalDiff),
  points,
  goalDiff,
  onTargetDiff: 0,
  turnovers: 0,
  costUsd: 0,
});

test("scores compare points first, then goal difference, shots on target and turnovers", () => {
  const base = { points: 1, goalDiff: 0, onTargetDiff: 0, turnovers: 2 };
  assert.equal(compare({ ...base, points: 1.5 }, { ...base, goalDiff: 3 }), 1);
  assert.equal(compare({ ...base, goalDiff: 0.5 }, base), 1);
  assert.equal(compare({ ...base, onTargetDiff: -1 }, base), -1);
  assert.equal(compare({ ...base, turnovers: 1 }, base), 1);
  assert.equal(compare(base, { ...base }), 0);
  const s = evaluate([result(42, "home", 3, 1), result(42, "away", 1)])!;
  assert.deepEqual([s.points, s.goalDiff, s.matches], [2, 0.5, 2]);
  assert.equal(isBetter(s, { ...s }), false, "a tie is not an improvement");
  assert.equal(isBetter(s, null), true);
});

test("early reject needs both first-seed matches to be worse than the best", () => {
  const best = [42, 43].flatMap((seed) => [
    result(seed, "home", 1),
    result(seed, "away", 1),
  ]);
  assert.equal(earlyReject([result(42, "home", 0, -1)], best, 42), false);
  assert.equal(
    earlyReject([result(42, "home", 0, -1), result(42, "away", 1)], best, 42),
    false,
  );
  assert.equal(
    earlyReject(
      [result(42, "home", 0, -1), result(42, "away", 0, -2)],
      best,
      42,
    ),
    true,
  );
});

test("writer answers are validated and whitespace changes count as the same prompt", () => {
  const answer = (prompts: unknown[]) =>
    JSON.stringify({ prompts, changes: [], rationale: "r" });
  assert.throws(() => parseRewrite("not json"), /valid JSON/);
  assert.throws(() => parseRewrite(answer([])), /didn't include/);
  assert.throws(
    () => parseRewrite(answer([{ role: "MID", text: "x".repeat(6001) }])),
    /over-long/,
  );
  assert.throws(
    () =>
      parseRewrite(
        answer([
          { role: "MID", text: "a" },
          { role: "MID", text: "b" },
        ]),
      ),
    /repeated/,
  );
  const ok = parseRewrite(
    JSON.stringify({
      prompts: [
        { role: "DEF", text: " Stay goal-side. " },
        { role: "FOR2", text: "Stay reachable." },
      ],
      changes: [
        { role: "DEF", change: "Goal-side rule." },
        { role: "XX", change: "Ignored." },
      ],
      rationale: "Because.",
    }),
  );
  assert.deepEqual(Object.keys(ok.prompts), ["DEF", "FOR2"]);
  assert.equal(ok.prompts.DEF, "Stay goal-side.");
  assert.deepEqual(ok.changes, [{ role: "DEF", change: "Goal-side rule." }]);
  assert.equal(sameText("Hold  the line.\n", "Hold the line."), true);
});

test("a mock session plays a baseline, keeps a better rewrite and saves it as a new version", async () => {
  const f = setup();
  const s = createRsi(f.repo, f.input({ maxRounds: 2 }));
  assert.equal(
    s.baseline.runIds.length,
    2,
    "baseline queues seed 42 home and away",
  );
  assert.throws(() => createRsi(f.repo, f.input()), /still active/);
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  await advanceRsi(f.repo, s.id);
  assert.equal(f.db.get(s.id)!.baseline.stage, "done");
  assert.equal(f.db.get(s.id)!.best.score!.points, 1);

  await advanceRsi(f.repo, s.id); // round 1: practice rewrite, then matches
  let live = f.db.get(s.id)!;
  assert.equal(live.rounds[0].stage, "evaluating");
  assert.deepEqual(live.rounds[0].roles, ["DEF", "MID"]);
  const runs = live.rounds[0].runIds.map((id) => f.repo.run(id)!);
  assert.ok(
    runs.every(
      (r) => r.evidenceOrigin === "test fixture" && r.config.rsi?.round === 1,
    ),
  );
  assert.ok(
    runs.every(
      (r) =>
        r.config.team.prompts.MID.text === live.rounds[0].prompts.MID &&
        r.config.team.prompts.DEF.text === live.rounds[0].prompts.DEF &&
        r.config.team.prompts.GK.id === s.start.GK.id,
    ),
  );
  assert.notEqual(runs[0].config.team.prompts.MID.id, s.start.MID.id);
  for (const r of queued(f.repo)) complete(f.repo, r, 1, 0);
  await advanceRsi(f.repo, s.id);
  live = f.db.get(s.id)!;
  assert.equal(live.rounds[0].outcome, "improved");
  assert.equal(live.best.round, 1);

  await advanceRsi(f.repo, s.id); // round 2
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  await advanceRsi(f.repo, s.id);
  assert.equal(f.db.get(s.id)!.rounds[1].outcome, "no-better");

  await advanceRsi(f.repo, s.id); // max rounds reached
  live = f.db.get(s.id)!;
  assert.equal(live.status, "completed");
  assert.match(live.reason!, /all 2 rounds/);
  const w = f.store.read(),
    saved = w.prompts.filter((p) => live.saved!.promptIds.includes(p.id)),
    prompt = saved.find((p) => p.role === "MID")!,
    team = w.teams.find((t) => t.id === live.saved!.teamId)!;
  assert.deepEqual(saved.map((p) => p.role).sort(), ["DEF", "MID"]);
  assert.equal(prompt.parentId, s.start.MID.id);
  assert.equal(prompt.text, live.rounds[0].prompts.MID);
  assert.equal(prompt.rsi.sessionId, s.id);
  assert.equal(prompt.status, "draft");
  assert.equal(team.promptIds.MID, prompt.id);
  assert.equal(team.promptIds.DEF, saved.find((p) => p.role === "DEF")!.id);
  assert.match(team.label, /RSI r1$/);
  assert.equal(team.parentId, "team-provisional");
  assert.equal(
    team.promptIds.GK,
    w.teams.find((t) => t.id === "team-provisional")!.promptIds.GK,
  );
  assert.equal(
    w.prompts.filter((p) => p.rsi).length,
    2,
    "rejected candidates are not saved as prompt versions",
  );
});

test("RSI matches never create evidence records or appear in analytics", () => {
  const f = setup();
  const s = createRsi(f.repo, f.input());
  const run = f.repo.run(s.baseline.runIds[0])!;
  complete(f.repo, run, 1, 0);
  persistEvidence(f.repo, f.repo.run(run.id)!);
  assert.equal(f.repo.run(run.id)!.matchId, null);
  assert.equal(f.store.read().matches.length, 0);
  const live = f.repo.run(run.id)!;
  live.evidenceOrigin = "rsi";
  f.repo.saveRun(live);
  assert.equal(analytics(f.repo).runs.length, 0);
});

test("a stored match with the same prompts and conditions is reused for the baseline", () => {
  const f = setup();
  const preview = previewRsi(f.repo, f.input());
  const config = structuredClone(preview.config.baseline);
  config.seed = 42;
  config.teamSide = "home";
  const stored = f.repo.create(config);
  complete(f.repo, stored, 1, 0);
  const other = structuredClone(config);
  other.team.prompts.MID = { ...other.team.prompts.MID, text: "Different" };
  other.teamSide = "away";
  complete(f.repo, f.repo.create(other), 1, 0);
  const again = previewRsi(f.repo, f.input());
  assert.equal(again.estimate.reused, 1);
  assert.deepEqual(again.reusedRunIds, [stored.id]);
  const s = createRsi(f.repo, f.input());
  assert.deepEqual(s.baseline.reusedRunIds, [stored.id]);
  assert.equal(s.baseline.runIds.length, 2, "only the away match is played");
});

test("a candidate behind on both first-seed matches is rejected early and the rest are skipped", async () => {
  const f = setup();
  const s = createRsi(f.repo, f.input({ matchesPerRound: 4 }));
  for (const r of queued(f.repo)) complete(f.repo, r, 1, 0);
  await advanceRsi(f.repo, s.id);
  await advanceRsi(f.repo, s.id);
  const round = f.db.get(s.id)!.rounds[0];
  assert.equal(round.runIds.length, 4);
  const [a, b] = round.runIds.map((id) => f.repo.run(id)!);
  complete(f.repo, a, 0, 1);
  complete(f.repo, b, 0, 0);
  await advanceRsi(f.repo, s.id);
  const live = f.db.get(s.id)!;
  assert.equal(live.rounds[0].outcome, "rejected-early");
  assert.equal(live.noImprovement, 1);
  assert.deepEqual(
    round.runIds.slice(2).map((id) => f.repo.run(id)!.status),
    ["stopped", "stopped"],
  );
});

test("a repeated rewrite plays no matches and counts toward the no-improvement stop", async () => {
  const f = setup();
  const start = f.store
    .read()
    .prompts.find(
      (p) =>
        p.id ===
        f.store.read().teams.find((t) => t.id === "team-provisional")!.promptIds
          .MID,
    )!;
  const s = createRsi(f.repo, f.input({ patience: 1 }));
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  const create = writer([{ MID: start.text + "   " }]);
  await advanceRsi(f.repo, s.id, create);
  await advanceRsi(f.repo, s.id, create);
  let live = f.db.get(s.id)!;
  assert.equal(live.rounds[0].outcome, "no-change");
  assert.equal(live.rounds[0].runIds.length, 0);
  await advanceRsi(f.repo, s.id, create);
  live = f.db.get(s.id)!;
  assert.equal(live.status, "completed");
  assert.match(live.reason!, /No improvement/);
  assert.equal(live.saved, null, "nothing beat the start, so nothing is saved");
});

test("spending stays under the limit: rounds only start when they fit and matches are capped", async () => {
  process.env.OPENAI_API_KEY ||= "test-key";
  const f = setup();
  const preview = previewRsi(
    f.repo,
    f.input({ provider: "responses", costLimitUsd: 0.1 }),
  );
  assert.ok(preview.estimate.perMatchUsd > 0);
  assert.ok(preview.estimate.rewriteMaxUsd > 0);
  const tight = previewRsi(
    f.repo,
    f.input({ provider: "responses", costLimitUsd: 0.01 }),
  );
  assert.match(tight.problem!, /can't cover/);
  assert.throws(
    () =>
      createRsi(f.repo, f.input({ provider: "responses", costLimitUsd: 0.01 })),
    /can't cover/,
  );

  const s = createRsi(
    f.repo,
    f.input({ provider: "responses", costLimitUsd: 0.1 }),
  );
  const baselineSeries = f.repo.seriesById(s.baseline.seriesIds[0])!;
  assert.equal(
    baselineSeries.costLimitUsd,
    0.1,
    "the first series may use the whole limit",
  );
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0, 0.004);
  const create = writer([{ MID: "Better MID prompt" }]);
  await advanceRsi(f.repo, s.id, create);
  await advanceRsi(f.repo, s.id, create);
  let live = f.db.get(s.id)!;
  const spentBefore = 0.008 + live.rounds[0].rewrite!.costUsd!;
  const series = f.repo.seriesById(live.rounds[0].seriesIds[0])!;
  assert.ok(
    Math.abs(series.costLimitUsd! - (0.1 - spentBefore)) < 1e-9,
    "a round's matches are capped at what's left",
  );
  // Expensive matches leave too little for another round.
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0, 0.03);
  await advanceRsi(f.repo, s.id, create);
  await advanceRsi(f.repo, s.id, create);
  live = f.db.get(s.id)!;
  assert.equal(live.status, "limited");
  assert.match(live.reason!, /Spending limit reached/);
  assert.ok(f.db.spend(live).totalUsd <= 0.1);
});

test("stopping keeps the best version so far and stops queued matches", async () => {
  const f = setup();
  const s = createRsi(f.repo, f.input({ maxRounds: 5 }));
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  await advanceRsi(f.repo, s.id);
  await advanceRsi(f.repo, s.id);
  for (const r of queued(f.repo)) complete(f.repo, r, 1, 0);
  await advanceRsi(f.repo, s.id);
  await advanceRsi(f.repo, s.id); // round 2 queued
  controlRsi(f.repo, s.id, "pause");
  assert.equal(f.db.get(s.id)!.status, "paused");
  assert.ok(queued(f.repo).length === 0, "pausing pauses queued matches");
  controlRsi(f.repo, s.id, "run");
  assert.equal(queued(f.repo).length, 2);
  const stopped = controlRsi(f.repo, s.id, "stop");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.rounds[1].outcome, "stopped");
  assert.equal(
    stopped.saved!.promptIds.length,
    2,
    "DEF and MID were rewritten",
  );
  assert.equal(queued(f.repo).length, 0);
  assert.throws(() => controlRsi(f.repo, s.id, "run"), /already finished/);
});

test("a worker restart during a rewrite pauses the session and keeps the reserved cost", () => {
  const f = setup();
  const s = createRsi(f.repo, f.input());
  const live = f.db.get(s.id)!;
  live.baseline.stage = "done";
  live.rounds.push({
    n: 1,
    stage: "rewriting",
    roles: [],
    prompts: {},
    rationale: "",
    changes: [],
    seriesIds: [],
    runIds: [],
    results: [],
    score: null,
    rewrite: {
      model: "gpt-6-luna",
      responseId: null,
      reservedInputTokens: 5000,
      reservedUsd: 0.002,
      inputTokens: null,
      outputTokens: 0,
      costUsd: null,
    },
    startedAt: new Date().toISOString(),
  });
  f.db.save(live);
  recoverRsi(f.repo);
  const after = f.db.get(s.id)!;
  assert.equal(after.status, "paused");
  assert.equal(after.rounds[0].outcome, "failed");
  assert.equal(f.db.spend(after).rewritesUsd, 0.002);
});

test("a dropped connection to the writer is retried once; timeouts are not", async () => {
  const f = setup();
  const s = createRsi(
    f.repo,
    f.input({ provider: "responses", costLimitUsd: 1 }),
  );
  let calls = 0;
  const flaky = async () => {
    if (calls++ === 0)
      throw new OpenAI.APIConnectionError({ message: "socket hang up" });
    return { status: "completed" };
  };
  assert.equal((await requestRewrite(s, 1, "{}", flaky)).status, "completed");
  assert.equal(calls, 2);
  calls = 0;
  const slow = async () => {
    calls++;
    throw new OpenAI.APIConnectionTimeoutError();
  };
  await assert.rejects(requestRewrite(s, 1, "{}", slow));
  assert.equal(calls, 1);
});

test("writer calls that never connect don't use up rounds", async () => {
  const f = setup();
  const s = createRsi(f.repo, f.input({ maxRounds: 1, provider: "responses" }));
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  await advanceRsi(f.repo, s.id);
  const down = async () => {
    throw new OpenAI.APIConnectionError({ message: "ECONNRESET" });
  };
  await advanceRsi(f.repo, s.id, down);
  let live = f.db.get(s.id)!;
  assert.equal(live.status, "paused");
  assert.match(live.reason!, /Couldn't reach/);
  controlRsi(f.repo, s.id, "run");
  await advanceRsi(f.repo, s.id, writer([{ MID: "A different MID prompt" }]));
  live = f.db.get(s.id)!;
  assert.equal(live.rounds.length, 2);
  assert.equal(
    live.rounds[1].stage,
    "evaluating",
    "the failed call didn't count as the one allowed round",
  );
});

test("one model plays every position; Jev hands the writing to Luna", () => {
  const f = setup();
  const luna = previewRsi(f.repo, f.input());
  assert.ok(ROLES.every((r) => luna.config.models[r] === "gpt-6-luna"));
  assert.equal(luna.config.writer.model, "gpt-6-luna");
  const sol = previewRsi(f.repo, f.input({ model: "gpt-6-sol" }));
  assert.equal(sol.config.writer.model, "gpt-6-sol");
  const jev = previewRsi(f.repo, f.input({ model: "jev-1.13.0" }));
  assert.ok(ROLES.every((r) => jev.config.models[r] === "jev-1.13.0"));
  assert.equal(jev.config.writer.model, "gpt-6-luna");
  assert.throws(
    () => previewRsi(f.repo, f.input({ model: "" })),
    /Choose a model/,
  );
});

test("a round can rewrite several positions; unchanged prompts are not counted", async () => {
  const f = setup();
  const s = createRsi(f.repo, f.input());
  for (const r of queued(f.repo)) complete(f.repo, r, 0, 0);
  await advanceRsi(f.repo, s.id);
  const create = writer([
    { GK: s.start.GK.text, DEF: "New DEF rules.", FOR2: "New FOR2 rules." },
  ]);
  await advanceRsi(f.repo, s.id, create);
  const round = f.db.get(s.id)!.rounds[0];
  assert.deepEqual(round.roles, ["DEF", "FOR2"], "GK came back unchanged");
  assert.deepEqual(
    round.changes.map((c) => c.role),
    ["DEF", "FOR2"],
  );
  const run = f.repo.run(round.runIds[0])!;
  assert.equal(run.config.team.prompts.DEF.text, "New DEF rules.");
  assert.equal(run.config.team.prompts.GK.id, s.start.GK.id);
  for (const r of queued(f.repo)) complete(f.repo, r, 1, 0);
  await advanceRsi(f.repo, s.id);
  const live = f.db.get(s.id)!;
  assert.equal(live.best.prompts.FOR2, "New FOR2 rules.");
  assert.equal(live.best.prompts.GK, s.start.GK.text);
  assert.match(live.best.ids.DEF, /^rsi-.*-r1-DEF$/);
});
