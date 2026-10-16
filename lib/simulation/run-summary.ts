import { ROLES, type Role } from "../domain";
import {
  OTHER,
  type InferenceSettings,
  type Run,
  type RunStatus,
  type Side,
  type Stats,
} from "./types";

/** A slim, list-friendly view of a run: no state.players, no events, no rounds. */
export type RunSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  phase: string;
  reason: string | null;
  label: string;
  provider: Run["config"]["provider"];
  evidenceOrigin: Run["evidenceOrigin"];
  seriesId: string | null;
  matchId: string | null;
  team: {
    id: string;
    label: string;
    formationId: string;
    formationName: string;
    family: string;
    models: Record<Role, string>;
    inference?: Record<Role, InferenceSettings>;
    promptIds: Record<Role, string>;
  };
  opponent: { label: string; kind: "bot" | "team"; bot: string };
  side: Side;
  seed: number;
  duration: number;
  interval: number;
  played: number;
  score: { for: number; against: number; home: number; away: number };
  stats: { for: Stats; against: Stats };
  events: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  reservedCost: number;
  rounds: number;
  hasReplay: boolean;
  observation: string;
};

export function runSummary(run: Run, roundCount: number): RunSummary {
  const c = run.config,
    side = c.teamSide,
    other = OTHER(side),
    stats = run.state.stats;
  return {
    id: run.id,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    status: run.status,
    phase: run.phase,
    reason: run.reason,
    label: c.label,
    provider: c.provider,
    evidenceOrigin: run.evidenceOrigin,
    seriesId: run.seriesId,
    matchId: run.matchId,
    team: {
      id: c.team.id,
      label: c.team.label,
      formationId: c.team.formation.id,
      formationName: c.team.formation.name ?? c.team.formation.family ?? "",
      family: c.team.formation.family ?? "",
      models: c.team.models,
      inference: c.team.inference,
      promptIds: Object.fromEntries(
        ROLES.map((role) => [role, c.team.prompts[role]?.id ?? ""]),
      ) as Record<Role, string>,
    },
    opponent: c.opponent
      ? { label: c.opponent.label, kind: "team", bot: c.bot }
      : { label: `Scripted ${c.bot}`, kind: "bot", bot: c.bot },
    side,
    seed: c.seed,
    duration: c.duration,
    interval: c.interval,
    played: run.state.time,
    score: {
      for: stats[side].goals,
      against: stats[other].goals,
      home: stats.home.goals,
      away: stats.away.goals,
    },
    stats: { for: stats[side], against: stats[other] },
    events: run.state.events.length,
    requests: run.requests,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    cost: run.estimatedCostUsd ?? 0,
    reservedCost: run.reservedCostUsd ?? 0,
    rounds: roundCount,
    hasReplay: roundCount > 0,
    observation: c.versions.observation,
  };
}
