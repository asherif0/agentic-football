"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DIMENSIONS,
  PHASES,
  ROLES,
  type RecordData,
} from "../../../lib/domain";
import { postJSON } from "../../lib/data/cache";
import { reviewedVersion } from "../../lib/moments";
import { eventName } from "../../lib/timeline";
import { toast } from "../../lib/toast";
import { Dialog } from "../ui/Overlay";
import { Badge, Button, Field } from "../ui/primitives";
import s from "./moment.module.css";

type Score = number | null;

/**
 * Optional diagnosis for a critical event. Records are immutable, so saving
 * stores a reviewed version that points back at the original.
 */
export function MomentReviewForm({
  record,
  onSaved,
  onCancel,
  cancelLabel = "Done",
  showExisting = true,
}: {
  record: RecordData;
  onSaved: (r: RecordData) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Hide the earlier diagnosis when the page already shows it. */
  showExisting?: boolean;
}) {
  const [diagnosis, setDiagnosis] = useState(""),
    [phase, setPhase] = useState<string>(record.phase),
    [role, setRole] = useState<string>(record.role),
    [scores, setScores] = useState<Record<string, Score>>({}),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setDiagnosis("");
    setPhase(record.phase);
    setRole(record.role);
    setScores({});
  }, [record.id]);
  const scored = Object.values(scores).some(
    (v) => v !== null && v !== undefined,
  );
  const changed =
    diagnosis.trim() !== "" ||
    phase !== record.phase ||
    role !== record.role ||
    scored;
  async function save() {
    setBusy(true);
    try {
      const text = diagnosis.trim();
      const next = reviewedVersion(record, {
        // An extra diagnosis is added to any earlier one rather than replacing it.
        diagnosis:
          record.diagnosis && text
            ? `${record.diagnosis}\n\n${text}`
            : text || record.diagnosis || "",
        phase,
        role,
        scores: Object.fromEntries(
          Object.entries(scores).filter(([, v]) => v !== undefined),
        ),
      });
      const saved = await postJSON<RecordData>(
        "/api/workspace",
        { kind: "annotations", record: next },
        ["workspace"],
      );
      toast("Diagnosis saved to Critical events.", "success");
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.form}>
      {showExisting && record.diagnosis && (
        <div className={s.existing}>
          <span className="eyebrow">Diagnosis so far</span>
          <p>{record.diagnosis}</p>
        </div>
      )}
      <Field
        label={
          record.diagnosis
            ? "Add to the diagnosis (optional)"
            : "Diagnosis (optional)"
        }
        hint="What went right or wrong, and why. Leave empty to keep the event without one."
      >
        <textarea
          id={`diagnosis-${record.id}`}
          rows={3}
          value={diagnosis}
          placeholder="e.g. DEF stepped up without cover; MID never offered a passing angle."
          onChange={(e) => setDiagnosis(e.target.value)}
          data-autofocus
        />
      </Field>
      <div className={s.row}>
        <Field label="Phase">
          <select
            id={`phase-${record.id}`}
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            {PHASES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Our player">
          <select
            id={`role-${record.id}`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>
      <details className={s.scores}>
        <summary>Execution scores (optional)</summary>
        <div className={s.scoreGrid}>
          {DIMENSIONS.map((d) => (
            <label key={d} className={s.scoreItem}>
              <span>{d}</span>
              <select
                id={`score-${record.id}-${d}`}
                value={scores[d] ?? record.scores?.[d] ?? ""}
                onChange={(e) =>
                  setScores({
                    ...scores,
                    [d]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Not assessed</option>
                <option value="0">0 · Failed</option>
                <option value="1">1 · Partial</option>
                <option value="2">2 · Clear</option>
              </select>
            </label>
          ))}
        </div>
      </details>
      <div className={s.actions}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button variant="primary" disabled={!changed || busy} onClick={save}>
          {busy ? "Saving…" : "Save diagnosis"}
        </Button>
      </div>
    </div>
  );
}

/** Shown right after Annotate: the event is already saved; a diagnosis is optional. */
export function MomentDialog({
  record,
  created,
  onClose,
  onSaved,
}: {
  record: RecordData | null;
  created: boolean;
  onClose: () => void;
  onSaved: (r: RecordData) => void;
}) {
  return (
    <Dialog
      open={!!record}
      onClose={onClose}
      small
      title={
        created ? "Added to Critical events" : "Already in Critical events"
      }
      sub={record?.observation}
    >
      {record && (
        <div className={s.dialog}>
          <div className={s.meta}>
            <Badge tone={record.team === "them" ? "neutral" : "lime"}>
              {record.team === "them" ? "Opponent moment" : "Our moment"}
            </Badge>
            {record.eventType && <Badge>{eventName(record.eventType)}</Badge>}
            <Badge>{record.role}</Badge>
            <Badge>{record.phase}</Badge>
            <Link
              href={`/library/annotations?record=${record.id}`}
              className={s.open}
            >
              Open in Critical events →
            </Link>
          </div>
          <MomentReviewForm
            record={record}
            onCancel={onClose}
            onSaved={(r) => {
              onSaved(r);
              onClose();
            }}
          />
        </div>
      )}
    </Dialog>
  );
}
