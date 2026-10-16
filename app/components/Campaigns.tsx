"use client";
import { useEffect, useState } from "react";
import type { Workspace } from "../../lib/domain";
import type {
  Campaign,
  Generation,
  Strategy,
} from "../../lib/improvement/types";
import { defaultModels } from "./ModelAssignments";
import { usePreparation } from "./Preparation";

type Index = {
  campaigns: (Campaign & { usage: any })[];
  strategies: Strategy[];
  activeTeams: any[];
  adoptions: any[];
  keyConfigured: boolean;
};
export default function Campaigns({
  workspace: w,
  onReplay,
  onPrompt,
  onChanged,
  requestedId,
  resultsOnly = false,
}: {
  workspace: Workspace;
  onReplay: (id: string) => void;
  onPrompt: (id: string) => void;
  onChanged: () => Promise<void>;
  requestedId?: string | null;
  resultsOnly?: boolean;
}) {
  const { value: p, set: setPreparation } = usePreparation(),
    [index, setIndex] = useState<Index>({
      campaigns: [],
      strategies: [],
      activeTeams: [],
      adoptions: [],
      keyConfigured: false,
    }),
    [selected, setSelected] = useState(requestedId || ""),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [cost, setCost] = useState(""),
    [requests, setRequests] = useState(50000),
    [tokens, setTokens] = useState(300000000),
    [generations, setGenerations] = useState(3),
    [review, setReview] = useState(false),
    [discovery, setDiscovery] = useState<string[]>([]),
    [available, setAvailable] = useState<any[]>([]),
    [annotations, setAnnotations] = useState<string[]>([]),
    [generatorModel, setGeneratorModel] = useState("gpt-6-luna"),
    [search, setSearch] = useState(""),
    [manualTeam, setManualTeam] = useState(""),
    [manualReason, setManualReason] = useState("");
  const input = {
    teamId: p.team,
    scenarioId: p.scenario,
    strategyId: p.strategy,
    provider: p.provider,
    models: p.provider === "decisions" ? defaultModels() : p.models,
    ...(p.provider === "responses" ? { inference: p.inference } : {}),
    duration: p.duration,
    seed: p.seed,
    requestLimit: requests,
    inputTokenLimit: tokens,
    costLimitUsd: Number(cost),
    maxGenerations: generations,
    reviewBeforeAdoption: review,
    selectedRunIds: discovery,
    annotationIds: annotations,
    generatorModel,
  };
  const signature = JSON.stringify(input);
  useEffect(() => setPreview(null), [signature]);
  async function refresh() {
    const r = await fetch("/api/campaigns"),
      d = await r.json();
    if (!r.ok) throw new Error(d.error || "Could not load campaigns");
    setIndex(d);
  }
  async function load(id: string) {
    const r = await fetch(`/api/campaigns/${id}`),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setDetail(d);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setAvailable(d.runs || []))
      .catch(() => {});
    const timer = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (requestedId) setSelected(requestedId);
  }, [requestedId]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    load(selected).catch((e) => setError(e.message));
    const source = new EventSource(`/api/campaigns/${selected}/events`);
    source.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setDetail((old: any) => (old ? { ...old, ...d } : d));
    };
    source.onerror = () => load(selected).catch(() => {});
    return () => source.close();
  }, [selected]);
  async function post(url: string, body: any) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      await onChanged();
      if (selected) await load(selected);
      return d;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    const d = await post("/api/campaigns", { ...input, action: "preview" });
    if (d) setPreview(d);
  }
  async function start() {
    if (!preview) return;
    const d = await post("/api/campaigns", input);
    if (d) {
      setSelected(d.id);
      setPreview(null);
      setNotice(
        "Campaign started. It will stop at its limits; you can leave this page.",
      );
    }
  }
  async function control(command: string) {
    await post(`/api/campaigns/${selected}`, { command });
  }
  const c: Campaign | undefined = detail?.campaign,
    usage = detail?.usage,
    gs: Generation[] = detail?.generations || [],
    active = c
      ? index.activeTeams.find((a) => a.id === c.manifest.profile)
      : null;
  const generationSignature = gs
    .map((g) => `${g.id}/${g.stage}/${g.outcome || ""}`)
    .join(";");
  useEffect(() => {
    if (selected && generationSignature) {
      load(selected).catch(() => {});
      onChanged().catch(() => {});
    }
  }, [selected, generationSignature]);
  useEffect(() => {
    if (!requestedId) {
      try {
        setSelected(
          sessionStorage.getItem("football-campaign-selection") || "",
        );
      } catch {}
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("football-campaign-selection", selected);
    } catch {}
  }, [selected]);
  async function changeTeam(teamId: string, action = "override") {
    if (!c) return;
    const d = await post("/api/local-team", {
      profile: c.manifest.profile,
      expectedRevision: active?.revision || 0,
      teamId,
      reason: manualReason,
      action,
    });
    if (d) {
      setNotice(
        "Local active team changed. Existing matches retain their saved prompts.",
      );
      setPreparation((old) => ({ ...old, team: teamId }));
    }
  }
  return (
    <section className="campaign-workspace">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!resultsOnly && (
        <details className="workspace-section campaign-config" open={!selected}>
          <summary>Start an improvement campaign</summary>
          <p className="muted">
            One role per generation. Screening → fresh validation → automatic
            local adoption.
          </p>
          <div className="campaign-context">
            <strong>
              {w.teams.find((t) => t.id === p.team)?.label ||
                "Choose a squad on the Squad page"}
            </strong>
            <span>
              {p.provider} · {p.duration}s matches · API key{" "}
              {index.keyConfigured ? "configured" : "not configured"}
            </span>
            <span>
              Strategy:{" "}
              {index.strategies.find((s) => s.id === p.strategy)?.label ||
                "choose one above"}
            </span>
          </div>
          <div className="filter-bar">
            <label>
              Estimated spend ceiling ($)
              <input
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                placeholder="Required"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
            <label>
              Request ceiling
              <input
                type="number"
                min="1"
                max="500000"
                value={requests}
                onChange={(e) => setRequests(+e.target.value)}
              />
            </label>
            <label>
              Maximum generations
              <input
                type="number"
                min="1"
                max="10"
                value={generations}
                onChange={(e) => setGenerations(+e.target.value)}
              />
            </label>
          </div>
          <details>
            <summary>Advanced limits & discovery evidence</summary>
            <label>
              Reserved input-token ceiling
              <input
                type="number"
                value={tokens}
                onChange={(e) => setTokens(+e.target.value)}
              />
            </label>
            <label>
              Proposal model
              <select
                value={generatorModel}
                onChange={(e) => setGeneratorModel(e.target.value)}
              >
                {["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
              />
              Review before adoption
            </label>
            <p className="muted">
              Optionally select matching runs, including runs still in progress.
              Otherwise the campaign runs six baseline discovery matches.
            </p>
            <div className="evidence-options">
              {available
                .filter((r) => r.team.id === p.team)
                .slice(0, 30)
                .map((r) => (
                  <label className="check-row" key={r.id}>
                    <input
                      type="checkbox"
                      checked={discovery.includes(r.id)}
                      onChange={(e) =>
                        setDiscovery((old) =>
                          e.target.checked
                            ? [...old, r.id]
                            : old.filter((id) => id !== r.id),
                        )
                      }
                    />
                    {r.label} · {r.status}
                  </label>
                ))}
            </div>
            <details>
              <summary>Optional human annotations</summary>
              {w.annotations
                .filter((a) => {
                  const m = w.matches.find((m) => m.id === a.matchId);
                  return (
                    w.experiments.find((e) => e.id === m?.experimentId)
                      ?.teamId === p.team
                  );
                })
                .map((a) => (
                  <label className="check-row" key={a.id}>
                    <input
                      type="checkbox"
                      checked={annotations.includes(a.id)}
                      onChange={(e) =>
                        setAnnotations((old) =>
                          e.target.checked
                            ? [...old, a.id]
                            : old.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.role} · {a.timestamp} · {a.observation}
                  </label>
                ))}
            </details>
          </details>
          {preview && (
            <div className="campaign-preview" role="status">
              <strong>
                {preview.schedule.maximumPlannedRequests.toLocaleString()}{" "}
                maximum normal requests
              </strong>
              <p>
                Per generation: 12 screening matches, then 36 validation matches
                if screening passes. {preview.schedule.discoveryMatches} initial
                discovery matches. Retries count toward your{" "}
                {requests.toLocaleString()} request ceiling.
              </p>
              <p>
                ${Number(cost).toFixed(2)} estimated ceiling ·{" "}
                {tokens.toLocaleString()} reserved input tokens · stops after
                two generations without adoption.
              </p>
              <p className="muted">
                Unknown usage stays reserved.{" "}
                {p.provider === "mock"
                  ? "Fixture only: no API calls or real adoption."
                  : "No limits increase automatically. Local improvements do not establish portal performance."}
              </p>
              {requests < preview.schedule.maximumPlannedRequests && (
                <p className="muted">
                  Your request ceiling may stop this campaign before every
                  generation completes.
                </p>
              )}
            </div>
          )}
          <button
            disabled={
              busy ||
              !p.strategy ||
              !p.scenario ||
              Number(cost) <= 0 ||
              (p.provider !== "mock" && !index.keyConfigured)
            }
            onClick={preview ? start : prepare}
          >
            {busy
              ? "Working…"
              : preview
                ? "Start campaign"
                : "Preview campaign"}
          </button>
        </details>
      )}
      <div className="section-heading">
        <div>
          <h2>{resultsOnly ? "Improvement results" : "Campaigns"}</h2>
          <p className="muted">Every candidate and adoption stays traceable.</p>
        </div>
        <input
          aria-label="Search campaigns"
          placeholder="Search campaigns"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {!index.campaigns.length ? (
        <p className="empty">
          No campaigns yet. Choose a strategy above, then start a bounded
          campaign.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Generation</th>
                <th>Requests</th>
                <th>Estimated + reserved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {index.campaigns
                .filter((c) =>
                  c.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <tr
                    key={c.id}
                    className={selected === c.id ? "selected-row" : ""}
                  >
                    <td>
                      {c.label}
                      <small className="table-subtitle">
                        {c.manifest.evidenceOrigin}
                      </small>
                    </td>
                    <td>{c.status}</td>
                    <td>
                      {c.generation}/{c.manifest.maxGenerations}
                    </td>
                    <td>{c.usage.requests.toLocaleString()}</td>
                    <td>
                      ${c.usage.costUsd.toFixed(3)} / $
                      {c.manifest.budget.costUsd.toFixed(2)}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-expanded={selected === c.id}
                        onClick={() =>
                          setSelected(selected === c.id ? "" : c.id)
                        }
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {c && (
        <section className="workspace-section campaign-detail">
          <div className="section-heading">
            <div>
              <h2>{c.label}</h2>
              <p>
                {c.status} ·{" "}
                {c.reason || "Worker progressing through the campaign"}
              </p>
            </div>
            <a
              className="text-button"
              href={`/api/campaigns/${c.id}?export=1`}
              download={`campaign-${c.id}.json`}
            >
              Export campaign
            </a>
          </div>
          <p className="muted">
            Strategy: {c.manifest.strategy.label} · frozen{" "}
            {new Date(c.createdAt).toLocaleString()} · incumbent:{" "}
            {w.teams.find((t) => t.id === c.incumbentTeamId)?.label ||
              c.incumbentTeamId}
          </p>
          {usage && (
            <div className="metric-strip">
              <span>
                <strong>{usage.requests.toLocaleString()}</strong> requests
              </span>
              <span>
                <strong>${usage.costUsd.toFixed(3)}</strong> estimated +
                reserved
              </span>
              <span>
                <strong>${usage.reservedCostUsd.toFixed(3)}</strong> uncertain
                reservations
              </span>
            </div>
          )}
          <div className="toolbar">
            {c.status === "running" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => control("pause")}
              >
                Pause campaign
              </button>
            )}
            {c.status === "paused" &&
              gs.at(-1)?.stage !== "generating" &&
              (active?.revision || 0) === c.activeRevision && (
                <button disabled={busy} onClick={() => control("run")}>
                  Resume campaign
                </button>
              )}
            {c.status === "paused" &&
              (gs.at(-1)?.stage === "generating" ||
                (active?.revision || 0) !== c.activeRevision) && (
                <p className="muted">
                  Stop this campaign and start a new one from your chosen team.
                  Existing history and uncertain reservations are retained.
                </p>
              )}
            {c.status === "review" && (
              <>
                <button disabled={busy} onClick={() => control("approve")}>
                  Adopt validated team
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => control("reject")}
                >
                  Retain incumbent
                </button>
              </>
            )}
            {["running", "paused", "review"].includes(c.status) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => control("stop")}
              >
                Stop campaign
              </button>
            )}
            <button
              className="text-button"
              onClick={() => {
                setPreparation((old) => ({
                  ...old,
                  team: c.incumbentTeamId,
                  scenario: c.manifest.baseline.scenarioIds[0],
                  provider: c.manifest.baseline.provider,
                  models: c.manifest.baseline.team.models,
                  inference:
                    c.manifest.baseline.team.inference || old.inference,
                  duration: c.manifest.baseline.duration,
                  strategy: c.manifest.strategy.id,
                }));
                setNotice("Campaign team and settings loaded into your squad.");
              }}
            >
              Use incumbent as squad
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Generation</th>
                  <th>Stage / outcome</th>
                  <th>Changed role</th>
                  <th>Evidence & results</th>
                </tr>
              </thead>
              <tbody>
                {gs.map((g) => (
                  <tr key={g.id}>
                    <td>{g.number}</td>
                    <td>
                      {g.outcome || g.stage}
                      <small className="table-subtitle">{g.reason}</small>
                    </td>
                    <td>
                      {g.proposal?.role || "—"}
                      {g.promptId && (
                        <button
                          className="text-button"
                          onClick={() => onPrompt(g.promptId!)}
                        >
                          View prompt
                        </button>
                      )}
                    </td>
                    <td>
                      {g.proposal?.rationale}
                      <br />
                      {g.assessments?.map((a) => (
                        <div key={a.stage}>
                          {a.stage}: {a.incumbentPoints ?? "?"} →{" "}
                          {a.challengerPoints ?? "?"} points · {a.outcome}
                          {a.pValue !== null
                            ? ` · p=${a.pValue.toFixed(4)}`
                            : ""}
                          <p className="muted">{a.reason}</p>
                          <details>
                            <summary>
                              {a.runIds.length} comparison replays
                            </summary>
                            {a.runIds.map((id) => (
                              <button
                                key={id}
                                className="text-button"
                                onClick={() => onReplay(id)}
                              >
                                Open replay {id.slice(0, 8)}
                              </button>
                            ))}
                          </details>
                        </div>
                      ))}
                      {detail.evidence
                        ?.find((e: any) => e.id === g.evidenceId)
                        ?.runs.map((r: any) => (
                          <button
                            className="text-button"
                            key={r.id}
                            onClick={() => onReplay(r.id)}
                          >
                            Replay {r.bot} · {r.goalsFor}–{r.goalsAgainst}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Local team selection & rollback</summary>
            <p className="muted">
              Active team:{" "}
              {w.teams.find((t) => t.id === active?.teamId)?.label ||
                "No automatic adoption yet"}
              . Changes are recorded and cannot alter saved matches.
            </p>
            <label>
              Team version
              <select
                value={manualTeam}
                onChange={(e) => setManualTeam(e.target.value)}
              >
                <option value="">Choose a team</option>
                {w.teams
                  .filter(
                    (t) =>
                      t.formationId === c.manifest.baseline.team.formation.id,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Reason
              <input
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={
                busy ||
                !manualTeam ||
                !manualReason.trim() ||
                c.manifest.evidenceOrigin === "test fixture"
              }
              onClick={() => changeTeam(manualTeam)}
            >
              Use selected local team
            </button>
            {index.adoptions
              .filter((a) => a.profile === c.manifest.profile)
              .map((a) => (
                <p key={a.id}>
                  {w.teams.find((t) => t.id === a.teamId)?.label} · {a.reason}{" "}
                  {a.previousTeamId && (
                    <button
                      className="text-button"
                      disabled={busy || !manualReason.trim()}
                      onClick={() => changeTeam(a.previousTeamId, "rollback")}
                    >
                      Roll back to prior team
                    </button>
                  )}
                </p>
              ))}
          </details>
          <details>
            <summary>Frozen settings & diagnostics</summary>
            <pre>{JSON.stringify(c.manifest, null, 2)}</pre>
          </details>
        </section>
      )}
    </section>
  );
}
