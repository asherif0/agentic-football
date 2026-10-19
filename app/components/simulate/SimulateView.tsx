"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, type RecordData } from "../../../lib/domain";
import type { Event } from "../../../lib/simulation/types";
import { postJSON } from "../../lib/data/cache";
import { useReplay, useRunIndex, useWorkspace } from "../../lib/data/hooks";
import { findAnnotation, momentAnnotation } from "../../lib/moments";
import { toast } from "../../lib/toast";
import { reducedMotion } from "../../lib/motion";
import { modelLabel } from "../../lib/models";
import { tracesByPlayer } from "../../lib/playback";
import { defaultRun, isActive, replayable, statusLabel } from "../../lib/runs";
import { Pitch } from "../pitch/Pitch";
import { Timeline } from "../pitch/Timeline";
import { Transport } from "../pitch/Transport";
import { usePlayback } from "../pitch/usePlayback";
import { NextStep } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import {
  Badge,
  Button,
  EmptyState,
  ModelChip,
  Skeleton,
} from "../ui/primitives";
import { Inspector } from "./Inspector";
import { MomentDialog } from "./MomentDialog";
import { MatchPicker } from "./MatchPicker";
import { Scoreboard } from "./Scoreboard";
import { SetupPanel } from "./SetupPanel";
import s from "./simulate.module.css";

export default function SimulateView() {
  const params = useSearchParams(),
    router = useRouter(),
    { data: index } = useRunIndex(),
    { data: ws } = useWorkspace(),
    runId = params.get("run"),
    replay = useReplay(runId),
    playback = usePlayback(),
    [selected, setSelected] = useState<string | null>(null),
    [intent, setIntent] = useState(true),
    [picker, setPicker] = useState(false),
    [setup, setSetup] = useState(params.get("new") === "1"),
    [created, setCreated] = useState<RecordData[]>([]),
    [moment, setMoment] = useState<{
      record: RecordData;
      created: boolean;
    } | null>(null),
    annotating = useRef(false);

  // Open the newest completed local replay when no match is in the URL.
  useEffect(() => {
    if (runId || !index) return;
    const pick = defaultRun(index.runs);
    if (pick) router.replace(`/simulate?run=${pick.id}`, { scroll: false });
  }, [runId, index, router]);

  const data =
    replay.data && replay.data.run.id === runId ? replay.data : undefined;
  const run = data?.run;
  const frames = useMemo(
    () => data?.rounds.flatMap((r) => r.frames) ?? [],
    [data],
  );
  const traces = useMemo(
    () => tracesByPlayer(data?.rounds.flatMap((r) => r.traces) ?? []),
    [data],
  );
  const events = run?.state.events ?? EMPTY_EVENTS;
  const keyEvents = useMemo(() => events.filter((e) => e.bookmark), [events]);
  const active = !!run && isActive(run.status);

  // Keep the clock's end in step with (possibly growing) frames.
  useEffect(() => {
    playback.setEnd(frames.at(-1)?.time ?? 0);
  }, [frames, playback]);

  // A newly opened match starts at ?t= (or kickoff) and plays automatically.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!run || !frames.length || opened.current === run.id) return;
    opened.current = run.id;
    setSelected(null);
    const t = Number(params.get("t"));
    playback.seek(Number.isFinite(t) && t > 0 ? t : 0);
    if (isActive(run.status)) playback.setFollow(true);
    else if (!(t > 0) && !reducedMotion()) playback.play();
  }, [run, frames.length, params, playback]);

  // Remember the paused position in the URL so the moment can be shared.
  useEffect(() => {
    let wasPlaying = false;
    return playback.subscribe(() => {
      const st = playback.getSnapshot();
      if (wasPlaying && !st.playing && runId)
        window.history.replaceState(
          null,
          "",
          `/simulate?run=${runId}&t=${st.time.toFixed(1)}`,
        );
      wasPlaying = st.playing;
    });
  }, [playback, runId]);

  // Space plays/pauses, arrows skip, Escape clears the selected player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest("input, textarea, select, [role=dialog]") ||
        e.metaKey ||
        e.ctrlKey
      )
        return;
      if (e.key === " " && !el.closest("button, a, [role=button]")) {
        e.preventDefault();
        playback.toggle();
      } else if (e.key === "ArrowRight" && !el.closest("[role=radiogroup]"))
        playback.skip(e.shiftKey ? 5 : 1);
      else if (e.key === "ArrowLeft" && !el.closest("[role=radiogroup]"))
        playback.skip(e.shiftKey ? -5 : -1);
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  const list = index ? replayable(index.runs) : [];
  const pos = list.findIndex((r) => r.id === runId);
  const go = (id: string) => {
    opened.current = null;
    router.push(`/simulate?run=${id}`, { scroll: false });
  };
  const summary = index?.runs.find((r) => r.id === runId);
  // Annotate saves the moment straight away; the dialog then offers an optional diagnosis.
  const annotations = useMemo(() => {
    const all = [...(ws?.records.annotations ?? [])];
    for (const r of created) if (!all.some((a) => a.id === r.id)) all.push(r);
    return all;
  }, [ws, created]);
  const canAnnotate =
    !!run?.matchId && run.evidenceOrigin === "local simulation";
  const isAnnotated = (e: Event) =>
    !!run && !!findAnnotation(annotations, run, e);
  async function annotateEvent(e: Event) {
    if (!run || annotating.current) return;
    const existing = findAnnotation(annotations, run, e);
    if (existing) {
      setMoment({ record: existing, created: false });
      return;
    }
    const draft = momentAnnotation(run, frames, e);
    if (!draft) {
      toast(
        "Only completed local-simulation matches can be annotated.",
        "error",
      );
      return;
    }
    annotating.current = true;
    try {
      const record = await postJSON<RecordData>(
        "/api/workspace",
        { kind: "annotations", record: draft },
        ["workspace"],
      );
      setCreated((old) => [...old, record]);
      setMoment({ record, created: true });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      annotating.current = false;
    }
  }

  return (
    <>
      <header className={s.head} data-reveal>
        <div className={s.headText}>
          <span
            style={{ display: "inline-flex", gap: 10, alignItems: "center" }}
          >
            <Badge tone="lime">02</Badge>
            <span className="eyebrow">Simulate · replay and inspect</span>
          </span>
          <div className={s.titleRow}>
            <h1 className={s.title}>Match replay</h1>
            <button
              type="button"
              className={s.switcher}
              onClick={() => setPicker(true)}
              aria-haspopup="dialog"
            >
              {summary ? (
                <span>
                  {modelLabel(summary.team.models)} · {summary.team.family} ·
                  seed {summary.seed} · {summary.side}
                </span>
              ) : (
                <span>Choose a match</span>
              )}
              <Icon name="chevronDown" size={14} />
            </button>
            {run && run.status !== "completed" && (
              <Badge tone={active ? "lime" : "warn"} dot={active}>
                {statusLabel[run.status]}
              </Badge>
            )}
            {run?.evidenceOrigin === "test fixture" && <Badge>Fixture</Badge>}
          </div>
        </div>
        <div className={s.actions}>
          <Button
            icon="chevronLeft"
            aria-label="Newer match"
            disabled={pos <= 0}
            onClick={() => pos > 0 && go(list[pos - 1].id)}
          />
          <Button
            icon="chevronRight"
            aria-label="Older match"
            disabled={pos < 0 || pos >= list.length - 1}
            onClick={() =>
              pos >= 0 && pos < list.length - 1 && go(list[pos + 1].id)
            }
          />
          <Button icon="list" onClick={() => setPicker(true)}>
            All matches{index ? ` · ${list.length}` : ""}
          </Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setSetup(true)}
            disabled={!index || !ws}
          >
            New match
          </Button>
        </div>
      </header>

      <div className={s.stage}>
        <div className={s.center} data-reveal>
          {run ? (
            <Scoreboard run={run} frames={frames} playback={playback} />
          ) : (
            <Skeleton height={76} radius={16} />
          )}
          <div className={s.pitchWrap}>
            {run && frames.length ? (
              <Pitch
                frames={frames}
                events={events}
                traces={traces}
                teamSide={run.config.teamSide}
                models={run.config.team.models}
                playback={playback}
                selected={selected}
                onSelect={setSelected}
                showIntent={intent}
              />
            ) : (
              <div style={{ aspectRatio: "43.2 / 23.2", position: "relative" }}>
                <div className={s.pitchOverlay}>
                  {index && !list.length ? (
                    <EmptyState icon="pitch" title="No stored matches yet">
                      Start a match to see it here.
                    </EmptyState>
                  ) : replay.error ? (
                    `Could not load this replay: ${replay.error}`
                  ) : run && !frames.length ? (
                    "This match stopped before kickoff, so there is nothing to replay."
                  ) : (
                    "Loading replay…"
                  )}
                </div>
              </div>
            )}
          </div>
          <div className={s.controls}>
            <Timeline
              events={keyEvents}
              duration={run?.config.duration ?? 0}
              playback={playback}
              onAnnotate={canAnnotate ? annotateEvent : undefined}
              isAnnotated={isAnnotated}
            />
            <Transport
              playback={playback}
              live={active}
              disabled={!frames.length}
            />
          </div>
          {run && (
            <div className={s.lineup} role="group" aria-label="Your squad">
              <span className={`eyebrow ${s.lineupLabel}`}>Your squad</span>
              {ROLES.map((role) => {
                const id = `${run.config.teamSide}-${role}`;
                return (
                  <button
                    key={role}
                    type="button"
                    className={s.slot}
                    aria-pressed={selected === id}
                    onClick={() => setSelected(selected === id ? null : id)}
                    title={run.config.team.models[role]}
                  >
                    <span className={s.slotRole}>{role}</span>
                    <ModelChip model={run.config.team.models[role]} short />
                  </button>
                );
              })}
              <label className={s.toggle}>
                <input
                  type="checkbox"
                  checked={intent}
                  onChange={(e) => setIntent(e.target.checked)}
                />
                Show intent lines
              </label>
            </div>
          )}
        </div>
        {run ? (
          <Inspector
            run={run}
            traces={traces}
            performance={data?.performance}
            playback={playback}
            selected={selected}
            onSelect={setSelected}
            workspace={ws?.records}
            onAnnotate={canAnnotate ? annotateEvent : undefined}
            isAnnotated={isAnnotated}
          />
        ) : (
          <Skeleton height={420} radius={16} />
        )}
      </div>

      <NextStep href="/analytics" />

      {index && (
        <MatchPicker
          open={picker}
          onClose={() => setPicker(false)}
          runs={index.runs}
          current={runId}
          onPick={go}
        />
      )}
      <MomentDialog
        record={moment?.record ?? null}
        created={moment?.created ?? false}
        onClose={() => setMoment(null)}
        onSaved={(r) => setCreated((old) => [...old, r])}
      />
      {index && ws && (
        <SetupPanel
          open={setup}
          onClose={() => setSetup(false)}
          workspace={ws.records}
          index={index}
          onStarted={go}
        />
      )}
    </>
  );
}

const EMPTY_EVENTS: Event[] = [];
