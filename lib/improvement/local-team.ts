import type { SimRepository } from "../simulation/repository";
import { improvementRepository, profileKey } from "./persistence";
import type { RunConfig } from "../simulation/types";
export function resolveActiveTeam(
  repo: SimRepository,
  config: RunConfig,
  enabled: boolean,
) {
  if (!enabled || config.opponent || config.provider === "mock") return config;
  const active = improvementRepository(repo).active(profileKey(config));
  if (!active) return config;
  return {
    ...config,
    team: repo.snapshot(
      active.teamId,
      config.scenarioIds[0],
      config.team.models,
      config.team.inference,
    ),
  };
}
export function snapshotForProfile(
  repo: SimRepository,
  profile: string,
  teamId: string,
) {
  const campaign = improvementRepository(repo)
    .campaigns()
    .find((c) => c.manifest.profile === profile);
  const team = repo.store.read().teams.find((t) => t.id === teamId);
  if (
    !campaign ||
    !team ||
    team.formationId !== campaign.manifest.baseline.team.formation.id
  )
    throw new Error(
      "Team must match the local evaluation profile's formation revision",
    );
  return campaign.manifest.baseline;
}
