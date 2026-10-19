"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ROLES } from "../../../lib/domain";
import type { AnalyticsGroup } from "../../lib/data/types";
import { useAnalytics } from "../../lib/data/hooks";
import { dec, int, ms, pct, signed, usd, date } from "../../lib/format";
import {
  MODEL_OPTIONS,
  isUniform,
  modelLabel,
  modelShort,
  parseModelMap,
  seriesVar,
} from "../../lib/models";
import { result } from "../../lib/runs";
import {
  BarList,
  ChartFrame,
  Heatmap,
  Lollipop,
  RangePlot,
  ResultBars,
  Scatter,
  type ChartRow,
  type LegendItem,
  type Shape,
} from "../charts/Charts";
import { NextStep, PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ModelMix,
  Notice,
  Skeleton,
} from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import { Stat } from "../ui/Stat";
import s from "./analytics.module.css";

const SHAPES: Shape[] = ["circle", "square", "diamond"];
const FILTER_KEYS = [
  "formation",
  "model",
  "origin",
  "benchmark",
  "team",
] as const;

type HeatMetric =
  "goals" | "shots" | "passes" | "turnovers" | "medianMs" | "failures";
const HEAT: Record<
  HeatMetric,
  { label: string; format: (n: number) => string; invert?: boolean }
> = {
  goals: { label: "Goals", format: (n) => int(n) },
  shots: { label: "Shots", format: (n) => int(n) },
  passes: { label: "Passes completed", format: (n) => int(n) },
  turnovers: {
    label: "Dangerous turnovers",
    format: (n) => int(n),
    invert: true,
  },
  medianMs: { label: "Median decision", format: (n) => ms(n), invert: true },
  failures: { label: "Failed decisions", format: (n) => int(n), invert: true },
};

export default function AnalyticsView() {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined]),
  ) as Record<string, string | undefined>;
  const { data, error, loading } = useAnalytics(filters);
  const [heat, setHeat] = useState<HeatMetric>("goals"),
    [scatterY, setScatterY] = useState<"gd" | "sot" | "support">("gd");
  const setFilter = (k: string, v: string) => {
    const q = new URLSearchParams(params.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    router.replace(`${pathname}${q.toString() ? "?" + q : ""}`, {
      scroll: false,
    });
  };

  const formations = useMemo(
    () =>
      [...(data?.options.formations ?? [])].sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [data],
  );
  const shapeOf = (formationId: string) =>
    SHAPES[
      Math.max(
        0,
        formations.findIndex((f) => f.id === formationId),
      ) % SHAPES.length
    ];
  const groups = useMemo(
    () =>
      [...(data?.groups ?? [])].sort(
        (a, b) =>
          a.formation.localeCompare(b.formation) ||
          (b.goalDifferencePer60 ?? -99) - (a.goalDifferencePer60 ?? -99),
      ),
    [data],
  );
  const rowOf = (g: AnalyticsGroup): ChartRow => {
    const m = parseModelMap(g.modelMap);
    return {
      id: `${g.teamId}|${g.modelMap}|${g.provider}|${g.duration}`,
      label: modelLabel(m),
      sub: `${g.team} · ${g.matches} match${g.matches === 1 ? "" : "es"} · ${g.duration}s`,
      group: g.formation,
      color: isUniform(m) ? seriesVar(m.GK) : "var(--series-other)",
      shape: shapeOf(g.formationId),
    };
  };
  const runs = data?.runs ?? [];
  const totals = useMemo(() => {
    const matches = runs.length,
      wins = runs.filter((r) => r.stats.goals > r.against.goals).length,
      played = runs.reduce((n, r) => n + r.played, 0),
      gd = runs.reduce((n, r) => n + r.stats.goals - r.against.goals, 0),
      samples = runs
        .flatMap((r) => r.successfulSamples ?? [])
        .sort((a, b) => a - b),
      decisions = runs.reduce((n, r) => n + r.decisions, 0),
      failures = runs.reduce((n, r) => n + r.failures, 0);
    return {
      matches,
      winRate: matches ? wins / matches : null,
      gdPer60: played ? (gd * 60) / played : null,
      median: samples.length
        ? samples[Math.ceil(samples.length / 2) - 1]
        : null,
      failureRate: decisions ? failures / decisions : null,
      cost: runs.reduce((n, r) => n + (r.cost ?? 0), 0),
    };
  }, [runs]);

  const modelsPresent = [
    ...new Set(groups.flatMap((g) => Object.values(parseModelMap(g.modelMap)))),
  ];
  const legend: LegendItem[] = [
    ...MODEL_OPTIONS.filter((m) => modelsPresent.includes(m.id)).map((m) => ({
      label: m.id,
      color: seriesVar(m.id),
      kind: "dot" as const,
    })),
    ...(groups.some((g) => !isUniform(parseModelMap(g.modelMap)))
      ? [
          {
            label: "Mixed models",
            color: "var(--series-other)",
            kind: "dot" as const,
          },
        ]
      : []),
    ...formations
      .filter((f) => groups.some((g) => g.formationId === f.id))
      .map((f) => ({
        label: f.label,
        kind: (shapeOf(f.id) === "square"
          ? "square"
          : "ring") as LegendItem["kind"],
      })),
  ];

  const header = (
    <PageHeader
      step="03"
      eyebrow="Analytics"
      title="Compare what works"
      description="Every completed match, grouped by squad configuration. Results, speed, cost and each player's contribution, side by side."
      actions={
        <>
          <Button
            icon="download"
            href={`/api/analytics?${new URLSearchParams(Object.entries({ ...filters, export: "json" }).filter(([, v]) => v) as [string, string][]).toString()}`}
            download="analytics.json"
          >
            Export JSON
          </Button>
          <Button variant="outline" href="/library/benchmarks" icon="plus">
            New benchmark
          </Button>
        </>
      }
    />
  );

  const filterBar = (
    <div className={s.filters} data-reveal>
      <Segmented
        label="Evidence"
        size="sm"
        value={filters.origin ?? "local simulation"}
        onChange={(v) => setFilter("origin", v === "local simulation" ? "" : v)}
        options={[
          { value: "local simulation", label: "Local simulations" },
          { value: "test fixture", label: "Test fixtures" },
        ]}
      />
      <Segmented
        label="Formation"
        size="sm"
        value={filters.formation ?? ""}
        onChange={(v) => setFilter("formation", v)}
        options={[
          { value: "", label: "All formations" },
          ...formations.map((f) => ({ value: f.id, label: f.label })),
        ]}
      />
      <select
        aria-label="Model"
        value={filters.model ?? ""}
        onChange={(e) => setFilter("model", e.target.value)}
      >
        <option value="">All models</option>
        {(data?.options.models ?? []).map((m) => (
          <option key={m} value={m}>
            {modelLabel(m)}
          </option>
        ))}
      </select>
      <select
        aria-label="Team version"
        value={filters.team ?? ""}
        onChange={(e) => setFilter("team", e.target.value)}
      >
        <option value="">All team versions</option>
        {(data?.options.teams ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Benchmark"
        value={filters.benchmark ?? ""}
        onChange={(e) => setFilter("benchmark", e.target.value)}
      >
        <option value="">All matches</option>
        {(data?.benchmarks ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      {FILTER_KEYS.some((k) => filters[k]) && (
        <Button
          size="sm"
          variant="ghost"
          icon="close"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          Reset
        </Button>
      )}
    </div>
  );

  if (error && !data)
    return (
      <>
        {header}
        <EmptyState icon="alert" title="Could not load analytics">
          {error}
        </EmptyState>
      </>
    );
  if (loading && !data)
    return (
      <>
        {header}
        <div className={s.kpis}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={70} />
          ))}
        </div>
        <div className={s.grid}>
          <Skeleton height={320} radius={16} />
          <Skeleton height={320} radius={16} />
        </div>
      </>
    );

  const rows = groups.map(rowOf);
  const running = data?.benchmarks.filter((b) => b.status === "running") ?? [];
  return (
    <>
      {header}
      {filterBar}
      {running.map((b) => (
        <Notice key={b.id} tone="lime" icon="bolt">
          {b.label} is running · {b.progress}/{b.runIds.length} matches
          complete. Charts refresh automatically.
        </Notice>
      ))}
      {!groups.length ? (
        <EmptyState
          icon="chart"
          title="No completed matches for these filters"
          action={
            <Button href="/simulate" variant="primary">
              Open Simulate
            </Button>
          }
        >
          Change the filters, or run a match or benchmark to start collecting
          evidence.
        </EmptyState>
      ) : (
        <>
          <div className={s.kpis} data-reveal>
            <Stat label="Completed matches" value={totals.matches} />
            <Stat label="Configurations" value={groups.length} />
            <Stat
              label="Win rate"
              value={totals.winRate}
              format={(n) => pct(n)}
            />
            <Stat
              label="Goal diff / 60 s"
              value={totals.gdPer60}
              format={(n) => signed(n, 2)}
            />
            <Stat
              label="Median decision"
              value={totals.median}
              format={(n) => ms(n)}
            />
            <Stat
              label="Estimated spend"
              value={totals.cost}
              format={(n) => usd(n)}
              sub={
                totals.failureRate !== null
                  ? `${pct(totals.failureRate, 1)} decisions failed`
                  : undefined
              }
            />
          </div>
          {groups.some((g) => g.matches < 6) && (
            <Notice icon="info">
              Preliminary sample: fewer than six matches per configuration. Read
              these as observed outcomes, not a reliable ranking. Formation
              comparisons describe the formation-and-prompt system together.
            </Notice>
          )}
          <div className={s.grid}>
            <ChartFrame
              title="Results by configuration"
              sub="Wins, draws and losses; goal difference per 60 s at the end of each row."
              legend={[
                { label: "Win", color: "var(--chart-win)" },
                { label: "Draw", color: "var(--chart-draw)" },
                { label: "Loss", color: "var(--chart-loss)" },
              ]}
              table={{
                columns: [
                  "Configuration",
                  "Formation",
                  "Matches",
                  "W",
                  "D",
                  "L",
                  "GF",
                  "GA",
                  "GD / 60",
                ],
                rows: groups.map((g) => [
                  modelLabel(g.modelMap),
                  g.formation,
                  g.matches,
                  g.wins,
                  g.draws,
                  g.matches - g.wins - g.draws,
                  g.goalsFor,
                  g.goalsAgainst,
                  signed(g.goalDifferencePer60, 2),
                ]),
              }}
            >
              <ResultBars
                rows={groups.map((g, i) => ({
                  ...rows[i],
                  w: g.wins,
                  d: g.draws,
                  l: g.matches - g.wins - g.draws,
                  note: signed(g.goalDifferencePer60, 1),
                }))}
              />
            </ChartFrame>
            <ChartFrame
              title="Goal difference per 60 s"
              sub="Above zero means the squad outscored the scripted opponent."
              legend={legend}
              table={{
                columns: [
                  "Configuration",
                  "Formation",
                  "GD / 60",
                  "Shots on target",
                  "Pass completion",
                  "Possession",
                ],
                rows: groups.map((g) => [
                  modelLabel(g.modelMap),
                  g.formation,
                  signed(g.goalDifferencePer60, 2),
                  g.shotsOnTarget,
                  pct(g.passCompletion),
                  pct(g.possession),
                ]),
              }}
            >
              <Lollipop
                label="GD / 60"
                format={(n) => n.toFixed(1)}
                rows={groups.map((g, i) => ({
                  ...rows[i],
                  value: g.goalDifferencePer60,
                  detail: [
                    ["Shots on target", int(g.shotsOnTarget)],
                    ["Pass completion", pct(g.passCompletion)],
                    ["Possession", pct(g.possession)],
                  ],
                }))}
              />
            </ChartFrame>
            <ChartFrame
              title="Decision latency"
              sub="Dot = median of successful decisions, bar end = 95th percentile."
              legend={legend}
              table={{
                columns: [
                  "Configuration",
                  "Formation",
                  "Median",
                  "p95",
                  "Failed",
                  "Decisions",
                ],
                rows: groups.map((g) => [
                  modelLabel(g.modelMap),
                  g.formation,
                  ms(g.successfulMedianMs),
                  ms(g.successfulP95Ms),
                  g.failures,
                  g.decisions,
                ]),
              }}
              foot="Game time pauses while agents decide, so latency changes how long a match takes, not its result. Failed requests do change results: the player holds."
            >
              <RangePlot
                format={ms}
                rows={groups.map((g, i) => ({
                  ...rows[i],
                  low: g.successfulMedianMs,
                  high: g.successfulP95Ms,
                  detail: [
                    ["Failed decisions", `${g.failures} / ${g.decisions}`],
                  ],
                }))}
              />
            </ChartFrame>
            <ChartFrame
              title="Speed against result"
              sub="Up and to the left is better. Speed alone does not make a stronger player."
              legend={legend}
              tools={
                <Segmented
                  size="sm"
                  label="Scatter metric"
                  value={scatterY}
                  onChange={setScatterY}
                  options={[
                    { value: "gd", label: "GD/60" },
                    { value: "sot", label: "On target" },
                    { value: "support", label: "Support" },
                  ]}
                />
              }
              table={{
                columns: [
                  "Configuration",
                  "Formation",
                  "Median",
                  "GD / 60",
                  "On target / match",
                  "Support options",
                ],
                rows: groups.map((g) => [
                  modelLabel(g.modelMap),
                  g.formation,
                  ms(g.successfulMedianMs),
                  signed(g.goalDifferencePer60, 2),
                  dec(g.shotsOnTarget / g.matches, 1),
                  dec(g.support, 2),
                ]),
              }}
            >
              <Scatter
                xLabel="Median decision"
                yLabel={
                  scatterY === "gd"
                    ? "GD / 60"
                    : scatterY === "sot"
                      ? "On target / match"
                      : "Support options"
                }
                formatX={ms}
                formatY={(n) => (scatterY === "gd" ? signed(n, 1) : dec(n, 1))}
                points={groups.map((g, i) => ({
                  ...rows[i],
                  label: `${rows[i].label} · ${g.formation}`,
                  tag: isUniform(parseModelMap(g.modelMap))
                    ? modelShort(parseModelMap(g.modelMap).GK)
                    : "Mixed",
                  x: g.successfulMedianMs,
                  y:
                    scatterY === "gd"
                      ? g.goalDifferencePer60
                      : scatterY === "sot"
                        ? g.shotsOnTarget / g.matches
                        : g.support,
                  detail: [["Matches", String(g.matches)]],
                }))}
              />
            </ChartFrame>
          </div>
          <ChartFrame
            className={s.full}
            title="Player contributions"
            sub="Totals per position across each configuration's matches. Stronger colour = more, or better for latency, turnovers and failures."
            tools={
              <Segmented<HeatMetric>
                size="sm"
                label="Contribution metric"
                value={heat}
                onChange={setHeat}
                options={(Object.keys(HEAT) as HeatMetric[]).map((k) => ({
                  value: k,
                  label: HEAT[k].label.split(" ")[0],
                }))}
              />
            }
            table={{
              columns: ["Configuration", "Formation", ...ROLES],
              rows: groups.map((g) => [
                modelLabel(g.modelMap),
                g.formation,
                ...g.roles.map((r) =>
                  r[heat] === null ? "—" : HEAT[heat].format(r[heat] as number),
                ),
              ]),
            }}
          >
            <Heatmap
              rows={rows}
              columns={[...ROLES]}
              values={groups.map((g) =>
                g.roles.map((r) => r[heat] as number | null),
              )}
              format={HEAT[heat].format}
              invert={HEAT[heat].invert}
            />
          </ChartFrame>
          <div className={s.grid}>
            <ChartFrame
              title="Estimated cost per match"
              sub="From recorded token usage and dated list prices; not invoice data."
              table={{
                columns: [
                  "Configuration",
                  "Formation",
                  "Matches",
                  "Cost",
                  "Per match",
                  "Input tokens",
                  "Output tokens",
                ],
                rows: groups.map((g) => [
                  modelLabel(g.modelMap),
                  g.formation,
                  g.matches,
                  usd(g.cost),
                  usd(g.cost === null ? null : g.cost / g.matches),
                  int(g.inputTokens),
                  int(g.outputTokens),
                ]),
              }}
            >
              <BarList
                label="Per match"
                format={usd}
                rows={groups.map((g, i) => ({
                  ...rows[i],
                  value: g.cost === null ? null : g.cost / g.matches,
                  detail: [["Total", usd(g.cost)]],
                }))}
              />
            </ChartFrame>
            <section className={s.findings} data-reveal>
              <h2 className={s.findTitle}>What the data says</h2>
              <ul>
                {(data?.findings ?? []).map((f, i) => (
                  <li key={i}>
                    <p>{f.text}</p>
                    {f.runIds.length > 0 && (
                      <span className={s.findLinks}>
                        {f.runIds.slice(0, 3).map((id, j) => (
                          <Link key={id} href={`/simulate?run=${id}`}>
                            Replay {j + 1}{" "}
                            <Icon name="arrowUpRight" size={12} />
                          </Link>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section className={s.matches} data-reveal>
            <div className={s.matchesHead}>
              <h2 className={s.findTitle}>Matches in this view</h2>
              {(data?.partial.length ?? 0) > 0 && (
                <span className="muted">
                  {data!.partial.length} unfinished or stopped runs are
                  excluded.
                </span>
              )}
            </div>
            <DataTable
              label="Matches"
              columns={[
                "Result",
                "Configuration",
                "Formation",
                "Seed · side",
                "Median",
                "Failed",
                "Cost",
                "Date",
                "",
              ]}
            >
              {[...runs]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((r) => {
                  const res = result({
                    score: { for: r.stats.goals, against: r.against.goals },
                  });
                  const samples = [...(r.successfulSamples ?? [])].sort(
                    (a, b) => a - b,
                  );
                  return (
                    <tr key={r.id}>
                      <td>
                        <Badge
                          tone={
                            res === "W"
                              ? "lime"
                              : res === "L"
                                ? "neutral"
                                : "neutral"
                          }
                        >
                          {res} {r.stats.goals}–{r.against.goals}
                        </Badge>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <ModelMix models={r.models} /> {modelLabel(r.models)}
                        </span>
                      </td>
                      <td>{r.formation}</td>
                      <td className="mono">
                        {r.seed} · {r.side}
                      </td>
                      <td className="num">
                        {ms(
                          samples.length
                            ? samples[Math.ceil(samples.length / 2) - 1]
                            : null,
                        )}
                      </td>
                      <td className="num">
                        {r.failures}/{r.decisions}
                      </td>
                      <td className="num">{usd(r.cost)}</td>
                      <td>{date(r.createdAt)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          href={`/simulate?run=${r.id}`}
                          iconRight="arrowRight"
                        >
                          Replay
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </DataTable>
          </section>
        </>
      )}
      <NextStep href="/prompts" />
    </>
  );
}
