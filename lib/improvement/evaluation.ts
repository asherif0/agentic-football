import { stableJSON } from "./keys";
import type { Run, RunConfig } from "../simulation/types";
import { OTHER } from "../simulation/types";
import type { SimRepository } from "../simulation/repository";
import type { Assessment, Campaign } from "./types";
import { IMPROVEMENT_VERSION } from "./types";

const points = (r: Run) => {
  const a = r.state.stats[r.config.teamSide].goals,
    b = r.state.stats[OTHER(r.config.teamSide)].goals;
  return a > b ? 3 : a === b ? 1 : 0;
};
export function conditionKey(c: RunConfig) {
  return stableJSON({
    formation: c.team.formation.id,
    models: c.team.models,
    inference: c.team.inference || null,
    layout: c.team.layout,
    provider: c.provider,
    opponent: c.opponent,
    duration: c.duration,
    interval: c.interval,
    versions: c.versions,
  });
}
export function exactPairedPValue(differences: number[]) {
  if (!differences.length || differences.length > 20)
    throw new Error("Invalid paired sample count");
  const observed = differences.reduce((a, b) => a + b, 0);
  let extreme = 0;
  const n = 2 ** differences.length;
  for (let mask = 0; mask < n; mask++) {
    const value = differences.reduce(
      (sum, d, i) => sum + (mask & (1 << i) ? d : -d),
      0,
    );
    if (value >= observed - 1e-9) extreme++;
  }
  return extreme / n;
}
export function assess(
  repo: SimRepository,
  c: Campaign,
  runIds: string[],
  incumbent: string,
  challenger: string,
  stage: "screening" | "validation",
  seeds: number[],
): Assessment {
  const result: Assessment = {
    version: IMPROVEMENT_VERSION,
    stage,
    outcome: "inconclusive",
    reason: "Incomplete comparison suite",
    incumbentPoints: null,
    challengerPoints: null,
    pValue: null,
    alpha: c.manifest.test.alpha,
    blocks: [],
    runIds,
    failureRates: [null, null],
  };
  const runs = runIds.map((id) => repo.run(id));
  const expected = 3 * seeds.length * 2 * 2;
  if (
    runs.length !== expected ||
    new Set(runIds).size !== expected ||
    runs.some(
      (r) =>
        !r ||
        r.status !== "completed" ||
        r.evidenceOrigin !== c.manifest.evidenceOrigin ||
        r.state.time < r.config.duration - 1e-6,
    )
  )
    return result;
  const ready = runs as Run[];
  const key = conditionKey(c.manifest.baseline);
  if (
    ready.some(
      (r) =>
        conditionKey(r.config) !== key ||
        ![incumbent, challenger].includes(r.config.team.id),
    )
  ) {
    result.reason = "Comparison configuration mismatch";
    return result;
  }
  for (const r of ready) {
    for (const side of [r.config.teamSide, OTHER(r.config.teamSide)]) {
      const stats = r.state.stats?.[side];
      if (
        !stats ||
        ["goals", "shots", "onTarget", "dangerousTurnovers"].some(
          (k) => !Number.isFinite((stats as any)[k]),
        )
      ) {
        result.reason = "Required statistics are missing";
        return result;
      }
    }
    const rounds = repo.rounds(r.id),
      traces = rounds.flatMap((round) =>
        round.traces.filter((t) => t.provider !== "scripted"),
      );
    if (
      traces.length !== Math.ceil(r.config.duration / r.config.interval) * 5 ||
      new Set(traces.map((t) => `${t.round}/${t.playerId}`)).size !==
        traces.length
    ) {
      result.reason = "Decision evidence is incomplete";
      return result;
    }
    if (
      traces.some((t) => {
        const role = r.state.players.find(
          (p) => p.id === t.playerId && p.side === r.config.teamSide,
        )?.role;
        return (
          !role ||
          t.provider !== r.config.provider ||
          (r.config.provider !== "mock" &&
            (t.model !== r.config.team.models[role] || t.attempts < 1))
        );
      })
    ) {
      result.reason = "Decision provider/model evidence mismatch";
      return result;
    }
    const snapshot = repo.store
      .read()
      .teams.find((t) => t.id === r.config.team.id);
    if (
      !snapshot ||
      Object.entries(r.config.team.prompts).some(
        ([role, p]) =>
          snapshot.promptIds[role] !== p.id ||
          repo.store.read().prompts.find((x) => x.id === p.id)?.text !== p.text,
      )
    ) {
      result.reason = "Team prompt snapshot mismatch";
      return result;
    }
  }
  const totals = [0, 0],
    failures = [0, 0],
    counts = [0, 0];
  for (const bot of ["balanced", "press", "counter"])
    for (const seed of seeds) {
      let difference = 0;
      for (const side of ["home", "away"]) {
        const pair = [incumbent, challenger].map((team) =>
          ready.filter(
            (r) =>
              r.config.bot === bot &&
              r.config.seed === seed &&
              r.config.teamSide === side &&
              r.config.team.id === team,
          ),
        );
        if (pair.some((p) => p.length !== 1)) {
          result.reason = "Paired opponent/seed/side coverage mismatch";
          return result;
        }
        for (let i = 0; i < 2; i++) {
          const r = pair[i][0];
          totals[i] += points(r);
          const traces = repo
            .rounds(r.id)
            .flatMap((x) => x.traces.filter((t) => t.provider !== "scripted"));
          failures[i] += traces.filter((t) => !!t.error).length;
          counts[i] += traces.length;
        }
        difference += points(pair[1][0]) - points(pair[0][0]);
      }
      result.blocks.push(difference / 2);
    }
  result.incumbentPoints = totals[0];
  result.challengerPoints = totals[1];
  result.failureRates = [failures[0] / counts[0], failures[1] / counts[1]];
  if (
    result.failureRates.some(
      (rate) => rate === null || rate > c.manifest.test.failureLimit,
    )
  ) {
    result.reason = "Failed decision rate exceeds 1% in a comparison arm";
    return result;
  }
  if (totals[1] <= totals[0]) {
    result.outcome = "rejected";
    result.reason = "Challenger did not earn more match points";
    return result;
  }
  if (stage === "validation") {
    result.pValue = exactPairedPValue(result.blocks);
    if (result.pValue > result.alpha) {
      result.outcome = "rejected";
      result.reason = "Higher points did not pass fresh paired validation";
      return result;
    }
  }
  result.outcome = "pass";
  result.reason =
    stage === "screening"
      ? "Higher match points; fresh validation required"
      : "Higher match points and paired validation passed";
  return result;
}
