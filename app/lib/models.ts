import { ROLES, type Role } from "../../lib/domain";
import type {
  InferenceSettings,
  ProviderKind,
} from "../../lib/simulation/types";

/**
 * The lab's model registry, in fixed chart-colour order. `writes` marks models
 * that can generate text (prompt revisions); decision models only choose.
 */
export const MODEL_OPTIONS = [
  {
    id: "gpt-6-luna",
    short: "Luna",
    note: "Fastest · lowest cost",
    provider: "openai",
    writes: true,
  },
  {
    id: "gpt-6-sol",
    short: "Sol",
    note: "Larger reasoning model",
    provider: "openai",
    writes: true,
  },
  {
    id: "gpt-6.1-sol",
    short: "Sol 6.1",
    note: "Newest · needs effort ≥ low",
    provider: "openai",
    writes: true,
  },
  {
    id: "jev-1.13.0",
    short: "Jev",
    note: "TypeSafe decision model · input tokens only",
    provider: "typesafe",
    writes: false,
  },
] as const;

const KEY_NAME = { openai: "OPENAI_API_KEY", typesafe: "JEV_API_KEY" } as const;

export type ProposalModel = {
  id: string;
  short: string;
  note: string;
  available: boolean;
  reason: string | null;
};

/**
 * Models that can draft a prompt revision, with availability from the
 * server's configured keys. A PROMPT_REVISION_MODEL override that isn't in the
 * registry is offered as an extra OpenAI option.
 */
export function proposalModels(
  keys: { openai: boolean; jev: boolean },
  envDefault?: string,
): ProposalModel[] {
  const has = (p: "openai" | "typesafe") =>
    p === "openai" ? keys.openai : keys.jev;
  const list: ProposalModel[] = MODEL_OPTIONS.filter((m) => m.writes).map(
    (m) => ({
      id: m.id,
      short: m.short,
      note: m.note,
      available: has(m.provider),
      reason: has(m.provider) ? null : `needs ${KEY_NAME[m.provider]}`,
    }),
  );
  if (envDefault && !MODEL_OPTIONS.some((m) => m.id === envDefault))
    list.push({
      id: envDefault,
      short: envDefault,
      note: "Set by PROMPT_REVISION_MODEL",
      available: keys.openai,
      reason: keys.openai ? null : "needs OPENAI_API_KEY",
    });
  return list;
}

/** Why a model can't draft a revision, or null when it can. */
export function proposalModelProblem(
  model: string,
  keys: { openai: boolean; jev: boolean },
  envDefault?: string,
) {
  const known = MODEL_OPTIONS.find((m) => m.id === model);
  if (known && !known.writes)
    return `${model} can't write prompts; choose a GPT model.`;
  const option = proposalModels(keys, envDefault).find((m) => m.id === model);
  if (!option) return `${model} isn't in the lab's model list.`;
  if (!option.available) return `${model} ${option.reason}.`;
  return null;
}

/** TypeSafe Jev models are routed to the System One API instead of OpenAI. */
export const isJev = (model: string) => /^jev-/.test(model);

/** RSI uses one model for playing and writing; a model that can't write text hands the writing to Luna. */
export const writerFor = (model: string) =>
  (MODEL_OPTIONS.find((m) => m.id === model)?.writes ?? !isJev(model))
    ? model
    : "gpt-6-luna";

/** Jev returns a choice with probabilities; reasoning effort and output limits don't apply. */
export const usesInference = (model: string) => !isJev(model);

/** Which server-side API keys a set of models needs. */
export function neededKeys(models: string[]) {
  return { openai: models.some((m) => !isJev(m)), jev: models.some(isJev) };
}

/** Human name for the API(s) a squad's decisions go through. */
export function apiLabel(models: Record<Role, string>, provider: string) {
  if (provider === "mock") return "Mock";
  if (provider === "decisions") return "OpenAI Decisions";
  const need = neededKeys(ROLES.map((r) => models[r]));
  return need.openai && need.jev
    ? "OpenAI + TypeSafe"
    : need.jev
      ? "TypeSafe"
      : "OpenAI Responses";
}

export const EFFORTS: InferenceSettings["reasoningEffort"][] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** Colour follows the model, never its rank. Unknown models share "other". */
export function seriesVar(model: string) {
  const i = MODEL_OPTIONS.findIndex((m) => m.id === model);
  return i < 0 ? "var(--series-other)" : `var(--series-${i + 1})`;
}

export function modelShort(model: string) {
  return MODEL_OPTIONS.find((m) => m.id === model)?.short ?? model;
}

export function isUniform(models: Partial<Record<Role, string>>) {
  return new Set(ROLES.map((r) => models[r])).size === 1;
}

/** Parses analytics' "GK:a / DEF:b / …" model map. */
export function parseModelMap(map: string): Record<Role, string> {
  const out = {} as Record<Role, string>;
  for (const part of map.split(" / ")) {
    const [role, ...rest] = part.split(":");
    if ((ROLES as readonly string[]).includes(role))
      out[role as Role] = rest.join(":");
  }
  return out;
}

export function modelLabel(models: Partial<Record<Role, string>> | string) {
  const m = typeof models === "string" ? parseModelMap(models) : models;
  if (isUniform(m)) return m.GK ?? "";
  return `Mixed · ${new Set(Object.values(m)).size} models`;
}

/**
 * Decisions only supports gpt-6-luna for every position; any other mix must
 * run through Responses. Mock stays an explicit opt-in.
 */
export function providerFor(
  models: Record<Role, string>,
  preferred?: string,
): ProviderKind {
  if (preferred === "mock") return "mock";
  const allLuna = ROLES.every((r) => models[r] === "gpt-6-luna");
  if (!allLuna) return "responses";
  return preferred === "responses" ? "responses" : "decisions";
}

/** Mirrors repository validation so problems show before a match is started. */
export function inferenceIssues(
  models: Record<Role, string>,
  inference: Record<Role, InferenceSettings>,
) {
  const issues: string[] = [];
  for (const r of ROLES) {
    const v = inference[r];
    if (!models[r]?.trim()) issues.push(`${r}: choose a model.`);
    if (!v) continue;
    if (
      !Number.isInteger(v.maxOutputTokens) ||
      v.maxOutputTokens < 256 ||
      v.maxOutputTokens > 4096
    )
      issues.push(`${r}: output limit must be 256–4,096 tokens.`);
    if (models[r] === "gpt-6.1-sol" && v.reasoningEffort === "none")
      issues.push(`${r}: gpt-6.1-sol needs reasoning effort low or higher.`);
  }
  return issues;
}
