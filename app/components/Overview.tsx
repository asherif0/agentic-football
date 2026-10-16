"use client";
import { useEffect, useState } from "react";
import type { Workspace } from "../../lib/domain";
import DataTable from "./DataTable";
export default function Overview({
  workspace: w,
  onNavigate,
  onReplay,
}: {
  workspace: Workspace;
  onNavigate: (
    tab: "simulation" | "analytics" | "prompts" | "collections",
  ) => void;
  onReplay: (id: string) => void;
}) {
  const [runs, setRuns] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/simulation")
      .then((r) => r.json())
      .then((x) => setRuns(x.runs || []))
      .catch(() => setError("Recent runs are unavailable."));
  }, []);
  const active = runs.find((r) =>
    ["running", "queued", "paused"].includes(r.status),
  );
  return (
    <div className="overview-workspace">
      <section className="overview-intro">
        <div>
          <span className="eyebrow">YOUR TACTICAL WORKSPACE</span>
          <h2>
            Build a team.
            <br />
            Learn from every match.
          </h2>
          <p>
            Version your player instructions, run controlled simulations and
            turn match evidence into the next revision.
          </p>
          <button
            onClick={() =>
              active ? onReplay(active.id) : onNavigate("simulation")
            }
          >
            {active ? "Open active match" : "Prepare a simulation"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="journey-list">
          {[
            [
              "01",
              "Configure",
              "Choose a formation, prompts and models",
              "prompts",
            ],
            ["02", "Simulate", "Run a match with a frozen setup", "simulation"],
            [
              "03",
              "Analyze",
              "Compare execution, outcomes and speed",
              "analytics",
            ],
            [
              "04",
              "Improve",
              "Collect evidence and review a revision",
              "collections",
            ],
          ].map(([n, title, desc, tab]) => (
            <button
              className="journey-step"
              key={n}
              onClick={() => onNavigate(tab as any)}
            >
              <span>{n}</span>
              <div>
                <strong>{title}</strong>
                <small>{desc}</small>
              </div>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>
      <div className="metric-strip">
        <div>
          <span>Formations</span>
          <strong>{new Set(w.formations.map((f) => f.family)).size}</strong>
        </div>
        <div>
          <span>Player versions</span>
          <strong>{w.prompts.length}</strong>
        </div>
        <div>
          <span>Completed simulations</span>
          <strong>
            {
              runs.filter(
                (r) =>
                  r.status === "completed" &&
                  r.evidenceOrigin === "local simulation",
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Evidence collections</span>
          <strong>{w.collections.length}</strong>
        </div>
      </div>
      <section className="chart-panel">
        <div className="section-heading">
          <h2>Recent matches</h2>
          <button
            className="text-button"
            onClick={() => onNavigate("analytics")}
          >
            View analytics ↗
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <DataTable
          label="Recent matches"
          columns={["Team", "Formation", "Status", "Score", "Evidence", ""]}
        >
          {runs.slice(0, 8).map((r) => (
            <tr key={r.id}>
              <td>{r.config.team.label}</td>
              <td>{r.config.team.formation.name}</td>
              <td>{r.status}</td>
              <td>
                {r.state.stats.home.goals} – {r.state.stats.away.goals}
              </td>
              <td>{r.evidenceOrigin}</td>
              <td>
                <button className="text-button" onClick={() => onReplay(r.id)}>
                  Open replay ↗
                </button>
              </td>
            </tr>
          ))}
          {!runs.length && (
            <tr>
              <td colSpan={6}>Your saved matches will appear here.</td>
            </tr>
          )}
        </DataTable>
      </section>
    </div>
  );
}
