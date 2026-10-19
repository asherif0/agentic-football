"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ROLES, type Role, type Workspace } from "../../../lib/domain";
import type { Event, Run, Stats } from "../../../lib/simulation/types";
import type { Performance, Round } from "../../lib/data/types";
import { postJSON } from "../../lib/data/cache";
import { int, ms, pct, usd } from "../../lib/format";
import { clock, currentDecision } from "../../lib/playback";
import { eventName } from "../../lib/timeline";
import { prettyAction } from "../../lib/actions";
import { isJev } from "../../lib/models";
import { toast } from "../../lib/toast";
import { Badge, Button, ModelChip, Notice } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import { usePlaybackState, type Playback } from "../pitch/usePlayback";
import s from "./simulate.module.css";

type Trace = Round["traces"][number];
type Tab = "player" | "events" | "stats";

export function Inspector({
  run,
  traces,
  performance,
  playback,
  selected,
  onSelect,
  workspace,
}: {
  run: Run;
  traces: Map<string, Trace[]>;
  performance?: Performance;
  playback: Playback;
  selected: string | null;
  onSelect: (id: string | null) => void;
  workspace?: Workspace;
}) {
  const [tab, setTab] = useState<Tab>("player");
  const st = usePlaybackState(playback);
  return (
    <aside className={s.inspector} aria-label="Match inspector">
      <Segmented<Tab>
        full
        label="Inspector view"
        value={tab}
        onChange={setTab}
        options={[
          { value: "player", label: "Player", icon: "user" },
          { value: "events", label: "Events", icon: "list" },
          { value: "stats", label: "Stats", icon: "chart" },
        ]}
      />
      {tab === "player" ? (
        selected ? (
          <PlayerPanel
            run={run}
            id={selected}
            traces={traces.get(selected)}
            time={st.time}
            playback={playback}
            onClear={() => onSelect(null)}
            workspace={workspace}
          />
        ) : (
          <PickPlayer run={run} onSelect={onSelect} workspace={workspace} />
        )
      ) : tab === "events" ? (
        <EventsPanel run={run} time={st.time} playback={playback} />
      ) : (
        <StatsPanel run={run} performance={performance} workspace={workspace} />
      )}
    </aside>
  );
}

const promptLabel = (w: Workspace | undefined, id: string) =>
  w?.prompts.find((p) => p.id === id)?.label ?? id;

function PickPlayer({
  run,
  onSelect,
  workspace,
}: {
  run: Run;
  onSelect: (id: string) => void;
  workspace?: Workspace;
}) {
  const side = run.config.teamSide;
  return (
    <div className={s.section}>
      <p className="muted" style={{ fontSize: "var(--fs-small)" }}>
        Select a player on the pitch, or below, to see the decision they were
        executing at each moment.
      </p>
      <div className={s.pickGrid}>
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={s.pick}
            onClick={() => onSelect(`${side}-${role}`)}
          >
            <span className={s.slotRole}>{role}</span>
            <ModelChip model={run.config.team.models[role]} short />
            <span className={s.pickPrompt}>
              {promptLabel(workspace, run.config.team.prompts[role].id)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const STAT_ROWS: [keyof Stats, string][] = [
  ["goals", "Goals"],
  ["shots", "Shots"],
  ["onTarget", "On target"],
  ["completedPasses", "Passes completed"],
  ["passes", "Passes attempted"],
  ["interceptions", "Interceptions"],
  ["tackles", "Tackles won"],
  ["turnovers", "Turnovers"],
  ["dangerousTurnovers", "Dangerous turnovers"],
];

function PlayerPanel({
  run,
  id,
  traces,
  time,
  playback,
  onClear,
  workspace,
}: {
  run: Run;
  id: string;
  traces?: Trace[];
  time: number;
  playback: Playback;
  onClear: () => void;
  workspace?: Workspace;
}) {
  const [side, role] = id.split("-") as ["home" | "away", Role];
  const ours = side === run.config.teamSide;
  const team = ours ? run.config.team : run.config.opponent;
  const d = currentDecision(traces, time);
  const stats = run.state.individual[id];
  const recent = useMemo(() => {
    if (!traces?.length || !d) return [];
    const i = traces.indexOf(d);
    return traces.slice(Math.max(0, i - 4), i + 3);
  }, [traces, d]);
  return (
    <div className={s.section} style={{ gap: 16 }}>
      <div className={s.playerHead}>
        <span className={`${s.bigRole} ${ours ? s.roleOurs : s.roleTheirs}`}>
          {role}
        </span>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <span className={s.playerName}>
            {ours
              ? "Your squad"
              : run.config.opponent
                ? run.config.opponent.label
                : `Scripted ${run.config.bot}`}
          </span>
          {team ? (
            <ModelChip model={team.models[role]} />
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Rule-based controller
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="close"
          aria-label="Clear selection"
          onClick={onClear}
          style={{ marginLeft: "auto" }}
        />
      </div>
      {team && (
        <dl className={s.kv}>
          <dt>Prompt</dt>
          <dd>
            <Link href={`/prompts?prompt=${team.prompts[role].id}`}>
              {promptLabel(workspace, team.prompts[role].id)}
            </Link>
          </dd>
          <dt>Reasoning</dt>
          <dd>
            {isJev(team.models[role])
              ? "Not used by Jev"
              : team.inference?.[role]
                ? `${team.inference[role].reasoningEffort} · ${int(team.inference[role].maxOutputTokens)} max out`
                : "Provider default"}
          </dd>
        </dl>
      )}
      <div className={s.decision}>
        <div className={s.sectionHead}>
          <span className="eyebrow">Decision at {clock(time)}</span>
          {d && <Badge>{d.selected.type}</Badge>}
        </div>
        {d ? (
          <>
            <p className={s.decisionAction}>
              {prettyAction(d.selected.description).text}
              {prettyAction(d.selected.description).target && (
                <span className={s.target}>
                  {" "}
                  → {prettyAction(d.selected.description).target}
                </span>
              )}
            </p>
            <div className={s.decisionMeta}>
              <span>Round {d.round + 1}</span>
              <span>
                {d.provider === "scripted" ? "Scripted" : ms(d.latencyMs)}
              </span>
              {d.inputTokens !== null && d.provider !== "scripted" && (
                <span>
                  {int(d.inputTokens)} in · {int(d.outputTokens)} out
                </span>
              )}
              {d.attempts > 1 && <span>{d.attempts} attempts</span>}
              {d.confidence !== null && (
                <span>confidence {pct(d.confidence)}</span>
              )}
            </div>
            {d.error && (
              <Notice tone="bad" icon="alert">
                Request failed, so the player held position: {d.error}
              </Notice>
            )}
            <ul className={s.candidates} aria-label="Legal options offered">
              {d.actions.slice(0, 9).map((a) => (
                <li key={a.id} data-chosen={a.id === d.selected.id}>
                  <span className={s.candType}>{a.type}</span>
                  <span className={s.candText}>
                    {prettyAction(a.description).text}
                  </span>
                  {prettyAction(a.description).target && (
                    <span className={s.candTarget}>
                      {prettyAction(a.description).target}
                    </span>
                  )}
                </li>
              ))}
              {d.actions.length > 9 && (
                <li className="muted">+{d.actions.length - 9} more options</li>
              )}
            </ul>
          </>
        ) : (
          <p className="muted" style={{ fontSize: "var(--fs-small)" }}>
            No decision yet at this moment.
          </p>
        )}
      </div>
      {recent.length > 0 && (
        <div className={s.section}>
          <span className="eyebrow">Nearby decisions</span>
          <div className={s.history}>
            {recent.map((t) => (
              <button
                key={t.round}
                type="button"
                className={s.histItem}
                data-current={t === d}
                data-error={!!t.error}
                title={prettyAction(t.selected.description).text}
                onClick={() => playback.seek(t.time + 0.01)}
              >
                {clock(t.time).slice(3)} {t.selected.type}
              </button>
            ))}
          </div>
        </div>
      )}
      {stats && (
        <div className={s.section}>
          <span className="eyebrow">Match contribution</span>
          <dl className={s.kv}>
            {STAT_ROWS.filter(([k]) => k !== "passes").map(([k, label]) => (
              <span key={k} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{int(stats[k] as number)}</dd>
              </span>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function EventsPanel({
  run,
  time,
  playback,
}: {
  run: Run;
  time: number;
  playback: Playback;
}) {
  const [all, setAll] = useState(false);
  const events = run.state.events.filter((e) => all || e.bookmark);
  const current = [...events].reverse().find((e) => e.time <= time);
  const annotate = (e: Event) =>
    `/library/annotations?draft=new&match=${run.matchId}&t=${e.time}&obs=${encodeURIComponent(e.detail)}`;
  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <span className="eyebrow">{events.length} events</span>
        <Segmented<"key" | "all">
          size="sm"
          label="Event filter"
          value={all ? "all" : "key"}
          onChange={(v) => setAll(v === "all")}
          options={[
            { value: "key", label: "Key" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <ul className={s.events}>
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`${s.event} ${e.type === "goal" ? s.eventGoal : ""}`}
              data-current={e === current}
              onClick={() => playback.seek(e.time)}
            >
              <span className={s.eventTime}>{clock(e.time).slice(1)}</span>
              <span>
                <span className={s.eventType}>
                  {eventName(e.type)} ·{" "}
                  {e.side === run.config.teamSide ? "you" : "opponent"}
                </span>
                {e.detail}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {run.matchId && current && (
        <Button href={annotate(current)} size="sm" icon="plus">
          Annotate {clock(current.time)}
        </Button>
      )}
    </div>
  );
}

function StatsPanel({
  run,
  performance,
  workspace,
}: {
  run: Run;
  performance?: Performance;
  workspace?: Workspace;
}) {
  const side = run.config.teamSide,
    a = run.state.stats[side],
    b = run.state.stats[side === "home" ? "away" : "home"];
  const played = Math.max(run.state.time, 0.01);
  const rows: [string, number, number, (n: number) => string][] = [
    [
      "Possession",
      a.possessionSeconds / played,
      b.possessionSeconds / played,
      (n) => pct(n),
    ],
    ...STAT_ROWS.map(
      ([k, label]) =>
        [label, a[k] as number, b[k] as number, (n: number) => int(n)] as [
          string,
          number,
          number,
          (n: number) => string,
        ],
    ),
  ];
  const [reason, setReason] = useState("");
  return (
    <div className={s.section} style={{ gap: 18 }}>
      <div className={s.compare}>
        <div className={s.sectionHead}>
          <span className="eyebrow">You</span>
          <span className="eyebrow">Opponent</span>
        </div>
        {rows.map(([label, x, y, f]) => {
          const max = Math.max(x, y, 0.0001);
          return (
            <div className={s.cmpRow} key={label}>
              <span className={s.cmpLabel}>{label}</span>
              <span>{f(x)}</span>
              <span className={s.cmpBars}>
                <span
                  className={s.cmpOurs}
                  style={{ width: `${(x / max) * 100}%` }}
                />
                <span
                  className={s.cmpTheirs}
                  style={{ width: `${(y / max) * 100}%` }}
                />
              </span>
              <span className={s.cmpRight}>{f(y)}</span>
            </div>
          );
        })}
      </div>
      <div className={s.section}>
        <span className="eyebrow">Agent performance</span>
        <dl className={s.kv}>
          <dt>Median decision</dt>
          <dd>{ms(performance?.medianMs)}</dd>
          <dt>95th percentile</dt>
          <dd>{ms(performance?.p95Ms)}</dd>
          <dt>Failed decisions</dt>
          <dd>
            {int(performance?.failed)} / {int(performance?.decisions)}
          </dd>
          <dt>Requests</dt>
          <dd>{int(run.requests)}</dd>
          <dt>Estimated cost</dt>
          <dd>{usd(run.estimatedCostUsd ?? null)}</dd>
        </dl>
      </div>
      <div className={s.section}>
        <span className="eyebrow">Squad in this match</span>
        <dl className={s.kv}>
          {ROLES.map((r) => (
            <span key={r} style={{ display: "contents" }}>
              <dt className="mono">{r}</dt>
              <dd>
                <ModelChip model={run.config.team.models[r]} short /> ·{" "}
                <Link href={`/prompts?prompt=${run.config.team.prompts[r].id}`}>
                  {promptLabel(workspace, run.config.team.prompts[r].id)}
                </Link>
              </dd>
            </span>
          ))}
        </dl>
      </div>
      <div className={s.section}>
        <span className="eyebrow">Evidence</span>
        <Button
          href={`/api/simulation/${run.id}`}
          download={`simulation-${run.id}.json`}
          icon="download"
          size="sm"
        >
          Full replay + decisions (JSON)
        </Button>
        {run.evidenceOrigin === "local simulation" &&
          run.status === "completed" && (
            <details>
              <summary
                className="muted"
                style={{ fontSize: "var(--fs-small)" }}
              >
                Record as local champion…
              </summary>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <input
                  placeholder="Reason for this decision"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="solid"
                  disabled={!reason.trim()}
                  onClick={() =>
                    postJSON(
                      "/api/simulation/decisions",
                      {
                        teamId: run.config.team.id,
                        outcome: "champion",
                        reason,
                        runIds: [run.id],
                      },
                      ["runs"],
                    )
                      .then(() =>
                        toast("Local simulation champion recorded.", "success"),
                      )
                      .catch((e) => toast(e.message, "error"))
                  }
                >
                  Record decision
                </Button>
                <p className="muted" style={{ fontSize: 12 }}>
                  A local champion does not validate portal performance.
                </p>
              </div>
            </details>
          )}
        {run.evidenceOrigin === "test fixture" && (
          <Notice icon="info">
            Test fixture: mock controllers that do not read prompts. Not used as
            evidence.
          </Notice>
        )}
      </div>
      {run.reason && (
        <Notice tone="warn" icon="alert">
          {run.reason}
        </Notice>
      )}
    </div>
  );
}
