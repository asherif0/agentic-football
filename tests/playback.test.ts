import test from "node:test";
import assert from "node:assert/strict";
import {
  clock,
  currentDecision,
  frameIndexAt,
  sampleFrame,
  trail,
} from "../app/lib/playback";
import type { Frame } from "../lib/simulation/types";

const frame = (time: number, x: number, ballX = x): Frame => ({
  time,
  players: [{ id: "home-GK", side: "home", role: "GK", x, y: 10 }],
  ball: { x: ballX, y: 10, owner: null },
  score: [0, 0],
});

test("frameIndexAt finds the last frame at or before t", () => {
  const frames = [frame(0, 0), frame(0.05, 1), frame(0.1, 2)];
  assert.equal(frameIndexAt([], 1), -1);
  assert.equal(frameIndexAt(frames, -1), 0);
  assert.equal(frameIndexAt(frames, 0.05), 1);
  assert.equal(frameIndexAt(frames, 0.07), 1);
  assert.equal(frameIndexAt(frames, 9), 2);
});

test("sampleFrame blends neighbouring frames", () => {
  const s = sampleFrame([frame(0, 0), frame(0.1, 1)], 0.05)!;
  assert.ok(Math.abs(s.players[0].x - 0.5) < 1e-9);
  assert.ok(Math.abs(s.ball.x - 0.5) < 1e-9);
  assert.equal(s.index, 0);
});

test("sampleFrame snaps across kickoff resets instead of sliding", () => {
  const s = sampleFrame([frame(0, 30), frame(0.05, 10)], 0.04)!;
  assert.equal(s.players[0].x, 30);
  assert.equal(s.ball.x, 30);
});

test("sampleFrame copes with growing live frame lists", () => {
  const frames = [frame(0, 0)];
  assert.equal(sampleFrame(frames, 5)!.players[0].x, 0);
  frames.push(frame(0.05, 1));
  assert.equal(sampleFrame(frames, 5)!.players[0].x, 1);
});

test("trail returns recent positions and stops at a snap", () => {
  const frames = [
    frame(0, 30),
    frame(0.05, 1),
    frame(0.1, 1.5),
    frame(0.15, 2),
  ];
  assert.deepEqual(
    trail(frames, 0.15, 1).map((p) => p.x),
    [1, 1.5, 2],
  );
  assert.deepEqual(
    trail(frames, 0.15, 0.06, "home-GK").map((p) => p.x),
    [1.5, 2],
  );
});

test("currentDecision picks the latest trace not after t", () => {
  const traces = [{ time: 0 }, { time: 1 }, { time: 2 }];
  assert.equal(currentDecision(traces, -0.5), null);
  assert.equal(currentDecision(traces, 1.5)?.time, 1);
  assert.equal(currentDecision(traces, 5)?.time, 2);
  assert.equal(currentDecision([], 1), null);
});

test("clock formats match time", () => {
  assert.equal(clock(0), "00:00.0");
  assert.equal(clock(65.25), "01:05.3");
});

import { prettyAction } from "../app/lib/actions";
test("prettyAction strips embedded coordinates", () => {
  assert.deepEqual(prettyAction('move back to {"x":0.5847,"y":0.3424}'), {
    text: "Move back",
    target: "58% · 34%",
  });
  assert.deepEqual(prettyAction('Pass to FOR2 at {"x":0.7,"y":0.25}'), {
    text: "Pass to FOR2",
    target: "70% · 25%",
  });
  assert.deepEqual(prettyAction("Hold current position"), {
    text: "Hold current position",
    target: null,
  });
});
