"use client";
import { useState, type ReactNode } from "react";
import { PHASES, ROLES, type Kind, type Workspace } from "../../../lib/domain";
import { postJSON } from "../../lib/data/cache";
import { REF_KINDS, applyFieldChange, recordName } from "../../lib/records";

type Attachment = { id: string; name: string };

/**
 * Schema-less editor for immutable workspace records. Every save creates a new
 * record; revisions keep a parentId link to the record they came from.
 */
export default function RecordEditor({
  kind,
  workspace: w,
  attachments,
  draft,
  setDraft,
  onSaved,
  onCancel,
  submitLabel = "Save new record",
}: {
  kind: Kind;
  workspace: Workspace;
  attachments: Attachment[];
  draft: any;
  setDraft: (fn: (d: any) => any) => void;
  onSaved: (id: string) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const setField = (key: string, value: any) =>
    setDraft((d: any) => applyFieldChange(d, key, value));
  async function save() {
    setBusy(true);
    setError("");
    try {
      const x = await postJSON<{ id: string }>(
        "/api/workspace",
        { kind, record: draft },
        ["workspace"],
      );
      onSaved(x.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function options(key: string) {
    let list = REF_KINDS[key] ? w[REF_KINDS[key]] : [];
    if (key === "hypothesisIds" && draft) {
      const f =
        draft.formationId ||
        w.teams.find((t) => t.id === draft.teamId)?.formationId;
      list = list.filter(
        (h) =>
          h.formationId === f && (!draft.role || h.roles.includes(draft.role)),
      );
    }
    return list;
  }
  function objectEditor(
    value: any,
    onChange: (v: any) => void,
    prefix = "",
  ): ReactNode {
    return (
      <div className="nested">
        {Object.entries(value).map(([k, v]) => {
          const Tag = v && typeof v === "object" ? "div" : "label";
          return (
            <Tag key={k}>
              {k}
              {v && typeof v === "object" && !Array.isArray(v) ? (
                objectEditor(
                  v,
                  (x) => onChange({ ...value, [k]: x }),
                  `${prefix}.${k}`,
                )
              ) : prefix === "scores" ? (
                <select
                  value={v === null ? "" : String(v)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [k]:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Not assessable</option>
                  <option value="0">0 · Failed</option>
                  <option value="1">1 · Partial</option>
                  <option value="2">2 · Clear</option>
                </select>
              ) : prefix === "promptIds" ? (
                <select
                  value={String(v)}
                  onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                >
                  <option value="">Select prompt</option>
                  {w.prompts
                    .filter(
                      (p) =>
                        p.role === k && p.formationId === draft.formationId,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {recordName(p)}
                      </option>
                    ))}
                </select>
              ) : (
                <textarea
                  rows={2}
                  value={String(v ?? "")}
                  onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                />
              )}
            </Tag>
          );
        })}
      </div>
    );
  }
  function fields() {
    return Object.entries(draft).map(([key, v]) => {
      let control: ReactNode;
      const enumOptions: Record<string, readonly string[]> = {
        role: ROLES,
        phase: PHASES,
        status: kind === "formations" ? ["draft", "active"] : ["draft"],
        compatibility: ["unconfirmed", "confirmed"],
        outcome: ["challenger", "tested", "validated", "champion", "rejected"],
        opponent: ["Benchmark FC", "Total Attack United", "Fort Knox Athletic"],
      };
      if (REF_KINDS[key] || key === "parentId") {
        const list = key === "parentId" ? w[kind] : options(key);
        control = Array.isArray(v) ? (
          <div className="checks">
            {list.map((x) => (
              <label key={x.id}>
                <input
                  type="checkbox"
                  checked={(v as string[]).includes(x.id)}
                  onChange={(e) =>
                    setField(
                      key,
                      e.target.checked
                        ? [...(v as string[]), x.id]
                        : (v as string[]).filter((id) => id !== x.id),
                    )
                  }
                />
                {recordName(x)}
              </label>
            ))}
          </div>
        ) : (
          <select
            value={String(v || "")}
            onChange={(e) => {
              const val = e.target.value || null;
              setField(key, val);
              if (key === "experimentId") {
                setField(
                  "evidenceOrigin",
                  w.experiments.find((x) => x.id === val)?.evidenceOrigin ||
                    "portal",
                );
                setField(
                  "synthetic",
                  w.experiments.find((x) => x.id === val)?.synthetic || false,
                );
              }
            }}
          >
            <option value="">Select / none</option>
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {recordName(x)} {x.revision ? `r${x.revision}` : ""}
              </option>
            ))}
          </select>
        );
      } else if (key === "roles" && Array.isArray(v))
        control = (
          <div className="checks">
            {ROLES.map((r) => (
              <label key={r}>
                <input
                  type="checkbox"
                  checked={v.includes(r)}
                  onChange={(e) =>
                    setField(
                      key,
                      e.target.checked ? [...v, r] : v.filter((x) => x !== r),
                    )
                  }
                />
                {r}
              </label>
            ))}
          </div>
        );
      else if (key === "questions")
        control = (
          <div style={{ display: "grid", gap: 8 }}>
            {(v as any[]).map((q, i) => (
              <div className="question" key={i}>
                <input
                  aria-label="Question ID"
                  value={q.id}
                  onChange={(e) =>
                    setField(
                      key,
                      (v as any[]).map((x, j) =>
                        j === i ? { ...x, id: e.target.value } : x,
                      ),
                    )
                  }
                />
                <select
                  value={q.role}
                  onChange={(e) =>
                    setField(
                      key,
                      (v as any[]).map((x, j) =>
                        j === i ? { ...x, role: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <input
                  aria-label="Question text"
                  value={q.text}
                  onChange={(e) =>
                    setField(
                      key,
                      (v as any[]).map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  className="secondary"
                  onClick={() =>
                    setField(
                      key,
                      (v as any[]).filter((_, j) => i !== j),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="secondary"
              style={{ width: "fit-content" }}
              onClick={() =>
                setField(key, [
                  ...(v as any[]),
                  { id: crypto.randomUUID(), role: "GK", text: "" },
                ])
              }
            >
              Add question
            </button>
          </div>
        );
      else if (key === "attachmentIds" || key === "evidenceIds") {
        const available =
          key === "evidenceIds"
            ? attachments.filter((a) =>
                w.matches
                  .find((m) => m.id === draft.matchId)
                  ?.attachmentIds.includes(a.id),
              )
            : attachments;
        control = (
          <div className="checks">
            {available.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={(v as string[]).includes(a.id)}
                  onChange={(e) =>
                    setField(
                      key,
                      e.target.checked
                        ? [...(v as string[]), a.id]
                        : (v as string[]).filter((id) => id !== a.id),
                    )
                  }
                />
                {a.name}
              </label>
            ))}
            {!available.length && (
              <span className="muted">No attachments.</span>
            )}
          </div>
        );
      } else if (v !== null && typeof v === "object")
        control = objectEditor(v, (x) => setField(key, x), key);
      else if (typeof v === "boolean")
        control = (
          <input
            type="checkbox"
            checked={v}
            disabled={key === "synthetic" && kind === "matches"}
            onChange={(e) => setField(key, e.target.checked)}
          />
        );
      else if (typeof v === "number" || (v === null && kind === "matches"))
        control = (
          <input
            type="number"
            min="0"
            value={v === null ? "" : String(v)}
            placeholder="Unknown"
            onChange={(e) =>
              setField(
                key,
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        );
      else if (enumOptions[key])
        control = (
          <select
            value={String(v)}
            onChange={(e) => setField(key, e.target.value)}
          >
            {enumOptions[key].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        );
      else
        control = (
          <textarea
            rows={key === "text" ? 16 : 2}
            value={String(v ?? "")}
            className={key === "text" ? "mono" : undefined}
            onChange={(e) => setField(key, e.target.value)}
          />
        );
      const Tag = v !== null && typeof v === "object" ? "div" : "label";
      return (
        <Tag className="field" key={key}>
          <span>
            {key.replace(/([A-Z])/g, " $1")}
            {key === "text" ? ` · ${String(v).length}/6000` : ""}
          </span>
          {control}
        </Tag>
      );
    });
  }
  function eventQuestions() {
    if (kind !== "annotations" || !draft) return null;
    const m = w.matches.find((m) => m.id === draft.matchId),
      e = w.experiments.find((e) => e.id === m?.experimentId),
      t = w.teams.find((t) => t.id === e?.teamId),
      f = w.formations.find((f) => f.id === t?.formationId);
    return (
      <div className="card">
        <h3>Formation-specific execution questions</h3>
        {f?.questions
          .filter((q: any) => q.role === draft.role)
          .map((q: any) => (
            <label key={q.id}>
              {q.text}
              <select
                value={draft.scores[q.id] ?? ""}
                onChange={(e) =>
                  setField("scores", {
                    ...draft.scores,
                    [q.id]:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Not assessable</option>
                {[0, 1, 2].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          ))}
      </div>
    );
  }
  return (
    <div className="legacy">
      <p className="muted">
        Saved versions are never overwritten. Changing a formation requires new
        prompts and a new team referencing that revision.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {fields()}
      {eventQuestions()}
      <div className="toolbar">
        <button disabled={busy} onClick={save}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
