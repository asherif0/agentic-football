"use client";
import { useEffect, useMemo, useState } from "react";
import type { RecordData, Workspace } from "../../../lib/domain";
import { annotationContext } from "../../../lib/prompt-proposals";
import { getJSON, postJSON } from "../../lib/data/cache";
import { diffLines } from "../../lib/diff";
import { date, int } from "../../lib/format";
import type { ProposalModel } from "../../lib/models";
import { toast } from "../../lib/toast";
import { Dialog } from "../ui/Overlay";
import { Badge, Button, EmptyState, Field, Notice } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import s from "./prompts.module.css";

type Proposal = {
  text: string;
  rationale: string;
  changes: { instruction: string; annotationIds: string[] }[];
  uncertainties: string[];
  evaluationPlan: string;
  provenance: {
    model: string;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    [key: string]: unknown;
  };
};
type Draft = {
  collectionId: string;
  model: string;
  proposal: Proposal;
  label: string;
};
const DRAFT_KEY = "afl-revision-draft";

/**
 * Draft a prompt revision from an annotation collection without leaving the
 * Prompts page: pick evidence and a model, generate, review, save.
 */
export function ReviseDialog({
  open,
  onClose,
  workspace: w,
  prompt,
  requestedCollection,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  prompt: RecordData;
  requestedCollection?: string | null;
  onSaved: (promptId: string) => void;
}) {
  const collections = useMemo(
    () =>
      w.collections
        .filter(
          (c) => c.role === prompt.role && c.formationId === prompt.formationId,
        )
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [w, prompt],
  );
  const [models, setModels] = useState<ProposalModel[]>([]),
    [model, setModel] = useState(""),
    [collectionId, setCollectionId] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [label, setLabel] = useState(""),
    [view, setView] = useState<"side" | "changes">("side"),
    [busy, setBusy] = useState<"" | "generating" | "saving">(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<null | "close" | "discard">(null);

  // Each time the dialog opens: load models, restore an unsaved draft, pick evidence.
  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirm(null);
    let draft: Draft | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch {}
    const restorable =
      draft && collections.some((c) => c.id === draft!.collectionId)
        ? draft
        : null;
    const start =
      (requestedCollection &&
        collections.find((c) => c.id === requestedCollection)?.id) ||
      restorable?.collectionId ||
      collections.find((c) => c.parentPromptId === prompt.id)?.id ||
      collections[0]?.id ||
      "";
    setCollectionId(start);
    if (restorable && restorable.collectionId === start) {
      setProposal(restorable.proposal);
      setLabel(restorable.label);
      setModel(restorable.model);
    } else {
      setProposal(null);
      setLabel("");
    }
    getJSON<{ model: string; models: ProposalModel[] }>("/api/prompt-proposals")
      .then((x) => {
        setModels(x.models);
        setModel((m) => {
          const pick = (id?: string) =>
            x.models.find((o) => o.id === id && o.available)?.id;
          return (
            pick(m) ||
            pick(x.model) ||
            x.models.find((o) => o.available)?.id ||
            x.model
          );
        });
      })
      .catch(() => setError("Could not load the model list."));
  }, [open]);

  // Keep an unsaved proposal across accidental reloads.
  useEffect(() => {
    try {
      if (proposal)
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ collectionId, model, proposal, label }),
        );
    } catch {}
  }, [proposal, label, collectionId, model]);

  const collection = collections.find((c) => c.id === collectionId);
  const parent = w.prompts.find((p) => p.id === collection?.parentPromptId);
  const chosen = models.find((m) => m.id === model);
  const matchCount = (c: RecordData) =>
    new Set(
      c.annotationIds.map(
        (id: string) => w.annotations.find((a) => a.id === id)?.matchId,
      ),
    ).size;

  function clearDraft() {
    setProposal(null);
    setLabel("");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }
  function requestClose() {
    if (busy === "saving") return;
    if (proposal) setConfirm("close");
    else onClose();
  }
  async function generate() {
    if (!collection) return;
    setBusy("generating");
    setError("");
    try {
      const p = await postJSON<Proposal>("/api/prompt-proposals", {
        collectionId: collection.id,
        model,
      });
      setProposal(p);
      setLabel(`${parent?.label ?? prompt.role} · ${collection.label}`);
      setView("side");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!proposal || !parent || !collection) return;
    setBusy("saving");
    setError("");
    try {
      const saved = await postJSON<{ id: string }>(
        "/api/workspace",
        {
          kind: "prompts",
          record: {
            label,
            text: proposal.text,
            rationale: proposal.rationale,
            parentId: parent.id,
            formationId: parent.formationId,
            role: parent.role,
            hypothesisIds: parent.hypothesisIds,
            status: "draft",
            collectionId: collection.id,
            aiProposal: {
              ...proposal.provenance,
              reviewedAt: new Date().toISOString(),
            },
          },
        },
        ["workspace"],
      );
      clearDraft();
      toast(`Saved “${label}” as an untested draft.`, "success");
      onSaved(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const footer = proposal ? (
    <>
      <Button
        variant="ghost"
        disabled={!!busy}
        onClick={() => setConfirm("discard")}
      >
        Discard
      </Button>
      <Button
        icon="restart"
        disabled={!!busy || !chosen?.available}
        onClick={generate}
      >
        {busy === "generating" ? "Regenerating…" : "Regenerate"}
      </Button>
      <Button
        variant="primary"
        icon="check"
        disabled={
          !!busy ||
          !label.trim() ||
          !proposal.text.trim() ||
          !proposal.rationale.trim() ||
          proposal.text.length > 6000 ||
          proposal.text.trim() === parent?.text.trim()
        }
        onClick={save}
      >
        {busy === "saving" ? "Saving…" : "Save reviewed revision"}
      </Button>
    </>
  ) : collections.length ? (
    <>
      <Button variant="ghost" onClick={requestClose}>
        Cancel
      </Button>
      <Button
        variant="primary"
        icon="sparkle"
        disabled={!!busy || !collection || !chosen?.available}
        onClick={generate}
      >
        {busy === "generating" ? "Generating…" : "Generate proposal"}
      </Button>
    </>
  ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      wide={!!proposal}
      title={
        proposal ? "Review the proposed revision" : "Revise from annotations"
      }
      sub={`${prompt.role} · ${prompt.label}`}
      footer={footer}
    >
      <div className={s.revise}>
        {confirm && (
          <div
            className={s.confirm}
            role="alertdialog"
            aria-label="Discard proposal"
          >
            <span>Discard this unsaved proposal? It can't be recovered.</span>
            <span className={s.confirmActions}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirm(null)}
                data-autofocus
              >
                Keep reviewing
              </Button>
              <Button
                size="sm"
                variant="solid"
                onClick={() => {
                  const closing = confirm === "close";
                  clearDraft();
                  setConfirm(null);
                  if (closing) onClose();
                }}
              >
                {confirm === "close" ? "Discard and close" : "Discard"}
              </Button>
            </span>
          </div>
        )}
        {error && (
          <Notice tone="bad" icon="alert">
            {error}
          </Notice>
        )}

        {!proposal && !collections.length && (
          <EmptyState
            icon="list"
            title={`No collections for ${prompt.role} yet`}
            action={
              <Button
                href={`/library/collections?parent=${prompt.id}`}
                variant="primary"
                iconRight="arrowRight"
              >
                Build a collection
              </Button>
            }
          >
            A collection groups critical events from several matches. The
            proposal is drafted from it.
          </EmptyState>
        )}

        {!proposal && collections.length > 0 && (
          <>
            <div className={s.reviseStep}>
              <span className="eyebrow">Evidence</span>
              <div
                className={s.collections}
                role="radiogroup"
                aria-label="Annotation collection"
              >
                {collections.map((c) => {
                  const revises = w.prompts.find(
                    (p) => p.id === c.parentPromptId,
                  );
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={c.id === collectionId}
                      className={s.collection}
                      disabled={!!busy}
                      onClick={() => setCollectionId(c.id)}
                    >
                      <span className={s.collectionTitle}>
                        {c.label}
                        {c.parentPromptId === prompt.id ? (
                          <Badge tone="lime">This version</Badge>
                        ) : null}
                      </span>
                      <span className={s.collectionMeta}>
                        {c.annotationIds.length} annotation
                        {c.annotationIds.length === 1 ? "" : "s"} from{" "}
                        {matchCount(c)} match
                        {matchCount(c) === 1 ? "" : "es"} · {c.evidenceOrigin} ·{" "}
                        {date(c.createdAt)}
                      </span>
                      <span className={s.collectionMeta}>
                        Revises {revises?.label ?? "an earlier version"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {collection && collection.parentPromptId !== prompt.id && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  This collection was built for {parent?.label}; the new version
                  will branch from that one.
                </p>
              )}
            </div>
            <div className={s.reviseStep}>
              <Field label="Model" hint={chosen ? chosen.note : undefined}>
                <select
                  id="revise-model"
                  value={model}
                  disabled={!!busy}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {!models.length && <option value="">Loading models…</option>}
                  {models.map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.available}>
                      {m.id}
                      {m.available ? "" : ` (${m.reason})`}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted" style={{ fontSize: 12 }}>
                One request per click, up to 60 s, no automatic retries.
                Annotation text, match context and prompts are sent; recordings
                are not.
              </p>
            </div>
            {busy === "generating" && collection && (
              <p role="status" aria-live="polite" className={s.working}>
                Reviewing {collection.annotationIds.length} annotation
                {collection.annotationIds.length === 1 ? "" : "s"} with {model}…
              </p>
            )}
          </>
        )}

        {proposal && parent && (
          <>
            <div className={s.reviewHead}>
              <Badge>Untested draft</Badge>
              <span className="muted" style={{ fontSize: 12.5 }}>
                From {collection?.label} · {proposal.provenance.model} ·{" "}
                {(proposal.provenance.durationMs / 1000).toFixed(1)} s ·{" "}
                {int(proposal.provenance.inputTokens)} in /{" "}
                {int(proposal.provenance.outputTokens)} out tokens
              </span>
            </div>
            {busy === "generating" && (
              <p role="status" aria-live="polite" className={s.working}>
                Generating a fresh proposal with {model}…
              </p>
            )}
            <div className={s.reviseStep}>
              <span className="eyebrow">Proposed changes</span>
              {proposal.changes.length === 0 && (
                <p className="muted" style={{ fontSize: 13 }}>
                  No changes proposed: the model judged the evidence too thin.
                  Add more annotations to the collection, or edit the prompt
                  yourself below.
                </p>
              )}
              <ol className={s.changes}>
                {proposal.changes.map((c, i) => (
                  <li key={i}>
                    <p>{c.instruction}</p>
                    <span className={s.cites}>
                      {c.annotationIds.map((id) => {
                        const a = w.annotations.find((x) => x.id === id);
                        return (
                          <span
                            key={id}
                            className={s.cite}
                            title={a?.observation}
                          >
                            {a?.timestamp} ·{" "}
                            {a
                              ? annotationContext(a, w)
                                  .match?.label?.split(" · ")
                                  .slice(-2)
                                  .join(" · ")
                              : id.slice(0, 8)}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {proposal.uncertainties.length > 0 && (
              <Notice tone="warn" icon="alert">
                <strong>Uncertainties and conflicting evidence</strong>
                <ul className={s.plainList}>
                  {proposal.uncertainties.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <p className={s.plan}>
              <strong>Evaluation plan.</strong> {proposal.evaluationPlan}
            </p>
            <Field label="Revision name">
              <input
                id="revise-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <div className={s.reviewBar}>
              <Segmented
                size="sm"
                label="Proposal view"
                value={view}
                onChange={setView}
                options={[
                  { value: "side", label: "Side by side" },
                  { value: "changes", label: `Changes from ${parent.label}` },
                ]}
              />
              {proposal.text.trim() === parent.text.trim() && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Same as the current version · edit it to save
                </span>
              )}
              <span
                className={proposal.text.length > 6000 ? s.over : "muted"}
                style={{ fontSize: 12 }}
              >
                {int(proposal.text.length)} / 6,000 characters
              </span>
            </div>
            {view === "side" ? (
              <div className={s.sideBySide}>
                <div className={s.sideCol}>
                  <span className="eyebrow">Current · {parent.label}</span>
                  <pre className={s.parentText}>{parent.text}</pre>
                </div>
                <label className={s.sideCol}>
                  <span className="eyebrow">Proposed · editable</span>
                  <textarea
                    id="revise-text"
                    className={s.proposedText}
                    rows={18}
                    value={proposal.text}
                    onChange={(e) =>
                      setProposal({ ...proposal, text: e.target.value })
                    }
                  />
                </label>
              </div>
            ) : (
              <pre className={s.text} aria-label="Changes from parent">
                {diffLines(parent.text, proposal.text).map((l, i) => (
                  <div
                    key={i}
                    className={`${s.line} ${l.type === "add" ? s.add : l.type === "del" ? s.del : ""}`}
                  >
                    <span className={s.sign}>
                      {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
                    </span>
                    <span>{l.text || " "}</span>
                  </div>
                ))}
              </pre>
            )}
            <Field label="Rationale">
              <textarea
                id="revise-rationale"
                rows={3}
                value={proposal.rationale}
                onChange={(e) =>
                  setProposal({ ...proposal, rationale: e.target.value })
                }
              />
            </Field>
            <p className="muted" style={{ fontSize: 12 }}>
              Saving keeps the original AI proposal alongside your edits. Team
              versions are unchanged; put the new version in a squad to test it.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
