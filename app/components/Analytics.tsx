"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import type { Workspace } from "../../lib/domain";
import DataTable from "./DataTable";
const palette = ["#d3ee51", "#8ec8f3", "#e6b4ec", "#f0bd86"];
const num = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d });
function Panel({
  title,
  children,
  table,
}: {
  title: string;
  children: ReactNode;
  table?: ReactNode;
}) {
  return (
    <section className="chart-panel">
      <h2>{title}</h2>
      {children}
      {table && (
        <details>
          <summary>View data table</summary>
          {table}
        </details>
      )}
    </section>
  );
}
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(220, entries[0].contentRect.width)),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
function Bars({
  rows,
  keys,
  labels,
}: {
  rows: any[];
  keys: string[];
  labels: string[];
}) {
  const { ref, width } = useChartWidth();
  const max = Math.max(
      1,
      ...rows.flatMap((r) => keys.map((k) => Number(r[k]) || 0)),
    ),
    plot = width - 85;
  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${Math.max(140, rows.length * 78 + 20)}`}
        role="img"
        aria-label={labels.join(" and ") + " by model and formation"}
      >
        {rows.map((r, i) => (
          <g key={i}>
            <text x="0" y={i * 78 + 17} className="chart-label">
              {`${r.model.startsWith("Mixed") ? "Mixed assignment" : r.model} · ${r.formation}`.slice(
                0,
                Math.floor(width / 7),
              )}
            </text>
            {keys.map((k, j) => (
              <g
                key={k}
                tabIndex={0}
                role="img"
                aria-label={`${r.model} ${r.formation}: ${labels[j]} ${num(r[k], 2)}`}
              >
                <rect
                  x="0"
                  y={i * 78 + 29 + j * 18}
                  width={
                    r[k] == null ? 0 : (Math.max(0, Number(r[k])) / max) * plot
                  }
                  height="10"
                  rx="3"
                  fill={palette[j % 4]}
                />
                <text
                  x={(Math.max(0, Number(r[k]) || 0) / max) * plot + 7}
                  y={i * 78 + 38 + j * 18}
                  className="chart-value"
                >
                  {num(r[k], 1)}
                </text>
                <title>
                  {labels[j]}: {num(r[k], 2)}
                </title>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {labels.map((label, i) => (
          <span key={label} style={{ color: palette[i % 4] }}>
            ● {label}
          </span>
        ))}
      </div>
    </div>
  );
}
function Scatter({ groups, metric }: { groups: any[]; metric: string }) {
  const { ref, width } = useChartWidth(),
    maxX = Math.max(1, ...groups.map((g) => g.successfulMedianMs || 0)),
    maxY = Math.max(1, ...groups.map((g) => Math.abs(g[metric] || 0))),
    plot = width - 65;
  const metricLabel = (
    {
      goalDifferencePer60: "Goal difference / minute",
      shotsOnTarget: "Shots on target",
      support: "Mean support options",
    } as Record<string, string>
  )[metric];
  return (
    <div ref={ref}>
      <p className="chart-axis-label">↑ {metricLabel}</p>
      <svg
        viewBox={`0 0 ${width} 290`}
        role="img"
        aria-label="Football performance versus successful decision latency"
      >
        <path d={`M35 15V245H${width - 10}`} fill="none" stroke="#555" />
        <path d={`M35 130H${width - 10}`} stroke="#333" />
        <text x="0" y="134" className="chart-value">
          0
        </text>
        {groups.map((g, i) =>
          g.successfulMedianMs == null || g[metric] == null ? null : (
            <g
              key={g.id}
              tabIndex={0}
              role="img"
              aria-label={`${g.model} ${g.formation}, successful median ${num(g.successfulMedianMs)} ms, ${metricLabel} ${num(g[metric], 2)}`}
            >
              <circle
                cx={35 + (g.successfulMedianMs / maxX) * plot}
                cy={130 - (g[metric] / maxY) * 100}
                r="7"
                fill={palette[i % 4]}
              />
              <text
                x={
                  35 +
                  (g.successfulMedianMs / maxX) * plot +
                  (g.successfulMedianMs / maxX > 0.75 ? -10 : 10)
                }
                textAnchor={
                  g.successfulMedianMs / maxX > 0.75 ? "end" : "start"
                }
                y={125 - (g[metric] / maxY) * 100 - (i % 2) * 13}
                className="chart-value"
              >
                P{i + 1}
              </text>
              <title>
                {g.model} · {g.formation} · {g.matches} matches
              </title>
            </g>
          ),
        )}
        <text x="35" y="268" className="chart-value">
          0 ms
        </text>
        <text x={width - 10} y="268" textAnchor="end" className="chart-value">
          {num(maxX)} ms
        </text>
      </svg>
      <p className="chart-axis-label">Successful-decision latency →</p>
      <div className="scatter-legend">
        {groups.map((g, i) => (
          <span key={g.id}>
            <b style={{ color: palette[i % 4] }}>P{i + 1}</b>{" "}
            {g.model.startsWith("Mixed") ? "Mixed assignment" : g.model} ·{" "}
            {g.formation}
          </span>
        ))}
      </div>
    </div>
  );
}
export default function Analytics({
  workspace: w,
  onReplay,
}: {
  workspace: Workspace;
  onReplay: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [filters, setFilters] = useState<Record<string, string>>({
      origin: "local simulation",
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [benchmarkOpen, setBenchmarkOpen] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState("responses"),
    [duration, setDuration] = useState(20),
    [budget, setBudget] = useState(5),
    [modelSelection, setModels] = useState([
      "gpt-6-luna",
      "gpt-6-sol",
      "gpt-6.1-sol",
    ]),
    [teamSelection, setTeams] = useState([
      "team-provisional",
      "team-211-provisional",
    ]),
    [scatterMetric, setScatter] = useState("goalDifferencePer60");
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  async function load(signal?: AbortSignal) {
    const r = await fetch("/api/analytics?" + query, { signal });
    const x = await r.json();
    if (!r.ok) throw new Error(x.error);
    setData(x);
    setError("");
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    const go = () =>
      load(controller.signal).catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    go();
    const timer = setInterval(go, 5000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [query]);
  const change = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  async function benchmark(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          provider,
          models: modelSelection,
          teamIds: teamSelection,
          duration,
          costLimitUsd: budget,
          requestLimit: 3000,
          inputTokenLimit: 30000000,
        }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error);
      if (action === "preview") setPreview(x);
      else {
        setFilters({
          origin: provider === "mock" ? "test fixture" : "local simulation",
          benchmark: x.id,
        });
        setPreview(null);
        setBenchmarkOpen(false);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function control(id: string, command: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/benchmarks/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const groups = data?.groups || [],
    first = groups[0],
    maxX = Math.max(1, ...groups.map((g: any) => g.p95Ms || 0)),
    maxY = Math.max(
      1,
      ...groups.map((g: any) => Math.abs(g[scatterMetric] || 0)),
    ),
    total = groups.reduce((n: number, g: any) => n + g.matches, 0);
  const select = (
    key: string,
    label: string,
    options: { id: string; label: string }[],
  ) => (
    <label>
      {label}
      <select
        value={filters[key] || ""}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const groupTable = (
    <DataTable
      label="Analytics group summaries"
      columns={[
        "Model / formation",
        "Matches",
        "Win / draw",
        "GD",
        "Overall median / p95",
        "Successful median / p95",
        "Cost",
        "Conditions",
      ]}
    >
      {groups.map((g: any) => (
        <tr key={g.id}>
          <td>
            {g.model} · {g.formation}
          </td>
          <td>{g.matches}</td>
          <td>
            {g.wins} / {g.draws}
          </td>
          <td>{g.goalDifference}</td>
          <td>
            {num(g.medianMs)} / {num(g.p95Ms)} ms
          </td>
          <td>
            {num(g.successfulMedianMs)} / {num(g.successfulP95Ms)} ms
          </td>
          <td>{g.cost == null ? "Unknown" : "$" + g.cost.toFixed(3)}</td>
          <td>
            <small>
              {g.provider} · {g.duration}s · {g.opponent} · {g.team}
            </small>
          </td>
        </tr>
      ))}
    </DataTable>
  );
  return (
    <div className="analytics-workspace">
      <div className="section-heading">
        <p className="muted">
          Compare execution, football outcomes and inference speed under
          matching conditions.
        </p>
        <div className="toolbar">
          <a
            className="quiet-link"
            href={`/api/analytics?${query}&export=json`}
          >
            Export data
          </a>
          <button onClick={() => setBenchmarkOpen(!benchmarkOpen)}>
            New benchmark
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Retry
          </button>
        </p>
      )}
      {benchmarkOpen && (
        <section className="card benchmark-setup">
          <h2>Model × formation benchmark</h2>
          <p className="muted">
            Two seeds, both starting sides, one balanced opponent. Limits
            include retries.
          </p>
          <fieldset disabled={busy || !!preview}>
            <div className="collection-fields">
              <label>
                Provider
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="responses">
                    Responses · model comparison
                  </option>
                  <option value="mock">Mock · fixture only</option>
                </select>
              </label>
              <label>
                Simulated seconds
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                />
              </label>
              <label>
                Estimated spend ceiling ($)
                <input
                  type="number"
                  min=".01"
                  max="1000"
                  step=".5"
                  value={budget}
                  onChange={(e) => setBudget(+e.target.value)}
                />
              </label>
            </div>
            <div className="grid">
              <div>
                <h3>Models</h3>
                {["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"].map((m) => (
                  <label className="check-row" key={m}>
                    <input
                      type="checkbox"
                      checked={modelSelection.includes(m)}
                      onChange={(e) =>
                        setModels(
                          e.target.checked
                            ? [...modelSelection, m]
                            : modelSelection.filter((x) => x !== m),
                        )
                      }
                    />
                    {m}
                  </label>
                ))}
              </div>
              <div>
                <h3>Teams / formations</h3>
                {w.teams.map((t) => (
                  <label className="check-row" key={t.id}>
                    <input
                      type="checkbox"
                      checked={teamSelection.includes(t.id)}
                      onChange={(e) =>
                        setTeams(
                          e.target.checked
                            ? [...teamSelection, t.id]
                            : teamSelection.filter((x) => x !== t.id),
                        )
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {!preview ? (
            <button
              disabled={busy || !modelSelection.length || !teamSelection.length}
              onClick={() => benchmark("preview")}
            >
              {busy ? "Preparing…" : "Preview benchmark"}
            </button>
          ) : (
            <div className="notice">
              <strong>
                {preview.plannedMatches} matches ·{" "}
                {preview.normalRequests.toLocaleString()} normal calls
              </strong>
              <p>
                Ceilings: 3,000 requests · 30M reserved input tokens · $
                {preview.costLimitUsd} estimated spend. Settings: low reasoning,
                1,024 maximum output tokens. A ceiling may stop the pilot before
                every match completes.
              </p>
              <div className="toolbar">
                <button disabled={busy} onClick={() => benchmark("create")}>
                  {busy ? "Starting…" : "Start benchmark"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  Edit settings
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <section className="analytics-filters">
        <div className="filter-grid">
          {select(
            "benchmark",
            "Benchmark",
            (data?.benchmarks || []).map((s: any) => ({
              id: s.id,
              label: s.label,
            })),
          )}
          {select("formation", "Formation", data?.options.formations || [])}
          {select(
            "model",
            "Model assignment",
            (data?.options.models || []).map((m: string) => ({
              id: m,
              label: m,
            })),
          )}
          <label>
            Evidence
            <select
              value={filters.origin}
              onChange={(e) => change("origin", e.target.value)}
            >
              <option>local simulation</option>
              <option>test fixture</option>
            </select>
          </label>
        </div>
        <details>
          <summary>More filters</summary>
          <div className="filter-grid">
            {select("team", "Team version", data?.options.teams || [])}
            {select(
              "prompt",
              "Prompt version",
              w.prompts.map((p) => ({
                id: p.id,
                label: `${p.role} · ${p.label}`,
              })),
            )}
            {select(
              "provider",
              "Provider",
              ["responses", "decisions", "mock"].map((s) => ({
                id: s,
                label: s,
              })),
            )}
            {select(
              "opponent",
              "Opponent",
              (data?.options.opponents || []).map((s: string) => ({
                id: s,
                label: s,
              })),
            )}
            {select(
              "status",
              "Status",
              [
                "completed",
                "running",
                "paused",
                "limited",
                "failed",
                "interrupted",
                "stopped",
                "queued",
              ].map((s) => ({ id: s, label: s })),
            )}
            <label>
              From
              <input
                type="date"
                value={filters.from || ""}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to || ""}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
          </div>
        </details>
      </section>
      {loading && !data ? (
        <div className="empty" role="status">
          Loading evaluations…
        </div>
      ) : (
        <>
          {(data?.benchmarks || [])
            .filter(
              (b: any) => !filters.benchmark || b.id === filters.benchmark,
            )
            .slice(0, 4)
            .map((b: any) => (
              <div className="benchmark-status" key={b.id}>
                <div>
                  <strong>{b.label}</strong>
                  <p>
                    {b.progress}/{b.runIds.length} completed · {b.status} ·{" "}
                    {b.requests}/{b.requestLimit} calls · ${b.cost.toFixed(3)}{" "}
                    known + ${b.reservedCost.toFixed(3)} reserved / $
                    {b.costLimitUsd}
                  </p>
                </div>
                {["queued", "running", "paused"].includes(b.status) && (
                  <div className="toolbar">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        control(b.id, b.status === "paused" ? "run" : "pause")
                      }
                    >
                      {b.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => control(b.id, "stop")}
                    >
                      Stop
                    </button>
                  </div>
                )}
              </div>
            ))}
          {!groups.length ? (
            <div className="empty">
              <h2>No completed comparisons yet</h2>
              <p>
                Run a benchmark or change the filters. Partial and failed runs
                appear below.
              </p>
            </div>
          ) : (
            <>
              <div className="metric-strip">
                <div>
                  <span>Completed matches</span>
                  <strong>{total}</strong>
                </div>
                <div>
                  <span>Configurations</span>
                  <strong>{groups.length}</strong>
                </div>
                <div>
                  <span>Known input tokens</span>
                  <strong>
                    {num(
                      groups.reduce(
                        (n: number, g: any) => n + g.inputTokens,
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong className="metric-text">{filters.origin}</strong>
                </div>
              </div>
              <h2 className="section-label">Execution & speed</h2>
              <div className="analytics-grid">
                <Panel title="Decision latency" table={groupTable}>
                  <div className="chart-legend">
                    <span>● Median</span>
                    <span>● p95</span>
                  </div>
                  <Bars
                    rows={groups}
                    keys={["medianMs", "p95Ms"]}
                    labels={["Median ms", "p95 ms"]}
                  />
                  <p className="muted">
                    Decision duration includes retries; pooled from individual
                    decisions.
                  </p>
                </Panel>
                <Panel
                  title="Request & round waiting time"
                  table={
                    <DataTable
                      label="Request and round timing"
                      columns={[
                        "Configuration",
                        "Request median / p95",
                        "Round median / p95",
                        "Requests / second",
                        "Failures / retries",
                      ]}
                    >
                      {groups.map((g: any) => (
                        <tr key={g.id}>
                          <td>
                            {g.model} · {g.formation}
                          </td>
                          <td>
                            {num(g.attemptMedianMs)} / {num(g.attemptP95Ms)} ms
                          </td>
                          <td>
                            {num(g.roundMedianMs)} / {num(g.roundP95Ms)} ms
                          </td>
                          <td>{num(g.throughput, 2)}</td>
                          <td>
                            {g.failures} / {g.retries}{" "}
                            <small>
                              {g.decisions
                                ? num((g.failures / g.decisions) * 100, 1) +
                                  "% failure"
                                : "Unknown failure rate"}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  }
                >
                  <Bars
                    rows={groups}
                    keys={["attemptMedianMs", "roundMedianMs"]}
                    labels={["Request median ms", "Round waiting median ms"]}
                  />
                </Panel>
              </div>
              <h2 className="section-label">Football results</h2>
              <div className="analytics-grid">
                <Panel title="Performance versus speed" table={groupTable}>
                  <label>
                    Performance metric
                    <select
                      value={scatterMetric}
                      onChange={(e) => setScatter(e.target.value)}
                    >
                      <option value="goalDifferencePer60">
                        Goal difference / simulated minute
                      </option>
                      <option value="shotsOnTarget">Shots on target</option>
                      <option value="support">Mean support options</option>
                    </select>
                  </label>
                  <Scatter groups={groups} metric={scatterMetric} />
                  <p className="muted">
                    Successful-decision latency excludes failures. Latency
                    affects waiting time, not simulated player ability. Short
                    matches provide preliminary evidence.
                  </p>
                </Panel>
                <Panel title="Model × formation results" table={groupTable}>
                  {groups.map((g: any, i: number) => (
                    <div className="formation-result" key={g.id}>
                      <div>
                        <strong>
                          {g.model} · {g.formation}
                        </strong>
                        <span>
                          {g.wins}W / {g.draws}D /{" "}
                          {g.matches - g.wins - g.draws}L · GD{" "}
                          {g.goalDifference}
                        </span>
                      </div>
                      <div className="result-track">
                        <span
                          style={{
                            width: `${(100 * g.wins) / g.matches}%`,
                            background: palette[i % 4],
                          }}
                        />
                      </div>
                      <small>
                        {g.matches} matches · seeds {g.seeds.join(", ")} ·{" "}
                        {g.sides.join(" / ")}
                      </small>
                    </div>
                  ))}
                </Panel>
              </div>
              <div className="analytics-grid">
                <Panel
                  title="Passing & defensive security"
                  table={
                    <DataTable
                      label="Football statistics"
                      columns={[
                        "Configuration",
                        "Pass completion",
                        "On target",
                        "Dangerous losses",
                        "Recovery",
                        "Support / cover",
                        "Possession",
                      ]}
                    >
                      {groups.map((g: any) => (
                        <tr key={g.id}>
                          <td>
                            {g.model} · {g.formation}
                          </td>
                          <td>
                            {g.passCompletion === null
                              ? "—"
                              : num(g.passCompletion * 100, 1) + "%"}
                          </td>
                          <td>{g.shotsOnTarget}</td>
                          <td>{g.dangerousTurnovers}</td>
                          <td>{num(g.recoverySeconds, 2)} s</td>
                          <td>
                            {num(g.support, 2)} / {num(g.cover, 2)}
                          </td>
                          <td>
                            {g.possession == null
                              ? "—"
                              : num(g.possession * 100, 1) + "%"}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  }
                >
                  <Bars
                    rows={groups}
                    keys={["shotsOnTarget", "dangerousTurnovers"]}
                    labels={["Shots on target", "Dangerous turnovers"]}
                  />
                </Panel>
                <Panel
                  title="Usage & estimated cost"
                  table={
                    <DataTable
                      label="Token usage and estimated cost"
                      columns={[
                        "Configuration",
                        "Input",
                        "Output",
                        "Unknown / reserved input",
                        "Estimated / reserved cost",
                      ]}
                    >
                      {groups.map((g: any) => (
                        <tr key={g.id}>
                          <td>
                            {g.model} · {g.formation}
                          </td>
                          <td>{num(g.inputTokens)}</td>
                          <td>{num(g.outputTokens)}</td>
                          <td>{num(g.reservedTokens)}</td>
                          <td>
                            {g.cost === null
                              ? "Unknown"
                              : "$" + g.cost.toFixed(4)}{" "}
                            / ${g.reservedCost.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  }
                >
                  <Bars
                    rows={groups}
                    keys={["inputTokens", "outputTokens"]}
                    labels={["Input tokens", "Output tokens"]}
                  />
                  <p className="muted">
                    Estimated from frozen pricing; reserved usage includes
                    requests with unknown billing.
                  </p>
                </Panel>
              </div>
              <Panel title="Decision latency distribution">
                <DataTable
                  label="Decision latency distribution"
                  columns={[
                    "Configuration",
                    "Under 250 ms",
                    "250–500",
                    "500–1,000",
                    "1–2 s",
                    "2–5 s",
                    "5–10 s",
                    "10 s+",
                  ]}
                >
                  {groups.map((g: any) => (
                    <tr key={g.id}>
                      <td>
                        {g.model} · {g.formation}
                      </td>
                      {g.histogram.map((b: any, i: number) => (
                        <td key={i}>{b.count}</td>
                      ))}
                    </tr>
                  ))}
                </DataTable>
              </Panel>
              <h2 className="section-label">
                Supporting evidence & repeatability
              </h2>
              <section className="chart-panel">
                <h2>Observed findings</h2>
                <ul className="insight-list">
                  {(
                    data.findings ||
                    data.insights.map((text: string) => ({ text, runIds: [] }))
                  ).map((f: any, i: number) => (
                    <li key={i}>
                      {f.text}
                      {!!f.runIds.length && (
                        <div className="finding-evidence">
                          {f.runIds.slice(0, 4).map((id: string, j: number) => (
                            <button
                              className="text-button"
                              key={id}
                              onClick={() => onReplay(id)}
                            >
                              Replay {j + 1} ↗
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  Model comparisons require matching prompts, opponent, engine
                  and inference settings. Formation comparisons describe the
                  entire formation-and-prompt setup.
                </p>
              </section>
              <details className="chart-panel">
                <summary>Player contributions, latency & failures</summary>
                <DataTable
                  label="Player contribution statistics"
                  columns={[
                    "Configuration / player",
                    "Model",
                    "Goals / shots",
                    "Completed passes",
                    "Dangerous losses",
                    "Median ms",
                    "Failures / retries",
                    "Input / output tokens",
                  ]}
                >
                  {groups.flatMap((g: any) =>
                    g.roles.map((r: any) => (
                      <tr key={g.id + r.role}>
                        <td>
                          {g.formation} · {r.role}
                        </td>
                        <td>{r.model}</td>
                        <td>
                          {r.goals} / {r.shots}
                        </td>
                        <td>{r.passes}</td>
                        <td>{r.turnovers}</td>
                        <td>{num(r.medianMs)}</td>
                        <td>
                          {r.failures} / {r.retries}
                        </td>
                        <td>
                          {num(r.inputTokens)} / {num(r.outputTokens)}
                        </td>
                      </tr>
                    )),
                  )}
                </DataTable>
                <p className="muted">
                  Team wins are not attributed to an individual model.
                </p>
              </details>
            </>
          )}
          <section className="chart-panel">
            <h2>Match evidence</h2>
            <DataTable
              label="Evaluated simulation runs"
              columns={[
                "Match",
                "Status",
                "Score",
                "Model / formation",
                "Seed / side",
                "",
              ]}
            >
              {(data?.runs || []).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.team}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.stats.goals} – {r.against.goals}
                  </td>
                  <td>
                    {r.model} · {r.formation}
                  </td>
                  <td>
                    {r.seed} / {r.side}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onReplay(r.id)}
                    >
                      Open replay ↗
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
          {!!data?.partial.length && (
            <details className="chart-panel">
              <summary>
                Partial, active or failed runs ({data.partial.length})
              </summary>
              <DataTable
                label="Partial simulation runs"
                columns={[
                  "Match",
                  "Status",
                  "Played",
                  "Calls",
                  "Cost / reserved",
                  "",
                ]}
              >
                {data.partial.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.played.toFixed(1)} / {r.duration}s
                    </td>
                    <td>{r.requests}</td>
                    <td>
                      {r.cost == null ? "Unknown" : "$" + r.cost.toFixed(4)} / $
                      {r.reservedCost.toFixed(4)}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onReplay(r.id)}
                      >
                        Inspect ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </details>
          )}
        </>
      )}
    </div>
  );
}
