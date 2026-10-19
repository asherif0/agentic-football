"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  RecordData,
  Role,
  ROLES,
  Workspace,
  latestAnnotations,
} from "../../lib/domain";
import { annotationContext } from "../../lib/prompt-proposals";
import DataTable from "./DataTable";
export default function AnnotationCollections({
  workspace: w,
  requestedParentId,
  refresh,
}: {
  workspace: Workspace;
  requestedParentId: string | null;
  refresh: () => Promise<void>;
}) {
  const requested = w.prompts.find((p) => p.id === requestedParentId);
  const [formationId, setFormation] = useState(
    requested?.formationId || w.formations[0]?.id || "",
  );
  const [role, setRole] = useState<Role>(requested?.role || "MID");
  const [parentId, setParent] = useState(requested?.id || "");
  const [origin, setOrigin] = useState("local simulation");
  const [selected, setSelected] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [savedId, setSavedId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("football-collection-review");
      if (raw && !requestedParentId) {
        const s = JSON.parse(raw);
        if (
          w.formations.some((f) => f.id === s.formationId) &&
          ROLES.includes(s.role)
        ) {
          setFormation(s.formationId);
          setRole(s.role);
          setParent(s.parentId);
          setOrigin(s.origin);
          setSelected(
            s.selected.filter((id: string) =>
              w.annotations.some((a) => a.id === id),
            ),
          );
          setLabel(s.label);
          setSavedId(
            w.collections.some((c) => c.id === s.savedId) ? s.savedId : "",
          );
        }
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        "football-collection-review",
        JSON.stringify({
          formationId,
          role,
          parentId,
          origin,
          selected,
          label,
          savedId,
        }),
      );
    } catch {}
  }, [ready, formationId, role, parentId, origin, selected, label, savedId]);
  const prompts = w.prompts
    .filter((p) => p.formationId === formationId && p.role === role)
    .slice()
    .reverse();
  const parent = prompts.find((p) => p.id === parentId) || prompts[0];
  const saved = w.collections.find((c) => c.id === savedId);
  const eligible = latestAnnotations(w).filter((a) => {
    const c = annotationContext(a, w);
    return (
      a.role === role &&
      c.formationId === formationId &&
      c.evidenceOrigin === origin
    );
  });
  const visible = eligible.filter((a) =>
    `${a.observation} ${a.diagnosis} ${a.timestamp} ${annotationContext(a, w).match?.label}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const matches = new Set(
    selected.map((id) => w.annotations.find((a) => a.id === id)?.matchId),
  ).size;
  function reset() {
    setSavedId("");
    setSelected([]);
    setLabel("");
    setError("");
  }
  function openCollection(id: string) {
    const c = w.collections.find((c) => c.id === id);
    if (!c) {
      reset();
      return;
    }
    setFormation(c.formationId);
    setRole(c.role);
    setParent(c.parentPromptId);
    setOrigin(c.evidenceOrigin);
    setSelected(c.annotationIds);
    setLabel(c.label);
    setSavedId(c.id);
    setError("");
    setSearch("");
  }
  async function post(url: string, data: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const x = await r.json();
    if (!r.ok) throw new Error(x.error || "Request failed");
    return x;
  }
  async function saveCollection() {
    setBusy("Saving collection…");
    setError("");
    try {
      const c = await post("/api/workspace", {
        kind: "collections",
        record: {
          label,
          formationId,
          role,
          parentPromptId: parent?.id,
          evidenceOrigin: origin,
          annotationIds: selected,
        },
      });
      await refresh();
      setSavedId(c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="collection-workspace">
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EVIDENCE</span>
            <h2>Annotation collections</h2>
            <p className="muted">
              Group critical events from several matches for one player.
              Drafting the revision happens on the Prompts page.
            </p>
          </div>
          <label>
            Saved collections
            <select
              value={savedId}
              disabled={!!busy}
              onChange={(e) => openCollection(e.target.value)}
            >
              <option value="">New collection</option>
              {w.collections
                .slice()
                .reverse()
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.role} · {c.evidenceOrigin}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <fieldset disabled={!!busy || !!saved} className="collection-fields">
          <label>
            Formation revision
            <select
              value={formationId}
              onChange={(e) => {
                reset();
                setFormation(e.target.value);
                setParent("");
              }}
            >
              {w.formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · r{f.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Player
            <select
              value={role}
              onChange={(e) => {
                reset();
                setRole(e.target.value as Role);
                setParent("");
              }}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Parent prompt
            <select
              value={parent?.id || ""}
              onChange={(e) => setParent(e.target.value)}
            >
              {!prompts.length && <option value="">No prompt available</option>}
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {new Date(p.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Evidence origin
            <select
              value={origin}
              onChange={(e) => {
                reset();
                setOrigin(e.target.value);
              }}
            >
              <option>local simulation</option>
              <option>portal</option>
              <option>test fixture</option>
            </select>
          </label>
          <label>
            Collection name
            <input
              value={label}
              placeholder="e.g. MID defensive recovery"
              maxLength={160}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        </fieldset>
        <p className="muted">
          {selected.length} selected · {matches} matches · {origin}. Evidence
          may include different tested prompt versions; the AI receives that
          context. Collections stay within one player and exact formation
          revision.
        </p>
        {origin === "test fixture" && (
          <p className="notice">
            Test fixtures are diagnostic examples and cannot validate tactics.
          </p>
        )}
        {saved && (
          <div className="toolbar">
            <span className="badge">Saved · immutable</span>
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => {
                setSavedId("");
                setLabel(label + " revision");
              }}
            >
              Revise collection
            </button>
          </div>
        )}
        <label>
          Search annotations
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Observation, diagnosis, timestamp or match"
          />
        </label>
        <div className="collection-evidence-list">
          <DataTable
            label="Annotations for prompt revision"
            columns={[
              "Select",
              "Play / match",
              "Observation & diagnosis",
              "Tested prompt",
            ]}
          >
            {visible.map((a) => {
              const c = annotationContext(a, w);
              return (
                <tr key={a.id}>
                  <td>
                    <input
                      aria-label={`Select ${a.timestamp} ${a.observation}`}
                      type="checkbox"
                      checked={selected.includes(a.id)}
                      disabled={
                        !!saved ||
                        !!busy ||
                        (selected.length >= 50 && !selected.includes(a.id))
                      }
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, a.id]
                            : ids.filter((id) => id !== a.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{a.timestamp}</strong>
                    <div>{a.phase}</div>
                    <small>{c.match?.label}</small>
                  </td>
                  <td>
                    <p>{a.observation}</p>
                    <small>{a.diagnosis || "No diagnosis recorded"}</small>
                    <details>
                      <summary>Evidence details</summary>
                      <p>Match: {a.matchId}</p>
                      <p>Opponent: {c.experiment?.opponent}</p>
                      <pre>{JSON.stringify(a.scores, null, 2)}</pre>
                      {a.evidenceIds?.map((id: string) => (
                        <a key={id} href={`/api/attachments/${id}`}>
                          Open attachment{" "}
                        </a>
                      ))}
                      {c.match?.replayUrl && (
                        <a
                          href={c.match.replayUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open recording
                        </a>
                      )}
                    </details>
                  </td>
                  <td>
                    {w.prompts.find((p) => p.id === c.testedPromptId)?.label ||
                      "Unknown"}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={4}>
                  No matching annotations. Save critical-event annotations for
                  this player, formation revision and evidence origin first.
                </td>
              </tr>
            )}
          </DataTable>
        </div>
        {!saved && (
          <div className="toolbar">
            <button
              disabled={!!busy || !parent || !selected.length || !label.trim()}
              onClick={saveCollection}
            >
              Save collection
            </button>
            <span className="muted">
              Up to 50 annotations. Saving does not call AI.
            </span>
          </div>
        )}
      </section>
      {saved && (
        <section className="card">
          <h2>Collection saved</h2>
          <p className="muted">
            Draft a revision of {parent?.label || role} from these{" "}
            {saved.annotationIds.length} annotations on the Prompts page. You
            choose the model there and review the proposal before saving it.
          </p>
          <div className="toolbar">
            <Link
              className="file-button"
              href={`/prompts?prompt=${saved.parentPromptId}&revise=${saved.id}`}
            >
              Generate a revision on Prompts →
            </Link>
            <button className="secondary" onClick={reset}>
              Start a new collection
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
