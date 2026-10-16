import type { RecordData, Role } from "../domain";
import type { Pricing, RunConfig } from "../simulation/types";

export const IMPROVEMENT_VERSION = "local-improvement-v1";
export type Strategy = RecordData & {
  label: string;
  formationId: string;
  parentId: string | null;
  brief: string;
  roleGuidance: Partial<Record<Role, string>>;
  protectedInstructions: string[];
  sourceIds: string[];
};
export type CampaignStatus =
  "running" | "paused" | "review" | "completed" | "limited" | "stopped";
export type Campaign = {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  status: CampaignStatus;
  reason: string | null;
  manifest: {
    version: string;
    strategy: Strategy;
    baseline: RunConfig;
    profile: string;
    generator: {
      model: string;
      reasoningEffort: "low";
      maxOutputTokens: number;
      pricing: Pricing;
    };
    budget: { requests: number; inputTokens: number; costUsd: number };
    maxGenerations: number;
    reviewBeforeAdoption: boolean;
    selectedRunIds: string[];
    annotationIds: string[];
    seed: number;
    test: {
      screeningSeeds: number;
      validationSeeds: number;
      failureLimit: number;
      alpha: number;
    };
    evidenceOrigin: "local simulation" | "test fixture";
  };
  incumbentTeamId: string;
  activeRevision: number;
  generation: number;
  noAdoption: number;
};
export type Generation = {
  id: string;
  campaignId: string;
  number: number;
  createdAt: string;
  stage:
    | "observe"
    | "discovery"
    | "propose"
    | "generating"
    | "screening"
    | "validation"
    | "review"
    | "done";
  incumbentTeamId: string;
  activeRevision: number;
  challengerTeamId?: string;
  promptId?: string;
  evidenceId?: string;
  seriesId?: string;
  outcome?: "adopted" | "rejected" | "inconclusive" | "insufficient";
  reason?: string;
  proposal?: Proposal;
  assessments?: Assessment[];
};
export type Proposal = {
  outcome: "proposal" | "insufficient_evidence";
  role: Role;
  text: string;
  rationale: string;
  evidenceIds: string[];
  sourceIds: string[];
  uncertainties: string[];
};
export type EvidenceBundle = {
  id: string;
  createdAt: string;
  campaignId: string;
  generationId: string;
  author: "machine";
  evidenceOrigin: "local simulation" | "test fixture";
  runs: any[];
  annotations: RecordData[];
  previousAttempts?: {
    id: string;
    role: string | null;
    outcome: string;
    rationale: string;
    proposedTextExcerpt: string;
    assessments: Assessment[];
  }[];
};
export type Assessment = {
  version: string;
  stage: "screening" | "validation";
  outcome: "pass" | "rejected" | "inconclusive";
  reason: string;
  incumbentPoints: number | null;
  challengerPoints: number | null;
  pValue: number | null;
  alpha: number;
  blocks: number[];
  runIds: string[];
  failureRates: [number | null, number | null];
};
export type ActiveTeam = {
  id: string;
  teamId: string;
  revision: number;
  updatedAt: string;
};
