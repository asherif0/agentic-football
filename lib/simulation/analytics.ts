import { ROLES } from "../domain";
import { OTHER, type Run } from "./types";
import type { SimRepository } from "./repository";
export const ANALYTICS_VERSION = "simulation-analytics-v2";
export const percentile = (values: number[], p: number) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.max(0, Math.ceil(v.length * p) - 1)] : null;
};
const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
export function runMetrics(repo: SimRepository, run: Run) {
  repo.db.exec(
    "CREATE TABLE IF NOT EXISTS sim_analytics(run_id TEXT PRIMARY KEY,revision TEXT NOT NULL,body TEXT NOT NULL)",
  );
  const revision = ANALYTICS_VERSION + run.updatedAt,
    old = repo.db
      .prepare("SELECT revision,body FROM sim_analytics WHERE run_id=?")
      .get(run.id) as any;
  if (old?.revision === revision) return JSON.parse(old.body);
  const rounds = repo.rounds(run.id),
    traces = rounds
      .flatMap((r) => r.traces)
      .filter((t) => t.playerId.startsWith(run.config.teamSide + "-")),
    paid = traces.filter((t) => t.provider !== "mock" && t.attempts > 0);
  const measurements = rounds
    .flatMap((r) => r.measurements)
    .filter((m) => m.side === run.config.teamSide);
  const stats = run.state.stats[run.config.teamSide],
    against = run.state.stats[OTHER(run.config.teamSide)];
  const modelMap = ROLES.map((r) => `${r}:${run.config.team.models[r]}`).join(
    " / ",
  );
  const uniform = new Set(Object.values(run.config.team.models)).size === 1;
  const metric = {
    id: run.id,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    status: run.status,
    origin: run.evidenceOrigin,
    seriesId: run.seriesId,
    label: run.config.label,
    formationId: run.config.team.formation.id,
    formation: run.config.team.formation.name,
    teamId: run.config.team.id,
    team: run.config.team.label,
    promptIds: ROLES.map((r) => run.config.team.prompts[r].id),
    models: run.config.team.models,
    modelMap,
    model: uniform ? run.config.team.models.GK : "Mixed · " + modelMap,
    provider: run.config.provider,
    opponent: run.config.opponent?.label || `Scripted ${run.config.bot}`,
    side: run.config.teamSide,
    seed: run.config.seed,
    duration: run.config.duration,
    played: run.state.time,
    stats,
    against,
    requests: run.requests,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    reservedTokens: run.reservedTokens,
    cost: run.estimatedCostUsd ?? null,
    reservedCost: run.reservedCostUsd ?? 0,
    comparisonKey: JSON.stringify({
      formationId: run.config.team.formation.id,
      prompts: run.config.team.prompts,
      opponent: run.config.opponent,
      bot: run.config.bot,
      versions: run.config.versions,
      provider: run.config.provider,
      duration: run.config.duration,
      interval: run.config.interval,
      inference: run.config.team.inference,
    }),
    groupKey: JSON.stringify({
      team: run.config.team.id,
      formation: run.config.team.formation.id,
      prompts: run.config.team.prompts,
      models: run.config.team.models,
      inference: run.config.team.inference,
      provider: run.config.provider,
      opponent: run.config.opponent,
      bot: run.config.bot,
      duration: run.config.duration,
      interval: run.config.interval,
      versions: run.config.versions,
      origin: run.evidenceOrigin,
    }),
    decisionSamples: paid.map((t) => t.latencyMs),
    successfulSamples: paid.filter((t) => !t.error).map((t) => t.latencyMs),
    attemptSamples: paid.flatMap(
      (t) => t.attemptLog?.map((a) => a.durationMs) || [],
    ),
    roundSamples: rounds.map((r) => r.waitingMs),
    failures: paid.filter((t) => !!t.error).length,
    retries: paid.reduce((n, t) => n + Math.max(0, t.attempts - 1), 0),
    decisions: paid.length,
    support: measurements.map((m) => m.supportOptions),
    cover: measurements.map((m) => m.defensiveCover),
    recovery: measurements.flatMap((m) =>
      m.recoverySeconds === null ? [] : [m.recoverySeconds],
    ),
    roles: ROLES.map((role) => {
      const ts = paid.filter(
        (t) => t.playerId === `${run.config.teamSide}-${role}`,
      );
      return {
        role,
        model: run.config.team.models[role],
        stats: run.state.individual[`${run.config.teamSide}-${role}`],
        latencies: ts.map((t) => t.latencyMs),
        failures: ts.filter((t) => t.error).length,
        requests: ts.reduce((n, t) => n + t.attempts, 0),
        retries: ts.reduce((n, t) => n + Math.max(0, t.attempts - 1), 0),
        inputTokens: ts.some((t) => t.inputTokens === null)
          ? null
          : ts.reduce((n, t) => n + (t.inputTokens || 0), 0),
        outputTokens: ts.reduce((n, t) => n + t.outputTokens, 0),
      };
    }),
  };
  repo.db
    .prepare(
      "INSERT INTO sim_analytics VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision,body=excluded.body",
    )
    .run(run.id, revision, JSON.stringify(metric));
  return metric;
}
export type AnalyticsFilters = {
  benchmark?: string;
  formation?: string;
  team?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  opponent?: string;
  origin?: string;
  status?: string;
  from?: string;
  to?: string;
};
export function analytics(repo: SimRepository, filters: AnalyticsFilters = {}) {
  const all = repo.runs().map((r) => runMetrics(repo, r));
  const filtered = all.filter(
    (m) =>
      (!filters.benchmark || m.seriesId === filters.benchmark) &&
      (!filters.formation || m.formationId === filters.formation) &&
      (!filters.team || m.teamId === filters.team) &&
      (!filters.prompt || m.promptIds.includes(filters.prompt)) &&
      (!filters.provider || m.provider === filters.provider) &&
      (!filters.model || m.modelMap === filters.model) &&
      (!filters.opponent || m.opponent === filters.opponent) &&
      m.origin === (filters.origin || "local simulation") &&
      (!filters.from || m.createdAt.slice(0, 10) >= filters.from) &&
      (!filters.to || m.createdAt.slice(0, 10) <= filters.to),
  );
  const complete = filtered.filter((m) => m.status === "completed"),
    shown =
      filters.status && filters.status !== "completed"
        ? filtered.filter((m) => m.status === filters.status)
        : complete;
  const buckets = new Map<string, any[]>();
  for (const m of shown.filter((m) => m.status === "completed")) {
    const b = buckets.get(m.groupKey) || [];
    b.push(m);
    buckets.set(m.groupKey, b);
  }
  const groups = [...buckets.values()].map((ms, index) => {
    const base = ms[0],
      decisions = ms.flatMap((m) => m.decisionSamples),
      attempts = ms.flatMap((m) => m.attemptSamples),
      waiting = ms.flatMap((m) => m.roundSamples),
      played = ms.reduce((n, m) => n + m.played, 0);
    const sum = (side: "stats" | "against", key: string) =>
      ms.reduce((n, m) => n + m[side][key], 0);
    return {
      id: String(index),
      model: base.model,
      formation: base.formation,
      formationId: base.formationId,
      team: base.team,
      provider: base.provider,
      duration: base.duration,
      opponent: base.opponent,
      teamId: base.teamId,
      comparisonKey: base.comparisonKey,
      modelMap: base.modelMap,
      runIds: ms.map((m) => m.id),
      matches: ms.length,
      seeds: [...new Set(ms.map((m) => m.seed))],
      sides: [...new Set(ms.map((m) => m.side))],
      wins: ms.filter((m) => m.stats.goals > m.against.goals).length,
      draws: ms.filter((m) => m.stats.goals === m.against.goals).length,
      goalsFor: sum("stats", "goals"),
      goalsAgainst: sum("against", "goals"),
      goalDifference: sum("stats", "goals") - sum("against", "goals"),
      goalDifferencePer60: played
        ? ((sum("stats", "goals") - sum("against", "goals")) * 60) / played
        : null,
      shotsOnTarget: sum("stats", "onTarget"),
      dangerousTurnovers: sum("stats", "dangerousTurnovers"),
      passCompletion: sum("stats", "passes")
        ? sum("stats", "completedPasses") / sum("stats", "passes")
        : null,
      possession: played ? sum("stats", "possessionSeconds") / played : null,
      medianMs: percentile(decisions, 0.5),
      p95Ms: percentile(decisions, 0.95),
      successfulMedianMs: percentile(
        ms.flatMap((m) => m.successfulSamples),
        0.5,
      ),
      successfulP95Ms: percentile(
        ms.flatMap((m) => m.successfulSamples),
        0.95,
      ),
      attemptMedianMs: percentile(attempts, 0.5),
      attemptP95Ms: percentile(attempts, 0.95),
      roundMedianMs: percentile(waiting, 0.5),
      roundP95Ms: percentile(waiting, 0.95),
      histogram: [0, 250, 500, 1000, 2000, 5000, 10000, Infinity]
        .slice(0, -1)
        .map((v, i, arr) => ({
          from: v,
          to: [250, 500, 1000, 2000, 5000, 10000, Infinity][i],
          count: decisions.filter(
            (t) =>
              t >= v && t < [250, 500, 1000, 2000, 5000, 10000, Infinity][i],
          ).length,
        })),
      support: mean(ms.flatMap((m) => m.support)),
      cover: mean(ms.flatMap((m) => m.cover)),
      recoverySeconds: mean(ms.flatMap((m) => m.recovery)),
      failures: ms.reduce((n, m) => n + m.failures, 0),
      decisions: decisions.length,
      retries: ms.reduce((n, m) => n + m.retries, 0),
      requests: ms.reduce((n, m) => n + m.requests, 0),
      throughput:
        waiting.reduce((a, b) => a + b, 0) > 0
          ? ms.reduce((n, m) => n + m.requests, 0) /
            (waiting.reduce((a, b) => a + b, 0) / 1000)
          : null,
      inputTokens: ms.reduce((n, m) => n + m.inputTokens, 0),
      outputTokens: ms.reduce((n, m) => n + m.outputTokens, 0),
      reservedTokens: ms.reduce((n, m) => n + m.reservedTokens, 0),
      cost: ms.every((m) => m.cost !== null)
        ? ms.reduce((n, m) => n + m.cost, 0)
        : null,
      reservedCost: ms.reduce((n, m) => n + m.reservedCost, 0),
      roles: ROLES.map((role) => {
        const rs = ms.map((m) => m.roles.find((r: any) => r.role === role));
        return {
          role,
          model: rs[0].model,
          goals: rs.reduce((n, r) => n + (r.stats?.goals || 0), 0),
          shots: rs.reduce((n, r) => n + (r.stats?.shots || 0), 0),
          passes: rs.reduce((n, r) => n + (r.stats?.completedPasses || 0), 0),
          turnovers: rs.reduce(
            (n, r) => n + (r.stats?.dangerousTurnovers || 0),
            0,
          ),
          medianMs: percentile(
            rs.flatMap((r) => r.latencies),
            0.5,
          ),
          failures: rs.reduce((n, r) => n + r.failures, 0),
          requests: rs.reduce((n, r) => n + r.requests, 0),
          retries: rs.reduce((n, r) => n + r.retries, 0),
          inputTokens: rs.some((r) => r.inputTokens === null)
            ? null
            : rs.reduce((n, r) => n + r.inputTokens, 0),
          outputTokens: rs.reduce((n, r) => n + r.outputTokens, 0),
        };
      }),
    };
  });
  const findings: { text: string; runIds: string[] }[] = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i],
        b = groups[j];
      if (
        a.comparisonKey !== b.comparisonKey ||
        a.modelMap === b.modelMap ||
        findings.length >= 4
      )
        continue;
      const ar = shown.filter((m) => a.runIds.includes(m.id)),
        br = shown.filter((m) => b.runIds.includes(m.id));
      const keys = [...new Set(ar.map((m) => `${m.seed}:${m.side}`))].filter(
        (k) => br.some((m) => `${m.seed}:${m.side}` === k),
      );
      if (!keys.length) continue;
      const aa = keys.map((k) => ar.find((m) => `${m.seed}:${m.side}` === k)!),
        bb = keys.map((k) => br.find((m) => `${m.seed}:${m.side}` === k)!);
      const am = percentile(
          aa.flatMap((m) => m.successfulSamples),
          0.5,
        ),
        bm = percentile(
          bb.flatMap((m) => m.successfulSamples),
          0.5,
        );
      const gd = (rs: any[]) =>
        rs.reduce((n, m) => n + m.stats.goals - m.against.goals, 0);
      if (am !== null && bm !== null)
        findings.push({
          text: `${a.formation}, ${keys.length} matching seed/side pair${keys.length === 1 ? "" : "s"}: ${a.model} successful-decision median ${Math.round(am)} ms versus ${b.model} ${Math.round(bm)} ms. Aggregate goal difference ${gd(aa)} versus ${gd(bb)}. Speed does not establish stronger football play.`,
          runIds: [...aa, ...bb].map((m) => m.id),
        });
    }
  if (!findings.length)
    for (const g of groups.slice(0, 3))
      findings.push({
        text: `${g.model} · ${g.formation}: ${g.matches} completed matches, ${g.wins} wins, ${g.draws} draws, goal difference ${g.goalDifference}; median ${g.medianMs === null ? "unknown" : Math.round(g.medianMs) + " ms"}. No matched model comparison is available yet.`,
        runIds: g.runIds,
      });
  if (groups.some((g) => g.matches < 6))
    findings.unshift({
      text: "Preliminary sample: report observed outcomes, not a reliable model ranking. Cross-formation results compare formation-and-prompt systems.",
      runIds: [],
    });
  if (shown.some((m) => m.reservedTokens > 0))
    findings.push({
      text: "Some requests have unknown usage. Their conservative token and cost reservations remain in the budget.",
      runIds: shown.filter((m) => m.reservedTokens > 0).map((m) => m.id),
    });
  const errors = shown.reduce((n, m) => n + m.failures, 0),
    decisions = shown.reduce((n, m) => n + m.decisions, 0);
  if (errors)
    findings.push({
      text: `${errors} of ${decisions} agent decisions failed and used hold actions. These execution failures affect football results; successful-decision latency excludes them, while overall latency includes them.`,
      runIds: shown.filter((m) => m.failures > 0).map((m) => m.id),
    });
  const insights = findings.map((f) => f.text);
  return {
    version: ANALYTICS_VERSION,
    filters,
    groups,
    insights,
    findings,
    runs: shown,
    partial: filtered.filter((m) => m.status !== "completed"),
    benchmarks: repo
      .series()
      .filter((s) => s.kind === "benchmark")
      .map((s) => ({
        ...s,
        status: s.runIds.some((id) => repo.run(id)?.status === "running")
          ? "running"
          : s.status,
        manifest: undefined,
        progress: s.runIds.filter((id) => repo.run(id)?.status === "completed")
          .length,
        requests: s.runIds.reduce(
          (n, id) => n + (repo.run(id)?.requests || 0),
          0,
        ),
        cost: s.runIds.reduce(
          (n, id) => n + (repo.run(id)?.estimatedCostUsd || 0),
          0,
        ),
        reservedCost: s.runIds.reduce(
          (n, id) => n + (repo.run(id)?.reservedCostUsd || 0),
          0,
        ),
      })),
    options: {
      formations: [
        ...new Map(
          all.map((m) => [
            m.formationId,
            { id: m.formationId, label: m.formation },
          ]),
        ).values(),
      ],
      teams: [
        ...new Map(
          all.map((m) => [m.teamId, { id: m.teamId, label: m.team }]),
        ).values(),
      ],
      models: [...new Set(all.map((m) => m.modelMap))],
      opponents: [...new Set(all.map((m) => m.opponent))],
    },
  };
}
