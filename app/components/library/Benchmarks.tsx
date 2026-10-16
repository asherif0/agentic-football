"use client";
import Link from "next/link";
import { useState } from "react";
import { postJSON } from "../../lib/data/cache";
import { useAnalytics, useRunIndex, useWorkspace } from "../../lib/data/hooks";
import { usd } from "../../lib/format";
import { MODEL_OPTIONS } from "../../lib/models";
import { toast } from "../../lib/toast";

const ACTIVE = ["queued", "running", "paused"];

/** Model × formation benchmarks and paired series: setup, progress and controls. */
export default function Benchmarks() {
  const { data: w } = useWorkspace(),
    { data } = useAnalytics({}),
    { data: index } = useRunIndex(),
    [open, setOpen] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState("responses"),
    [duration, setDuration] = useState(20),
    [budget, setBudget] = useState(5),
    [models, setModels] = useState<string[]>(MODEL_OPTIONS.map((m) => m.id)),
    [teams, setTeams] = useState(["team-provisional", "team-211-provisional"]),
    [expanded, setExpanded] = useState<string | null>(null);
  async function benchmark(action: "preview" | "create") {
    setBusy(true);
    try {
      const x = await postJSON(
        "/api/benchmarks",
        {
          action,
          provider,
          models,
          teamIds: teams,
          duration,
          costLimitUsd: budget,
          requestLimit: 3000,
          inputTokenLimit: 30000000,
        },
        action === "create" ? ["analytics", "runs"] : [],
      );
      if (action === "preview") setPreview(x);
      else {
        setPreview(null);
        setOpen(false);
        toast("Benchmark scheduled. Progress appears below.", "success");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function control(path: string, body: unknown) {
    setBusy(true);
    try {
      await postJSON(path, body, ["analytics", "runs"]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const series = (index?.series ?? []).filter((s) => s.kind !== "benchmark");
  return (
    <div className="legacy">
      <div className="toolbar">
        <p>
          Benchmarks run the same squad across models, seeds and sides. Results
          appear in <Link href="/analytics">Analytics</Link>.
        </p>
        {!open && (
          <button onClick={() => setOpen(true)}>+ New benchmark</button>
        )}
      </div>
      {open && (
        <section className="card benchmark-setup">
          <div className="section-heading">
            <h2>Model × formation benchmark</h2>
            <button
              className="secondary"
              onClick={() => {
                setOpen(false);
                setPreview(null);
              }}
            >
              Cancel
            </button>
          </div>
          <p className="muted">
            Two seeds, both starting sides, one balanced opponent. Limits
            include retries.
          </p>
          <fieldset disabled={busy || !!preview}>
            <label>
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="responses">Responses · model comparison</option>
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
          </fieldset>
          <div className="grid">
            <div>
              <h3>Models</h3>
              {MODEL_OPTIONS.map((m) => (
                <label className="check-row" key={m.id}>
                  <input
                    type="checkbox"
                    disabled={busy || !!preview}
                    checked={models.includes(m.id)}
                    onChange={(e) =>
                      setModels(
                        e.target.checked
                          ? [...models, m.id]
                          : models.filter((x) => x !== m.id),
                      )
                    }
                  />
                  {m.id}
                </label>
              ))}
            </div>
            <div>
              <h3>Teams / formations</h3>
              {(w?.records.teams ?? []).map((t) => (
                <label className="check-row" key={t.id}>
                  <input
                    type="checkbox"
                    disabled={busy || !!preview}
                    checked={teams.includes(t.id)}
                    onChange={(e) =>
                      setTeams(
                        e.target.checked
                          ? [...teams, t.id]
                          : teams.filter((x) => x !== t.id),
                      )
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          {!preview ? (
            <button
              disabled={busy || !models.length || !teams.length}
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
                {preview.costLimitUsd} estimated spend. Low reasoning, 1,024
                maximum output tokens. A ceiling may stop the run before every
                match completes.
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
      <section className="card">
        <h3>Benchmarks</h3>
        {(data?.benchmarks ?? []).map((b) => (
          <div className="benchmark-status" key={b.id}>
            <strong>{b.label}</strong>
            <p className="muted">
              {b.progress}/{b.runIds.length} completed · {b.status} ·{" "}
              {b.requests.toLocaleString()}/{b.requestLimit.toLocaleString()}{" "}
              calls · {usd(b.cost)} known + {usd(b.reservedCost)} reserved
              {b.costLimitUsd ? ` / ${usd(b.costLimitUsd)}` : ""}
            </p>
            <div className="toolbar">
              <Link href={`/analytics?benchmark=${b.id}`}>
                Open in Analytics →
              </Link>
              {ACTIVE.includes(b.status) && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      control(`/api/benchmarks/${b.id}`, {
                        command: b.status === "paused" ? "run" : "pause",
                      })
                    }
                  >
                    {b.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      control(`/api/benchmarks/${b.id}`, { command: "stop" })
                    }
                  >
                    Stop
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {!data?.benchmarks.length && (
          <p className="muted">No benchmarks yet.</p>
        )}
      </section>
      <section className="card">
        <h3>Paired series</h3>
        <p className="muted">
          Champion vs challenger across three seeds and both sides.
        </p>
        {series.length ? (
          <div className="table-scroll">
            <table aria-label="Saved series">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Status</th>
                  <th>Runs</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td>{s.status}</td>
                    <td>{s.runIds.length}</td>
                    <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="secondary"
                        aria-expanded={expanded === s.id}
                        onClick={() =>
                          setExpanded(expanded === s.id ? null : s.id)
                        }
                      >
                        {expanded === s.id ? "Hide" : "View comparison"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No paired series yet.</p>
        )}
        {expanded &&
          (() => {
            const s = series.find((x) => x.id === expanded);
            if (!s) return null;
            const running = s.runIds.some((id) =>
              ACTIVE.includes(
                index?.runs.find((r) => r.id === id)?.status ?? "",
              ),
            );
            return (
              <div className="series-detail">
                <h3>{s.label}</h3>
                <div className="table-scroll">
                  <table aria-label="Series comparison">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Completed</th>
                        <th>Wins</th>
                        <th>GF–GA</th>
                        <th>Dangerous losses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.summary.map((row) => (
                        <tr key={row.key || row.teamId}>
                          <td>
                            {row.label}
                            {row.fixture ? " (fixture)" : ""}
                          </td>
                          <td>
                            {row.completed}/{row.planned}
                          </td>
                          <td>{row.wins}</td>
                          <td>
                            {row.goalsFor}–{row.goalsAgainst}
                          </td>
                          <td>{row.dangerousTurnovers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {running && (
                  <div className="toolbar">
                    {(["pause", "run", "stop"] as const).map((command) => (
                      <button
                        key={command}
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          control("/api/simulation/series", {
                            id: s.id,
                            command,
                          })
                        }
                      >
                        {command === "run" ? "Resume" : command}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
      </section>
    </div>
  );
}
