import { ROLES } from "../domain";
import { PRICING } from "./pricing";
import type { SimRepository, Series } from "./repository";
import type { RunConfig } from "./types";
export const PILOT_MODELS = ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"];
export function previewBenchmark(repo: SimRepository, input: any = {}) {
  const models: string[] = input.models || PILOT_MODELS;
  const teamIds: string[] = input.teamIds || [
    "team-provisional",
    "team-211-provisional",
  ];
  const seeds: number[] = input.seeds || [42, 43];
  const provider = input.provider || "responses";
  const duration = input.duration ?? 20;
  const requestLimit = input.requestLimit ?? 3000,
    inputTokenLimit = input.inputTokenLimit ?? 30_000_000,
    costLimitUsd = input.costLimitUsd ?? 5;
  if (
    !["responses", "decisions", "mock"].includes(provider) ||
    !Array.isArray(models) ||
    !models.length ||
    models.length > 8 ||
    new Set(models).size !== models.length ||
    !Array.isArray(teamIds) ||
    !teamIds.length ||
    teamIds.length > 8 ||
    new Set(teamIds).size !== teamIds.length ||
    !Array.isArray(seeds) ||
    !seeds.length ||
    seeds.length > 10 ||
    new Set(seeds).size !== seeds.length ||
    !seeds.every(Number.isInteger)
  )
    throw new Error("Invalid benchmark variants");
  if (
    !Number.isInteger(requestLimit) ||
    requestLimit < 1 ||
    requestLimit > 500000 ||
    !Number.isInteger(inputTokenLimit) ||
    inputTokenLimit < 1 ||
    inputTokenLimit > 1e9 ||
    !Number.isFinite(costLimitUsd) ||
    costLimitUsd <= 0 ||
    costLimitUsd > 1000
  )
    throw new Error("Invalid benchmark budget");
  if (provider !== "mock" && models.some((m) => !PRICING[m]))
    throw new Error(
      "A dated pricing snapshot is required for every benchmark model.",
    );
  const configs: RunConfig[] = [];
  // Rotate model order in successive blocks so a budget stop does not always favour one model.
  for (const [si, seed] of seeds.entries())
    for (const [ti, teamId] of teamIds.entries())
      for (const teamSide of ["home", "away"] as const)
        for (let i = 0; i < models.length; i++) {
          const model =
            models[
              (i + si + ti + (teamSide === "away" ? 1 : 0)) % models.length
            ];
          const team = repo.store.read().teams.find((t) => t.id === teamId);
          if (!team) throw new Error("Unknown benchmark team");
          const scenario = repo
            .scenarios()
            .find((s) => s.formationId === team.formationId);
          if (!scenario)
            throw new Error(
              "Every benchmark formation needs a starting scenario",
            );
          configs.push(
            repo.buildConfig({
              label: `${model} · ${team.label} · seed ${seed} · ${teamSide}`,
              provider,
              teamId,
              scenarioId: scenario.id,
              models: Object.fromEntries(ROLES.map((r) => [r, model])),
              inference: Object.fromEntries(
                ROLES.map((r) => [
                  r,
                  { reasoningEffort: "low", maxOutputTokens: 1024 },
                ]),
              ),
              bot: input.bot || "balanced",
              teamSide,
              seed,
              duration,
              interval: 1,
              requestLimit: Math.min(requestLimit, Math.ceil(duration) * 5 * 2),
              inputTokenLimit,
            }),
          );
        }
  return {
    version: "model-formation-benchmark-v1",
    label: input.label || "Model × formation pilot",
    models,
    teamIds,
    seeds,
    duration,
    provider,
    bot: input.bot || "balanced",
    normalRequests: configs.length * Math.ceil(duration) * 5,
    plannedMatches: configs.length,
    requestLimit,
    inputTokenLimit,
    costLimitUsd,
    pricing: PRICING,
    configs,
  };
}
export function createBenchmark(repo: SimRepository, input: any = {}) {
  return repo.db.transaction(() => {
    const manifest = previewBenchmark(repo, input),
      id = crypto.randomUUID();
    const runIds = manifest.configs.map((c) => repo.create(c, id).id);
    const series: Series = {
      id,
      createdAt: new Date().toISOString(),
      label: manifest.label,
      kind: "benchmark",
      runIds,
      requestLimit: manifest.requestLimit,
      inputTokenLimit: manifest.inputTokenLimit,
      costLimitUsd: manifest.costLimitUsd,
      manifest,
      command: "run",
      status: "queued",
      reason: null,
    };
    repo.saveSeries(series);
    return series;
  })();
}
