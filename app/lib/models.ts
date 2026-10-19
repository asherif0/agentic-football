import { ROLES, type Role } from "../../lib/domain";
import type {
  InferenceSettings,
  ProviderKind,
} from "../../lib/simulation/types";

/** Models offered in the squad builder, in their fixed chart-colour order. */
export const MODEL_OPTIONS = [
  { id: "gpt-6-luna", short: "Luna", note: "Fastest · lowest cost" },
  { id: "gpt-6-sol", short: "Sol", note: "Larger reasoning model" },
  { id: "gpt-6.1-sol", short: "Sol 6.1", note: "Newest · needs effort ≥ low" },
  {
    id: "jev-1.13.0",
    short: "Jev",
    note: "TypeSafe decision model · input tokens only",
  },
] as const;

/** TypeSafe Jev models are routed to the System One API instead of OpenAI. */
export const isJev = (model: string) => /^jev-/.test(model);

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
