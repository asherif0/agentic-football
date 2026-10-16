import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store";
import { simulationRepository } from "../lib/simulation/repository";
import {
  candidates,
  initialState,
  advance,
  relative,
  absolute,
  observation,
  measurements,
  DEFAULT_LAYOUT,
  scripted,
} from "../lib/simulation/engine";
import { executeRound, play } from "../lib/simulation/runner";
import { ROLES, summarize } from "../lib/domain";
import { provider, ProviderFailure } from "../lib/simulation/providers";
import type { PlayerDecisionProvider } from "../lib/simulation/providers";
function setup() {
  const store = createStore(":memory:");
  store.initialize();
  const repo = simulationRepository(store);
  repo.ensureDefault();
  const input = {
    teamId: "team-provisional",
    scenarioId: repo.scenarios()[0].id,
    models: Object.fromEntries(ROLES.map((r) => [r, "gpt-6-luna"])),
    provider: "mock",
    bot: "balanced",
    teamSide: "home",
    seed: 42,
    duration: 2,
    interval: 1,
    requestLimit: 10,
    inputTokenLimit: 1000000,
  };
  return { repo, input, config: repo.buildConfig(input) };
}
test("legal candidates, relative coordinates and seeded replay are deterministic", () => {
  const { config } = setup(),
    s = initialState(config),
    copy = structuredClone(s);
  for (const p of s.players) {
    assert.deepEqual(absolute(relative(p, p.side), p.side), { x: p.x, y: p.y });
    p.x = 0.3;
    p.y = 0.3;
    for (const a of candidates(s, p, 1))
      if (a.type === "move" || a.type === "dribble") {
        assert.ok(a.target!.x >= 0.3 && a.target!.y >= 0.3);
      }
  }
  const a = initialState(config),
    b = structuredClone(a);
  for (let i = 0; i < 10; i++) {
    const actions = Object.fromEntries(
      a.players.map((p) => [
        p.id,
        scripted(a, p, candidates(a, p, 1), "balanced"),
      ]),
    );
    assert.deepEqual(advance(a, actions, 1), advance(b, actions, 1));
  }
  assert.equal(a.time, 10);
  assert.ok(
    a.stats.home.possessionSeconds + a.stats.away.possessionSeconds <= 10.00001,
  );
  assert.equal(measurements(a).length, 2);
  assert.deepEqual(s.round, copy.round);
});
test("shot, goal, kickoff and boundary restart accounting", () => {
  const { config } = setup(),
    s = initialState(config);
  for (const p of s.players) {
    p.x = 5;
    p.y = 2;
  }
  const p = s.players[1];
  p.x = 38;
  p.y = 10;
  s.ball = {
    x: 38,
    y: 10,
    vx: 0,
    vy: 0,
    owner: p.id,
    lastTouch: p.id,
    flight: null,
  };
  s.lastPossession = "home";
  advance(
    s,
    { [p.id]: candidates(s, p, 1).find((a) => a.id === "shoot-1")! },
    1,
  );
  assert.equal(s.stats.home.shots, 1);
  assert.equal(s.stats.home.onTarget, 1);
  assert.equal(s.stats.home.goals, 1);
  assert.ok(s.events.some((e) => e.type === "kickoff" && e.side === "away"));
  s.ball = {
    x: 20,
    y: 0.1,
    vx: 0,
    vy: -10,
    owner: null,
    lastTouch: p.id,
    flight: null,
  };
  advance(s, {}, 0.1);
  assert.ok(s.events.some((e) => e.type === "restart"));
  assert.equal(s.lastPossession, "away");
});
test("goalkeeper intercept saves and defending-third turnover", () => {
  const { config } = setup(),
    s = initialState(config);
  s.players.forEach((p) => {
    p.x = 5;
    p.y = 2;
  });
  const shooter = s.players.find((p) => p.id === "home-FOR1")!,
    keeper = s.players.find((p) => p.id === "away-GK")!;
  shooter.x = 35;
  shooter.y = 10;
  keeper.x = 38;
  keeper.y = 10;
  s.ball = {
    x: 35,
    y: 10,
    vx: 0,
    vy: 0,
    owner: shooter.id,
    lastTouch: shooter.id,
    flight: null,
  };
  s.lastPossession = "home";
  advance(
    s,
    {
      [shooter.id]: candidates(s, shooter, 1).find((a) => a.id === "shoot-1")!,
    },
    1,
  );
  assert.equal(s.stats.away.saves, 1);
  assert.equal(s.stats.home.turnovers, 1);
  assert.equal(s.stats.home.goals, 0);
});
test("concurrent decisions receive one frozen round and exact prompts", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  const run = repo.create(config);
  let active = 0,
    max = 0;
  const times: number[] = [];
  const adapter: PlayerDecisionProvider = {
    kind: "decisions",
    async decide(input) {
      active++;
      max = Math.max(max, active);
      assert.equal(input.prompt, config.team.prompts[input.player.role].text);
      times.push((input.observation as any).time);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return {
        choice: "hold",
        confidence: 0.2,
        probabilities: null,
        inputTokens: 10,
        outputTokens: 1,
      };
    },
  };
  const result = await executeRound(
    repo,
    run,
    adapter,
    new AbortController().signal,
  );
  assert.equal(max, 5);
  assert.deepEqual(times, [0, 0, 0, 0, 0]);
  assert.equal(result.traces.length, 10);
  assert.equal(repo.run(run.id)!.requests, 5);
  assert.equal(run.state.time, 0);
});
test("invalid choices and refusals hold; one transient retry is logged", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  let count = 0;
  const adapter: PlayerDecisionProvider = {
    kind: "decisions",
    async decide() {
      count++;
      if (count <= 5)
        throw Object.assign(new Error("private body"), { status: 429 });
      return {
        choice: "invalid",
        confidence: null,
        probabilities: null,
        inputTokens: 10,
        outputTokens: 0,
      };
    },
  };
  const r = repo.create(config),
    result = await executeRound(repo, r, adapter, new AbortController().signal);
  assert.equal(r.requests, 10);
  assert.ok(
    result.traces
      .filter((t) => t.provider === "decisions")
      .every((t) => t.selected.id === "hold"),
  );
  assert.ok(
    result.traces
      .filter((t) => t.provider === "decisions")
      .every(
        (t) =>
          t.attempts === 2 &&
          t.error === "Provider returned an unknown action ID",
      ),
  );
  const refusal: PlayerDecisionProvider = {
    kind: "decisions",
    async decide() {
      throw new ProviderFailure("Decision refused", {
        inputTokens: 2,
        outputTokens: 0,
      });
    },
  };
  const other = repo.create(config),
    refused = await executeRound(
      repo,
      other,
      refusal,
      new AbortController().signal,
    );
  assert.equal(other.requests, 5);
  assert.ok(
    refused.traces
      .filter((t) => t.provider === "decisions")
      .every((t) => t.selected.id === "hold" && t.error === "Decision refused"),
  );
});
test("request and token ceilings stop without physics, preserving attempted decisions", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  config.requestLimit = 2;
  const r = repo.create(config),
    adapter: PlayerDecisionProvider = {
      kind: "decisions",
      async decide() {
        return {
          choice: "hold",
          confidence: null,
          probabilities: null,
          inputTokens: 10,
          outputTokens: 0,
        };
      },
    };
  await play(repo, r, "test", adapter);
  assert.equal(repo.run(r.id)!.status, "limited");
  assert.equal(r.state.time, 0);
  assert.equal(r.requests, 2);
  assert.equal(repo.rounds(r.id)[0].traces.length, 10);
  config.requestLimit = 10;
  config.inputTokenLimit = 1;
  const t = repo.create(config);
  await play(repo, t, "test", adapter);
  assert.equal(t.requests, 0);
  assert.equal(t.status, "limited");
});
test("mock workflow persists fixture evidence, pause/resume and stop", async () => {
  const { repo, config } = setup(),
    r = repo.create(config);
  repo.control(r.id, "pause");
  assert.equal(repo.run(r.id)!.status, "paused");
  repo.control(r.id, "run");
  await play(repo, repo.run(r.id)!, "test");
  const done = repo.run(r.id)!;
  assert.equal(done.status, "completed");
  assert.ok(done.matchId);
  assert.equal(repo.store.read().matches[0].evidenceOrigin, "test fixture");
  assert.equal(
    (summarize(config.team.id, repo.store.read()) as any).results.matches,
    0,
  );
  const stop = repo.create(config);
  repo.control(stop.id, "stop");
  assert.equal(repo.run(stop.id)!.status, "stopped");
  assert.throws(() =>
    repo.promotion({
      teamId: config.team.id,
      outcome: "champion",
      reason: "fixture",
      runIds: [r.id],
    }),
  );
});
test("paired series settings, formation scenarios and absent API access", () => {
  const { repo, input } = setup();
  const s = repo.createSeries({
    ...input,
    challengerTeamId: "team-baseline",
    challengerScenarioId: input.scenarioId,
    seriesRequestLimit: 120,
    seriesInputTokenLimit: 12000000,
  });
  assert.equal(s.runIds.length, 12);
  assert.equal(
    new Set(s.runIds.map((id) => repo.run(id)!.config.seed)).size,
    3,
  );
  for (const seed of [42, 43, 44])
    assert.equal(
      s.runIds
        .map((id) => repo.run(id)!)
        .filter((r) => r.config.seed === seed && r.config.teamSide === "away")
        .length,
      2,
    );
  repo.seriesControl(s.id, "pause");
  assert.ok(s.runIds.every((id) => repo.run(id)!.status === "paused"));
  repo.seriesControl(s.id, "run");
  assert.ok(s.runIds.every((id) => repo.run(id)!.status === "queued"));
  const original = repo.store.read().formations[0];
  for (const family of ["2-1-1", "3-0-1"]) {
    const f = repo.store.save("formations", {
      ...original,
      id: undefined,
      family,
      label: family,
      parentId: null,
    });
    assert.ok(
      repo.scenario({
        formationId: f.id,
        label: family,
        parentId: null,
        layout: DEFAULT_LAYOUT,
      }),
    );
  }
  assert.throws(() => provider("decisions", ""));
});

test("worker lease interruption preserves explicit status and blocks duplicate workers", async () => {
  const { acquireWorker } = await import("../lib/simulation/lifecycle");
  const { repo, config } = setup(),
    r = repo.create(config);
  r.status = "running";
  repo.saveRun(r);
  assert.equal(acquireWorker(repo, "worker-1", 100000), true);
  assert.equal(repo.run(r.id)!.status, "interrupted");
  assert.ok(repo.run(r.id)!.matchId);
  assert.equal(acquireWorker(repo, "worker-2", 100001), false);
  assert.equal(acquireWorker(repo, "worker-2", 110001), true);
});
test("pause after frozen decisions resumes; stop cancels outstanding requests", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  const r = repo.create(config);
  let paused = false;
  const adapter: PlayerDecisionProvider = {
    kind: "decisions",
    async decide() {
      if (!paused) {
        paused = true;
        repo.control(r.id, "pause");
      }
      return {
        choice: "hold",
        confidence: null,
        probabilities: null,
        inputTokens: 1,
        outputTokens: 0,
      };
    },
  };
  await play(repo, r, "test", adapter);
  assert.equal(r.status, "paused");
  assert.equal(r.state.time, 0);
  assert.equal(repo.rounds(r.id).length, 1);
  repo.control(r.id, "run");
  const hold: PlayerDecisionProvider = {
    kind: "decisions",
    async decide() {
      return {
        choice: "hold",
        confidence: null,
        probabilities: null,
        inputTokens: 1,
        outputTokens: 0,
      };
    },
  };
  await play(repo, repo.run(r.id)!, "test", hold);
  assert.equal(repo.run(r.id)!.status, "limited"); // prior calls count toward the original cap
  const stopped = repo.create(config);
  const slow: PlayerDecisionProvider = {
    kind: "decisions",
    async decide(input, signal) {
      repo.control(stopped.id, "stop");
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) reject(new Error("cancelled"));
        else
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
      });
      return {
        choice: "hold",
        confidence: null,
        probabilities: null,
        inputTokens: 0,
        outputTokens: 0,
      };
    },
  };
  await play(repo, stopped, "test", slow);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.state.time, 0);
  assert.equal(repo.rounds(stopped.id).length, 1);
});
test("pass completions and dangerous interceptions use event accounting", () => {
  const { config } = setup(),
    s = initialState(config);
  s.players.forEach((p, i) => {
    p.x = 30;
    p.y = 2 + i;
  });
  const passer = s.players.find((p) => p.id === "home-DEF")!,
    receiver = s.players.find((p) => p.id === "home-MID")!;
  passer.x = 5;
  passer.y = 10;
  receiver.x = 8;
  receiver.y = 10;
  s.ball = {
    x: 5,
    y: 10,
    vx: 0,
    vy: 0,
    owner: passer.id,
    lastTouch: passer.id,
    flight: null,
  };
  s.lastPossession = "home";
  advance(
    s,
    { [passer.id]: candidates(s, passer, 1).find((a) => a.id === "pass-MID")! },
    1,
  );
  assert.equal(s.stats.home.passes, 1);
  assert.equal(s.stats.home.completedPasses, 1);
  const opponent = s.players.find((p) => p.id === "away-DEF")!;
  opponent.x = 9;
  opponent.y = 10;
  s.ball = {
    x: 8,
    y: 10,
    vx: 12,
    vy: 0,
    owner: null,
    lastTouch: receiver.id,
    flight: {
      kind: "pass",
      from: receiver.id,
      side: "home",
      released: s.time,
      onTarget: false,
    },
  };
  advance(s, {}, 0.2);
  assert.equal(s.stats.away.interceptions, 1);
  assert.equal(s.stats.home.dangerousTurnovers, 1);
});

test("2–1–1 and 3–0–1 support full simulation workflow from configuration", async () => {
  const { repo, input } = setup();
  const w = repo.store.read(),
    original = w.formations[0];
  for (const family of ["2-1-1", "3-0-1"]) {
    const formation = repo.store.save("formations", {
      ...original,
      id: undefined,
      family,
      label: family,
      parentId: null,
    });
    const promptIds = Object.fromEntries(
      ROLES.map((role) => {
        const p = w.prompts.find((p) => p.role === role)!;
        return [
          role,
          repo.store.save("prompts", {
            ...p,
            id: undefined,
            formationId: formation.id,
            parentId: p.id,
            hypothesisIds: [],
          }).id,
        ];
      }),
    );
    const team = repo.store.save("teams", {
      label: family,
      formationId: formation.id,
      promptIds,
      parentId: null,
    });
    const scenario = repo.scenario({
      formationId: formation.id,
      label: family,
      parentId: null,
      layout: DEFAULT_LAYOUT,
    });
    const config = repo.buildConfig({
      ...input,
      teamId: team.id,
      scenarioId: scenario.id,
    });
    const r = repo.create(config);
    await play(repo, r, "test");
    assert.equal(r.status, "completed");
    assert.equal(r.config.team.formation.id, formation.id);
    const payload = JSON.parse(
      JSON.stringify({ run: repo.run(r.id), rounds: repo.rounds(r.id) }),
    );
    const replay = initialState(payload.run.config);
    for (const round of payload.rounds)
      if (round.frames.length)
        advance(
          replay,
          Object.fromEntries(
            round.traces.map((t: any) => [t.playerId, t.selected]),
          ),
          1,
        );
    assert.deepEqual(replay, payload.run.state);
    assert.ok(payload.rounds[0].measurements.length);
    assert.ok(r.matchId);
  }
});
test("local evidence cannot contribute to portal summaries or promotions", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  const r = repo.create(config),
    hold: PlayerDecisionProvider = {
      kind: "decisions",
      async decide() {
        return {
          choice: "hold",
          confidence: null,
          probabilities: null,
          inputTokens: 1,
          outputTokens: 0,
        };
      },
    };
  await play(repo, r, "test", hold);
  assert.equal(r.status, "completed");
  assert.equal(repo.store.read().matches[0].evidenceOrigin, "local simulation");
  assert.equal(summarize(config.team.id, repo.store.read()).results.matches, 0);
  assert.throws(
    () =>
      repo.store.save("decisions", {
        family: config.team.formation.family,
        teamId: config.team.id,
        outcome: "champion",
        reason: "No portal evidence",
        matchIds: [r.matchId],
      }),
    /real/,
  );
  assert.ok(
    repo.promotion({
      teamId: config.team.id,
      outcome: "challenger",
      reason: "Review repeated simulations",
      runIds: [r.id],
    }),
  );
  assert.equal(repo.store.read().decisions.length, 0);
});
test("timeouts exhaust one retry and preserve unknown usage, without switching provider", async () => {
  const { repo, config } = setup();
  config.provider = "decisions";
  const r = repo.create(config),
    timeout: PlayerDecisionProvider = {
      kind: "decisions",
      async decide() {
        throw Object.assign(new Error("body must not leak"), {
          name: "APIConnectionTimeoutError",
        });
      },
    };
  const result = await executeRound(
    repo,
    r,
    timeout,
    new AbortController().signal,
  );
  assert.equal(r.requests, 10);
  assert.ok(r.reservedTokens > 0);
  for (const t of result.traces.filter((t) => t.provider === "decisions")) {
    assert.equal(t.selected.id, "hold");
    assert.equal(t.attempts, 2);
    assert.equal(t.attemptLog?.length, 2);
    assert.equal(t.inputTokens, null);
    assert.ok(!t.error?.includes("body"));
  }
});
