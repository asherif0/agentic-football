"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ROLES,
  currentChampion,
  teamStatus,
  type Kind,
  type RecordData,
  type Workspace,
} from "../../../lib/domain";
import { getJSON } from "../../lib/data/cache";
import { download } from "../../lib/download";
import { REF_KINDS, hrefFor, recordName } from "../../lib/records";
import { toast } from "../../lib/toast";
import { usePreparation } from "../Preparation";

type Attachment = { id: string; name: string };

/** Detail card for one immutable record, with links to everything it references. */
export default function RecordDetail({
  kind,
  record: x,
  workspace: w,
  attachments,
  onRevise,
  onDuplicate,
}: {
  kind: Kind;
  record: RecordData;
  workspace: Workspace;
  attachments: Attachment[];
  onRevise: (x: RecordData) => void;
  onDuplicate: (x: RecordData) => void;
}) {
  const router = useRouter(),
    { set: setPreparation } = usePreparation();
  return (
    <article className="card" id={x.id}>
      <div className="record-head">
        <h2>{recordName(x)}</h2>
        <span className="badge">
          {x.evidenceOrigin
            ? x.evidenceOrigin.toUpperCase()
            : x.synthetic
              ? "SYNTHETIC"
              : kind === "teams"
                ? teamStatus(x.id, w)
                : x.status || `r${x.revision || 1}`}
        </span>
      </div>
      <details className="record-meta">
        <summary>Record ID</summary>
        <small>{x.id}</small>
      </details>
      {kind === "sources" ? (
        <>
          <p>{x.summary}</p>
          <div className="toolbar">
            <Link href="/library/principles">Principles</Link>
            <Link href="/library/hypotheses">Formation hypotheses</Link>
            <a href={x.url} target="_blank" rel="noreferrer">
              Open primary source ↗
            </a>
          </div>
          <p>
            <b>Locator:</b> {x.locator}
          </p>
          <p>
            <b>Transfer limits:</b> {x.limitations}
          </p>
        </>
      ) : kind === "formations" ? (
        <>
          <p>{x.structure}</p>
          <p className="muted">{x.failureMode}</p>
          <div className="roles">
            {ROLES.map((r) => (
              <div key={r}>
                <b>{r}</b>
                <span>{x.roles[r]?.placement || "Unassigned"}</span>
                <small>{x.roles[r]?.responsibility}</small>
              </div>
            ))}
          </div>
          <p>
            Portal compatibility: <b>{x.compatibility}</b> · Family champion:{" "}
            <b>{currentChampion(x.family, w)?.label || "None selected"}</b>
          </p>
        </>
      ) : kind === "teams" ? (
        <>
          <p>
            Formation revision:{" "}
            <b>
              {w.formations.find((f) => f.id === x.formationId)?.name} ·{" "}
              {x.formationId}
            </b>
          </p>
          <div className="toolbar">
            <button
              onClick={() => {
                setPreparation((old) => ({
                  ...old,
                  team: x.id,
                  lineup: {},
                  scenario: "",
                  strategy: "",
                }));
                router.push("/squad");
              }}
            >
              Use as current squad
            </button>
            {x.campaignId && (
              <Link href={`/library/campaigns?campaign=${x.campaignId}`}>
                View improvement campaign
              </Link>
            )}
          </div>
          <div className="roles">
            {ROLES.map((r) => (
              <div key={r}>
                <b>{r}</b>
                <span>
                  {w.prompts.find((p) => p.id === x.promptIds[r])?.label}
                </span>
                <Link href={hrefFor("prompts", x.promptIds[r])}>
                  Inspect prompt →
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : kind === "matches" ? (
        <>
          <h3>
            {x.goalsFor ?? "?"} – {x.goalsAgainst ?? "?"}
          </h3>
          <p>{x.primaryDiagnosis || "No diagnosis recorded."}</p>
          <p className="muted">
            Shots on target: {x.onTargetFor ?? "Unknown"} for /{" "}
            {x.onTargetAgainst ?? "Unknown"} against · Dangerous turnovers:{" "}
            {x.dangerousTurnovers ?? "Unknown"}
          </p>
          {x.replayUrl && (
            <a href={x.replayUrl} target="_blank" rel="noreferrer">
              Open replay ↗
            </a>
          )}
          <div>
            {x.attachmentIds.map((id: string) => (
              <p key={id}>
                <a href={`/api/attachments/${id}`}>
                  {attachments.find((a) => a.id === id)?.name ||
                    `Restore attachment ${id}`}
                </a>
              </p>
            ))}
          </div>
        </>
      ) : (
        <details>
          <summary>Record data</summary>
          <pre>{JSON.stringify(x, null, 2)}</pre>
        </details>
      )}
      <div className="toolbar">
        <button className="secondary" onClick={() => onRevise(x)}>
          {["formations", "prompts", "teams"].includes(kind)
            ? "Create revision"
            : "Copy to new record"}
        </button>
        {kind === "formations" && (
          <button className="secondary" onClick={() => onDuplicate(x)}>
            Duplicate as new formation
          </button>
        )}
        {kind === "experiments" && (
          <button
            className="secondary"
            onClick={async () => {
              try {
                const p = await getJSON<{
                  manifest: unknown;
                  warnings: string[];
                }>(`/api/workspace?experiment=${x.id}`);
                download(`${x.id}-manual-manifest.json`, p.manifest);
                toast(
                  p.warnings.join(" ") || "Manual portal manifest exported.",
                );
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Export portal preparation
          </button>
        )}
        {kind === "teams" && (
          <button
            className="secondary"
            onClick={() =>
              download(
                `${x.id}-prompts.txt`,
                ROLES.map(
                  (r) =>
                    `${r}\n${w.prompts.find((p) => p.id === x.promptIds[r])?.text}`,
                ).join("\n\n────────\n\n"),
              )
            }
          >
            Download all five prompts
          </button>
        )}
      </div>
      <div className="toolbar">
        {[
          "formationId",
          "sourceIds",
          "principleIds",
          "hypothesisIds",
          "teamId",
          "experimentId",
          "matchId",
        ].flatMap((key) => {
          const ids = Array.isArray(x[key]) ? x[key] : x[key] ? [x[key]] : [];
          const k = REF_KINDS[key];
          return ids.map((id: string) => {
            const target = w[k]?.find((r) => r.id === id);
            return target ? (
              <Link key={key + id} href={hrefFor(k, id)} className="badge">
                {recordName(target)} ↗
              </Link>
            ) : null;
          });
        })}
      </div>
      <details>
        <summary>Full record</summary>
        <pre>{JSON.stringify(x, null, 2)}</pre>
      </details>
    </article>
  );
}
