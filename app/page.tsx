"use client";
import Analytics from "./components/Analytics";
import PrepareWorkspace from "./components/PrepareWorkspace";
import Campaigns from "./components/Campaigns";
import { PreparationProvider, usePreparation } from "./components/Preparation";
import RecordBrowser from "./components/RecordBrowser";
import PromptBrowser from "./components/PromptBrowser";
import AnnotationCollections from "./components/AnnotationCollections";
import Simulation from "./components/Simulation";
import { useEffect, useState } from "react";
import {
  ROLES,
  PHASES,
  DIMENSIONS,
  KINDS,
  Kind,
  Workspace,
  RecordData,
  emptyWorkspace,
  compareConditions,
  summarize,
  promptDiff,
  teamStatus,
  promptStatus,
  currentChampion,
} from "../lib/domain";
const labels: Record<Kind, string> = {
  formations: "Formations",
  sources: "Sources",
  principles: "Principles",
  hypotheses: "Hypotheses",
  prompts: "Player prompts",
  teams: "Team versions",
  experiments: "Experiments",
  matches: "Match evidence",
  annotations: "Critical events",
  decisions: "Promotion history",
  collections: "Annotation collections",
};
function download(name: string, value: unknown) {
  const blob = new Blob(
    [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
    { type: typeof value === "string" ? "text/plain" : "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function stageFor(tab: string) {
  if (["simulation"].includes(tab)) return "Simulate";
  if (
    [
      "analytics",
      "campaigns",
      "matches",
      "annotations",
      "collections",
      "experiments",
      "decisions",
      "compare",
    ].includes(tab)
  )
    return "Evaluate";
  if (tab === "prompts") return "Prompts";
  return "Prepare";
}
export default function Page() {
  return (
    <PreparationProvider>
      <WorkspacePage />
    </PreparationProvider>
  );
}
function WorkspacePage() {
  const { set: setPreparation } = usePreparation();
  const [w, setW] = useState<Workspace>(emptyWorkspace()),
    [attachments, setAttachments] = useState<any[]>([]),
    [tab, setTab] = useState<
      Kind | "overview" | "compare" | "simulation" | "analytics" | "campaigns"
    >("overview"),
    [family, setFamily] = useState("all"),
    [draft, setDraft] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [simMode, setSimMode] = useState("match"),
    [requestedCampaign, setRequestedCampaign] = useState<string | null>(null),
    [requestedPrompt, setRequestedPrompt] = useState<string | null>(null),
    [requestedRun, setRequestedRun] = useState<string | null>(null),
    [requestedRecord, setRequestedRecord] = useState<string | null>(null),
    [collectionParent, setCollectionParent] = useState<string | null>(null),
    [compare, setCompare] = useState(["", ""]),
    [cross, setCross] = useState(false);
  async function refresh() {
    const r = await fetch("/api/workspace");
    const x = await r.json();
    if (!r.ok) throw new Error(x.error);
    setW(x.records);
    setAttachments(x.attachments);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  const formations = w.formations.filter(
    (f) => family === "all" || f.family === family,
  );
  const formationIds = formations.map((f) => f.id);
  function relevant(kind: Kind) {
    return w[kind].filter((x) => {
      if (family === "all" || ["sources", "principles"].includes(kind))
        return true;
      if (kind === "formations") return formationIds.includes(x.id);
      if (kind === "decisions") return x.family === family;
      if (x.formationId) return formationIds.includes(x.formationId);
      const team =
        kind === "teams"
          ? x
          : kind === "experiments"
            ? w.teams.find((t) => t.id === x.teamId)
            : w.teams.find(
                (t) =>
                  t.id ===
                  w.experiments.find(
                    (e) =>
                      e.id ===
                      (kind === "matches"
                        ? x.experimentId
                        : w.matches.find((m) => m.id === x.matchId)
                            ?.experimentId),
                  )?.teamId,
              );
      return team && formationIds.includes(team.formationId);
    });
  }
  function template(k: Kind): any {
    const f = formations.at(-1) || w.formations.at(-1),
      t = relevant("teams").at(-1) || w.teams.at(-1),
      e = relevant("experiments").at(-1),
      m = relevant("matches").at(-1);
    switch (k) {
      case "formations":
        return {
          family: "new-formation",
          name: "New formation",
          revision: 1,
          parentId: null,
          structure: "Describe the outfield structure",
          failureMode: "Expected structural weakness",
          status: "draft",
          compatibility: "unconfirmed",
          roles: Object.fromEntries(
            ROLES.map((r) => [
              r,
              {
                placement: "",
                responsibility: "",
                relationships: "",
                phases: Object.fromEntries(PHASES.map((p) => [p, ""])),
              },
            ]),
          ),
          questions: ROLES.map((r) => ({
            id: `question-${r}`,
            role: r,
            text: `Did ${r} perform the intended duty?`,
          })),
        };
      case "sources":
        return {
          title: "",
          url: "",
          locator: "",
          accessedAt: new Date().toISOString().slice(0, 10),
          summary: "",
          limitations: "",
        };
      case "principles":
        return { title: "", sourceIds: [], claim: "", adaptation: "" };
      case "hypotheses":
        return {
          title: "",
          formationId: f?.id || "",
          roles: ["MID"],
          principleIds: [],
          behavior: "",
          expectedFailure: "",
          successCriterion: "",
        };
      case "prompts":
        return {
          label: "",
          role: "GK",
          formationId: f?.id || "",
          parentId: null,
          text: "",
          hypothesisIds: [],
          status: "draft",
          rationale: "",
        };
      case "teams":
        return {
          label: "",
          formationId: f?.id || "",
          parentId: null,
          promptIds: Object.fromEntries(
            ROLES.map((r) => [
              r,
              w.prompts
                .filter((p) => p.role === r && p.formationId === f?.id)
                .at(-1)?.id || "",
            ]),
          ),
        };
      case "experiments":
        return {
          label: "",
          teamId: t?.id || "",
          comparatorTeamId: null,
          opponent: "Benchmark FC",
          models: Object.fromEntries(ROLES.map((r) => [r, ""])),
          setup: "",
          shouts: "",
          variable: "Baseline mapping",
          expectedOutcome: "",
          hypothesisIds: [],
          synthetic: false,
        };
      case "matches":
        return {
          label: "",
          experimentId: e?.id || "",
          synthetic: e?.synthetic || false,
          evidenceOrigin: e?.evidenceOrigin || "portal",
          goalsFor: null,
          goalsAgainst: null,
          shotsFor: null,
          shotsAgainst: null,
          onTargetFor: null,
          onTargetAgainst: null,
          dangerousTurnovers: null,
          latencyFailures: "",
          executionFailures: "",
          primaryDiagnosis: "",
          nextHypothesis: "",
          replayUrl: "",
          attachmentIds: [],
        };
      case "annotations":
        return {
          matchId: m?.id || "",
          timestamp: "",
          phase: PHASES[0],
          role: "GK",
          observation: "",
          diagnosis: "",
          scores: Object.fromEntries(DIMENSIONS.map((d) => [d, null])),
          evidenceIds: [],
        };
      case "decisions":
        return {
          family: f?.family || "",
          teamId: t?.id || "",
          outcome: "challenger",
          reason: "",
          matchIds: [],
        };
    }
  }
  function edit(k: Kind, old?: RecordData) {
    setTab(k);
    setError("");
    setNotice("");
    if (!old) {
      setDraft(template(k));
      return;
    }
    const { id, createdAt, ...copy } = old;
    if (k === "formations") {
      copy.parentId = id;
      copy.revision =
        Math.max(
          ...w.formations
            .filter((f) => f.family === old.family)
            .map((f) => f.revision),
        ) + 1;
      copy.status = "draft";
      copy.compatibility = "unconfirmed";
    }
    if (k === "prompts") {
      copy.parentId = id;
      delete copy.collectionId;
      delete copy.aiProposal;
      delete copy.campaignId;
      delete copy.generationId;
      delete copy.evidenceBundleId;
      delete copy.strategyId;
      copy.status = "draft";
      copy.label += " revision";
    }
    if (k === "teams") {
      delete copy.campaignId;
      delete copy.generationId;
      delete copy.strategyId;
      copy.parentId = id;
      copy.label += " revision";
    }
    setDraft(copy);
  }
  function duplicateFormation(old: RecordData) {
    const { id, createdAt, ...copy } = old;
    setTab("formations");
    setDraft({
      ...copy,
      family: `${old.family}-copy`,
      name: `${old.name} copy`,
      revision: 1,
      parentId: id,
      status: "draft",
      compatibility: "unconfirmed",
    });
  }
  async function save() {
    if (
      !draft ||
      tab === "overview" ||
      tab === "compare" ||
      tab === "simulation" ||
      tab === "analytics" ||
      tab === "campaigns"
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: tab, record: draft }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error);
      await refresh();
      if (tab === "prompts") setRequestedPrompt(x.id);
      setDraft(null);
      setNotice("Saved as a new immutable record.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function setField(key: string, value: any) {
    setDraft((d: any) => {
      const next = { ...d, [key]: value };
      if (key === "formationId") {
        if (next.hypothesisIds) next.hypothesisIds = [];
        if (next.promptIds)
          next.promptIds = Object.fromEntries(ROLES.map((r) => [r, ""]));
      }
      if (key === "role") {
        if (next.hypothesisIds) next.hypothesisIds = [];
        if (next.scores)
          next.scores = Object.fromEntries(
            DIMENSIONS.map((k) => [k, d.scores[k] ?? null]),
          );
      }
      if (key === "matchId")
        next.scores = Object.fromEntries(DIMENSIONS.map((k) => [k, null]));
      if (key === "teamId" && next.hypothesisIds) next.hypothesisIds = [];
      return next;
    });
  }
  const refKinds: Record<string, Kind> = {
    formationId: "formations",
    teamId: "teams",
    comparatorTeamId: "teams",
    experimentId: "experiments",
    matchId: "matches",
    sourceIds: "sources",
    principleIds: "principles",
    hypothesisIds: "hypotheses",
    matchIds: "matches",
  };
  const name = (x: RecordData) =>
    x.label ||
    x.title ||
    x.name ||
    (x.timestamp ? `${x.role} · ${x.phase} · ${x.timestamp}` : x.id);
  function options(key: string) {
    let list = refKinds[key] ? w[refKinds[key]] : [];
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
  ): React.ReactNode {
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
                        {name(p)}
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
      let control: React.ReactNode;
      const enumOptions: Record<string, readonly string[]> = {
        role: ROLES,
        phase: PHASES,
        status: tab === "formations" ? ["draft", "active"] : ["draft"],
        compatibility: ["unconfirmed", "confirmed"],
        outcome: ["challenger", "tested", "validated", "champion", "rejected"],
        opponent: ["Benchmark FC", "Total Attack United", "Fort Knox Athletic"],
      };
      if (refKinds[key] || key === "parentId") {
        const list =
          key === "parentId"
            ? tab === "overview" ||
              tab === "compare" ||
              tab === "simulation" ||
              tab === "analytics" ||
              tab === "campaigns"
              ? []
              : w[tab]
            : options(key);
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
                {name(x)}
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
                {name(x)} {x.revision ? `r${x.revision}` : ""}
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
          <div>
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
          </div>
        );
      } else if (v !== null && typeof v === "object")
        control = objectEditor(v, (x) => setField(key, x), key);
      else if (typeof v === "boolean")
        control = (
          <input
            type="checkbox"
            checked={v}
            disabled={key === "synthetic" && tab === "matches"}
            onChange={(e) => setField(key, e.target.checked)}
          />
        );
      else if (typeof v === "number" || (v === null && tab === "matches"))
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
            rows={key === "text" ? 14 : 2}
            value={String(v ?? "")}
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
    if (tab !== "annotations" || !draft) return null;
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
  async function upload(file: File) {
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const r = await fetch("/api/attachments", { method: "POST", body: data });
      const a = await r.json();
      if (!r.ok) throw new Error(a.error);
      await refresh();
      setNotice(`Uploaded ${a.name}; select it in a match's attachment list.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const comparisons = compare.map((id) =>
    w.experiments.find((e) => e.id === id),
  );
  const conditions =
    comparisons[0] && comparisons[1]
      ? compareConditions(comparisons[0], comparisons[1], w)
      : null;
  return (
    <div className="shell">
      <button
        id="navigation-toggle"
        className="mobile-menu secondary"
        aria-expanded={menuOpen}
        aria-controls="main-navigation"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? "Close menu" : "☰ Menu"}
      </button>
      {menuOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setMenuOpen(false);
            document.getElementById("navigation-toggle")?.focus();
          }
        }}
        className={menuOpen ? "nav-open" : ""}
        id="main-navigation"
      >
        <div className="brand">
          <span className="ball">◉</span>
          <span>
            Agentic
            <br />
            Football Lab
          </span>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              ["Prepare", "overview"],
              ["Simulate", "simulation"],
              ["Evaluate", "analytics"],
              ["Prompts", "prompts"],
            ] as const
          ).map(([label, target], i) => (
            <button
              key={target}
              className={stageFor(tab) === label ? "selected" : ""}
              aria-current={stageFor(tab) === label ? "page" : undefined}
              onClick={() => {
                setTab(target);
                setDraft(null);
                setError("");
                setMenuOpen(false);
              }}
            >
              <span className="stage-number">0{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">AGENTIC FOOTBALL / TACTICAL WORKBENCH</div>
            <h1>{stageFor(tab)}</h1>
          </div>
          {![
            "prompts",
            "analytics",
            "simulation",
            "collections",
            "campaigns",
            "overview",
          ].includes(tab) && (
            <select
              aria-label="Formation filter"
              value={family}
              onChange={(e) => {
                setFamily(e.target.value);
                setDraft(null);
              }}
            >
              <option value="all">All formations</option>
              {[...new Set(w.formations.map((f) => f.family))].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          )}
        </header>
        {stageFor(tab) === "Prepare" && (
          <nav className="section-nav" aria-label="Preparation sections">
            {(
              [
                ["overview", "Team & strategy"],
                ["teams", "Team versions"],
                ["sources", "Sources"],
                ["formations", "Formations"],
              ] as const
            ).map(([target, label]) => (
              <button
                key={target}
                className={tab === target ? "selected" : "secondary"}
                aria-current={tab === target ? "page" : undefined}
                onClick={() => {
                  setTab(target);
                  setDraft(null);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {stageFor(tab) === "Evaluate" && (
          <nav className="section-nav" aria-label="Evaluation sections">
            {(
              [
                ["analytics", "Analytics"],
                ["campaigns", "Campaign results"],
                ["matches", "Match evidence"],
                ["annotations", "Annotations"],
                ["collections", "Collections"],
              ] as const
            ).map(([target, label]) => (
              <button
                key={target}
                className={tab === target ? "selected" : "secondary"}
                aria-current={tab === target ? "page" : undefined}
                onClick={() => {
                  setTab(target);
                  setDraft(null);
                }}
              >
                {label}
              </button>
            ))}
            <label className="compact-select">
              <span className="sr-only">More evaluation tools</span>
              <select
                value={
                  ["experiments", "decisions", "compare"].includes(tab)
                    ? tab
                    : ""
                }
                onChange={(e) => {
                  if (e.target.value) {
                    setTab(e.target.value as any);
                    setDraft(null);
                  }
                }}
              >
                <option value="">More tools</option>
                <option value="experiments">Portal experiments</option>
                <option value="decisions">Portal promotion history</option>
                <option value="compare">Portal comparison</option>
              </select>
            </label>
          </nav>
        )}
        {stageFor(tab) === "Prepare" &&
          !["overview", "teams", "sources", "formations"].includes(tab) && (
            <p className="muted">Sources / {labels[tab as Kind]}</p>
          )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {tab === "campaigns" ? (
          <Campaigns
            workspace={w}
            resultsOnly
            requestedId={requestedCampaign}
            onChanged={refresh}
            onReplay={(id) => {
              setRequestedRun(id);
              setTab("simulation");
              setSimMode("match");
            }}
            onPrompt={(id) => {
              setRequestedPrompt(id);
              setTab("prompts");
            }}
          />
        ) : tab === "analytics" ? (
          <Analytics
            workspace={w}
            onReplay={(id) => {
              setRequestedRun(id);
              setSimMode("match");
              setTab("simulation");
            }}
          />
        ) : tab === "simulation" ? (
          <>
            <div
              className="section-nav"
              role="group"
              aria-label="Simulation mode"
            >
              <button
                className={simMode === "match" ? "selected" : "secondary"}
                aria-pressed={simMode === "match"}
                onClick={() => setSimMode("match")}
              >
                Single match
              </button>
              <button
                className={simMode === "campaign" ? "selected" : "secondary"}
                aria-pressed={simMode === "campaign"}
                onClick={() => setSimMode("campaign")}
              >
                Improvement campaign
              </button>
            </div>
            {simMode === "campaign" ? (
              <Campaigns
                workspace={w}
                onChanged={refresh}
                onReplay={(id) => {
                  setRequestedRun(id);
                  setSimMode("match");
                }}
                onPrompt={(id) => {
                  setRequestedPrompt(id);
                  setTab("prompts");
                }}
              />
            ) : (
              <Simulation
                workspace={w}
                requestedRunId={requestedRun}
                onRequestHandled={() => setRequestedRun(null)}
                onAnnotate={async (matchId, time, observation) => {
                  await refresh();
                  setTab("annotations");
                  setDraft({
                    ...template("annotations"),
                    matchId,
                    timestamp: time.toFixed(2) + "s",
                    observation,
                  });
                }}
              />
            )}
          </>
        ) : tab === "collections" ? (
          <AnnotationCollections
            workspace={w}
            requestedParentId={collectionParent}
            refresh={refresh}
            onSaved={(id) => {
              setTab("prompts");
              setRequestedPrompt(id);
              setNotice("Reviewed prompt revision saved as an untested draft.");
            }}
          />
        ) : tab === "prompts" && !draft ? (
          <PromptBrowser
            onCampaign={(id) => {
              setRequestedCampaign(id);
              setTab("campaigns");
            }}
            workspace={w}
            family={family}
            requestedId={requestedPrompt}
            onRevise={(p) => edit("prompts", p)}
            onEvidenceRevise={(p) => {
              setCollectionParent(p.id);
              setTab("collections");
            }}
            onRequestHandled={() => setRequestedPrompt(null)}
            onCreate={(formationId, role) =>
              setDraft({
                ...template("prompts"),
                formationId,
                role,
                hypothesisIds: [],
              })
            }
          />
        ) : tab === "overview" ? (
          <PrepareWorkspace
            workspace={w}
            onContinue={() => setTab("simulation")}
            onPositions={() => {
              setTab("simulation");
              setSimMode("match");
              setNotice(
                "Open Starting positions & scenarios below the pitch to edit your layout.",
              );
            }}
          />
        ) : tab === "compare" ? (
          <>
            <div className="card">
              <p>
                Select two portal experiments. Local comparisons are in
                Simulation. Cross-formation comparisons require explicit opt-in.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={cross}
                  onChange={(e) => setCross(e.target.checked)}
                />{" "}
                Allow cross-formation comparison
              </label>
              <div className="grid">
                {compare.map((id, i) => (
                  <select
                    aria-label={`Comparison ${i + 1}`}
                    key={i}
                    value={id}
                    onChange={(e) =>
                      setCompare(
                        compare.map((v, j) => (j === i ? e.target.value : v)),
                      )
                    }
                  >
                    <option value="">Select experiment</option>
                    {w.experiments
                      .filter(
                        (e) =>
                          !e.evidenceOrigin || e.evidenceOrigin === "portal",
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                  </select>
                ))}
              </div>
              {conditions && (
                <p
                  className={conditions.mismatches.length ? "error" : "notice"}
                >
                  {conditions.crossFormation
                    ? "Cross-formation / revision comparison. "
                    : ""}
                  {conditions.mismatches.length
                    ? `Conditions differ: ${conditions.mismatches.join(", ")}. Results are descriptive, not a controlled comparison.`
                    : "Recorded surrounding conditions match."}{" "}
                  Changed player instructions:{" "}
                  {conditions.changedPlayers.join(", ") || "none"}.
                  {conditions.changedPlayers.length > 1
                    ? " Multiple player changes; isolate one variable for controlled refinement."
                    : ""}
                </p>
              )}
            </div>
            {conditions && (!conditions.crossFormation || cross) ? (
              <div className="grid">
                {comparisons.map(
                  (e, i) =>
                    e && (
                      <div className="card" key={i}>
                        <h2>{e.label}</h2>
                        {(() => {
                          const team = w.teams.find((t) => t.id === e.teamId)!;
                          const selected = w.matches.filter(
                            (m) => m.experimentId === e.id,
                          );
                          const subset = { ...w, matches: selected };
                          const s = summarize(team.id, subset);
                          return (
                            <>
                              <h3>1 · Execution</h3>
                              <table>
                                <tbody>
                                  {Object.entries(s.execution).map(([k, v]) => (
                                    <tr key={k}>
                                      <td>{k}</td>
                                      <td>
                                        {v.mean === null
                                          ? "Unknown"
                                          : v.mean.toFixed(2)}{" "}
                                        <small>(n={v.n})</small>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <h3>2 · Results</h3>
                              <p>
                                {s.results.wins} W / {s.results.draws} D /{" "}
                                {s.results.losses} L · GD{" "}
                                {s.results.goalDifference ?? "Unknown"}
                              </p>
                              <p>
                                {s.results.matches} real matches;{" "}
                                {s.results.scored} with known score
                              </p>
                              <h3>3 · Supporting evidence</h3>
                              <pre>{JSON.stringify(s.supporting, null, 2)}</pre>
                              <h3>4 · Repeatability</h3>
                              <pre>
                                {JSON.stringify(s.repeatability, null, 2)}
                              </pre>
                              <button onClick={() => edit("decisions")}>
                                Record a promotion decision
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    ),
                )}
              </div>
            ) : conditions ? (
              <p>Enable cross-formation comparison to view these results.</p>
            ) : null}
          </>
        ) : (
          <>
            <div className="toolbar">
              <p>{relevant(tab).length} records · immutable history</p>
              {tab === "annotations" && !draft && (
                <button
                  className="secondary"
                  onClick={() => {
                    setCollectionParent(null);
                    setTab("collections");
                  }}
                >
                  Build revision from a collection
                </button>
              )}
              <button onClick={() => edit(tab)}>
                + New {labels[tab].toLowerCase()}
              </button>
            </div>
            {draft ? (
              <section className="card editor">
                <h2>Create a new record</h2>
                <p className="muted">
                  Saved versions are never overwritten. Changing a formation
                  requires new prompts and a new team referencing that revision.
                </p>
                {fields()}
                {eventQuestions()}
                <div className="toolbar">
                  <button disabled={busy} onClick={save}>
                    {busy ? "Saving…" : "Save new record"}
                  </button>
                  <button className="secondary" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                </div>
              </section>
            ) : (
              <RecordBrowser
                key={tab}
                storageKey={tab}
                records={relevant(tab)}
                name={name}
                requestedId={requestedRecord}
              >
                {(x) => (
                  <article className="card" id={x.id} key={x.id}>
                    <div className="record-head">
                      <h2>{name(x)}</h2>
                      <span className="badge">
                        {x.evidenceOrigin
                          ? x.evidenceOrigin.toUpperCase()
                          : x.synthetic
                            ? "SYNTHETIC"
                            : tab === "teams"
                              ? teamStatus(x.id, w)
                              : tab === "prompts"
                                ? promptStatus(x.id, w)
                                : x.status || `r${x.revision || 1}`}
                      </span>
                    </div>
                    <details className="record-meta">
                      <summary>Record details</summary>
                      <small>{x.id}</small>
                    </details>
                    {tab === "sources" ? (
                      <>
                        <p>{x.summary}</p>
                        <div className="toolbar">
                          <button
                            className="text-button"
                            onClick={() => setTab("principles")}
                          >
                            Principles
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setTab("hypotheses")}
                          >
                            Formation hypotheses
                          </button>
                        </div>
                        <a href={x.url} target="_blank" rel="noreferrer">
                          Open primary source ↗
                        </a>
                        <p>
                          <b>Locator:</b> {x.locator}
                        </p>
                        <p>
                          <b>Transfer limits:</b> {x.limitations}
                        </p>
                      </>
                    ) : tab === "formations" ? (
                      <>
                        <p>{x.structure}</p>
                        <p>{x.failureMode}</p>
                        <div className="roles">
                          {ROLES.map((r) => (
                            <div key={r}>
                              <b>{r}</b>
                              <span>
                                {x.roles[r]?.placement || "Unassigned"}
                              </span>
                              <small>{x.roles[r]?.responsibility}</small>
                            </div>
                          ))}
                        </div>
                        <p>
                          Portal compatibility: <b>{x.compatibility}</b> ·
                          Family champion:{" "}
                          <b>
                            {currentChampion(x.family, w)?.label ||
                              "None selected"}
                          </b>
                        </p>
                      </>
                    ) : tab === "teams" ? (
                      <>
                        <p>
                          Formation revision:{" "}
                          <b>
                            {
                              w.formations.find((f) => f.id === x.formationId)
                                ?.name
                            }{" "}
                            · {x.formationId}
                          </b>
                        </p>
                        <div className="toolbar">
                          <button
                            className="secondary"
                            onClick={() => {
                              setPreparation((old) => ({
                                ...old,
                                team: x.id,
                                scenario: "",
                                strategy: "",
                              }));
                              setTab("overview");
                            }}
                          >
                            Use in Prepare
                          </button>
                          {x.campaignId && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setRequestedCampaign(x.campaignId);
                                setTab("campaigns");
                              }}
                            >
                              View improvement campaign
                            </button>
                          )}
                        </div>
                        <div className="roles">
                          {ROLES.map((r) => (
                            <div key={r}>
                              <b>{r}</b>
                              <span>
                                {
                                  w.prompts.find((p) => p.id === x.promptIds[r])
                                    ?.label
                                }
                              </span>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setTab("prompts");
                                  setRequestedPrompt(x.promptIds[r]);
                                }}
                              >
                                Inspect prompt
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : tab === "matches" ? (
                      <>
                        <h3>
                          {x.goalsFor ?? "?"} – {x.goalsAgainst ?? "?"}
                        </h3>
                        <p>{x.primaryDiagnosis || "No diagnosis recorded."}</p>
                        <p>
                          Shots on target: {x.onTargetFor ?? "Unknown"} for /{" "}
                          {x.onTargetAgainst ?? "Unknown"} against · Dangerous
                          turnovers: {x.dangerousTurnovers ?? "Unknown"}
                        </p>
                        {x.replayUrl && (
                          <a
                            href={x.replayUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
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
                    ) : tab === "prompts" ? (
                      <>
                        <pre className="prompt">{x.text}</pre>
                        <p>{x.rationale}</p>
                        <div className="toolbar">
                          <button
                            onClick={() =>
                              navigator.clipboard
                                .writeText(x.text)
                                .then(() => setNotice("Prompt copied."))
                                .catch(() =>
                                  setError(
                                    "Clipboard unavailable; use Download prompt.",
                                  ),
                                )
                            }
                          >
                            Copy prompt
                          </button>
                          <button
                            className="secondary"
                            onClick={() => download(`${x.id}.txt`, x.text)}
                          >
                            Download prompt
                          </button>
                        </div>
                        {x.parentId && (
                          <details>
                            <summary>Changes from parent</summary>
                            <pre>
                              {JSON.stringify(
                                promptDiff(
                                  w.prompts.find((p) => p.id === x.parentId)
                                    ?.text || "",
                                  x.text,
                                ),
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        )}
                      </>
                    ) : (
                      <details>
                        <summary>Record data</summary>
                        <pre>{JSON.stringify(x, null, 2)}</pre>
                      </details>
                    )}
                    <div className="toolbar">
                      <button
                        className="secondary"
                        onClick={() => edit(tab, x)}
                      >
                        {["formations", "prompts", "teams"].includes(tab)
                          ? "Create revision"
                          : "Copy to new record"}
                      </button>
                      {tab === "formations" && (
                        <button
                          className="secondary"
                          onClick={() => duplicateFormation(x)}
                        >
                          Duplicate as new formation
                        </button>
                      )}
                      {tab === "experiments" && (
                        <button
                          onClick={async () => {
                            const r = await fetch(
                              `/api/workspace?experiment=${x.id}`,
                            );
                            const p = await r.json();
                            if (!r.ok) {
                              setError(p.error);
                              return;
                            }
                            download(
                              `${x.id}-manual-manifest.json`,
                              p.manifest,
                            );
                            setNotice(
                              p.warnings.join(" ") ||
                                "Manual portal manifest exported.",
                            );
                          }}
                        >
                          Export portal preparation
                        </button>
                      )}
                      {tab === "teams" && (
                        <button
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
                        const ids = Array.isArray(x[key])
                          ? x[key]
                          : x[key]
                            ? [x[key]]
                            : [];
                        const kind = refKinds[key];
                        return ids.map((id: string) => {
                          const target = w[kind]?.find((r) => r.id === id);
                          return target ? (
                            <button
                              className="secondary"
                              key={key + id}
                              onClick={() => {
                                setFamily("all");
                                setTab(kind);
                                setRequestedRecord(id);
                                setTimeout(
                                  () =>
                                    document
                                      .getElementById(id)
                                      ?.scrollIntoView({
                                        behavior: window.matchMedia(
                                          "(prefers-reduced-motion: reduce)",
                                        ).matches
                                          ? "auto"
                                          : "smooth",
                                      }),
                                  80,
                                );
                              }}
                            >
                              {name(target)} ↗
                            </button>
                          ) : null;
                        });
                      })}
                    </div>
                    <details>
                      <summary>Traceability & record</summary>
                      <details>
                        <summary>Record data</summary>
                        <pre>{JSON.stringify(x, null, 2)}</pre>
                      </details>
                    </details>
                  </article>
                )}
              </RecordBrowser>
            )}
            {!draft && !relevant(tab).length && (
              <div className="empty">
                No records yet. Create the first {labels[tab].toLowerCase()}{" "}
                record.
              </div>
            )}
          </>
        )}
        <details className="workspace-tools">
          <summary>Workspace backup & attachments</summary>
          <footer>
            <div>
              <h3>Workspace backup</h3>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const r = await fetch("/api/workspace?export=1");
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    download("agentic-football-workspace.json", d);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Export JSON records
              </button>
              <label className="file-button">
                Import JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const manifest = JSON.parse(await file.text());
                      const r = await fetch("/api/workspace", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "import", manifest }),
                      });
                      const x = await r.json();
                      if (!r.ok) throw new Error(x.error);
                      await refresh();
                      setNotice(`Imported ${x.added} records.`);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              <p className="muted">
                JSON contains records and attachment references. Back up data/
                for database and original attachment bytes.
              </p>
            </div>
            <div>
              <h3>Evidence attachments</h3>
              <label className="file-button">
                Upload report, replay or setup JSON
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
              </label>
              <p className="muted">
                Original bytes preserved · up to 25 MB per file
              </p>
              {attachments.map((a) => (
                <div key={a.id}>
                  <a href={`/api/attachments/${a.id}`}>{a.name}</a>{" "}
                  <small>{a.id}</small>
                </div>
              ))}
            </div>
          </footer>
        </details>
      </main>
    </div>
  );
}
