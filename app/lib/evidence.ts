import { ROLES, type Role } from "../../lib/domain";
import type { RunMetric } from "./data/types";

export type ModelEvidence = {
  model: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  played: number;
  gdPer60: number | null;
  goals: number;
  shots: number;
  completedPasses: number;
  dangerousTurnovers: number;
  failures: number;
  decisions: number;
  medianMs: number | null;
};

export type PromptEvidence = Omit<ModelEvidence, "model"> & {
  role: Role;
  runIds: string[];
  lastPlayed: string;
  byModel: ModelEvidence[];
};

const median = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.ceil(s.length * 0.5) - 1] : null;
};

function blank(model: string): ModelEvidence & { latencies: number[] } {
  return {
    model,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalDifference: 0,
    played: 0,
    gdPer60: null,
    goals: 0,
    shots: 0,
    completedPasses: 0,
    dangerousTurnovers: 0,
    failures: 0,
    decisions: 0,
    medianMs: null,
    latencies: [],
  };
}

function add(
  e: ModelEvidence & { latencies: number[] },
  run: RunMetric,
  i: number,
) {
  const gd = run.stats.goals - run.against.goals,
    r = run.roles[i];
  e.matches++;
  if (gd > 0) e.wins++;
  else if (gd === 0) e.draws++;
  else e.losses++;
  e.goalDifference += gd;
  e.played += run.played;
  e.goals += r?.stats?.goals ?? 0;
  e.shots += r?.stats?.shots ?? 0;
  e.completedPasses += r?.stats?.completedPasses ?? 0;
  e.dangerousTurnovers += r?.stats?.dangerousTurnovers ?? 0;
  e.failures += r?.failures ?? 0;
  e.decisions += r?.latencies.length ?? 0;
  e.latencies.push(...(r?.latencies ?? []));
}

function finish<T extends ModelEvidence & { latencies: number[] }>({
  latencies,
  ...e
}: T) {
  return {
    ...e,
    gdPer60: e.played > 0 ? (e.goalDifference * 60) / e.played : null,
    medianMs: median(latencies),
  };
}

/**
 * Evidence per prompt id from completed analytics runs. A run counts for a
 * prompt when that prompt played its role; per-role stats come from that
 * position only, results from the whole team.
 */
export function promptEvidence(runs: RunMetric[]) {
  const acc = new Map<
    string,
    {
      role: Role;
      all: ModelEvidence & { latencies: number[] };
      models: Map<string, ModelEvidence & { latencies: number[] }>;
      runIds: string[];
      lastPlayed: string;
    }
  >();
  for (const run of runs) {
    if (run.status !== "completed") continue;
    run.promptIds.forEach((id, i) => {
      const role = ROLES[i],
        model = run.models[role];
      const a = acc.get(id) ?? {
        role,
        all: blank(""),
        models: new Map<string, ModelEvidence & { latencies: number[] }>(),
        runIds: [] as string[],
        lastPlayed: run.createdAt,
      };
      add(a.all, run, i);
      const m = a.models.get(model) ?? blank(model);
      add(m, run, i);
      a.models.set(model, m);
      a.runIds.push(run.id);
      if (run.createdAt > a.lastPlayed) a.lastPlayed = run.createdAt;
      acc.set(id, a);
    });
  }
  const out = new Map<string, PromptEvidence>();
  for (const [id, a] of acc) {
    const { model: _m, ...all } = finish(a.all);
    out.set(id, {
      ...all,
      role: a.role,
      runIds: a.runIds,
      lastPlayed: a.lastPlayed,
      byModel: [...a.models.values()]
        .map(finish)
        .sort((x, y) => y.matches - x.matches),
    });
  }
  return out;
}

export type VersionRank = {
  label: string;
  tone: "neutral" | "lime" | "good";
  best: boolean;
};

/**
 * Honest labels for prompt versions of one role. "Best observed" needs at
 * least two tested versions with `min` matches each; small samples stay
 * "preliminary" because results are not matched comparisons.
 */
export function rankVersions(
  ids: string[],
  evidence: Map<string, PromptEvidence>,
  min = 3,
): Record<string, VersionRank> {
  const tested = ids.filter((id) => evidence.get(id)?.matches);
  const eligible = tested.filter((id) => evidence.get(id)!.matches >= min);
  const best =
    eligible.length >= 2
      ? eligible.reduce((a, b) =>
          (evidence.get(b)!.gdPer60 ?? -Infinity) >
          (evidence.get(a)!.gdPer60 ?? -Infinity)
            ? b
            : a,
        )
      : null;
  return Object.fromEntries(
    ids.map((id) => {
      const e = evidence.get(id);
      if (!e?.matches)
        return [id, { label: "Untested", tone: "neutral", best: false }];
      if (id === best)
        return [
          id,
          { label: `Best observed · n=${e.matches}`, tone: "lime", best: true },
        ];
      if (tested.length === 1)
        return [
          id,
          {
            label: `Only tested version · n=${e.matches}`,
            tone: "good",
            best: false,
          },
        ];
      return [
        id,
        { label: `Tested · n=${e.matches}`, tone: "good", best: false },
      ];
    }),
  );
}
