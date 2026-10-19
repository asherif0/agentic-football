import {
  DIMENSIONS,
  PHASES,
  ROLES,
  type RecordData,
  type Role,
} from "../../lib/domain";
import type { Event, Frame, Run } from "../../lib/simulation/types";
import { prettyAction } from "./actions";
import { frameIndexAt } from "./playback";
import { eventName } from "./timeline";

type Phase = (typeof PHASES)[number];
type Team = "us" | "them";

const [IN, OUT, ATTACK, DEFEND, RESTART] = PHASES;

/** Phase of play from our side's point of view. */
const PHASE: Record<string, Record<Team, Phase>> = {
  goal: { us: IN, them: OUT },
  "shot-on-target": { us: IN, them: OUT },
  shot: { us: IN, them: OUT },
  save: { us: OUT, them: IN },
  "dangerous-turnover": { us: DEFEND, them: ATTACK },
  turnover: { us: DEFEND, them: ATTACK },
  counter: { us: ATTACK, them: DEFEND },
  interception: { us: ATTACK, them: DEFEND },
  tackle: { us: ATTACK, them: DEFEND },
  kickoff: { us: RESTART, them: RESTART },
  restart: { us: RESTART, them: RESTART },
};

const LABEL: Record<string, Record<Team, string>> = {
  goal: { us: "Goal scored", them: "Goal conceded" },
  "shot-on-target": { us: "Shot on target", them: "Shot on target against us" },
  shot: { us: "Shot off target", them: "Opponent shot off target" },
  save: { us: "Save by our keeper", them: "Their keeper saved our shot" },
  "dangerous-turnover": {
    us: "Possession lost in our defensive third",
    them: "Opponent lost the ball in their defensive third",
  },
  turnover: { us: "Possession lost", them: "Opponent lost possession" },
  counter: {
    us: "Ball won back, attacking transition",
    them: "Opponent won the ball back, defensive transition",
  },
  interception: {
    us: "Interception by us",
    them: "Pass intercepted by the opponent",
  },
  tackle: { us: "Tackle won", them: "Tackled by the opponent" },
  pass: { us: "Pass", them: "Opponent pass" },
  "pass-complete": { us: "Pass completed", them: "Opponent pass completed" },
};

const roleOf = (playerId?: string) =>
  playerId ? (playerId.split("-")[1] as Role) : undefined;

/** Our player most involved in an event (see plan: actor → simultaneous event → nearest to ball). */
export function involvedRole(run: Run, frames: Frame[], event: Event): Role {
  const ours = `${run.config.teamSide}-`;
  if (event.playerId?.startsWith(ours)) return roleOf(event.playerId)!;
  const paired = run.state.events.find(
    (e) =>
      e !== event &&
      Math.abs(e.time - event.time) < 0.001 &&
      e.playerId?.startsWith(ours),
  );
  if (paired) return roleOf(paired.playerId)!;
  const f = frames[frameIndexAt(frames, event.time)];
  const nearest = f?.players
    .filter((p) => p.side === run.config.teamSide)
    .sort(
      (a, b) =>
        Math.hypot(a.x - f.ball.x, a.y - f.ball.y) -
        Math.hypot(b.x - f.ball.x, b.y - f.ball.y),
    )[0];
  return nearest && ROLES.includes(nearest.role) ? nearest.role : "GK";
}

/**
 * A ready-to-save critical event for a replay moment, or null when the match
 * has no evidence record or is a test fixture.
 */
export function momentAnnotation(run: Run, frames: Frame[], event: Event) {
  if (!run.matchId || run.evidenceOrigin !== "local simulation") return null;
  const team: Team = event.side === run.config.teamSide ? "us" : "them";
  const f = frames[frameIndexAt(frames, event.time)];
  const home = run.config.teamSide === "home";
  const score = f
    ? `${home ? f.score[0] : f.score[1]}–${home ? f.score[1] : f.score[0]}`
    : null;
  const actor = event.playerId
    ? `${event.playerId.startsWith(`${run.config.teamSide}-`) ? "our" : "their"} ${roleOf(event.playerId)}`
    : null;
  const label = LABEL[event.type]?.[team] ?? eventName(event.type);
  const detail = ["pass", "shot", "shot-on-target"].includes(event.type)
    ? prettyAction(event.detail).text
    : null;
  const observation = [
    `${event.time.toFixed(1)} s`,
    [label, actor && `(${actor})`].filter(Boolean).join(" "),
    detail && detail !== label ? detail : null,
    score && `score ${score}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    matchId: run.matchId,
    timestamp: `${event.time.toFixed(2)}s`,
    phase: PHASE[event.type]?.[team] ?? (team === "us" ? IN : OUT),
    role: involvedRole(run, frames, event),
    observation,
    diagnosis: "",
    scores: Object.fromEntries(DIMENSIONS.map((d) => [d, null])),
    evidenceIds: [] as string[],
    source: "replay",
    runId: run.id,
    eventId: event.id,
    eventType: event.type,
    team,
  };
}

/** The newest version of an annotation (following parentId links forward). */
export function latestVersion(annotations: RecordData[], a: RecordData) {
  let current = a;
  for (let guard = 0; guard < 50; guard++) {
    const child = annotations.find((x) => x.parentId === current.id);
    if (!child) break;
    current = child;
  }
  return current;
}

/** The existing critical event for this moment, if it was already annotated. */
export function findAnnotation(
  annotations: RecordData[],
  run: Run,
  event: Event,
) {
  const hit = annotations.find(
    (a) =>
      (a.runId === run.id && a.eventId === event.id) ||
      (!a.runId &&
        a.matchId === run.matchId &&
        Math.abs(parseFloat(String(a.timestamp)) - event.time) < 0.06 &&
        a.observation === event.detail),
  );
  return hit ? latestVersion(annotations, hit) : undefined;
}

/** A reviewed version that adds or changes the diagnosis (records are immutable). */
export function reviewedVersion(
  record: RecordData,
  changes: {
    diagnosis: string;
    phase?: string;
    role?: string;
    scores?: Record<string, number | null>;
  },
) {
  const { id, createdAt, ...rest } = record;
  return {
    ...rest,
    parentId: id,
    diagnosis: changes.diagnosis,
    phase: changes.phase ?? record.phase,
    role: changes.role ?? record.role,
    scores: { ...record.scores, ...(changes.scores ?? {}) },
  };
}
