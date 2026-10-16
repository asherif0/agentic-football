"use client";
import { useState } from "react";
import type { Run } from "../../lib/simulation/types";
import type { Series } from "../../lib/simulation/repository";
import DataTable from "./DataTable";
type Group = Series & { summary: any[] };
export default function SavedSimulations({
  runs,
  series,
  onOpen,
  onControl,
}: {
  runs: Run[];
  series: Group[];
  onOpen: (id: string) => void;
  onControl: (id: string, command: string) => void;
}) {
  const [tab, setTab] = useState("matches"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [origin, setOrigin] = useState("all"),
    [ascending, setAscending] = useState(false),
    [page, setPage] = useState(0),
    [expanded, setExpanded] = useState<string | null>(null);
  const active = ["queued", "running", "paused"];
  const rows = (tab === "matches" ? runs : series)
    .filter((r) => {
      const run = r as Run;
      const text =
        "config" in r
          ? `${run.config.team.label} ${run.config.team.formation.family} ${run.config.provider}`
          : `${r.label} ${(r as Group).summary.map((s) => s.label).join(" ")}`;
      return (
        text.toLowerCase().includes(search.toLowerCase()) &&
        (status === "all" || r.status === status) &&
        (origin === "all" ||
          ("config" in r
            ? run.evidenceOrigin === origin
            : (r as Group).runIds.some(
                (id) =>
                  runs.find((r) => r.id === id)?.evidenceOrigin === origin,
              )))
      );
    })
    .sort(
      (a, b) => (ascending ? 1 : -1) * a.createdAt.localeCompare(b.createdAt),
    );
  const maxPage = Math.max(0, Math.ceil(rows.length / 20) - 1),
    current = Math.min(page, maxPage),
    visible = rows.slice(current * 20, current * 20 + 20);
  return (
    <section className="card saved-simulations">
      <div className="section-heading">
        <div>
          <h2>Match library</h2>
          <p className="muted">Saved runs and controlled comparisons.</p>
        </div>
        <div
          className="segmented"
          role="tablist"
          aria-label="Saved simulations"
        >
          {["matches", "series"].map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-controls="saved-table"
              onClick={() => {
                setTab(t);
                setPage(0);
                setExpanded(null);
              }}
            >
              {t === "matches" ? "Matches" : "Series"}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-bar">
        <label>
          Search
          <input
            type="search"
            placeholder="Team, formation or provider"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All statuses</option>
            {[...new Set([...runs, ...series].map((r) => r.status))]
              .sort()
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <label>
          Evidence
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All evidence</option>
            <option>local simulation</option>
            <option>test fixture</option>
          </select>
        </label>
        <button className="secondary" onClick={() => setAscending(!ascending)}>
          Created {ascending ? "↑ oldest" : "↓ newest"}
        </button>
      </div>
      <div
        id="saved-table"
        role="tabpanel"
        aria-label={tab === "matches" ? "Matches" : "Series"}
      >
        {tab === "matches" ? (
          <DataTable
            label="Saved matches"
            columns={[
              "Team / formation",
              "Status",
              "Score",
              "Provider / evidence",
              "Seed / side",
              "Created",
              "Action",
            ]}
          >
            {visible.map((item) => {
              const r = item as Run;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.config.team.label}</strong>
                    <small>
                      {r.config.team.formation.family} · r
                      {r.config.team.formation.revision}
                    </small>
                  </td>
                  <td>
                    <span className="badge">{r.status}</span>
                  </td>
                  <td>
                    {r.state.stats.home.goals} – {r.state.stats.away.goals}
                  </td>
                  <td>
                    {r.config.provider}
                    <small>{r.evidenceOrigin}</small>
                  </td>
                  <td>
                    {r.config.seed}
                    <small>{r.config.teamSide}</small>
                  </td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    <button className="secondary" onClick={() => onOpen(r.id)}>
                      Open replay
                    </button>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <>
            <DataTable
              label="Saved series"
              columns={[
                "Series",
                "Progress",
                "Status",
                "Teams",
                "Budget usage",
                "Created",
                "Action",
              ]}
            >
              {visible.map((item) => {
                const s = item as Group,
                  groupRuns = s.runIds
                    .map((id) => runs.find((r) => r.id === id))
                    .filter(Boolean) as Run[];
                return (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td>
                      {
                        groupRuns.filter((r) => !active.includes(r.status))
                          .length
                      }
                      /{s.runIds.length}
                    </td>
                    <td>
                      <span className="badge">{s.status}</span>
                    </td>
                    <td>
                      {s.summary.map((row) => (
                        <small key={row.key || row.teamId}>
                          {row.label}
                          {row.fixture ? " · fixture" : ""}
                        </small>
                      ))}
                    </td>
                    <td>
                      {groupRuns.reduce((n, r) => n + r.requests, 0)} /{" "}
                      {s.requestLimit} calls
                      <small>
                        {groupRuns
                          .reduce(
                            (n, r) => n + r.inputTokens + r.reservedTokens,
                            0,
                          )
                          .toLocaleString()}{" "}
                        / {s.inputTokenLimit.toLocaleString()} input
                      </small>
                    </td>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        className="secondary"
                        aria-expanded={expanded === s.id}
                        onClick={() =>
                          setExpanded(expanded === s.id ? null : s.id)
                        }
                      >
                        View comparison
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            {expanded &&
              (() => {
                const s = series.find((s) => s.id === expanded);
                if (!s) return null;
                return (
                  <div className="series-detail">
                    <h3>{s.label}</h3>
                    <DataTable
                      label="Series comparison"
                      columns={[
                        "Team",
                        "Completed",
                        "Wins",
                        "GF–GA",
                        "Dangerous losses",
                      ]}
                    >
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
                    </DataTable>
                    {s.runIds.some((id) =>
                      active.includes(
                        runs.find((r) => r.id === id)?.status || "",
                      ),
                    ) && (
                      <div className="toolbar">
                        {["pause", "run", "stop"].map((command) => (
                          <button
                            key={command}
                            className="secondary"
                            onClick={() => onControl(s.id, command)}
                          >
                            {command === "run" ? "Resume" : command}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
          </>
        )}
        {!rows.length && <p className="empty">No {tab} match these filters.</p>}
      </div>
      <div className="pagination">
        <span>
          {rows.length} {tab} · page {current + 1} of {maxPage + 1}
        </span>
        <button
          className="secondary"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <button
          className="secondary"
          disabled={current === maxPage}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
