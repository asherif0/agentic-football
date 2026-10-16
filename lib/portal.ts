import { RecordData, Workspace, ROLES } from "./domain";
// Future adapters implement this boundary; the current adapter never calls the portal.
export interface PortalAdapter {
  prepare(
    experiment: RecordData,
    workspace: Workspace,
  ): { ready: boolean; warnings: string[]; manifest: unknown };
}
export const manualPortal: PortalAdapter = {
  prepare(e, w) {
    const t = w.teams.find((x) => x.id === e.teamId)!;
    const f = w.formations.find((x) => x.id === t.formationId)!;
    return {
      ready: f.compatibility === "confirmed",
      warnings:
        f.compatibility === "confirmed"
          ? []
          : [
              "Confirm this formation is supported in the portal before deployment.",
            ],
      manifest: {
        schemaVersion: 1,
        mode: "manual",
        experiment: e,
        formation: f,
        team: t,
        prompts: ROLES.map((r) =>
          w.prompts.find((p) => p.id === t.promptIds[r]),
        ),
      },
    };
  },
};
