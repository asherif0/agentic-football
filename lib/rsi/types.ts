import type { Role } from "../domain";
import type {
  BotStyle,
  InferenceSettings,
  Pricing,
  ProviderKind,
  RunConfig,
  RunStatus,
  Side,
} from "../simulation/types";

export const RSI_VERSION = "rsi-v1";

export type RsiStatus =
  "running" | "paused" | "completed" | "limited" | "stopped" | "failed";

/** Averages over a set of matches, from our side. Compared in this order. */
export type RsiScore = {
  points: number;
  goalDiff: number;
  onTargetDiff: number;
  turnovers: number;
  matches: number;
};

export type MatchResult = {
  runId: string;
  seed: number;
  side: Side;
  status: RunStatus;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDiff: number;
  onTargetDiff: number;
  turnovers: number;
  costUsd: number;
};

export type RoundOutcome =
  | "improved"
  | "no-better"
  | "rejected-early"
  | "no-change"
  | "failed"
  | "limited"
  | "stopped";

export type RsiRound = {
  n: number;
  stage: "rewriting" | "evaluating" | "done";
  role: Role | null;
  text: string | null;
  rationale: string;
  changes: string[];
  seriesIds: string[];
  runIds: string[];
  results: MatchResult[];
  score: RsiScore | null;
  outcome?: RoundOutcome;
  reason?: string;
  rewrite: {
    model: string;
    responseId: string | null;
    reservedInputTokens: number;
    reservedUsd: number;
    inputTokens: number | null;
    outputTokens: number;
    costUsd: number | null;
  } | null;
  startedAt: string;
  finishedAt?: string;
};

export type RsiEstimate = {
  perMatchUsd: number;
  perRoundUsd: number;
  rewriteMaxUsd: number;
  /** Decision reservations held while a match is in flight. */
  headroomUsd: number;
  baselineUsd: number;
  reused: number;
  roundsThatFit: number;
  basis: string;
};

export type RsiConfig = {
  teamId: string;
  teamLabel: string;
  formationId: string;
  formationName: string;
  role: Role | "auto";
  scenarioId: string;
  models: Record<Role, string>;
  inference?: Record<Role, InferenceSettings>;
  provider: ProviderKind;
  writer: {
    model: string;
    reasoningEffort: "low";
    maxOutputTokens: number;
    pricing: Pricing | null;
  };
  bot: BotStyle;
  duration: number;
  interval: number;
  seeds: number[];
  costLimitUsd: number;
  maxRounds: number;
  patience: number;
  collectionId: string | null;
  /** Frozen match settings; each match copies it and sets seed, side and prompts. */
  baseline: RunConfig;
};

export type RsiSession = {
  id: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  status: RsiStatus;
  reason: string | null;
  config: RsiConfig;
  estimate: RsiEstimate;
  start: Record<Role, { id: string; text: string; label: string }>;
  baseline: {
    stage: "evaluating" | "done";
    runIds: string[];
    reusedRunIds: string[];
    seriesIds: string[];
    results: MatchResult[];
    score: RsiScore | null;
  };
  rounds: RsiRound[];
  best: {
    round: number;
    prompts: Record<Role, string>;
    /** Prompt ids as frozen into matches: the start id, or an rsi-… id for rewrites. */
    ids: Record<Role, string>;
    score: RsiScore | null;
    results: MatchResult[];
  };
  noImprovement: number;
  saved: { promptIds: string[]; teamId: string | null } | null;
  finishedAt?: string;
};
