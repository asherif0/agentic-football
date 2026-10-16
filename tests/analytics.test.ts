import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store";
import { ensureLabCatalog } from "../lib/catalog";
import { simulationRepository } from "../lib/simulation/repository";
import {
  createBenchmark,
  previewBenchmark,
} from "../lib/simulation/benchmarks";
import { analytics, percentile } from "../lib/simulation/analytics";
import { reserve, executeRound, play } from "../lib/simulation/runner";
import { observation, blankStats } from "../lib/simulation/engine";
import { ROLES } from "../lib/domain";
function fixture() {
  const store = createStore(":memory:");
  store.initialize();
  ensureLabCatalog(store);
  const repo = simulationRepository(store);
  repo.ensureDefault();
  return repo;
}
const withKey = <T>(f: () => T): T => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    return f();
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
};
test("catalog adds configuration-only 2–1–1 and ten immutable adaptive revisions", () => {
  const r = fixture();
  const before = r.store.read();
  assert.equal(before.formations.length, 2);
  assert.equal(before.prompts.length, 25);
  assert.equal(before.teams.length, 5);
  ensureLabCatalog(r.store);
  assert.deepEqual(r.store.read(), before);
  for (const p of before.prompts.filter((p) => p.id.startsWith("adaptive-"))) {
    assert.ok(p.parentId);
    assert.equal(p.status, "draft");
    assert.ok(p.text.length <= 6000);
  }
  assert.equal(r.scenarios().length, 2);
  r.db.close();
});
test("pilot freezes 24 interleaved paired model/formation settings and budgets", () => {
  const r = fixture();
  const p = withKey(() => previewBenchmark(r));
  assert.equal(p.plannedMatches, 24);
  assert.equal(p.normalRequests, 2400);
  assert.equal(p.requestLimit, 3000);
  assert.equal(p.costLimitUsd, 5);
  for (const model of p.models)
    assert.equal(p.configs.filter((c) => c.team.models.GK === model).length, 8);
  for (const c of p.configs) {
    assert.equal(c.team.inference?.MID.maxOutputTokens, 1024);
    assert.equal(c.team.inference?.MID.reasoningEffort, "low");
    assert.ok(c.pricing?.[c.team.models.GK]);
  }
  assert.equal(
    new Set(
      p.configs.map(
        (c) => `${c.team.id}:${c.team.models.GK}:${c.seed}:${c.teamSide}`,
      ),
    ).size,
    24,
  );
  r.db.close();
});
test("per-role routing and settings reach each independent decision", async () => {
  const r = fixture();
  const c = withKey(() => previewBenchmark(r)).configs[0];
  c.team.models.MID = "gpt-6-sol";
  const run = r.create(c);
  run.status = "running";
  r.saveRun(run);
  const seen: any[] = [];
  await executeRound(
    r,
    run,
    {
      kind: "responses",
      async decide(i) {
        seen.push(i);
        return {
          choice: "hold",
          confidence: null,
          probabilities: null,
          inputTokens: 10,
          outputTokens: 1,
        };
      },
    },
    new AbortController().signal,
  );
  assert.equal(seen.length, 5);
  assert.equal(seen.find((i) => i.player.role === "MID").model, "gpt-6-sol");
  assert.equal(seen[0].inference.maxOutputTokens, 1024);
  assert.equal(seen[0].observation.matchContext.timeRemaining, 20);
  assert.ok(run.estimatedCostUsd! > 0);
  assert.equal(run.reservedCostUsd, 0);
  r.db.close();
});
test("cost reservations are atomic and retained if usage is unknown", async () => {
  const r = fixture();
  const b = withKey(() =>
    createBenchmark(r, {
      models: ["gpt-6-luna"],
      teamIds: ["team-provisional"],
      seeds: [42],
      costLimitUsd: 0.1,
    }),
  );
  const run = r.run(b.runIds[0])!;
  run.status = "running";
  r.saveRun(run);
  assert.equal(reserve(r, run, 100, 0.06), true);
  assert.equal(reserve(r, run, 100, 0.06), false);
  assert.equal(r.run(run.id)?.requests, 1);
  assert.equal(r.run(run.id)?.reservedCostUsd, 0.06);
  r.db.close();
});
test("versioned recent trends use a ten-second window and own-team perspective", () => {
  const r = fixture();
  const c = previewBenchmark(r, { provider: "mock" }).configs[0],
    s = r.create(c).state;
  const zero = { home: blankStats(), away: blankStats() };
  s.time = 15;
  s.stats.home.shots = 4;
  s.stats.away.shots = 2;
  const at5 = structuredClone(zero);
  at5.home.shots = 1;
  const context = {
    duration: 20,
    history: [
      { time: 0, stats: zero },
      { time: 5, stats: at5 },
    ],
  };
  const home = observation(
      s,
      s.players.find((p) => p.side === "home")!,
      context,
    ),
    away = observation(
      s,
      s.players.find((p) => p.side === "away")!,
      context,
    );
  assert.equal(home.recentTrends?.windowSeconds, 10);
  assert.equal(home.recentTrends?.us.shots, 3);
  assert.equal(away.recentTrends?.us.shots, 2);
  assert.equal(home.matchContext?.late, true);
  assert.equal(home.matchContext?.timeRemaining, 5);
  assert.equal(observation(s, s.players[0]).version, "team-relative-v1");
  r.db.close();
});
test("analytics pools samples, separates mixed teams and excludes fixtures by default", () => {
  const r = fixture();
  const c = withKey(() => previewBenchmark(r)).configs[0];
  function completed(samples: number[], mixed = false) {
    const cfg = structuredClone(c);
    if (mixed) cfg.team.models.MID = "gpt-6-sol";
    const run = r.create(cfg);
    run.status = "completed";
    run.state.time = 20;
    r.saveRun(run);
    r.saveRound(run, {
      round: 0,
      frames: [],
      measurements: [],
      waitingMs: 200,
      traces: samples.map(
        (latencyMs, i) =>
          ({
            playerId: `${cfg.teamSide}-GK`,
            provider: "responses",
            model: cfg.team.models.GK,
            attempts: 1,
            latencyMs,
            inputTokens: 10,
            outputTokens: 1,
            attemptLog: [
              {
                durationMs: latencyMs,
                inputTokens: 10,
                outputTokens: 1,
                error: null,
              },
            ],
            error: null,
          }) as any,
      ),
    });
    return run;
  }
  completed([10]);
  completed([100, 100, 100, 100, 100]);
  completed([50], true);
  const result = analytics(r);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups.find((g) => g.matches === 2)?.medianMs, 100);
  assert.equal(percentile([10, 20], 0.95), 20);
  const mock = r.create({ ...c, provider: "mock" });
  mock.status = "completed";
  r.saveRun(mock);
  assert.equal(analytics(r).runs.length, 3);
  assert.equal(analytics(r, { origin: "test fixture" }).runs.length, 1);
  r.db.close();
});
test("unavailable benchmark model blocks its remaining variants without spending more calls", async () => {
  const r = fixture();
  const b = withKey(() =>
    createBenchmark(r, {
      models: ["gpt-6-luna"],
      teamIds: ["team-provisional"],
      seeds: [42],
      duration: 1,
    }),
  );
  let calls = 0;
  await play(r, r.run(b.runIds[0])!, "test", {
    kind: "responses",
    async decide() {
      calls++;
      throw { status: 404 };
    },
  });
  assert.equal(calls, 5);
  assert.ok(b.runIds.every((id) => r.run(id)?.status === "failed"));
  r.db.close();
});
test("mock benchmark completes without remote calls and records fixture-only analytics", async () => {
  const r = fixture();
  const b = createBenchmark(r, {
    provider: "mock",
    models: ["gpt-6-luna"],
    teamIds: ["team-provisional", "team-211-provisional"],
    seeds: [42],
    duration: 1,
  });
  for (const id of b.runIds) await play(r, r.run(id)!, "test");
  assert.equal(analytics(r).groups.length, 0);
  assert.equal(
    analytics(r, { origin: "test fixture", benchmark: b.id }).runs.length,
    4,
  );
  assert.ok(b.runIds.every((id) => r.run(id)?.requests === 0));
  r.db.close();
});

test("unknown provider usage keeps conservative token and cost reservations", async () => {
  const r = fixture();
  const c = withKey(() => previewBenchmark(r)).configs[0];
  const run = r.create(c);
  run.status = "running";
  r.saveRun(run);
  const result = await executeRound(
    r,
    run,
    {
      kind: "responses",
      async decide() {
        return {
          choice: "hold",
          confidence: null,
          probabilities: null,
          inputTokens: null,
          outputTokens: 2,
        };
      },
    },
    new AbortController().signal,
  );
  assert.equal(result.traces.length, 10);
  assert.ok(
    result.traces
      .filter((t) => t.provider === "responses")
      .every((t) => t.inputTokens === null),
  );
  assert.ok(r.run(run.id)!.reservedTokens > 0);
  assert.ok(r.run(run.id)!.reservedCostUsd! > 0);
  assert.equal(r.run(run.id)!.inputTokens, 0);
  r.db.close();
});
test("benchmark pause and resume preserve frozen manifests and model assignments", () => {
  const r = fixture();
  const b = createBenchmark(r, {
    provider: "mock",
    models: ["gpt-6-luna", "gpt-6-sol"],
    teamIds: ["team-provisional"],
    seeds: [42],
    duration: 1,
  });
  const before = b.runIds.map((id) => JSON.stringify(r.run(id)!.config));
  r.seriesControl(b.id, "pause");
  assert.ok(b.runIds.every((id) => r.run(id)?.status === "paused"));
  r.seriesControl(b.id, "run");
  assert.ok(b.runIds.every((id) => r.run(id)?.status === "queued"));
  assert.deepEqual(
    b.runIds.map((id) => JSON.stringify(r.run(id)!.config)),
    before,
  );
  r.db.close();
});
test("legacy observation configurations do not acquire v2 context during resumed execution", async () => {
  const r = fixture();
  const c = previewBenchmark(r, { provider: "mock" }).configs[0];
  c.versions.observation = "team-relative-v1";
  const run = r.create(c);
  const result = await executeRound(
    r,
    run,
    {
      kind: "mock",
      async decide() {
        throw new Error("No call expected");
      },
    },
    new AbortController().signal,
  );
  assert.ok(
    result.traces.every(
      (t) => (t.observation as any).version === "team-relative-v1",
    ),
  );
  assert.ok(result.traces.every((t) => !(t.observation as any).matchContext));
  r.db.close();
});

test("fast failed requests cannot masquerade as successful model speed", () => {
  const r = fixture();
  const c = withKey(() => previewBenchmark(r)).configs[0],
    run = r.create(c);
  run.status = "completed";
  run.state.time = 20;
  r.saveRun(run);
  r.saveRound(run, {
    round: 0,
    frames: [],
    measurements: [],
    waitingMs: 1200,
    traces: [1, 2, 3, 1000].map(
      (latencyMs, i) =>
        ({
          playerId: `${c.teamSide}-GK`,
          provider: "responses",
          model: c.team.models.GK,
          attempts: 1,
          latencyMs,
          inputTokens: i < 3 ? null : 10,
          outputTokens: 1,
          error: i < 3 ? "Request failed" : null,
          attemptLog: [
            {
              durationMs: latencyMs,
              inputTokens: i < 3 ? null : 10,
              outputTokens: 1,
              error: i < 3 ? "Request failed" : null,
            },
          ],
        }) as any,
    ),
  });
  const a = analytics(r);
  assert.equal(a.groups[0].medianMs, 2);
  assert.equal(a.groups[0].successfulMedianMs, 1000);
  assert.equal(a.groups[0].failures, 3);
  assert.ok(a.insights.some((x) => x.includes("hold actions")));
  r.db.close();
});
