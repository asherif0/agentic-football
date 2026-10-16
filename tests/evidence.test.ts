import test from "node:test";
import assert from "node:assert/strict";
import { promptEvidence, rankVersions } from "../app/lib/evidence";
import type { RunMetric } from "../app/lib/data/types";

const roles = ["GK", "DEF", "MID", "FOR1", "FOR2"] as const;
function run(
  id: string,
  prompt: string,
  goals: number,
  against: number,
  model = "gpt-6-luna",
): RunMetric {
  const stats = (g: number) => ({
    goals: g,
    shots: 2,
    onTarget: 1,
    saves: 0,
    possessionSeconds: 10,
    passes: 4,
    completedPasses: 3,
    interceptions: 0,
    tackleAttempts: 0,
    tackles: 0,
    turnovers: 1,
    dangerousTurnovers: 0,
  });
  return {
    id,
    createdAt: "2026-10-16T10:00:00Z",
    status: "completed",
    played: 20,
    promptIds: roles.map((r) => (r === "MID" ? prompt : `p-${r}`)),
    models: Object.fromEntries(roles.map((r) => [r, model])) as any,
    stats: stats(goals),
    against: stats(against),
    roles: roles.map((role) => ({
      role,
      model,
      stats: stats(role === "MID" ? 1 : 0),
      latencies: [1000, 2000],
      failures: 0,
      requests: 2,
      retries: 0,
      inputTokens: 10,
      outputTokens: 2,
    })),
  } as unknown as RunMetric;
}

test("promptEvidence attributes results to each prompt that played", () => {
  const ev = promptEvidence([
    run("a", "mid-1", 2, 0),
    run("b", "mid-1", 0, 1, "gpt-6-sol"),
  ]);
  const mid = ev.get("mid-1")!;
  assert.equal(mid.role, "MID");
  assert.equal(mid.matches, 2);
  assert.equal(mid.wins, 1);
  assert.equal(mid.losses, 1);
  assert.equal(mid.goalDifference, 1);
  assert.equal(mid.gdPer60, 1.5);
  assert.equal(mid.goals, 2);
  assert.equal(mid.byModel.length, 2);
  assert.equal(ev.get("p-GK")!.matches, 2);
});

test("rankVersions only names a best version with enough matched evidence", () => {
  const few = promptEvidence([run("a", "v1", 1, 0)]);
  assert.equal(rankVersions(["v0", "v1"], few).v0.label, "Untested");
  assert.match(rankVersions(["v0", "v1"], few).v1.label, /Only tested version/);
  const many = promptEvidence([
    ...[1, 2, 3].map((i) => run("a" + i, "v1", 1, 0)),
    ...[1, 2, 3].map((i) => run("b" + i, "v2", 0, 1)),
  ]);
  const r = rankVersions(["v1", "v2"], many);
  assert.equal(r.v1.best, true);
  assert.equal(r.v2.best, false);
  assert.match(r.v1.label, /Best observed · n=3/);
});
