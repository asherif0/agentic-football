import type { Run } from "./types";
export function seriesSummary(runs: Run[]) {
  const key = (r: Run) =>
    JSON.stringify({
      teamId: r.config.team.id,
      models: r.config.team.models,
      inference: r.config.team.inference,
      provider: r.config.provider,
      versions: r.config.versions,
      duration: r.config.duration,
    });
  const teams = [...new Set(runs.map(key))];
  return teams.map((groupKey) => {
    const all = runs.filter((r) => key(r) === groupKey),
      complete = all.filter((r) => r.status === "completed");
    return {
      teamId: all[0]?.config.team.id,
      key: groupKey,
      label:
        all[0]?.config.team.label +
        " · " +
        (new Set(Object.values(all[0].config.team.models)).size === 1
          ? all[0].config.team.models.GK
          : "Mixed models"),
      completed: complete.length,
      planned: all.length,
      wins: complete.filter(
        (r) =>
          r.state.stats[r.config.teamSide].goals >
          r.state.stats[r.config.teamSide === "home" ? "away" : "home"].goals,
      ).length,
      goalsFor: complete.reduce(
        (n, r) => n + r.state.stats[r.config.teamSide].goals,
        0,
      ),
      goalsAgainst: complete.reduce(
        (n, r) =>
          n +
          r.state.stats[r.config.teamSide === "home" ? "away" : "home"].goals,
        0,
      ),
      dangerousTurnovers: complete.reduce(
        (n, r) => n + r.state.stats[r.config.teamSide].dangerousTurnovers,
        0,
      ),
      requests: all.reduce((n, r) => n + r.requests, 0),
      fixture: all.some((r) => r.evidenceOrigin === "test fixture"),
    };
  });
}
