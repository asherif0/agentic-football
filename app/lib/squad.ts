import { ROLES, type Role } from "../../lib/domain";
import { PRICING } from "../../lib/simulation/pricing";
import type { InferenceSettings } from "../../lib/simulation/types";

export const defaultModels = () =>
  Object.fromEntries(ROLES.map((r) => [r, "gpt-6-luna"])) as Record<
    Role,
    string
  >;

export const defaultInference = () =>
  Object.fromEntries(
    ROLES.map((r) => [r, { reasoningEffort: "low", maxOutputTokens: 1024 }]),
  ) as Record<Role, InferenceSettings>;

/** Fallback per-decision usage when no stored runs exist for a model. */
export const FALLBACK_USAGE = { input: 1400, output: 200 };

/**
 * Rough cost of one match: decisions per player × tokens per decision × price.
 * `usage` can carry observed per-model averages from stored runs.
 */
export function estimateMatchCost(
  models: Record<Role, string>,
  duration: number,
  interval: number,
  usage: Record<string, { input: number; output: number }> = {},
) {
  const decisions = Math.ceil(duration / Math.max(interval, 0.25));
  const perRole = Object.fromEntries(
    ROLES.map((r) => {
      const rate = PRICING[models[r]],
        u = usage[models[r]] ?? FALLBACK_USAGE;
      return [
        r,
        rate
          ? (decisions *
              (u.input * rate.inputPerMillion +
                u.output * rate.outputPerMillion)) /
            1e6
          : null,
      ];
    }),
  ) as Record<Role, number | null>;
  const known = Object.values(perRole).filter((v): v is number => v !== null);
  return {
    decisions: decisions * ROLES.length,
    perRole,
    total:
      known.length === ROLES.length ? known.reduce((a, b) => a + b, 0) : null,
  };
}
