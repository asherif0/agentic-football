"use client";
import ReplayTimeline from "./ReplayTimeline";
import ScenarioEditor from "./ScenarioEditor";
import { usePreparedField } from "./Preparation";
import Transport, { ControlIcon } from "./Transport";
import ModelAssignments, {
  defaultModels,
  defaultInference,
} from "./ModelAssignments";
import SavedSimulations from "./SavedSimulations";
import { useEffect, useState } from "react";
import { Workspace, ROLES } from "../../lib/domain";
import type { Run, Frame } from "../../lib/simulation/types";
import type { Scenario, Series } from "../../lib/simulation/repository";
export default function Simulation({
  workspace: w,
  onAnnotate,
  requestedRunId,
  onRequestHandled,
}: {
  workspace: Workspace;
  requestedRunId?: string | null;
  onRequestHandled?: () => void;
  onAnnotate: (matchId: string, time: number, observation: string) => void;
}) {
  const [index, setIndex] = useState<{
      runs: Run[];
      decisions: any[];
      scenarios: Scenario[];
      series: (Series & { summary: any[] })[];
      keyConfigured: boolean;
      connected: boolean;
    }>({
      runs: [],
      decisions: [],
      scenarios: [],
      series: [],
      keyConfigured: false,
      connected: false,
    }),
    [detail, setDetail] = useState<any>(null),
    [preparing, setPreparing] = useState(true),
    [starting, setStarting] = useState(false),
    [useActiveTeam, setUseActiveTeam] = useState(true),
    [error, setError] = useState(""),
    [provider, setProvider] = usePreparedField("provider"),
    [team, setTeam] = usePreparedField("team"),
    [scenario, setScenario] = usePreparedField("scenario"),
    [opponent, setOpponent] = usePreparedField("opponent"),
    [opScenario, setOpScenario] = usePreparedField("opScenario"),
    [bot, setBot] = usePreparedField("bot"),
    [models, setModels] = usePreparedField("models"),
    [opponentModels, setOpponentModels] = usePreparedField("opponentModels"),
    [inference, setInference] = usePreparedField("inference"),
    [opponentInference, setOpponentInference] =
      usePreparedField("opponentInference"),
    [duration, setDuration] = usePreparedField("duration"),
    [interval, setIntervalValue] = usePreparedField("interval"),
    [limit, setLimit] = usePreparedField("limit"),
    [tokenLimit, setTokenLimit] = usePreparedField("tokenLimit"),
    [seed, setSeed] = usePreparedField("seed"),
    [side, setSide] = usePreparedField("side"),
    [challenger, setChallenger] = useState("team-baseline"),
    [seriesMode, setSeriesMode] = useState(false),
    [seriesLimit, setSeriesLimit] = useState(3600),
    [seriesTokens, setSeriesTokens] = useState(36000000),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [live, setLive] = useState(true),
    [promotionReason, setPromotionReason] = useState("");
  async function refresh() {
    const response = await fetch("/api/simulation");
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not load simulations");
    setIndex(data);
    setScenario(
      (s) =>
        s ||
        data.scenarios.find(
          (x: any) =>
            x.formationId === w.teams.find((t) => t.id === team)?.formationId,
        )?.id ||
        "",
    );
    setOpScenario((s) => s || data.scenarios[0]?.id || "");
  }
  useEffect(() => {
    if (requestedRunId) {
      load(requestedRunId)
        .then(() => {
          setPreparing(false);
          setLive(false);
          setPlaying(false);
          setCursor(0);
          onRequestHandled?.();
        })
        .catch((e) => setError(e.message));
    }
  }, [requestedRunId]);
  async function load(id: string) {
    const response = await fetch("/api/simulation/" + id);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load replay");
    setDetail(data);
  }
  async function post(path: string, body: unknown) {
    setError("");
    const r = await fetch("/api/simulation" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      data = await r.json();
    if (!r.ok) {
      setError(data.error);
      return null;
    }
    await refresh();
    return data;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const t = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!detail?.run?.id) return;
    const source = new EventSource(
      "/api/simulation/" + detail.run.id + "/events",
    );
    source.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setDetail((old: any) => ({ ...old, run: d.run }));
      if (d.roundCount !== detail.rounds?.length) load(d.run.id);
    };
    return () => source.close();
  }, [detail?.run?.id, detail?.rounds?.length]);
  const frames: Frame[] = detail?.rounds?.flatMap((r: any) => r.frames) || [];
  useEffect(() => {
    if ((!playing && !live) || !frames.length) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          if (c >= frames.length - 1) {
            if (!live) setPlaying(false);
            return c;
          }
          return Math.min(
            frames.length - 1,
            c + (live ? Math.max(1, Math.ceil((frames.length - c) / 80)) : 1),
          );
        }),
      50 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, live, speed, frames.length]);
  const run: Run | undefined = detail?.run,
    f = frames[cursor],
    stats = run?.state.stats,
    planned = Math.ceil(duration / interval) * (opponent ? 10 : 5),
    validScenarios = index.scenarios.filter(
      (s) => s.formationId === w.teams.find((t) => t.id === team)?.formationId,
    );
  const options = (
    value: string,
    set: (s: string) => void,
    items: { id: string; label?: string; [key: string]: any }[],
  ) => (
    <select value={value} onChange={(e) => set(e.target.value)}>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {x.label}
        </option>
      ))}
    </select>
  );
  async function start() {
    if (starting) return;
    setStarting(true);
    try {
      const selectedModels =
        provider === "decisions" ? defaultModels() : models;
      const body = {
        useActiveTeam: useActiveTeam && !seriesMode,
        label: w.teams.find((t) => t.id === team)?.label,
        teamId: team,
        scenarioId: scenario,
        provider,
        models: selectedModels,
        ...(provider === "responses" ? { inference, opponentInference } : {}),
        opponentTeamId: opponent || null,
        opponentScenarioId: opScenario,
        opponentModels:
          provider === "decisions" ? defaultModels() : opponentModels,
        bot,
        teamSide: side,
        seed,
        duration,
        interval,
        requestLimit: limit,
        inputTokenLimit: tokenLimit,
        challengerTeamId: challenger,
        challengerScenarioId: scenario,
        seriesRequestLimit: seriesLimit,
        seriesInputTokenLimit: seriesTokens,
      };
      const result = await post(seriesMode ? "/series" : "", body);
      if (result) {
        if (!seriesMode && useActiveTeam) setTeam(result.config.team.id);
        setCursor(0);
        setPreparing(false);
        setLive(true);
        await load(seriesMode ? result.runIds[0] : result.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  function exportRun() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" }),
    );
    a.download = `simulation-${run?.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <section className="simulation">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="sim-grid">
        <details
          className="card prepare-panel"
          open={preparing}
          onToggle={(e) => setPreparing(e.currentTarget.open)}
        >
          <summary>
            Match setup{" "}
            <span className="muted">
              {provider} · {index.keyConfigured ? "Key configured" : "No key"} ·{" "}
              {limit} call ceiling
            </span>
          </summary>
          <div className="prepare-content">
            <h2>Prepare a run</h2>
            <p>
              Worker {index.connected ? "connected" : "starting"} · API key{" "}
              {index.keyConfigured ? "configured" : "not configured"}
            </p>
            <label>
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="decisions">OpenAI Decisions (default)</option>
                <option value="responses">OpenAI Responses</option>
                <option value="mock">Mock · fixture only</option>
              </select>
            </label>
            <p>
              {provider === "mock"
                ? "Mock uses scripted controllers; it does not evaluate prompt wording."
                : provider === "decisions"
                  ? "Decisions supports gpt-6-luna. Each player decides concurrently."
                  : "Assign a model to each player. Provider and settings are frozen when the run starts."}
            </p>
            {provider === "responses" && (
              <ModelAssignments
                title="Team models"
                models={models}
                inference={inference}
                onModels={setModels}
                onInference={setInference}
              />
            )}
            <label>
              Team
              {options(
                team,
                (s) => {
                  setTeam(s);
                  setScenario(
                    index.scenarios.find(
                      (x) =>
                        x.formationId ===
                        w.teams.find((t) => t.id === s)?.formationId,
                    )?.id || "",
                  );
                },
                w.teams,
              )}
            </label>
            <label>
              Starting scenario{options(scenario, setScenario, validScenarios)}
            </label>
            {!seriesMode && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={useActiveTeam}
                  onChange={(e) => setUseActiveTeam(e.target.checked)}
                />
                Use the locally adopted team when these settings match a
                campaign
              </label>
            )}
            <label>
              Opponent
              <select
                value={opponent}
                onChange={(e) => {
                  setOpponent(e.target.value);
                  setOpScenario(
                    index.scenarios.find(
                      (s) =>
                        s.formationId ===
                        w.teams.find((t) => t.id === e.target.value)
                          ?.formationId,
                    )?.id || "",
                  );
                  setLimit(e.target.value ? 600 : 300);
                }}
              >
                <option value="">Scripted local approximation</option>
                {w.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {opponent && provider === "responses" && (
              <ModelAssignments
                title="Opponent models"
                models={opponentModels}
                inference={opponentInference}
                onModels={setOpponentModels}
                onInference={setOpponentInference}
              />
            )}
            {opponent ? (
              <label>
                Opponent scenario
                {options(
                  opScenario,
                  setOpScenario,
                  index.scenarios.filter(
                    (s) =>
                      s.formationId ===
                      w.teams.find((t) => t.id === opponent)?.formationId,
                  ),
                )}
              </label>
            ) : (
              <label>
                Style
                <select value={bot} onChange={(e) => setBot(e.target.value)}>
                  <option value="balanced">Balanced</option>
                  <option value="press">Pressing</option>
                  <option value="counter">Counterattacking</option>
                </select>
              </label>
            )}
            {(
              [
                ["Seconds", duration, setDuration],
                ["Decision interval", interval, setIntervalValue],
                ["Seed", seed, setSeed],
                ["Request ceiling (retries included)", limit, setLimit],
                ["Conservative input-token ceiling", tokenLimit, setTokenLimit],
              ] as const
            ).map(([name, value, set]) => (
              <label key={name}>
                {name}
                <input
                  type="number"
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                />
              </label>
            ))}
            <label>
              Starting side
              <select value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={seriesMode}
                onChange={(e) => setSeriesMode(e.target.checked)}
              />{" "}
              Paired champion/challenger series
            </label>
            {seriesMode && (
              <>
                <label>
                  Challenger
                  {options(
                    challenger,
                    setChallenger,
                    w.teams.filter(
                      (t) =>
                        t.formationId ===
                        w.teams.find((x) => x.id === team)?.formationId,
                    ),
                  )}
                </label>
                <label>
                  Series request ceiling
                  <input
                    type="number"
                    value={seriesLimit}
                    onChange={(e) => setSeriesLimit(+e.target.value)}
                  />
                </label>
                <label>
                  Series input-token ceiling
                  <input
                    type="number"
                    value={seriesTokens}
                    onChange={(e) => setSeriesTokens(+e.target.value)}
                  />
                </label>
                <p>3 seeds × 2 sides × 2 versions = 12 matches.</p>
              </>
            )}
            <strong>
              Maximum planned calls:{" "}
              {provider === "mock" ? 0 : planned * (seriesMode ? 12 : 1)} before
              retries
            </strong>
            <p>
              30s timeout, at most one transient retry. A ceiling stops the run
              cleanly.
            </p>
            <button
              disabled={
                starting ||
                !scenario ||
                (provider !== "mock" && !index.keyConfigured)
              }
              onClick={start}
            >
              {starting
                ? "Starting…"
                : seriesMode
                  ? "Start 12-match series"
                  : "Start match"}
            </button>
          </div>
        </details>
        <div className="match-workspace">
          <div className="card">
            <h2 className="match-title">
              {run ? run.config.team.label : "Match viewer"}
            </h2>
            <p>
              {run?.status}
              {run?.phase && run.phase !== run.status
                ? ` · ${run.phase}`
                : ""}{" "}
              · {run?.config.provider} · {run?.evidenceOrigin} {run?.reason}
            </p>
            <h2 className="scoreboard">
              {f?.score[0] ?? stats?.home.goals ?? 0} —{" "}
              {f?.score[1] ?? stats?.away.goals ?? 0}{" "}
              <small>{(f?.time ?? run?.state.time ?? 0).toFixed(1)} s</small>
            </h2>
            <svg
              viewBox="0 0 400 200"
              className="sim-pitch"
              aria-label="Football match pitch"
            >
              <rect width="400" height="200" fill="#10271f" />
              <path
                d="M10 10H390V190H10Z M200 10V190 M10 50H65V150H10 M390 50H335V150H390"
                fill="none"
                stroke="#567065"
              />
              <circle cx="200" cy="100" r="28" fill="none" stroke="#567065" />
              {(f?.players || run?.state.players || []).map((p) => (
                <g key={p.id} transform={`translate(${p.x * 10},${p.y * 10})`}>
                  <circle
                    r="6"
                    fill={p.side === "home" ? "#d3ee51" : "#eceae6"}
                    stroke="#232723"
                  />
                  <text y="-9" textAnchor="middle" fill="white" fontSize="7">
                    {p.role}
                  </text>
                </g>
              ))}
              {run && (
                <circle
                  cx={(f?.ball.x ?? run.state.ball.x) * 10}
                  cy={(f?.ball.y ?? run.state.ball.y) * 10}
                  r="3"
                  fill="white"
                  stroke="#222"
                />
              )}
            </svg>
            <p>
              Lime home · white away · possession{" "}
              {f?.ball.owner ?? run?.state.ball.owner ?? "loose ball"}
            </p>
            {run && (
              <>
                {["running", "queued", "paused"].includes(run.status) && (
                  <div className="execution-controls">
                    <span className="muted">Live execution</span>
                    <button
                      className="secondary"
                      aria-label={
                        run.status === "paused"
                          ? "Resume simulation"
                          : "Pause simulation"
                      }
                      onClick={() =>
                        post("/" + run.id + "/control", {
                          command: run.status === "paused" ? "run" : "pause",
                        })
                      }
                    >
                      <ControlIcon
                        kind={run.status === "paused" ? "play" : "pause"}
                      />
                      {run.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        post("/" + run.id + "/control", { command: "stop" })
                      }
                    >
                      <ControlIcon kind="stop" />
                      Stop
                    </button>
                  </div>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={live}
                    onChange={(e) => setLive(e.target.checked)}
                  />{" "}
                  Follow live
                </label>
                <ReplayTimeline
                  key={run.id}
                  events={run.state.events.filter((e) => e.bookmark)}
                  frames={frames}
                  duration={run.config.duration}
                  cursor={cursor}
                  onSeek={(index) => {
                    setLive(false);
                    setCursor(index);
                  }}
                  onAnnotate={
                    run.matchId
                      ? (e) => onAnnotate(run.matchId!, e.time, e.detail)
                      : undefined
                  }
                />
                <Transport
                  playing={playing}
                  cursor={cursor}
                  count={frames.length}
                  speed={speed}
                  time={f?.time ?? 0}
                  onSpeed={setSpeed}
                  onSeek={(i) => {
                    setLive(false);
                    setCursor(i);
                  }}
                  onPlay={() => {
                    setLive(false);
                    if (cursor === frames.length - 1) setCursor(0);
                    setPlaying(!playing);
                  }}
                />
                <div className="viewer-utilities">
                  <small className="muted">Playback makes no API calls</small>
                  <button className="text-button" onClick={exportRun}>
                    Export replay ↗
                  </button>
                </div>
              </>
            )}
          </div>
          {run && (
            <div className="card">
              <h3>Execution & full-match results</h3>
              <details className="run-models">
                <summary>
                  {new Set(Object.values(run.config.team.models)).size === 1
                    ? run.config.team.models.GK
                    : "Mixed models"}{" "}
                  · player configuration
                </summary>
                {[
                  run.config.team,
                  ...(run.config.opponent ? [run.config.opponent] : []),
                ].map((snapshot, i) => (
                  <div key={i}>
                    <h4>
                      {i === 0 ? "Your team" : "Opponent"} · {snapshot.label}
                    </h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Model / reasoning</th>
                          <th>Prompt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROLES.map((role) => (
                          <tr key={role}>
                            <td>{role}</td>
                            <td>
                              {snapshot.models[role]}
                              <small>
                                {snapshot.inference?.[role]
                                  ? `${snapshot.inference[role].reasoningEffort} · ${snapshot.inference[role].maxOutputTokens} output limit`
                                  : "Saved legacy defaults"}
                              </small>
                            </td>
                            <td>
                              {w.prompts.find(
                                (p) => p.id === snapshot.prompts[role].id,
                              )?.label || snapshot.prompts[role].id}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </details>

              <p>
                Requests {run.requests}/{run.config.requestLimit} · known input{" "}
                {run.inputTokens} · reserved/unknown {run.reservedTokens}
              </p>
              <p>
                Latency median{" "}
                {detail.performance?.medianMs?.toFixed(0) ?? "unknown"} ms · p95{" "}
                {detail.performance?.p95Ms?.toFixed(0) ?? "unknown"} ms ·
                failures {detail.performance?.failed ?? 0}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Statistic</th>
                    <th>Home</th>
                    <th>Away</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(stats!.home).map((k) => (
                    <tr key={k}>
                      <td>
                        {(
                          {
                            goals: "Goals",
                            shots: "Shots",
                            onTarget: "Shots on target",
                            saves: "Saves",
                            possessionSeconds: "Possession (s)",
                            passes: "Passes attempted",
                            completedPasses: "Passes completed",
                            interceptions: "Interceptions",
                            tackleAttempts: "Tackles attempted",
                            tackles: "Tackles won",
                            turnovers: "Turnovers",
                            dangerousTurnovers: "Dangerous turnovers",
                          } as Record<string, string>
                        )[k] || k}
                      </td>
                      <td>
                        {Number.isFinite((stats!.home as any)[k])
                          ? Number((stats!.home as any)[k]).toFixed(
                              k === "possessionSeconds" ? 1 : 0,
                            )
                          : "—"}
                      </td>
                      <td>
                        {Number.isFinite((stats!.away as any)[k])
                          ? Number((stats!.away as any)[k]).toFixed(
                              k === "possessionSeconds" ? 1 : 0,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details>
                <summary>Event feed</summary>
                {run.state.events.slice(-100).map((e) => (
                  <p key={e.id}>
                    {e.time.toFixed(1)} · {e.detail}
                  </p>
                ))}
              </details>
              <details>
                <summary>
                  Raw measurements, individual contributions & decision traces
                </summary>
                <pre>
                  {JSON.stringify(
                    { individual: run.state.individual, rounds: detail.rounds },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <details>
                <summary>Evidence & promotion decision</summary>
                {run.matchId && (
                  <p>
                    Evidence match: {run.matchId}. Use Critical events to
                    annotate this match.
                  </p>
                )}
                <label>
                  Manual simulation promotion reason
                  <input
                    value={promotionReason}
                    onChange={(e) => setPromotionReason(e.target.value)}
                  />
                </label>
                <button
                  disabled={
                    run.evidenceOrigin !== "local simulation" ||
                    run.status !== "completed"
                  }
                  onClick={() =>
                    post("/decisions", {
                      teamId: run.config.team.id,
                      outcome: "champion",
                      reason: promotionReason,
                      runIds: [run.id],
                    })
                  }
                >
                  Record local simulation champion
                </button>
                <p>
                  This records a manual decision. Campaigns can adopt
                  automatically after validation. A local champion does not
                  validate portal performance.
                </p>
              </details>
            </div>
          )}
        </div>
      </div>
      <ScenarioEditor
        workspace={w}
        onSaved={() => refresh().catch((e) => setError(e.message))}
      />
      <SavedSimulations
        runs={index.runs}
        series={index.series}
        onOpen={(id) => {
          setPreparing(false);
          setLive(false);
          setCursor(0);
          load(id);
        }}
        onControl={(id, command) => post("/series", { id, command })}
      />
      <details className="card">
        <summary>Local simulation promotion history</summary>
        {index.decisions.map((d) => (
          <p key={d.id}>
            {d.outcome} · {w.teams.find((t) => t.id === d.teamId)?.label} ·{" "}
            {d.reason}
          </p>
        ))}
      </details>
    </section>
  );
}
