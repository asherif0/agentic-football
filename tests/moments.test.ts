import test from "node:test";
import assert from "node:assert/strict";
import {
  findAnnotation,
  involvedRole,
  latestVersion,
  momentAnnotation,
  reviewedVersion,
} from "../app/lib/moments";
import type { Event, Frame, Run } from "../lib/simulation/types";

const ev = (
  id: number,
  time: number,
  type: string,
  side: "home" | "away",
  playerId?: string,
  detail = type,
): Event => ({
  id,
  time,
  type,
  side,
  playerId,
  detail,
  bookmark: true,
});

function run(events: Event[], extra: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    matchId: "match-1",
    evidenceOrigin: "local simulation",
    config: { teamSide: "away" } as Run["config"],
    state: { events } as Run["state"],
    ...extra,
  } as Run;
}

const frames: Frame[] = [
  {
    time: 5,
    score: [1, 0],
    ball: { x: 5, y: 10, owner: "home-FOR1" },
    players: [
      { id: "home-FOR1", side: "home", role: "FOR1", x: 5, y: 10 },
      { id: "away-GK", side: "away", role: "GK", x: 6, y: 10 },
      { id: "away-DEF", side: "away", role: "DEF", x: 15, y: 10 },
    ],
  },
];

test("our own moments name our actor and the right phase", () => {
  const goal = ev(1, 5, "goal", "away", "away-FOR2", "GOAL");
  const a = momentAnnotation(run([goal]), frames, goal)!;
  assert.equal(a.role, "FOR2");
  assert.equal(a.phase, "In possession");
  assert.equal(a.team, "us");
  assert.equal(a.diagnosis, "");
  assert.equal(a.timestamp, "5.00s");
  assert.match(a.observation, /Goal scored \(our FOR2\)/);
  assert.match(a.observation, /score 0–1/);
  assert.equal(a.runId, "run-1");
  assert.equal(a.eventId, 1);
});

test("opponent moments fall back to the paired event, then the nearest player", () => {
  const lost = ev(1, 5, "dangerous-turnover", "away", "away-DEF");
  const regain = ev(2, 5, "counter", "home", "home-FOR1");
  const r = run([lost, regain]);
  assert.equal(involvedRole(r, frames, regain), "DEF");
  assert.equal(
    momentAnnotation(r, frames, regain)!.phase,
    "Defensive transition",
  );
  const shot = ev(
    3,
    5,
    "shot-on-target",
    "home",
    "home-FOR1",
    'Shoot toward goal target 2 at {"x":1,"y":0.5}',
  );
  const a = momentAnnotation(run([shot]), frames, shot)!;
  assert.equal(a.role, "GK");
  assert.equal(a.phase, "Out of possession");
  assert.doesNotMatch(a.observation, /\{/);
});

test("fixtures and matches without evidence cannot be annotated", () => {
  const e = ev(1, 5, "goal", "away", "away-FOR1");
  assert.equal(
    momentAnnotation(run([e], { evidenceOrigin: "test fixture" }), frames, e),
    null,
  );
  assert.equal(momentAnnotation(run([e], { matchId: null }), frames, e), null);
});

test("an annotated moment is found again, as its newest version", () => {
  const e = ev(
    7,
    3.2,
    "counter",
    "away",
    "away-MID",
    "Possession regained: attacking transition",
  );
  const r = run([e]);
  const legacy = {
    id: "a1",
    createdAt: "",
    matchId: "match-1",
    timestamp: "3.20s",
    observation: e.detail,
  };
  const reviewed = {
    id: "a2",
    createdAt: "",
    parentId: "a1",
    matchId: "match-1",
    diagnosis: "late press",
  };
  assert.equal(findAnnotation([legacy], r, e)?.id, "a1");
  assert.equal(findAnnotation([legacy, reviewed], r, e)?.id, "a2");
  assert.equal(latestVersion([legacy, reviewed], legacy).id, "a2");
  const replay = {
    id: "b1",
    createdAt: "",
    runId: "run-1",
    eventId: 7,
    matchId: "match-1",
  };
  assert.equal(findAnnotation([replay], r, e)?.id, "b1");
  assert.equal(
    findAnnotation([replay], r, ev(8, 9, "goal", "away"))?.id,
    undefined,
  );
});

test("a reviewed version links back and keeps unchanged fields", () => {
  const original = {
    id: "a1",
    createdAt: "x",
    matchId: "m",
    phase: "In possession",
    role: "MID",
    diagnosis: "",
    scores: { Shape: null },
  };
  const v = reviewedVersion(original, {
    diagnosis: "Too narrow",
    scores: { Shape: 1 },
  });
  assert.equal(v.parentId, "a1");
  assert.equal(v.diagnosis, "Too narrow");
  assert.equal(v.role, "MID");
  assert.deepEqual(v.scores, { Shape: 1 });
  assert.equal("id" in v, false);
});
