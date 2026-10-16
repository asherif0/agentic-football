import type { DecisionTrace, Frame, Vec } from "../../lib/simulation/types";

/** Engine pitch size in world units (see lib/simulation/engine.ts). */
export const PITCH = { width: 40, height: 20 };
/** Positions that jump further than this between frames are snapped, not blended (kickoff resets). */
export const SNAP_DISTANCE = 2;

export type SampledFrame = {
  time: number;
  index: number;
  players: {
    id: string;
    side: Frame["players"][number]["side"];
    role: Frame["players"][number]["role"];
    x: number;
    y: number;
  }[];
  ball: Vec & { owner: string | null };
  score: [number, number];
};

/** Index of the last frame whose time is ≤ t (0 when t precedes every frame). */
export function frameIndexAt(frames: Frame[], t: number) {
  if (!frames.length) return -1;
  let lo = 0,
    hi = frames.length - 1;
  if (t <= frames[0].time) return 0;
  if (t >= frames[hi].time) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const blend = (a: number, b: number, k: number) => a + (b - a) * k;
const far = (a: Vec, b: Vec) =>
  Math.abs(a.x - b.x) > SNAP_DISTANCE || Math.abs(a.y - b.y) > SNAP_DISTANCE;

/** Interpolated positions at time t; 20 Hz engine frames become smooth motion. */
export function sampleFrame(frames: Frame[], t: number): SampledFrame | null {
  const i = frameIndexAt(frames, t);
  if (i < 0) return null;
  const a = frames[i],
    b = frames[i + 1];
  const span = b ? b.time - a.time : 0,
    k = b && span > 0 ? Math.min(1, Math.max(0, (t - a.time) / span)) : 0;
  const next = new Map(b?.players.map((p) => [p.id, p]) ?? []);
  return {
    time: b ? blend(a.time, b.time, k) : a.time,
    index: i,
    players: a.players.map((p) => {
      const q = next.get(p.id);
      return q && !far(p, q)
        ? { ...p, x: blend(p.x, q.x, k), y: blend(p.y, q.y, k) }
        : { ...p };
    }),
    ball:
      b && !far(a.ball, b.ball)
        ? {
            x: blend(a.ball.x, b.ball.x, k),
            y: blend(a.ball.y, b.ball.y, k),
            owner: a.ball.owner,
          }
        : { ...a.ball },
    score: a.score,
  };
}

/** Recent positions of the ball (or a player) up to time t, newest last; breaks at snaps. */
export function trail(
  frames: Frame[],
  t: number,
  seconds: number,
  playerId?: string,
): Vec[] {
  const end = frameIndexAt(frames, t);
  if (end < 0) return [];
  const pick = (f: Frame): Vec | undefined =>
    playerId ? f.players.find((p) => p.id === playerId) : f.ball;
  const out: Vec[] = [];
  for (let i = end; i >= 0 && frames[i].time >= t - seconds; i--) {
    const p = pick(frames[i]);
    if (!p) break;
    if (out.length && far(out[out.length - 1], p)) break;
    out.push({ x: p.x, y: p.y });
  }
  return out.reverse();
}

/** Decision traces grouped per player and sorted by time. */
export function tracesByPlayer(traces: DecisionTrace[]) {
  const by = new Map<string, DecisionTrace[]>();
  for (const t of traces) {
    const list = by.get(t.playerId) ?? [];
    list.push(t);
    by.set(t.playerId, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.time - b.time);
  return by;
}

/** The decision a player was executing at time t (latest trace with time ≤ t). */
export function currentDecision<T extends { time: number }>(
  traces: T[] | undefined,
  t: number,
): T | null {
  if (!traces?.length || t < traces[0].time) return null;
  let lo = 0,
    hi = traces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (traces[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return traces[lo];
}

export const clock = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
