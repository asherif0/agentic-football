"use client";
import { useEffect, useState } from "react";
import {
  RecordData,
  Role,
  ROLES,
  Workspace,
  promptDiff,
} from "../../lib/domain";
import { annotationContext } from "../../lib/prompt-proposals";
import DataTable from "./DataTable";
type Proposal = {
  text: string;
  rationale: string;
  changes: { instruction: string; annotationIds: string[] }[];
  uncertainties: string[];
  evaluationPlan: string;
  provenance: any;
};
export default function AnnotationCollections({
  workspace: w,
  requestedParentId,
  refresh,
  onSaved,
}: {
  workspace: Workspace;
  requestedParentId: string | null;
  refresh: () => Promise<void>;
  onSaved: (id: string) => void;
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
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [revisionLabel, setRevisionLabel] = useState("");
  const [model, setModel] = useState("gpt-6-luna");
  const [configured, setConfigured] = useState(false);
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
          setProposal(s.proposal);
          setRevisionLabel(s.revisionLabel);
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
          proposal,
          revisionLabel,
        }),
      );
    } catch {}
  }, [
    ready,
    formationId,
    role,
    parentId,
    origin,
    selected,
    label,
    savedId,
    proposal,
    revisionLabel,
  ]);
  useEffect(() => {
    fetch("/api/prompt-proposals")
      .then((r) => r.json())
      .then((x) => {
        setConfigured(x.configured);
        setModel(x.model);
      })
      .catch(() => setError("Could not check API configuration."));
  }, []);
  useEffect(() => {
    if (!proposal) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [proposal]);
  const prompts = w.prompts
    .filter((p) => p.formationId === formationId && p.role === role)
    .slice()
    .reverse();
  const parent = prompts.find((p) => p.id === parentId) || prompts[0];
  const saved = w.collections.find((c) => c.id === savedId);
  const eligible = w.annotations.filter((a) => {
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
    setProposal(null);
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
    setProposal(null);
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
  async function generate() {
    setBusy("Reviewing collected evidence…");
    setError("");
    try {
      const p = await post("/api/prompt-proposals", {
        collectionId: savedId,
        model,
      });
      setProposal(p);
      setRevisionLabel(`${parent?.label || role} · ${label}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function saveRevision() {
    if (!proposal || !parent || !saved) return;
    setBusy("Saving reviewed revision…");
    setError("");
    try {
      const p = await post("/api/workspace", {
        kind: "prompts",
        record: {
          label: revisionLabel,
          text: proposal.text,
          rationale: proposal.rationale,
          parentId: parent.id,
          formationId: parent.formationId,
          role: parent.role,
          hypothesisIds: parent.hypothesisIds,
          status: "draft",
          collectionId: saved.id,
          aiProposal: {
            ...proposal.provenance,
            reviewedAt: new Date().toISOString(),
          },
        },
      });
      await refresh();
      setProposal(null);
      try {
        sessionStorage.removeItem("football-collection-review");
      } catch {}
      onSaved(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const diff =
    proposal && parent ? promptDiff(parent.text, proposal.text) : null;
  return (
    <div className="collection-workspace">
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EVIDENCE → PROPOSAL → REVIEW</span>
            <h2>Annotation collections</h2>
            <p className="muted">
              Bring plays from multiple matches together to revise one player’s
              instructions.
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
                setProposal(null);
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
          <h2>Propose a prompt revision</h2>
          <div className="toolbar">
            <span className="badge">
              {configured ? "API key configured" : "API key missing"}
            </span>
            <label>
              OpenAI model
              <input
                value={model}
                disabled={!!busy || !!proposal}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            One Responses API request per click · 50,000 reserved input-token
            ceiling · 4,096 output-token limit · 60-second timeout · no
            automatic retries. Only annotation text, match context and prompts
            are sent; recording files are not analyzed.
          </p>
          {!proposal && (
            <button disabled={!!busy || !configured} onClick={generate}>
              Generate AI proposal
            </button>
          )}
          {busy && (
            <p role="status" aria-live="polite">
              {busy}
            </p>
          )}
          {proposal && (
            <div className="proposal-review">
              <div className="section-heading">
                <h3>Review proposed changes</h3>
                <span className="badge">Untested draft</span>
              </div>
              <ul>
                {proposal.changes.map((c, i) => (
                  <li key={i}>
                    {c.instruction}
                    <small className="evidence-citations">
                      {c.annotationIds.map((id) => {
                        const a = w.annotations.find((a) => a.id === id);
                        return (
                          <span key={id}>
                            {" "}
                            {a?.timestamp} ·{" "}
                            {annotationContext(a!, w).match?.label} ·{" "}
                            {id.slice(0, 8)}
                          </span>
                        );
                      })}
                    </small>
                  </li>
                ))}
              </ul>
              {proposal.uncertainties.length > 0 && (
                <div className="notice">
                  <strong>Uncertainties & conflicting evidence</strong>
                  <ul>
                    {proposal.uncertainties.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p>
                <strong>Evaluation plan:</strong> {proposal.evaluationPlan}
              </p>
              <label>
                Revision label
                <input
                  value={revisionLabel}
                  onChange={(e) => setRevisionLabel(e.target.value)}
                />
              </label>
              <div className="proposal-columns">
                <div>
                  <h3>Parent prompt</h3>
                  <pre className="prompt-text">{parent?.text}</pre>
                </div>
                <label>
                  Proposed prompt — editable
                  <textarea
                    rows={18}
                    maxLength={6000}
                    value={proposal.text}
                    onChange={(e) =>
                      setProposal({ ...proposal, text: e.target.value })
                    }
                  />
                  <small>
                    {proposal.text.length.toLocaleString()} / 6,000 characters
                  </small>
                </label>
              </div>
              <label>
                Revision rationale
                <textarea
                  rows={3}
                  value={proposal.rationale}
                  onChange={(e) =>
                    setProposal({ ...proposal, rationale: e.target.value })
                  }
                />
              </label>
              <details>
                <summary>Changes from parent</summary>
                <h4>Removed lines</h4>
                <pre>{diff?.removed.join("\n") || "None"}</pre>
                <h4>Added lines</h4>
                <pre>{diff?.added.join("\n") || "None"}</pre>
              </details>
              <details>
                <summary>Generation details</summary>
                <p>
                  {proposal.provenance.model} · {proposal.provenance.durationMs}{" "}
                  ms · {proposal.provenance.inputTokens ?? "Unknown"} input /{" "}
                  {proposal.provenance.outputTokens ?? "Unknown"} output tokens
                </p>
              </details>
              <p className="muted">
                Saving records your review and preserves the original AI
                proposal. Team versions and champions are unchanged. Create a
                new team version to test this draft.
              </p>
              <div className="toolbar">
                <button
                  disabled={
                    !!busy ||
                    !revisionLabel.trim() ||
                    !proposal.text.trim() ||
                    !proposal.rationale.trim()
                  }
                  onClick={saveRevision}
                >
                  Save reviewed prompt revision
                </button>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => setProposal(null)}
                >
                  Discard proposal
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
