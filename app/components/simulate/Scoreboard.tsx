"use client";
import { useEffect, useRef } from "react";
import type { Frame, Run } from "../../../lib/simulation/types";
import { gsap, reducedMotion } from "../../lib/motion";
import { clock, frameIndexAt } from "../../lib/playback";
import { modelLabel } from "../../lib/models";
import { ModelMix } from "../ui/primitives";
import { usePlaybackState, type Playback } from "../pitch/usePlayback";
import s from "./simulate.module.css";

/** Broadcast-style score strip: your squad on the left, always. */
export function Scoreboard({
  run,
  frames,
  playback,
}: {
  run: Run;
  frames: Frame[];
  playback: Playback;
}) {
  const st = usePlaybackState(playback),
    i = frameIndexAt(frames, st.time),
    score =
      i >= 0
        ? frames[i].score
        : [run.state.stats.home.goals, run.state.stats.away.goals];
  const side = run.config.teamSide,
    ours = side === "home" ? score[0] : score[1],
    theirs = side === "home" ? score[1] : score[0];
  const oursRef = useRef<HTMLSpanElement>(null),
    theirsRef = useRef<HTMLSpanElement>(null),
    prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = [ours, theirs];
    if (!p || reducedMotion() || !st.playing) return;
    const bump = (el: HTMLElement | null) =>
      el &&
      gsap.fromTo(
        el,
        { scale: 1.6, y: -4 },
        { scale: 1, y: 0, duration: 0.6, ease: "back.out(3)" },
      );
    if (ours > p[0]) bump(oursRef.current);
    if (theirs > p[1]) bump(theirsRef.current);
  }, [ours, theirs]);
  const opponent = run.config.opponent?.label ?? `Scripted ${run.config.bot}`;
  return (
    <div
      className={s.score}
      aria-label={`Score: your squad ${ours}, opponent ${theirs}`}
    >
      <div className={s.team}>
        <span className={s.sideTag}>
          <span className={s.dotOurs} /> Your squad · {side}
        </span>
        <span className={s.teamName}>{run.config.team.label}</span>
        <span className={s.teamMeta}>
          <ModelMix models={run.config.team.models} />
          {modelLabel(run.config.team.models)} ·{" "}
          {run.config.team.formation.family}
        </span>
      </div>
      <div className={s.scoreDigits}>
        <div className={s.digits}>
          <span ref={oursRef} className={`${s.digit} ${s.digitOurs}`}>
            {ours}
          </span>
          <span className={s.dash}>–</span>
          <span ref={theirsRef} className={s.digit}>
            {theirs}
          </span>
        </div>
        <span className={s.scoreClock}>
          {clock(st.time)} / {clock(run.config.duration)}
        </span>
      </div>
      <div className={`${s.team} ${s.teamRight}`}>
        <span className={s.sideTag}>
          Opponent · {side === "home" ? "away" : "home"}{" "}
          <span className={s.dotTheirs} />
        </span>
        <span className={s.teamName}>{opponent}</span>
        <span className={s.teamMeta}>
          {run.config.opponent
            ? modelLabel(run.config.opponent.models)
            : "Rule-based controller"}
        </span>
      </div>
    </div>
  );
}
