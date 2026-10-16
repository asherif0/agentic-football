import type { RunSummary } from "../../lib/simulation/run-summary";

export const ACTIVE_STATUSES = ["queued", "running", "paused"];
export const isActive = (status: string) => ACTIVE_STATUSES.includes(status);

export type Result = "W" | "D" | "L";
export const result = (r: {
  score: { for: number; against: number };
}): Result =>
  r.score.for > r.score.against
    ? "W"
    : r.score.for === r.score.against
      ? "D"
      : "L";

/** Runs that can be replayed, newest first (the API already orders by insertion). */
export const replayable = (runs: RunSummary[]) =>
  runs.filter((r) => r.hasReplay);

/** The match Simulate opens with: newest completed local-simulation replay. */
export function defaultRun(runs: RunSummary[]) {
  const list = replayable(runs);
  return (
    list.find(
      (r) =>
        r.status === "completed" && r.evidenceOrigin === "local simulation",
    ) ??
    list.find((r) => r.status === "completed") ??
    list[0] ??
    null
  );
}

/** A short, human label for a run: model mix + formation + seed/side. */
export const statusLabel: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  stopped: "Stopped",
  limited: "Stopped at limit",
  failed: "Failed",
  interrupted: "Interrupted",
};
