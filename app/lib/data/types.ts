import type { Role, Workspace } from "../../../lib/domain";
import type { RunSummary } from "../../../lib/simulation/run-summary";
import type { Scenario, Series } from "../../../lib/simulation/repository";
import type {
  DecisionTrace,
  Frame,
  Measurement,
  Run,
  Stats,
} from "../../../lib/simulation/types";

export type { RunSummary, Scenario, Series };

export type WorkspaceResponse = {
  schemaVersion: number;
  records: Workspace;
  attachments: { id: string; name: string; mime: string; size: number }[];
};

export type SeriesWithSummary = Series & {
  summary: {
    teamId: string;
    key: string;
    label: string;
    completed: number;
    planned: number;
    wins: number;
    goalsFor: number;
    goalsAgainst: number;
    dangerousTurnovers: number;
    requests: number;
    fixture: boolean;
  }[];
};

export type RunIndex = {
  runs: RunSummary[];
  scenarios: Scenario[];
  series: SeriesWithSummary[];
  decisions: any[];
  connected: boolean;
  keyConfigured: boolean;
};

export type Round = {
  round: number;
  frames: Frame[];
  traces: (Omit<DecisionTrace, "observation" | "attemptLog"> &
    Partial<Pick<DecisionTrace, "observation" | "attemptLog">>)[];
  measurements: Measurement[];
  waitingMs: number;
  stateStats?: { time: number; stats: Run["state"]["stats"] };
};

export type Performance = {
  medianMs: number | null;
  p95Ms: number | null;
  roundWaitingMs: number[];
  failed: number;
  decisions: number;
  failureRate: number;
  decisionAttempts: number;
  requestsPerSecond: number | null;
  decisionsPerSecond: number | null;
};

export type ReplayResponse = {
  run: Run;
  rounds: Round[];
  performance: Performance;
};

export type RoleMetric = {
  role: Role;
  model: string;
  stats: Stats | undefined;
  latencies: number[];
  failures: number;
  requests: number;
  retries: number;
  inputTokens: number | null;
  outputTokens: number;
};

export type RunMetric = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  origin: string;
  seriesId: string | null;
  label: string;
  formationId: string;
  formation: string;
  teamId: string;
  team: string;
  promptIds: string[];
  models: Record<Role, string>;
  modelMap: string;
  model: string;
  provider: string;
  opponent: string;
  side: "home" | "away";
  seed: number;
  duration: number;
  played: number;
  stats: Stats;
  against: Stats;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reservedTokens: number;
  cost: number | null;
  reservedCost: number;
  decisions: number;
  failures: number;
  retries: number;
  successfulSamples: number[];
  decisionSamples: number[];
  roles: RoleMetric[];
};

export type GroupRole = {
  role: Role;
  model: string;
  goals: number;
  shots: number;
  passes: number;
  turnovers: number;
  medianMs: number | null;
  failures: number;
  requests: number;
  retries: number;
  inputTokens: number | null;
  outputTokens: number;
};

export type AnalyticsGroup = {
  id: string;
  model: string;
  formation: string;
  formationId: string;
  team: string;
  teamId: string;
  provider: string;
  duration: number;
  opponent: string;
  modelMap: string;
  runIds: string[];
  matches: number;
  seeds: number[];
  sides: string[];
  wins: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  goalDifferencePer60: number | null;
  shotsOnTarget: number;
  dangerousTurnovers: number;
  passCompletion: number | null;
  possession: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  successfulMedianMs: number | null;
  successfulP95Ms: number | null;
  attemptMedianMs: number | null;
  attemptP95Ms: number | null;
  roundMedianMs: number | null;
  roundP95Ms: number | null;
  histogram: { from: number; to: number; count: number }[];
  support: number | null;
  cover: number | null;
  recoverySeconds: number | null;
  failures: number;
  decisions: number;
  retries: number;
  requests: number;
  throughput: number | null;
  inputTokens: number;
  outputTokens: number;
  reservedTokens: number;
  cost: number | null;
  reservedCost: number;
  roles: GroupRole[];
};

export type BenchmarkSummary = Series & {
  progress: number;
  requests: number;
  cost: number;
  reservedCost: number;
};

export type AnalyticsResponse = {
  version: string;
  filters: Record<string, string>;
  groups: AnalyticsGroup[];
  insights: string[];
  findings: { text: string; runIds: string[] }[];
  runs: RunMetric[];
  partial: RunMetric[];
  benchmarks: BenchmarkSummary[];
  options: {
    formations: { id: string; label: string }[];
    teams: { id: string; label: string }[];
    models: string[];
    opponents: string[];
  };
};
