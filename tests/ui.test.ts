import test from "node:test";
import assert from "node:assert/strict";
import { clusterEvents } from "../app/lib/timeline";
import type { Event } from "../lib/simulation/types";
const event = (id: number, time: number): Event => ({
  id,
  time,
  type: "goal",
  side: "home",
  detail: "Goal",
  bookmark: true,
});
test("timeline clustering preserves timestamps and every coincident event", () => {
  const events = [event(3, 30), event(2, 10), event(1, 10), event(4, 10.1)];
  const groups = clusterEvents(events, 60, 600);
  assert.deepEqual(
    groups.map((g) => g.map((e) => e.id)),
    [[1, 2, 4], [3]],
  );
  assert.deepEqual(
    events.map((e) => e.id),
    [3, 2, 1, 4],
  );
  assert.equal(groups[0][2].time, 10.1);
});
test("timeline clustering adapts to narrow viewports and handles no events", () => {
  const events = [event(1, 0), event(2, 5), event(3, 60)];
  assert.equal(clusterEvents(events, 60, 120).length, 2);
  assert.equal(clusterEvents(events, 60, 1200).length, 3);
  assert.deepEqual(clusterEvents([], 0, 320), []);
  assert.ok(clusterEvents([event(1, 0)], 0, 0).length === 1);
});

import { placeTags } from "../app/lib/chart-layout";
test("scatter tags never overlap and drop when there is no room", () => {
  const tags = placeTags(
    [
      { id: "a", tag: "Luna", x: 100, y: 100 },
      { id: "b", tag: "Luna", x: 104, y: 100 },
      { id: "c", tag: "Sol", x: 300, y: 100 },
    ],
    400,
    200,
  );
  const a = tags.get("a")!,
    b = tags.get("b")!;
  assert.ok(a && b && tags.get("c"));
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  const crowded = placeTags(
    Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      tag: "Model",
      x: 50 + i,
      y: 50,
    })),
    120,
    100,
  );
  assert.ok(crowded.size < 12);
});
