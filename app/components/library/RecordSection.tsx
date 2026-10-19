"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Kind, RecordData } from "../../../lib/domain";
import { useWorkspace } from "../../lib/data/hooks";
import {
  KIND_LABELS,
  duplicateFormationDraft,
  recordName,
  relevant,
  reviseDraft,
  template,
} from "../../lib/records";
import { toast } from "../../lib/toast";
import { latestVersion } from "../../lib/moments";
import RecordBrowser from "../RecordBrowser";
import { EmptyState, Skeleton } from "../ui/primitives";
import RecordDetail from "./RecordDetail";
import RecordEditor from "./RecordEditor";

/** Browse, inspect and create one kind of workspace record. */
export default function RecordSection({ kind }: { kind: Kind }) {
  const { data, error } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    [family, setFamily] = useState("all"),
    [draft, setDraftState] = useState<any>(null),
    seeded = useRef<string | null>(null);
  const w = data?.records;
  useEffect(() => {
    if (!w || params.get("draft") !== "new") return;
    const key = params.toString();
    if (seeded.current === key) return;
    seeded.current = key;
    let d = template(kind, w, family);
    if (kind === "annotations" && params.get("match"))
      d = {
        ...d,
        matchId: params.get("match"),
        timestamp: params.get("t")
          ? `${Number(params.get("t")).toFixed(2)}s`
          : "",
        observation: params.get("obs") ?? "",
      };
    setDraftState(d);
  }, [w, params, kind, family]);
  if (error)
    return (
      <EmptyState icon="alert" title="Could not load records">
        {error}
      </EmptyState>
    );
  if (!w)
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton height={38} />
        <Skeleton height={280} />
      </div>
    );
  // A link to an older annotation opens its newest reviewed version.
  const linked = params.get("record");
  const linkedRecord =
    kind === "annotations"
      ? w.annotations.find((a) => a.id === linked)
      : undefined;
  const requestedId = linkedRecord
    ? latestVersion(w.annotations, linkedRecord).id
    : linked;
  const records = relevant(kind, w, family),
    families = [...new Set(w.formations.map((f) => f.family))];
  const setDraft = (fn: (d: any) => any) => setDraftState(fn);
  const close = () => {
    setDraftState(null);
    if (params.get("draft")) router.replace(pathname);
  };
  return (
    <div className="legacy">
      <div className="toolbar">
        <p>
          {records.length} {KIND_LABELS[kind].toLowerCase()} · immutable history
        </p>
        {!["sources", "principles"].includes(kind) && families.length > 1 && (
          <select
            aria-label="Formation filter"
            style={{ width: "auto" }}
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setDraftState(null);
            }}
          >
            <option value="all">All formations</option>
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        )}
        {kind === "annotations" && !draft && (
          <Link href="/library/collections" className="file-button">
            Build a revision from a collection
          </Link>
        )}
        {!draft && kind !== "collections" && (
          <button onClick={() => setDraftState(template(kind, w, family))}>
            + New {KIND_LABELS[kind].toLowerCase().replace(/s$/, "")}
          </button>
        )}
      </div>
      {draft ? (
        <section className="card">
          <h2>
            {draft.parentId ? "Create a revision" : "Create a new record"}
          </h2>
          <RecordEditor
            kind={kind}
            workspace={w}
            attachments={data.attachments}
            draft={draft}
            setDraft={setDraft}
            onCancel={close}
            onSaved={(id) => {
              toast("Saved as a new immutable record.", "success");
              setDraftState(null);
              router.replace(`${pathname}?record=${id}`);
            }}
          />
        </section>
      ) : records.length ? (
        <RecordBrowser
          key={kind}
          storageKey={kind}
          records={records}
          name={recordName}
          requestedId={requestedId}
          statusOf={
            kind === "annotations"
              ? (r) =>
                  String(r.diagnosis ?? "").trim()
                    ? "Diagnosed"
                    : "Needs diagnosis"
              : undefined
          }
        >
          {(x: RecordData) => (
            <RecordDetail
              kind={kind}
              record={x}
              workspace={w}
              attachments={data.attachments}
              onRevise={(r) => setDraftState(reviseDraft(kind, r, w))}
              onDuplicate={(r) => setDraftState(duplicateFormationDraft(r))}
            />
          )}
        </RecordBrowser>
      ) : (
        <EmptyState
          icon="plus"
          title={`No ${KIND_LABELS[kind].toLowerCase()} yet`}
        >
          Create the first record with the button above.
        </EmptyState>
      )}
    </div>
  );
}
