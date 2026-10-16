"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ROLES,
  type RecordData,
  type Role,
  type Workspace,
} from "../../../lib/domain";
import { useAnalytics, useRunIndex, useWorkspace } from "../../lib/data/hooks";
import { diffLines } from "../../lib/diff";
import { download } from "../../lib/download";
import {
  promptEvidence,
  rankVersions,
  type PromptEvidence,
} from "../../lib/evidence";
import { date, int, ms, signed } from "../../lib/format";
import { reviseDraft, template } from "../../lib/records";
import { toast } from "../../lib/toast";
import RecordEditor from "../library/RecordEditor";
import { usePreparation } from "../Preparation";
import { NextStep, PageHeader } from "../shell/PageHeader";
import { CopyButton } from "../ui/CopyButton";
import { Icon } from "../ui/Icon";
import { Drawer } from "../ui/Overlay";
import {
  Badge,
  Button,
  EmptyState,
  ModelChip,
  Notice,
  Skeleton,
} from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import { ExportDialog } from "./ExportDialog";
import s from "./prompts.module.css";

const byDate = (a: RecordData, b: RecordData) =>
  String(a.createdAt).localeCompare(String(b.createdAt)) ||
  a.id.localeCompare(b.id);

export default function PromptsView() {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    { value: p, set } = usePreparation(),
    { data: ws } = useWorkspace(),
    { data: analytics } = useAnalytics({}),
    { data: index } = useRunIndex(),
    [view, setView] = useState<"text" | "changes">("text"),
    [exporting, setExporting] = useState(params.get("export") === "1"),
    [draft, setDraft] = useState<any>(null);
  const w = ws?.records;
  const evidence = useMemo(
    () => promptEvidence(analytics?.runs ?? []),
    [analytics],
  );
  const fixtureCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of index?.runs ?? [])
      if (r.evidenceOrigin === "test fixture" && r.status === "completed")
        for (const id of Object.values(r.team.promptIds))
          c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [index]);

  // A ?prompt= link selects its formation and role.
  const requested = w?.prompts.find((x) => x.id === params.get("prompt"));
  const squadTeam = w?.teams.find((t) => t.id === p.team);
  const formationId =
    requested?.formationId ??
    params.get("formation") ??
    squadTeam?.formationId ??
    w?.formations[0]?.id;
  const role = (requested?.role ?? params.get("role") ?? "GK") as Role;
  const formation = w?.formations.find((f) => f.id === formationId);
  const inSquad = (r: Role) =>
    squadTeam?.formationId === formationId
      ? (p.lineup?.[r] ?? squadTeam?.promptIds[r])
      : undefined;
  const versions = useMemo(
    () =>
      w
        ? w.prompts
            .filter((x) => x.formationId === formationId && x.role === role)
            .sort(byDate)
        : [],
    [w, formationId, role],
  );
  const ranks = rankVersions(
    versions.map((v) => v.id),
    evidence,
  );
  const selected =
    requested ??
    versions.find((v) => v.id === inSquad(role)) ??
    versions.find((v) => ranks[v.id]?.best) ??
    versions.at(-1);
  const parent = w?.prompts.find((x) => x.id === selected?.parentId);
  useEffect(() => setView("text"), [selected?.id]);

  const go = (q: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) next.set(k, v);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  if (!w || !formation)
    return (
      <>
        <PageHeader
          step="04"
          eyebrow="Prompts"
          title="Export the prompts that win"
        />
        <Skeleton height={520} radius={16} />
      </>
    );

  const formations = w.formations.filter((f) =>
    w.prompts.some((x) => x.formationId === f.id),
  );
  const ev = selected ? evidence.get(selected.id) : undefined;

  return (
    <>
      <PageHeader
        step="04"
        eyebrow="Prompts"
        title="Export the prompts that win"
        description="Compare each position's versions against the match evidence, keep the strongest in your squad, then export all five prompts ready to paste into the competition portal."
        actions={
          <Button
            variant="primary"
            icon="download"
            onClick={() => setExporting(true)}
          >
            Export squad
          </Button>
        }
      />
      <div className={s.top} data-reveal>
        <Segmented
          label="Formation"
          value={formation.id}
          onChange={(f) => go({ formation: f, role })}
          options={formations.map((f) => ({ value: f.id, label: f.family }))}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          <span
            className={s.inSquad}
            style={{ display: "inline-block", marginRight: 6 }}
          />
          marks the version in your current squad
        </span>
      </div>
      <div className={s.layout}>
        <nav className={s.roles} aria-label="Positions" data-reveal>
          {ROLES.map((r) => {
            const id =
              inSquad(r) ??
              w.prompts
                .filter((x) => x.formationId === formation.id && x.role === r)
                .sort(byDate)
                .at(-1)?.id;
            const label =
              w.prompts.find((x) => x.id === id)?.label ?? "No prompt";
            const e = id ? evidence.get(id) : undefined;
            return (
              <button
                key={r}
                type="button"
                className={s.roleBtn}
                aria-current={r === role}
                onClick={() => go({ formation: formation.id, role: r })}
              >
                <span className={s.roleTag}>{r}</span>
                <span className={s.roleLabel}>{label}</span>
                <span className={s.roleMeta}>
                  {e?.matches
                    ? `n=${e.matches} · GD/60 ${signed(e.gdPer60, 1)}`
                    : "untested"}
                </span>
              </button>
            );
          })}
        </nav>

        <section className={s.doc} data-reveal>
          <div
            className={s.versions}
            role="group"
            aria-label={`${role} versions`}
          >
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className={s.version}
                aria-pressed={v.id === selected?.id}
                onClick={() => go({ prompt: v.id })}
              >
                <span className={s.versionName}>
                  {v.id === inSquad(role) && (
                    <span className={s.inSquad} title="In your squad" />
                  )}
                  {v.label}
                </span>
                <span className={s.versionMeta}>{ranks[v.id]?.label}</span>
              </button>
            ))}
            <button
              type="button"
              className={s.newVersion}
              aria-label={`New ${role} prompt`}
              title="New prompt for this position"
              onClick={() =>
                setDraft({
                  ...template("prompts", w),
                  formationId: formation.id,
                  role,
                  hypothesisIds: [],
                })
              }
            >
              <Icon name="plus" />
            </button>
          </div>
          {selected ? (
            <>
              <div className={s.docHead}>
                <div>
                  <h2 className={s.docTitle}>{selected.label}</h2>
                  <div className={s.docMeta}>
                    <span>{role}</span>
                    <span>{int(selected.text.length)} / 6,000 characters</span>
                    <span>{date(selected.createdAt)}</span>
                    {parent && <span>from {parent.label}</span>}
                    {ranks[selected.id] && (
                      <Badge tone={ranks[selected.id].tone}>
                        {ranks[selected.id].label}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className={s.docActions}>
                  <CopyButton text={selected.text} label="Copy prompt" />
                  <Button
                    icon="download"
                    aria-label="Download as text"
                    onClick={() =>
                      download(
                        `${role}-${selected.label.replace(/\W+/g, "-")}.txt`,
                        selected.text,
                      )
                    }
                  />
                </div>
              </div>
              <div className={s.bar}>
                {parent ? (
                  <Segmented
                    size="sm"
                    label="Prompt view"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "text", label: "Prompt" },
                      {
                        value: "changes",
                        label: `Changes from ${parent.label}`,
                      },
                    ]}
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Original version · no parent
                  </span>
                )}
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {squadTeam?.formationId === formation.id &&
                    selected.id !== inSquad(role) && (
                      <Button
                        size="sm"
                        variant="solid"
                        onClick={() => {
                          const lineup = { ...p.lineup };
                          if (selected.id === squadTeam.promptIds[role])
                            delete lineup[role];
                          else lineup[role] = selected.id;
                          set((old) => ({ ...old, lineup }));
                          toast(
                            `${selected.label} is now ${role} in your squad.`,
                            "success",
                          );
                        }}
                      >
                        Use in squad
                      </Button>
                    )}
                  <Button
                    size="sm"
                    icon="diff"
                    onClick={() =>
                      setDraft(reviseDraft("prompts", selected, w))
                    }
                  >
                    Create revision
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="sparkle"
                    href={`/library/collections?parent=${selected.id}`}
                  >
                    Revise from annotations
                  </Button>
                </span>
              </div>
              <pre className={s.text} aria-label="Prompt text">
                {view === "changes" && parent
                  ? diffLines(parent.text, selected.text).map((l, i) => (
                      <div
                        key={i}
                        className={`${s.line} ${l.type === "add" ? s.add : l.type === "del" ? s.del : ""}`}
                      >
                        <span className={s.sign}>
                          {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
                        </span>
                        <span>{l.text || " "}</span>
                      </div>
                    ))
                  : selected.text.split("\n").map((l: string, i: number) => (
                      <div key={i} className={s.line}>
                        <span className={s.sign} />
                        <span>{l || " "}</span>
                      </div>
                    ))}
              </pre>
            </>
          ) : (
            <div style={{ padding: 24 }}>
              <EmptyState
                icon="prompt"
                title={`No ${role} prompts for ${formation.family}`}
              >
                Create the first version with the + button above.
              </EmptyState>
            </div>
          )}
        </section>

        <aside className={s.side} data-reveal>
          {selected && (
            <EvidencePanel
              ev={ev}
              fixtures={fixtureCounts.get(selected.id) ?? 0}
            />
          )}
          {selected && <Traceability prompt={selected} w={w} />}
        </aside>
      </div>

      <NextStep href="/squad" />

      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        workspace={w}
        evidence={evidence}
        ranks={(ids) => rankVersions(ids, evidence)}
      />
      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.parentId ? "Create a revision" : "New prompt"}
        sub="Prompts are immutable; saving creates a new version linked to its parent."
        wide
      >
        {draft && (
          <RecordEditor
            kind="prompts"
            workspace={w}
            attachments={ws?.attachments ?? []}
            draft={draft}
            setDraft={(fn) => setDraft(fn)}
            onCancel={() => setDraft(null)}
            submitLabel="Save prompt version"
            onSaved={(id) => {
              setDraft(null);
              toast("Saved as a new untested version.", "success");
              go({ prompt: id });
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function EvidencePanel({
  ev,
  fixtures,
}: {
  ev?: PromptEvidence;
  fixtures: number;
}) {
  if (!ev?.matches)
    return (
      <div className={s.panel}>
        <span className="eyebrow">Evidence</span>
        <p style={{ fontSize: 14 }}>No completed local matches yet.</p>
        <p className="muted" style={{ fontSize: 12.5 }}>
          {fixtures
            ? `${fixtures} test-fixture runs used this prompt, but mock controllers don't read prompts, so they aren't evidence.`
            : "Put this version in your squad and simulate to collect evidence."}
        </p>
        <Button size="sm" href="/squad" iconRight="arrowRight">
          Open Squad
        </Button>
      </div>
    );
  const total = ev.matches;
  return (
    <div className={s.panel}>
      <span className="eyebrow">Evidence · local simulator</span>
      <div className={s.big}>
        <span className={s.bigNum}>{signed(ev.gdPer60, 2)}</span>
        <span className="muted">goal diff / 60 s</span>
      </div>
      <div
        className={s.wdl}
        aria-label={`${ev.wins} wins, ${ev.draws} draws, ${ev.losses} losses`}
      >
        {ev.wins > 0 && (
          <span style={{ flex: ev.wins, background: "var(--chart-win)" }} />
        )}
        {ev.draws > 0 && (
          <span style={{ flex: ev.draws, background: "var(--chart-draw)" }} />
        )}
        {ev.losses > 0 && (
          <span style={{ flex: ev.losses, background: "var(--chart-loss)" }} />
        )}
      </div>
      <dl className={s.kv}>
        <dt>Matches</dt>
        <dd>
          {total} · {ev.wins}W {ev.draws}D {ev.losses}L
        </dd>
        <dt>This player scored</dt>
        <dd>{int(ev.goals)}</dd>
        <dt>Shots</dt>
        <dd>{int(ev.shots)}</dd>
        <dt>Passes completed</dt>
        <dd>{int(ev.completedPasses)}</dd>
        <dt>Dangerous turnovers</dt>
        <dd>{int(ev.dangerousTurnovers)}</dd>
        <dt>Failed decisions</dt>
        <dd>
          {int(ev.failures)} / {int(ev.decisions)}
        </dd>
        <dt>Median decision</dt>
        <dd>{ms(ev.medianMs)}</dd>
      </dl>
      <span className="eyebrow" style={{ marginTop: 4 }}>
        By model
      </span>
      <div className={s.models}>
        {ev.byModel.map((m) => (
          <div key={m.model} className={s.modelRow}>
            <ModelChip model={m.model} short />
            <span className="muted">n={m.matches}</span>
            <span className="mono">{signed(m.gdPer60, 1)}</span>
          </div>
        ))}
      </div>
      <div className={s.links}>
        {ev.runIds.slice(0, 3).map((id, i) => (
          <Link key={id} href={`/simulate?run=${id}`}>
            Replay {i + 1} →
          </Link>
        ))}
      </div>
      {total < 6 && (
        <Notice icon="info">
          Small sample, and the matches aren't paired comparisons. Treat this as
          a lead to test, not a verdict.
        </Notice>
      )}
    </div>
  );
}

function Traceability({ prompt, w }: { prompt: RecordData; w: Workspace }) {
  const hypotheses = (prompt.hypothesisIds ?? [])
    .map((id: string) => w.hypotheses.find((h) => h.id === id))
    .filter(Boolean) as RecordData[];
  return (
    <div className={s.panel}>
      <span className="eyebrow">Why this version</span>
      <div className={s.trace}>
        {prompt.rationale ? (
          <p>{prompt.rationale}</p>
        ) : (
          <p className="muted">No rationale recorded.</p>
        )}
        {prompt.campaignId && (
          <details>
            <summary>Automatic improvement provenance</summary>
            <p>
              {prompt.aiProposal?.actor === "mock"
                ? "Test fixture"
                : "Machine-generated candidate"}{" "}
              · {prompt.aiProposal?.model}
            </p>
            <p>{prompt.aiProposal?.originalProposal?.rationale}</p>
            <Link href={`/library/campaigns?campaign=${prompt.campaignId}`}>
              View campaign evidence →
            </Link>
          </details>
        )}
        {prompt.collectionId && (
          <details>
            <summary>Built from an annotation collection</summary>
            {(() => {
              const c = w.collections.find((c) => c.id === prompt.collectionId);
              return (
                <>
                  <p>
                    {c?.label} · {c?.annotationIds.length} annotations ·{" "}
                    {prompt.aiProposal?.model || "manual revision"}
                  </p>
                  {c?.annotationIds.map((id: string) => {
                    const a = w.annotations.find((a) => a.id === id);
                    return (
                      <p key={id}>
                        <strong>
                          {a?.role} · {a?.timestamp}
                        </strong>{" "}
                        — {a?.observation}
                      </p>
                    );
                  })}
                </>
              );
            })()}
          </details>
        )}
        {hypotheses.length > 0 && (
          <details>
            <summary>
              {hypotheses.length} hypothes
              {hypotheses.length === 1 ? "is" : "es"} & sources
            </summary>
            {hypotheses.map((h) => (
              <div key={h.id}>
                <strong>{h.title}</strong>
                <p>{h.behavior}</p>
                {(h.principleIds ?? []).map((pid: string) => {
                  const pr = w.principles.find((x) => x.id === pid);
                  return pr ? (
                    <p key={pid} className="muted">
                      {pr.title}
                      {(pr.sourceIds ?? []).map((sid: string) => {
                        const src = w.sources.find((x) => x.id === sid);
                        return src ? (
                          <a
                            key={sid}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {" "}
                            · {src.title} ↗
                          </a>
                        ) : null;
                      })}
                    </p>
                  ) : null;
                })}
              </div>
            ))}
          </details>
        )}
        <p className="muted mono" style={{ fontSize: 11 }}>
          {prompt.id}
        </p>
      </div>
    </div>
  );
}
