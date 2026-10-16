"use client";
import { useEffect, useState } from "react";
import {
  Workspace,
  RecordData,
  ROLES,
  Role,
  promptStatus,
  promptDiff,
} from "../../lib/domain";
type Selection = {
  family: string;
  formationId: string;
  role: Role;
  promptId: string;
};
export default function PromptBrowser({
  workspace: w,
  family,
  requestedId,
  onRevise,
  onEvidenceRevise,
  onCreate,
  onRequestHandled,
  onCampaign,
}: {
  workspace: Workspace;
  family: string;
  requestedId: string | null;
  onRevise: (p: RecordData) => void;
  onEvidenceRevise: (p: RecordData) => void;
  onCreate: (formationId: string, role: Role) => void;
  onRequestHandled: () => void;
  onCampaign?: (id: string) => void;
}) {
  const [selection, setSelection] = useState<Selection>({
      family: "",
      formationId: "",
      role: "GK",
      promptId: "",
    }),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  const newest = (items: RecordData[]) =>
    [...items].sort(
      (a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)) ||
        b.id.localeCompare(a.id),
    );
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("football-prompt-selection");
      if (stored) {
        const saved = JSON.parse(stored);
        setSelection(
          family !== "all" && saved.family !== family
            ? {
                family,
                formationId: "",
                role: ROLES.includes(saved.role) ? saved.role : "GK",
                promptId: "",
              }
            : saved,
        );
      } else
        setSelection((s) => ({
          ...s,
          family:
            family !== "all"
              ? family
              : w.formations.some((f) => f.family === "1-1-2")
                ? "1-1-2"
                : w.formations[0]?.family || "",
        }));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!requestedId) return;
    const p = w.prompts.find((p) => p.id === requestedId),
      f = w.formations.find((f) => f.id === p?.formationId);
    if (p && f)
      setSelection({
        family: f.family,
        formationId: f.id,
        role: p.role,
        promptId: p.id,
      });
    onRequestHandled();
  }, [requestedId, w]);
  const selectedFamily =
      selection.family ||
      (family !== "all" ? family : w.formations[0]?.family || ""),
    formations = [
      ...w.formations.filter((f) => f.family === selectedFamily),
    ].sort((a, b) => b.revision - a.revision),
    formation =
      formations.find((f) => f.id === selection.formationId) || formations[0],
    prompts = newest(
      w.prompts.filter(
        (p) => p.formationId === formation?.id && p.role === selection.role,
      ),
    ),
    prompt = prompts.find((p) => p.id === selection.promptId) || prompts[0];
  useEffect(() => {
    if (ready)
      sessionStorage.setItem(
        "football-prompt-selection",
        JSON.stringify({
          ...selection,
          family: selectedFamily,
          formationId: formation?.id || "",
          promptId: prompt?.id || "",
        }),
      );
  }, [ready, selection, selectedFamily, formation?.id, prompt?.id]);
  function download() {
    if (!prompt) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([prompt.text], { type: "text/plain" }),
    );
    a.download = prompt.id + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <section className="prompt-browser">
      <div className="section-heading">
        <div>
          <h2>Player playbook</h2>
          <p className="muted">One role. Every version. A clear history.</p>
        </div>
        <button onClick={() => onCreate(formation?.id || "", selection.role)}>
          + New prompt
        </button>
      </div>
      <div className="filter-bar">
        <label>
          Formation
          <select
            value={selectedFamily}
            onChange={(e) =>
              setSelection((s) => ({
                ...s,
                family: e.target.value,
                formationId: "",
                promptId: "",
              }))
            }
          >
            {[...new Set(w.formations.map((f) => f.family))].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          Formation revision
          <select
            value={formation?.id || ""}
            onChange={(e) =>
              setSelection((s) => ({
                ...s,
                formationId: e.target.value,
                promptId: "",
              }))
            }
          >
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || f.label || f.family} · r{f.revision}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="role-tabs" role="tablist" aria-label="Player position">
        {ROLES.map((role) => (
          <button
            key={role}
            id={"role-" + role}
            role="tab"
            aria-selected={selection.role === role}
            aria-controls="prompt-panel"
            tabIndex={selection.role === role ? 0 : -1}
            onKeyDown={(e) => {
              const i = ROLES.indexOf(selection.role);
              const next =
                e.key === "ArrowRight"
                  ? ROLES[(i + 1) % 5]
                  : e.key === "ArrowLeft"
                    ? ROLES[(i + 4) % 5]
                    : e.key === "Home"
                      ? ROLES[0]
                      : e.key === "End"
                        ? ROLES[4]
                        : null;
              if (next) {
                e.preventDefault();
                setSelection((s) => ({ ...s, role: next, promptId: "" }));
                document.getElementById("role-" + next)?.focus();
              }
            }}
            onClick={() => setSelection((s) => ({ ...s, role, promptId: "" }))}
          >
            {role}
            <span>
              {
                w.prompts.filter(
                  (p) => p.formationId === formation?.id && p.role === role,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div
        className="card prompt-detail"
        role="tabpanel"
        id="prompt-panel"
        aria-labelledby={"role-" + selection.role}
      >
        {prompt ? (
          <>
            <div className="section-heading">
              <div>
                <span className="badge">{promptStatus(prompt.id, w)}</span>
                <h2>
                  {selection.role} · {prompt.label}
                </h2>
                <p className="muted">
                  {prompt.text.length.toLocaleString()} characters ·{" "}
                  {new Date(prompt.createdAt).toLocaleDateString()}
                </p>
              </div>
              <label>
                Prompt version
                <select
                  value={prompt.id}
                  onChange={(e) =>
                    setSelection((s) => ({ ...s, promptId: e.target.value }))
                  }
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {new Date(p.createdAt).toLocaleDateString()} ·{" "}
                      {p.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar">
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(prompt.text)
                    .then(() => setMessage("Prompt copied."))
                    .catch(() =>
                      setMessage(
                        "Clipboard unavailable; download this prompt.",
                      ),
                    )
                }
              >
                Copy prompt
              </button>
              <button className="secondary" onClick={download}>
                Download
              </button>
              <button className="secondary" onClick={() => onRevise(prompt)}>
                Create revision
              </button>
              <button
                className="secondary"
                onClick={() => onEvidenceRevise(prompt)}
              >
                Revise from annotations
              </button>
            </div>
            <p role="status" className="muted">
              {message}
            </p>
            <pre className="prompt-text">{prompt.text}</pre>
            {prompt.campaignId && (
              <details>
                <summary>Automatic improvement provenance</summary>
                <p>
                  {prompt.aiProposal?.actor === "mock"
                    ? "Test fixture"
                    : "Machine-generated candidate"}{" "}
                  · {prompt.aiProposal?.model}. Local evidence is separate from
                  portal validation.
                </p>
                <p>{prompt.aiProposal?.originalProposal?.rationale}</p>
                {prompt.aiProposal?.originalProposal?.sourceIds?.map(
                  (id: string) => {
                    const source = w.sources.find((s) => s.id === id);
                    return source ? (
                      <p key={id}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>{" "}
                        · {source.locator}
                      </p>
                    ) : null;
                  },
                )}
                {prompt.aiProposal?.originalProposal?.uncertainties?.map(
                  (s: string, i: number) => (
                    <p key={i}>{s}</p>
                  ),
                )}
                <button
                  className="text-button"
                  onClick={() => onCampaign?.(prompt.campaignId)}
                >
                  View campaign evidence & adoption results
                </button>
              </details>
            )}
            <details>
              <summary>Rationale & source traceability</summary>
              <p>{prompt.rationale}</p>
              {prompt.collectionId &&
                (() => {
                  const c = w.collections.find(
                    (c) => c.id === prompt.collectionId,
                  );
                  return (
                    <div>
                      <h3>Annotation collection: {c?.label}</h3>
                      <p>
                        {c?.evidenceOrigin} · {c?.annotationIds.length}{" "}
                        annotations ·{" "}
                        {prompt.aiProposal?.model || "Manual revision"}
                      </p>
                      {c?.annotationIds.map((id: string) => {
                        const a = w.annotations.find((a) => a.id === id);
                        return (
                          <p key={id}>
                            <strong>
                              {a?.role} · {a?.timestamp}
                            </strong>{" "}
                            — {a?.observation}
                            <br />
                            <small>{a?.diagnosis}</small>
                          </p>
                        );
                      })}
                      {prompt.aiProposal?.originalProposal && (
                        <details>
                          <summary>
                            Original AI proposal & evaluation plan
                          </summary>
                          <p>
                            {prompt.aiProposal.originalProposal.evaluationPlan}
                          </p>
                          <pre className="prompt-text">
                            {prompt.aiProposal.originalProposal.text}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })()}
              {prompt.hypothesisIds.map((id: string) => {
                const h = w.hypotheses.find((h) => h.id === id);
                return (
                  <div key={id}>
                    <strong>{h?.title || id}</strong>
                    <p>{h?.behavior}</p>
                    {(h?.principleIds || []).map((pid: string) => {
                      const principle = w.principles.find((p) => p.id === pid);
                      return (
                        <p key={pid}>
                          {principle?.title} · {principle?.claim}
                          {(principle?.sourceIds || []).map((sid: string) => {
                            const source = w.sources.find((s) => s.id === sid);
                            return source ? (
                              <a
                                key={sid}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {" "}
                                · {source.title}
                              </a>
                            ) : null;
                          })}
                        </p>
                      );
                    })}
                  </div>
                );
              })}
            </details>
            <details>
              <summary>Provenance & version changes</summary>
              <p>Prompt ID: {prompt.id}</p>
              <p>Formation revision: {prompt.formationId}</p>
              {prompt.parentId ? (
                <>
                  <p>
                    Parent:{" "}
                    {w.prompts.find((p) => p.id === prompt.parentId)?.label ||
                      prompt.parentId}
                  </p>
                  <pre>
                    {JSON.stringify(
                      promptDiff(
                        w.prompts.find((p) => p.id === prompt.parentId)?.text ||
                          "",
                        prompt.text,
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </>
              ) : (
                <p>Original version · no parent.</p>
              )}
            </details>
          </>
        ) : (
          <div className="empty">
            <h3>No {selection.role} prompts for this revision</h3>
            <p>Create a prompt to begin this role’s history.</p>
            <button
              onClick={() => onCreate(formation?.id || "", selection.role)}
            >
              Create prompt
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
