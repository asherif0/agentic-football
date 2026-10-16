"use client";
import { useEffect, useState } from "react";
import { ROLES, type Workspace } from "../../../lib/domain";
import type { Strategy } from "../../../lib/improvement/types";
import { getJSON, postJSON } from "../../lib/data/cache";
import { toast } from "../../lib/toast";
import { usePreparation } from "../Preparation";

/** Strategy briefs that guide automatic prompt-improvement campaigns. */
export default function StrategyPanel({
  workspace: w,
}: {
  workspace: Workspace;
}) {
  const { value: p, set } = usePreparation(),
    [strategies, setStrategies] = useState<Strategy[]>([]),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const team = w.teams.find((t) => t.id === p.team),
    strategy = strategies.find((s) => s.id === p.strategy);
  useEffect(() => {
    getJSON<{ strategies: Strategy[] }>("/api/campaigns")
      .then((a) => setStrategies(a.strategies || []))
      .catch(() => toast("Could not load strategies.", "error"));
  }, []);
  async function save() {
    setBusy(true);
    try {
      const data = await postJSON<Strategy>("/api/strategies", {
        ...draft,
        protectedInstructions: draft.protectedInstructions.filter((s: string) =>
          s.trim(),
        ),
        formationId: team?.formationId,
      });
      setStrategies((old) => [data, ...old]);
      set((old) => ({ ...old, strategy: data.id }));
      setEditing(false);
      toast(
        "Strategy revision saved. Existing campaigns keep their frozen strategy.",
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <h3>Strategy for {team?.label ?? "the current squad"}</h3>
          <p className="muted">
            Campaigns use your current squad from the Squad page plus this
            brief.
          </p>
        </div>
        <button
          className="secondary"
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
          value={strategy?.formationId === team?.formationId ? p.strategy : ""}
          onChange={(e) => set((old) => ({ ...old, strategy: e.target.value }))}
        >
          <option value="">Select a strategy for improvement campaigns</option>
          {strategies
            .filter((s) => s.formationId === team?.formationId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {new Date(s.createdAt).toLocaleDateString()}
              </option>
            ))}
        </select>
      </label>
      {strategy && strategy.formationId === team?.formationId && !editing && (
        <>
          <p className="strategy-brief">{strategy.brief}</p>
          {strategy.protectedInstructions.length > 0 && (
            <p className="muted">
              {strategy.protectedInstructions.length} protected instruction(s)
            </p>
          )}
          <button
            className="secondary"
            style={{ width: "fit-content" }}
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
          Add a brief to guide automatic prompt improvements. Individual matches
          do not need one.
        </p>
      )}
      {editing && draft && (
        <form
          style={{ display: "grid", gap: 12 }}
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
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label>
            Team brief
            <textarea
              required
              maxLength={10000}
              rows={5}
              value={draft.brief}
              onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
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
              One per line. Automatic revisions must include these exact words.
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
  );
}
