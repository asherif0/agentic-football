import type { Role, RecordData } from "../domain";
export type Side = "home" | "away";
export type Vec = { x: number; y: number };
export type Layout = Record<Role, Vec>;
export type ProviderKind = "decisions" | "responses" | "mock";
export type BotStyle = "balanced" | "press" | "counter";
export type Player = Vec & { id: string; side: Side; role: Role; anchor: Vec };
export type Action = {
  id: string;
  type: "hold" | "move" | "dribble" | "pass" | "shoot" | "tackle";
  description: string;
  target?: Vec;
  playerId?: string;
};
export type Event = {
  id: number;
  time: number;
  type: string;
  side: Side;
  playerId?: string;
  detail: string;
  bookmark: boolean;
};
export type Stats = {
  goals: number;
  shots: number;
  onTarget: number;
  saves: number;
  possessionSeconds: number;
  passes: number;
  completedPasses: number;
  interceptions: number;
  tackleAttempts: number;
  tackles: number;
  turnovers: number;
  dangerousTurnovers: number;
};
export type Flight = {
  kind: "pass" | "shot";
  from: string;
  side: Side;
  targetId?: string;
  released: number;
  onTarget: boolean;
};
export type Ball = Vec & {
  vx: number;
  vy: number;
  owner: string | null;
  lastTouch: string | null;
  flight: Flight | null;
};
export type Measurement = {
  time: number;
  side: Side;
  meanPairDistance: number;
  supportOptions: number;
  forwardOutlets: number;
  defensiveCover: number;
  recoverySeconds: number | null;
};
export type State = {
  time: number;
  round: number;
  rng: number;
  players: Player[];
  ball: Ball;
  stats: Record<Side, Stats>;
  individual: Record<string, Stats>;
  events: Event[];
  lastPossession: Side | null;
  lossAt: Partial<Record<Side, number>>;
  recoveries: Partial<Record<Side, number>>;
};
export type Frame = {
  time: number;
  players: { id: string; side: Side; role: Role; x: number; y: number }[];
  ball: Vec & { owner: string | null };
  score: [number, number];
};
export type InferenceSettings = {
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens: number;
};
export type Pricing = {
  date: string;
  source: string;
  inputPerMillion: number;
  outputPerMillion: number;
};
export type SnapshotTeam = {
  id: string;
  label: string;
  formation: RecordData;
  prompts: Record<Role, { id: string; text: string }>;
  models: Record<Role, string>;
  inference?: Record<Role, InferenceSettings>;
  layout: Layout;
};
export type RunConfig = {
  label: string;
  team: SnapshotTeam;
  opponent: SnapshotTeam | null;
  bot: BotStyle;
  provider: ProviderKind;
  teamSide: Side;
  seed: number;
  duration: number;
  interval: number;
  requestLimit: number;
  inputTokenLimit: number;
  scenarioIds: string[];
  pricing?: Record<string, Pricing>;
  /** Set on matches an RSI session queued. */
  rsi?: { sessionId: string; round: number };
  versions: {
    engine: string;
    observation: string;
    candidates: string;
    statistics: string;
  };
};
export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "limited"
  | "failed"
  | "interrupted";
export type Run = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  command: "run" | "pause" | "stop";
  phase: string;
  config: RunConfig;
  state: State;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reservedTokens: number;
  estimatedCostUsd?: number;
  reservedCostUsd?: number;
  reason: string | null;
  seriesId: string | null;
  evidenceOrigin: "local simulation" | "test fixture" | "rsi";
  matchId: string | null;
  workerId: string | null;
};
export type DecisionInput = {
  player: Player;
  prompt: string;
  model: string;
  observation: unknown;
  inference?: InferenceSettings;
  actions: Action[];
};
export type DecisionResult = {
  choice: string;
  confidence: number | null;
  probabilities: unknown;
  inputTokens: number | null;
  outputTokens: number;
};
export type DecisionTrace = {
  attemptLog?: {
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number;
    error: string | null;
  }[];
  round: number;
  time: number;
  playerId: string;
  provider: ProviderKind | "scripted";
  model: string;
  observation: unknown;
  inference?: InferenceSettings;
  actions: Action[];
  selected: Action;
  confidence: number | null;
  probabilities: unknown;
  attempts: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number;
  error: string | null;
};
export const VERSIONS = {
  engine: "local-2d-v1",
  observation: "team-relative-v2",
  candidates: "eight-direction-v1",
  statistics: "event-stats-v1",
};
export const OTHER = (s: Side): Side => (s === "home" ? "away" : "home");
