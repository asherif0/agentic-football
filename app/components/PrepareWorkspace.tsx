"use client";
import { useEffect, useState } from "react";
import { ROLES, type Workspace } from "../../lib/domain";
import type { Strategy } from "../../lib/improvement/types";
import type { Scenario } from "../../lib/simulation/repository";
import ModelAssignments from "./ModelAssignments";
import ScenarioEditor from "./ScenarioEditor";
import { usePreparation } from "./Preparation";
export default function PrepareWorkspace({
  workspace: w,
  onContinue,
  onPositions,
}: {
  workspace: Workspace;
  onContinue: () => void;
  onPositions: () => void;
}) {
  const { value: p, set } = usePreparation(),
    [strategies, setStrategies] = useState<Strategy[]>([]),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [key, setKey] = useState(false),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<any>({
      label: "",
      brief: "",
      roleGuidance: {},
      protectedInstructions: [],
      sourceIds: [],
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const team = w.teams.find((t) => t.id === p.team),
    strategy = strategies.find((s) => s.id === p.strategy),
    valid = scenarios.filter((s) => s.formationId === team?.formationId);
  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/runs").then((r) => r.json()),
    ])
      .then(([a, b]) => {
        setStrategies(a.strategies || []);
        setKey(a.keyConfigured);
        setScenarios(b.scenarios || []);
      })
      .catch(() =>
        setError("Could not load preparation settings. Refresh to retry."),
      );
  }, []);
  useEffect(() => {
    if (valid.length && !valid.some((s) => s.id === p.scenario))
      set((old) => ({ ...old, scenario: valid[0].id }));
  }, [p.team, scenarios]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            protectedInstructions: draft.protectedInstructions.filter(
              (s: string) => s.trim(),
            ),
            formationId: team?.formationId,
          }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setStrategies((old) => [data, ...old]);
      set((old) => ({ ...old, strategy: data.id }));
      setEditing(false);
      setNotice(
        "Strategy revision saved. Existing campaigns retain their frozen strategy.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="prepare-workspace">
      <div className="section-heading">
        <div>
          <h2>Set your team’s direction</h2>
          <p className="muted">
            Choose a team, define its strategy, then test and improve it.
          </p>
        </div>
        <button onClick={onContinue} disabled={!team || !p.scenario}>
          Continue to simulate →
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="prepare-columns">
        <section className="workspace-section">
          <h3>Team setup</h3>
          <label>
            Team version
            <select
              value={p.team}
              onChange={(e) =>
                set((old) => ({
                  ...old,
                  team: e.target.value,
                  scenario: "",
                  strategy: "",
                }))
              }
            >
              {w.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {w.formations.find((f) => f.id === team?.formationId)?.name} ·{" "}
            {team?.formationId}
          </p>
          <label>
            Starting positions
            <select
              value={p.scenario}
              onChange={(e) =>
                set((old) => ({ ...old, scenario: e.target.value }))
              }
            >
              {!valid.length && <option value="">No scenario available</option>}
              {valid.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <ScenarioEditor
            workspace={w}
            onSaved={() =>
              fetch("/api/runs")
                .then((r) => r.json())
                .then((d) => setScenarios(d.scenarios || []))
            }
          />
          <label>
            Decision provider
            <select
              value={p.provider}
              onChange={(e) =>
                set((old) => ({ ...old, provider: e.target.value }))
              }
            >
              <option value="decisions">Decisions · gpt-6-luna</option>
              <option value="responses">Responses · per-position models</option>
              <option value="mock">Mock · test fixture</option>
            </select>
          </label>
          <p className="muted">
            API key {key ? "configured" : "not configured"}. Settings freeze
            when a match or campaign starts.
          </p>
          {p.provider === "responses" && (
            <ModelAssignments
              title="Player models"
              models={p.models}
              inference={p.inference}
              onModels={(models) => set((old) => ({ ...old, models }))}
              onInference={(inference) => set((old) => ({ ...old, inference }))}
            />
          )}
        </section>
        <section className="workspace-section">
          <div className="section-heading">
            <h3>Strategy</h3>
            <button
              className="text-button"
              onClick={() => {
                setDraft({
                  label: "New strategy",
                  brief:
                    "Win matches through coordinated movement and reliable progression. Adapt risk to the score and time remaining.",
                  roleGuidance: {},
                  protectedInstructions: [],
                  sourceIds: [],
                  parentId: null,
                });
                setEditing(true);
              }}
            >
              New strategy
            </button>
          </div>
          <label>
            Saved revision
            <select
              value={
                strategy?.formationId === team?.formationId ? p.strategy : ""
              }
              onChange={(e) =>
                set((old) => ({ ...old, strategy: e.target.value }))
              }
            >
              <option value="">
                Select a strategy for improvement campaigns
              </option>
              {strategies
                .filter((s) => s.formationId === team?.formationId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
            </select>
          </label>
          {strategy &&
            strategy.formationId === team?.formationId &&
            !editing && (
              <>
                <p className="strategy-brief">{strategy.brief}</p>
                {strategy.protectedInstructions.length > 0 && (
                  <p className="muted">
                    {strategy.protectedInstructions.length} protected
                    instruction(s)
                  </p>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    setDraft({
                      ...strategy,
                      label: strategy.label + " · revision",
                      parentId: strategy.id,
                    });
                    setEditing(true);
                  }}
                >
                  Edit as new revision
                </button>
              </>
            )}
          {!strategy && !editing && (
            <p className="empty">
              Add a brief to guide automatic prompt improvements. Individual
              matches do not require one.
            </p>
          )}
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <label>
                Name
                <input
                  required
                  value={draft.label}
                  onChange={(e) =>
                    setDraft({ ...draft, label: e.target.value })
                  }
                />
              </label>
              <label>
                Team brief
                <textarea
                  required
                  maxLength={10000}
                  rows={5}
                  value={draft.brief}
                  onChange={(e) =>
                    setDraft({ ...draft, brief: e.target.value })
                  }
                />
              </label>
              <details>
                <summary>Role guidance</summary>
                {ROLES.map((role) => (
                  <label key={role}>
                    {role}
                    <textarea
                      maxLength={2000}
                      rows={2}
                      value={draft.roleGuidance[role] || ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          roleGuidance: {
                            ...draft.roleGuidance,
                            [role]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </details>
              <label>
                Protected instructions{" "}
                <small>
                  One per line. Automatic revisions must include these exact
                  words.
                </small>
                <textarea
                  rows={3}
                  value={draft.protectedInstructions.join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      protectedInstructions: e.target.value.split("\n"),
                    })
                  }
                />
              </label>
              <details>
                <summary>Linked sources ({draft.sourceIds.length})</summary>
                {w.sources.map((source) => (
                  <label className="check-row" key={source.id}>
                    <input
                      type="checkbox"
                      checked={draft.sourceIds.includes(source.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sourceIds: e.target.checked
                            ? [...draft.sourceIds, source.id]
                            : draft.sourceIds.filter(
                                (id: string) => id !== source.id,
                              ),
                        })
                      }
                    />
                    {source.title}
                  </label>
                ))}
              </details>
              <div className="toolbar">
                <button disabled={busy}>
                  {busy ? "Saving…" : "Save strategy revision"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
