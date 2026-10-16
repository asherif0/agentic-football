"use client";
import Link from "next/link";
import { useState } from "react";
import { compareConditions, summarize } from "../../../lib/domain";
import { useWorkspace } from "../../lib/data/hooks";
import { Skeleton } from "../ui/primitives";

/** Side-by-side comparison of two portal experiments (manual evidence). */
export default function ComparePanel() {
  const { data } = useWorkspace(),
    [compare, setCompare] = useState(["", ""]),
    [cross, setCross] = useState(false);
  const w = data?.records;
  if (!w) return <Skeleton height={240} />;
  const comparisons = compare.map((id) =>
    w.experiments.find((e) => e.id === id),
  );
  const conditions =
    comparisons[0] && comparisons[1]
      ? compareConditions(comparisons[0], comparisons[1], w)
      : null;
  return (
    <div className="legacy">
      <div className="card">
        <p className="muted">
          Select two portal experiments. Local simulation comparisons live in
          Analytics. Cross-formation comparisons require explicit opt-in.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={cross}
            onChange={(e) => setCross(e.target.checked)}
          />
          Allow cross-formation comparison
        </label>
        <div className="grid">
          {compare.map((id, i) => (
            <select
              aria-label={`Comparison ${i + 1}`}
              key={i}
              value={id}
              onChange={(e) =>
                setCompare(
                  compare.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
            >
              <option value="">Select experiment</option>
              {w.experiments
                .filter(
                  (e) => !e.evidenceOrigin || e.evidenceOrigin === "portal",
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
            </select>
          ))}
        </div>
        {!w.experiments.some(
          (e) => !e.evidenceOrigin || e.evidenceOrigin === "portal",
        ) && (
          <p className="empty">
            No portal experiments recorded yet. Add one under Experiments.
          </p>
        )}
        {conditions && (
          <p className={conditions.mismatches.length ? "error" : "notice"}>
            {conditions.crossFormation
              ? "Cross-formation / revision comparison. "
              : ""}
            {conditions.mismatches.length
              ? `Conditions differ: ${conditions.mismatches.join(", ")}. Results are descriptive, not a controlled comparison.`
              : "Recorded surrounding conditions match."}{" "}
            Changed player instructions:{" "}
            {conditions.changedPlayers.join(", ") || "none"}.
            {conditions.changedPlayers.length > 1
              ? " Multiple player changes; isolate one variable for controlled refinement."
              : ""}
          </p>
        )}
      </div>
      {conditions && (!conditions.crossFormation || cross) ? (
        <div className="grid">
          {comparisons.map(
            (e, i) =>
              e && (
                <div className="card" key={i}>
                  <h2>{e.label}</h2>
                  {(() => {
                    const team = w.teams.find((t) => t.id === e.teamId)!;
                    const subset = {
                      ...w,
                      matches: w.matches.filter((m) => m.experimentId === e.id),
                    };
                    const s = summarize(team.id, subset);
                    return (
                      <>
                        <h3>1 · Execution</h3>
                        <table>
                          <tbody>
                            {Object.entries(s.execution).map(([k, v]) => (
                              <tr key={k}>
                                <td>{k}</td>
                                <td>
                                  {v.mean === null
                                    ? "Unknown"
                                    : v.mean.toFixed(2)}{" "}
                                  <small>(n={v.n})</small>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <h3>2 · Results</h3>
                        <p>
                          {s.results.wins} W / {s.results.draws} D /{" "}
                          {s.results.losses} L · GD{" "}
                          {s.results.goalDifference ?? "Unknown"}
                        </p>
                        <p className="muted">
                          {s.results.matches} real matches; {s.results.scored}{" "}
                          with known score
                        </p>
                        <h3>3 · Supporting evidence</h3>
                        <pre>{JSON.stringify(s.supporting, null, 2)}</pre>
                        <h3>4 · Repeatability</h3>
                        <pre>{JSON.stringify(s.repeatability, null, 2)}</pre>
                        <Link
                          href="/library/decisions?draft=new"
                          className="file-button"
                        >
                          Record a promotion decision
                        </Link>
                      </>
                    );
                  })()}
                </div>
              ),
          )}
        </div>
      ) : conditions ? (
        <p className="muted">
          Enable cross-formation comparison to view these results.
        </p>
      ) : null}
    </div>
  );
}
