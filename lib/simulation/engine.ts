import { ROLES } from "../domain";
import {
  Action,
  Ball,
  BotStyle,
  Event,
  Frame,
  Layout,
  Measurement,
  OTHER,
  Player,
  RunConfig,
  Side,
  State,
  Stats,
  Vec,
} from "./types";
export const RULES = {
  width: 40,
  height: 20,
  step: 0.05,
  speed: 4,
  dribbleSpeed: 3.2,
  passSpeed: 13,
  shotSpeed: 20,
  goalHalfWidth: 1.5,
  controlRadius: 0.5,
  keeperRadius: 0.85,
  tackleRange: 1.25,
  tackleSuccess: 0.55,
  passAngleNoise: 0.025,
  shotAngleNoise: 0.07,
};
export const DEFAULT_LAYOUT: Layout = {
  GK: { x: 0.06, y: 0.5 },
  DEF: { x: 0.25, y: 0.5 },
  MID: { x: 0.46, y: 0.5 },
  FOR1: { x: 0.7, y: 0.3 },
  FOR2: { x: 0.65, y: 0.72 },
};
export function blankStats(): Stats {
  return {
    goals: 0,
    shots: 0,
    onTarget: 0,
    saves: 0,
    possessionSeconds: 0,
    passes: 0,
    completedPasses: 0,
    interceptions: 0,
    tackleAttempts: 0,
    tackles: 0,
    turnovers: 0,
    dangerousTurnovers: 0,
  };
}
export function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function random(s: State) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function relative(v: Vec, side: Side): Vec {
  return {
    x: (side === "home" ? v.x : 40 - v.x) / 40,
    y: (side === "home" ? v.y : 20 - v.y) / 20,
  };
}
export function absolute(v: Vec, side: Side): Vec {
  return {
    x: side === "home" ? v.x * 40 : 40 - v.x * 40,
    y: side === "home" ? v.y * 20 : 20 - v.y * 20,
  };
}
export function initialState(
  config: Pick<RunConfig, "team" | "opponent" | "teamSide" | "seed">,
): State {
  const players: Player[] = [];
  for (const side of ["home", "away"] as Side[]) {
    const layout =
      side === config.teamSide
        ? config.team.layout
        : config.opponent?.layout || DEFAULT_LAYOUT;
    for (const role of ROLES) {
      const pos = absolute(layout[role], side);
      players.push({
        id: `${side}-${role}`,
        side,
        role,
        ...pos,
        anchor: { ...pos },
      });
    }
  }
  const s: State = {
    time: 0,
    round: 0,
    rng: config.seed,
    players,
    ball: {
      x: 20,
      y: 10,
      vx: 0,
      vy: 0,
      owner: null,
      lastTouch: null,
      flight: null,
    },
    stats: { home: blankStats(), away: blankStats() },
    individual: Object.fromEntries(players.map((p) => [p.id, blankStats()])),
    events: [],
    lastPossession: null,
    lossAt: {},
    recoveries: {},
  };
  kickoff(s, random(s) < 0.5 ? "home" : "away");
  return s;
}
function emit(
  s: State,
  type: string,
  side: Side,
  detail: string,
  playerId?: string,
  bookmark = false,
) {
  s.events.push({
    id: s.events.length,
    time: Number(s.time.toFixed(3)),
    type,
    side,
    detail,
    playerId,
    bookmark,
  });
}
function increment(s: State, p: Player, key: keyof Stats, n = 1) {
  s.stats[p.side][key] += n;
  s.individual[p.id][key] += n;
}
function kickoff(s: State, side: Side) {
  for (const p of s.players) {
    p.x = p.anchor.x;
    p.y = p.anchor.y;
  }
  const p = s.players.find((p) => p.side === side && p.role === "MID")!;
  p.x = 20;
  p.y = 10;
  s.ball = {
    x: 20,
    y: 10,
    vx: 0,
    vy: 0,
    owner: p.id,
    lastTouch: p.id,
    flight: null,
  };
  s.lastPossession = side;
  s.lossAt = {};
  emit(s, "kickoff", side, "Kickoff", p.id);
}
function gain(s: State, p: Player) {
  const old = s.lastPossession;
  const flight = s.ball.flight;
  if (flight) {
    if (
      flight.side === p.side &&
      flight.kind === "pass" &&
      flight.from !== p.id
    ) {
      const passer = s.players.find((x) => x.id === flight.from)!;
      increment(s, passer, "completedPasses");
      emit(s, "pass-complete", p.side, "Pass completed", p.id);
    }
    if (flight.side !== p.side) {
      if (p.role === "GK" && flight.kind === "shot") {
        increment(s, p, "saves");
        emit(s, "save", p.side, "Goalkeeper save", p.id, true);
      } else {
        increment(s, p, "interceptions");
        emit(s, "interception", p.side, "Interception", p.id);
      }
    }
  }
  if (old && old !== p.side) {
    const loser = s.players.find(
      (x) => x.id === (flight?.from || s.ball.lastTouch),
    );
    if (loser && loser.side === old) {
      increment(s, loser, "turnovers");
      const dangerous = relative(s.ball, old).x < 1 / 3;
      if (dangerous) increment(s, loser, "dangerousTurnovers");
      emit(
        s,
        dangerous ? "dangerous-turnover" : "turnover",
        old,
        "Possession lost",
        loser.id,
        dangerous,
      );
    }
    s.lossAt[old] = s.time;
    delete s.recoveries[old];
    emit(
      s,
      "counter",
      p.side,
      "Possession regained: attacking transition",
      p.id,
      true,
    );
  }
  s.lastPossession = p.side;
  s.ball.owner = p.id;
  s.ball.lastTouch = p.id;
  s.ball.flight = null;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.x = p.x;
  s.ball.y = p.y;
}
export function candidates(s: State, p: Player, interval: number): Action[] {
  const list: Action[] = [
    { id: "hold", type: "hold", description: "Hold current position" },
  ];
  const owner = s.ball.owner === p.id;
  const dirs = [
    [1, 0, "forward"],
    [1, 1, "forward-right"],
    [0, 1, "right"],
    [-1, 1, "back-right"],
    [-1, 0, "back"],
    [-1, -1, "back-left"],
    [0, -1, "left"],
    [1, -1, "forward-left"],
  ] as const;
  for (const [dx, dy, name] of dirs) {
    for (const type of owner
      ? (["move", "dribble"] as const)
      : (["move"] as const)) {
      const length = Math.hypot(dx, dy),
        speed = type === "dribble" ? RULES.dribbleSpeed : RULES.speed,
        sign = p.side === "home" ? 1 : -1;
      const target = {
        x: p.x + ((sign * dx) / length) * speed * interval,
        y: p.y + ((sign * dy) / length) * speed * interval,
      };
      if (
        target.x >= 0.3 &&
        target.x <= 39.7 &&
        target.y >= 0.3 &&
        target.y <= 19.7
      )
        list.push({
          id: `${type}-${name}`,
          type,
          description: `${type} ${name} to ${JSON.stringify(relative(target, p.side))}${owner && type === "move" ? " (release ball)" : ""}`,
          target,
        });
    }
  }
  if (owner) {
    for (const q of s.players.filter((q) => q.side === p.side && q.id !== p.id))
      list.push({
        id: `pass-${q.role}`,
        type: "pass",
        playerId: q.id,
        target: { x: q.x, y: q.y },
        description: `Pass to ${q.role} at ${JSON.stringify(relative(q, p.side))}`,
      });
    for (const [i, y] of [9, 10, 11].entries()) {
      const target = { x: p.side === "home" ? 40 : 0, y };
      list.push({
        id: `shoot-${i}`,
        type: "shoot",
        target,
        description: `Shoot toward goal target ${i + 1} at ${JSON.stringify(relative(target, p.side))}`,
      });
    }
  }
  const q = s.players.find((q) => q.id === s.ball.owner);
  if (q && q.side !== p.side && distance(p, q) <= RULES.tackleRange)
    list.push({
      id: `tackle-${q.role}`,
      type: "tackle",
      playerId: q.id,
      description: `Tackle ${q.role} within reach`,
    });
  return list;
}
export function observation(
  s: State,
  p: Player,
  context?: {
    duration: number;
    history: { time: number; stats: State["stats"] }[];
  },
) {
  const cutoff = Math.max(0, s.time - 10);
  const previous =
    context?.history.filter((x) => x.time <= cutoff).at(-1) ||
    context?.history[0];
  const recent = (side: Side) => ({
    possessionSeconds: previous
      ? Math.max(
          0,
          s.stats[side].possessionSeconds -
            previous.stats[side].possessionSeconds,
        )
      : null,
    shots: previous ? s.stats[side].shots - previous.stats[side].shots : null,
    dangerousTurnovers: previous
      ? s.stats[side].dangerousTurnovers -
        previous.stats[side].dangerousTurnovers
      : null,
    turnovers: previous
      ? s.stats[side].turnovers - previous.stats[side].turnovers
      : null,
  });
  return {
    version: context ? "team-relative-v2" : "team-relative-v1",
    ...(context
      ? {
          matchContext: {
            duration: context.duration,
            timeRemaining: Math.max(0, context.duration - s.time),
            progress: Math.min(1, s.time / context.duration),
            late: s.time / context.duration >= 2 / 3,
          },
          recentTrends: {
            windowSeconds: previous ? s.time - previous.time : 0,
            us: recent(p.side),
            them: recent(OTHER(p.side)),
          },
        }
      : {}),
    time: s.time,
    round: s.round,
    self: { id: p.id, role: p.role, ...relative(p, p.side) },
    score: { us: s.stats[p.side].goals, them: s.stats[OTHER(p.side)].goals },
    players: s.players.map((q) => ({
      id: q.id,
      role: q.role,
      team: q.side === p.side ? "us" : "them",
      ...relative(q, p.side),
    })),
    ball: {
      ...relative(s.ball, p.side),
      owner: s.ball.owner,
      velocity: {
        x: (s.ball.vx / 40) * (p.side === "home" ? 1 : -1),
        y: (s.ball.vy / 20) * (p.side === "home" ? 1 : -1),
      },
    },
    coordinates:
      "x=0 own goal, x=1 opposing goal; y=0 left touchline, y=1 right touchline. Positions normalized.",
    recentEvents: s.events
      .slice(-5)
      .map((e) => ({ time: e.time, type: e.type, playerId: e.playerId })),
  };
}
function segmentDistance(a: Vec, b: Vec, p: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return { distance: distance({ x: a.x + t * dx, y: a.y + t * dy }, p), t };
}
function restart(s: State, side: Side, at: Vec) {
  const choices = s.players
    .filter((p) => p.side === side)
    .sort(
      (a, b) => distance(a, at) - distance(b, at) || a.id.localeCompare(b.id),
    );
  const p = choices[0];
  p.x = Math.max(0.5, Math.min(39.5, at.x));
  p.y = Math.max(0.5, Math.min(19.5, at.y));
  s.ball = {
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    owner: p.id,
    lastTouch: p.id,
    flight: null,
  };
  s.lastPossession = side;
  emit(s, "restart", side, "Boundary restart", p.id);
}
export function advance(
  s: State,
  chosen: Record<string, Action>,
  interval: number,
): Frame[] {
  const legal = Object.fromEntries(
    s.players.map((p) => [p.id, candidates(s, p, interval)]),
  );
  const actions = Object.fromEntries(
    s.players.map((p) => [
      p.id,
      legal[p.id].find((a) => a.id === chosen[p.id]?.id) || legal[p.id][0],
    ]),
  );
  // Resolve simultaneous tackle contests in seeded order, independent of request completion order.
  const tacklers = s.players
    .filter((p) => actions[p.id].type === "tackle")
    .map((p) => ({ p, priority: random(s) }))
    .sort((a, b) => a.priority - b.priority);
  for (const { p } of tacklers) {
    increment(s, p, "tackleAttempts");
    const owner = s.players.find((q) => q.id === s.ball.owner);
    if (
      owner &&
      owner.side !== p.side &&
      distance(p, owner) <= RULES.tackleRange &&
      random(s) < RULES.tackleSuccess
    ) {
      increment(s, p, "tackles");
      emit(s, "tackle", p.side, "Successful tackle", p.id);
      gain(s, p);
    }
  }
  for (const p of s.players) {
    const a = actions[p.id];
    if (s.ball.owner !== p.id) continue;
    if (a.type === "move") {
      s.ball.owner = null;
      s.ball.flight = null;
      s.ball.vx = 0;
      s.ball.vy = 0;
      continue;
    }
    if ((a.type === "pass" || a.type === "shoot") && a.target) {
      const angle =
        Math.atan2(a.target.y - p.y, a.target.x - p.x) +
        (random(s) - 0.5) *
          2 *
          (a.type === "shoot" ? RULES.shotAngleNoise : RULES.passAngleNoise);
      const speed = a.type === "shoot" ? RULES.shotSpeed : RULES.passSpeed;
      const vx = Math.cos(angle) * speed,
        vy = Math.sin(angle) * speed;
      const goalX = p.side === "home" ? 40 : 0;
      const projected = p.y + ((goalX - p.x) * vy) / vx;
      const onTarget =
        a.type === "shoot" && Math.abs(projected - 10) <= RULES.goalHalfWidth;
      s.ball = {
        x: p.x,
        y: p.y,
        vx,
        vy,
        owner: null,
        lastTouch: p.id,
        flight: {
          kind: a.type === "shoot" ? "shot" : "pass",
          from: p.id,
          side: p.side,
          targetId: a.playerId,
          released: s.time,
          onTarget,
        },
      };
      increment(s, p, a.type === "shoot" ? "shots" : "passes");
      if (onTarget) increment(s, p, "onTarget");
      emit(
        s,
        a.type === "shoot" ? (onTarget ? "shot-on-target" : "shot") : "pass",
        p.side,
        a.description,
        p.id,
        onTarget,
      );
    }
  }
  const releasedBy = s.players.find(
    (p) =>
      actions[p.id].type === "move" &&
      s.ball.lastTouch === p.id &&
      !s.ball.owner,
  )?.id;
  const frames: Frame[] = [];
  let elapsed = 0;
  while (elapsed < interval - 1e-9) {
    const dt = Math.min(RULES.step, interval - elapsed);
    elapsed += dt;
    s.time = Number((s.time + dt).toFixed(6));
    for (const p of s.players) {
      const a = actions[p.id];
      if ((a.type === "move" || a.type === "dribble") && a.target) {
        const dist = distance(p, a.target),
          speed = a.type === "dribble" ? RULES.dribbleSpeed : RULES.speed;
        const step = Math.min(dist, speed * dt);
        if (dist) {
          p.x += ((a.target.x - p.x) / dist) * step;
          p.y += ((a.target.y - p.y) / dist) * step;
        }
        p.x = Math.max(0.3, Math.min(39.7, p.x));
        p.y = Math.max(0.3, Math.min(19.7, p.y));
      }
    }
    const owner = s.players.find((p) => p.id === s.ball.owner);
    if (owner) {
      s.ball.x = owner.x;
      s.ball.y = owner.y;
      increment(s, owner, "possessionSeconds", dt);
    } else {
      const before = { x: s.ball.x, y: s.ball.y },
        after = { x: before.x + s.ball.vx * dt, y: before.y + s.ball.vy * dt };
      const hits = s.players
        .filter(
          (p) =>
            !(p.id === releasedBy && elapsed < 0.35) &&
            !(
              p.id === s.ball.flight?.from &&
              s.time - (s.ball.flight?.released || 0) < 0.35
            ),
        )
        .map((p) => ({ p, ...segmentDistance(before, after, p) }))
        .filter(
          (h) =>
            h.distance <=
            (h.p.role === "GK" && relative(h.p, h.p.side).x < 0.18
              ? RULES.keeperRadius
              : RULES.controlRadius),
        )
        .sort(
          (a, b) =>
            a.t - b.t ||
            distance(a.p, before) - distance(b.p, before) ||
            a.p.id.localeCompare(b.p.id),
        );
      const crossing = after.x < 0 || after.x > 40;
      const crossX = after.x < 0 ? 0 : 40;
      const crossT = crossing
        ? (crossX - before.x) / (after.x - before.x)
        : Infinity;
      const crossY = before.y + (after.y - before.y) * crossT;
      if (
        crossing &&
        Math.abs(crossY - 10) <= RULES.goalHalfWidth &&
        (!hits[0] || crossT < hits[0].t)
      ) {
        const side: Side = crossX === 40 ? "home" : "away";
        const scorer = s.players.find((p) => p.id === s.ball.lastTouch);
        s.stats[side].goals++;
        if (scorer?.side === side) s.individual[scorer.id].goals++;
        emit(s, "goal", side, "GOAL", scorer?.id, true);
        kickoff(s, OTHER(side));
        for (const p of s.players) actions[p.id] = legal[p.id][0];
      } else if (hits[0]) gain(s, hits[0].p);
      else if (after.x < 0 || after.x > 40 || after.y < 0 || after.y > 20) {
        const last = s.players.find((p) => p.id === s.ball.lastTouch);
        restart(s, last ? OTHER(last.side) : "home", after);
        for (const p of s.players) actions[p.id] = legal[p.id][0];
      } else {
        s.ball.x = after.x;
        s.ball.y = after.y;
        const drag = Math.pow(0.985, dt / 0.05);
        s.ball.vx *= drag;
        s.ball.vy *= drag;
      }
    }
    for (const side of ["home", "away"] as Side[]) {
      if (s.lossAt[side] !== undefined && s.recoveries[side] === undefined) {
        const behind = s.players.filter(
          (p) =>
            p.side === side &&
            p.role !== "GK" &&
            relative(p, side).x < relative(s.ball, side).x,
        ).length;
        if (behind >= 2) {
          s.recoveries[side] = s.time - s.lossAt[side]!;
          emit(
            s,
            "recovery",
            side,
            `Two outfield players recovered behind ball in ${s.recoveries[side]!.toFixed(2)}s`,
          );
        }
      }
    }
    frames.push(frame(s));
  }
  s.round++;
  return frames;
}
export function frame(s: State): Frame {
  return {
    time: s.time,
    players: s.players.map(({ id, side, role, x, y }) => ({
      id,
      side,
      role,
      x,
      y,
    })),
    ball: { x: s.ball.x, y: s.ball.y, owner: s.ball.owner },
    score: [s.stats.home.goals, s.stats.away.goals],
  };
}
export function measurements(s: State): Measurement[] {
  return (["home", "away"] as Side[]).map((side) => {
    const team = s.players.filter((p) => p.side === side && p.role !== "GK"),
      owner = s.players.find((p) => p.id === s.ball.owner && p.side === side);
    let sum = 0,
      n = 0;
    team.forEach((p, i) =>
      team.slice(i + 1).forEach((q) => {
        sum += distance(p, q);
        n++;
      }),
    );
    const open = (q: Player) =>
      !!owner &&
      !s.players.some(
        (o) => o.side !== side && segmentDistance(owner, q, o).distance < 0.8,
      );
    return {
      time: s.time,
      side,
      meanPairDistance: n ? sum / n : 0,
      supportOptions: owner
        ? team.filter(
            (q) => q.id !== owner.id && distance(q, owner) <= 12 && open(q),
          ).length
        : 0,
      forwardOutlets: owner
        ? team.filter(
            (q) => relative(q, side).x > relative(owner, side).x && open(q),
          ).length
        : 0,
      defensiveCover: team.filter(
        (q) => relative(q, side).x < relative(s.ball, side).x,
      ).length,
      recoverySeconds: s.recoveries[side] ?? null,
    };
  });
}
export function scripted(
  s: State,
  p: Player,
  actions: Action[],
  style: BotStyle,
): Action {
  const pos = relative(p, p.side),
    ball = relative(s.ball, p.side),
    owns = s.ball.owner === p.id;
  let target: Vec;
  if (owns) {
    const shot = actions.find((a) => a.id === "shoot-1");
    if (shot && pos.x > (style === "counter" ? 0.64 : 0.76)) return shot;
    const pass = actions
      .filter((a) => a.type === "pass")
      .sort(
        (a, b) => relative(b.target!, p.side).x - relative(a.target!, p.side).x,
      )
      .find(
        (a) =>
          relative(a.target!, p.side).x > pos.x + 0.05 &&
          !s.players.some(
            (o) =>
              o.side !== p.side &&
              segmentDistance(p, a.target!, o).distance < 0.8,
          ),
      );
    const pressure = s.players.some(
      (o) => o.side !== p.side && distance(p, o) < 3,
    );
    if (pass && (pressure || p.role === "GK")) return pass;
    target = absolute(
      { x: Math.min(0.95, pos.x + 0.2), y: 0.5 + (pos.y - 0.5) * 0.5 },
      p.side,
    );
    const choices = actions.filter((a) => a.type === "dribble");
    return (
      choices.sort(
        (a, b) => distance(a.target!, target) - distance(b.target!, target),
      )[0] || actions[0]
    );
  }
  const tackle = actions.find((a) => a.type === "tackle");
  if (tackle) return tackle;
  const owner = s.players.find((q) => q.id === s.ball.owner);
  const attacking = owner?.side === p.side;
  if (p.role === "GK")
    target = absolute(
      { x: 0.055, y: Math.max(0.37, Math.min(0.63, ball.y)) },
      p.side,
    );
  else {
    const closest = s.players
      .filter((q) => q.side === p.side && q.role !== "GK")
      .sort((a, b) => distance(a, s.ball) - distance(b, s.ball))[0];
    if ((!attacking && p.id === closest.id) || !owner) target = s.ball;
    else {
      const anchor = relative(p.anchor, p.side);
      const depth = attacking
        ? Math.min(
            0.9,
            ball.x +
              ({ DEF: -0.2, MID: -0.03, FOR1: 0.2, FOR2: 0.05 }[p.role] || 0),
          )
        : style === "counter"
          ? Math.min(anchor.x, 0.35)
          : Math.min(0.8, ball.x + (style === "press" ? 0.04 : -0.12));
      target = absolute({ x: Math.max(0.1, depth), y: anchor.y }, p.side);
    }
  }
  return actions
    .filter((a) => a.type === "move" || a.type === "hold")
    .sort(
      (a, b) =>
        distance(a.target || p, target) - distance(b.target || p, target),
    )[0];
}
