import { OTHER, type Run } from "../simulation/types";
import type { MatchResult, RsiScore } from "./types";

const EPSILON = 1e-9;

/** One match from our side: points first, then the tiebreak statistics. */
export function matchResult(run: Run): MatchResult {
  const ours = run.state.stats[run.config.teamSide],
    them = run.state.stats[OTHER(run.config.teamSide)],
    goalDiff = ours.goals - them.goals;
  return {
    runId: run.id,
    seed: run.config.seed,
    side: run.config.teamSide,
    status: run.status,
    goalsFor: ours.goals,
    goalsAgainst: them.goals,
    points: goalDiff > 0 ? 3 : goalDiff === 0 ? 1 : 0,
    goalDiff,
    onTargetDiff: ours.onTarget - them.onTarget,
    turnovers: ours.dangerousTurnovers,
    costUsd: (run.estimatedCostUsd || 0) + (run.reservedCostUsd || 0),
  };
}

export function evaluate(results: MatchResult[]): RsiScore | null {
  if (!results.length) return null;
  const mean = (k: "points" | "goalDiff" | "onTargetDiff" | "turnovers") =>
    results.reduce((n, r) => n + r[k], 0) / results.length;
  return {
    points: mean("points"),
    goalDiff: mean("goalDiff"),
    onTargetDiff: mean("onTargetDiff"),
    turnovers: mean("turnovers"),
    matches: results.length,
  };
}

/** Lexicographic: points, goal difference, shots-on-target difference, fewer dangerous turnovers. */
export function compare(
  a: Pick<RsiScore, "points" | "goalDiff" | "onTargetDiff" | "turnovers">,
  b: Pick<RsiScore, "points" | "goalDiff" | "onTargetDiff" | "turnovers">,
) {
  for (const [x, y] of [
    [a.points, b.points],
    [a.goalDiff, b.goalDiff],
    [a.onTargetDiff, b.onTargetDiff],
    [-a.turnovers, -b.turnovers],
  ])
    if (Math.abs(x - y) > EPSILON) return x > y ? 1 : -1;
  return 0;
}

export const isBetter = (a: RsiScore | null, b: RsiScore | null) =>
  !!a && (!b || compare(a, b) > 0);

const key = (r: Pick<MatchResult, "seed" | "side">) => `${r.seed}:${r.side}`;

/**
 * Early reject: once both matches of the first seed are finished, a candidate
 * that did worse than the best on each of them stops there.
 */
export function earlyReject(
  candidate: MatchResult[],
  best: MatchResult[],
  firstSeed: number,
) {
  const pair = candidate.filter((r) => r.seed === firstSeed);
  if (pair.length < 2) return false;
  const reference = new Map(best.map((r) => [key(r), r]));
  return pair.every((r) => {
    const b = reference.get(key(r));
    return !!b && compare(r, b) < 0;
  });
}
