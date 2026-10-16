import test from "node:test";
import assert from "node:assert/strict";
import { runSummary } from "../lib/simulation/run-summary";
import type { Run, Stats } from "../lib/simulation/types";

const stats = (goals: number): Stats => ({
  goals,
  shots: goals + 1,
  onTarget: goals,
  saves: 0,
  possessionSeconds: 5,
  passes: 4,
  completedPasses: 3,
  interceptions: 0,
  tackleAttempts: 0,
  tackles: 0,
  turnovers: 1,
  dangerousTurnovers: 0,
});
const roles = ["GK", "DEF", "MID", "FOR1", "FOR2"] as const;

function run(teamSide: "home" | "away"): Run {
  return {
    id: "r1",
    createdAt: "2026-10-16T10:00:00Z",
    updatedAt: "2026-10-16T10:01:00Z",
    status: "completed",
    command: "run",
    phase: "complete",
    config: {
      label: "Pilot",
      team: {
        id: "team-provisional",
        label: "Research candidate v1",
        formation: {
          id: "formation-112-r1",
          createdAt: "",
          family: "1–1–2",
          name: "1–1–2",
        },
        prompts: Object.fromEntries(
          roles.map((r) => [r, { id: `p-${r}`, text: "x" }]),
        ) as any,
        models: {
          GK: "gpt-6-sol",
          DEF: "gpt-6-luna",
          MID: "gpt-6-luna",
          FOR1: "gpt-6.1-sol",
          FOR2: "gpt-6.1-sol",
        },
        layout: {} as any,
      },
      opponent: null,
      bot: "balanced",
      provider: "responses",
      teamSide,
      seed: 42,
      duration: 20,
      interval: 1,
      requestLimit: 100,
      inputTokenLimit: 100,
      scenarioIds: [],
      versions: {
        engine: "e",
        observation: "team-relative-v2",
        candidates: "c",
        statistics: "s",
      },
    },
    state: {
      time: 20,
      round: 20,
      rng: 1,
      players: [],
      ball: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        owner: null,
        lastTouch: null,
        flight: null,
      },
      stats: { home: stats(2), away: stats(1) },
      individual: {},
      events: [],
      lastPossession: null,
      lossAt: {},
      recoveries: {},
    },
    requests: 100,
    inputTokens: 1000,
    outputTokens: 100,
    reservedTokens: 0,
    estimatedCostUsd: 0.5,
    reason: null,
    seriesId: null,
    evidenceOrigin: "local simulation",
    matchId: null,
    workerId: null,
  };
}

test("runSummary scores from the perspective of the configured team side", () => {
  const away = runSummary(run("away"), 20);
  assert.deepEqual(away.score, { for: 1, against: 2, home: 2, away: 1 });
  assert.equal(away.stats.for.goals, 1);
  const home = runSummary(run("home"), 0);
  assert.equal(home.score.for, 2);
  assert.equal(home.hasReplay, false);
});

test("runSummary keeps per-position models and prompt ids", () => {
  const s = runSummary(run("home"), 3);
  assert.equal(s.team.models.GK, "gpt-6-sol");
  assert.equal(s.team.promptIds.FOR2, "p-FOR2");
  assert.equal(s.opponent.label, "Scripted balanced");
  assert.equal(s.hasReplay, true);
  assert.equal(s.cost, 0.5);
});
