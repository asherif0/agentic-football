"use client";
import { useEffect, useMemo, useRef } from "react";
import type { Event, Frame, Side } from "../../../lib/simulation/types";
import { useReplay } from "../../lib/data/hooks";
import { reducedMotion } from "../../lib/motion";
import { Pitch } from "../pitch/Pitch";
import { PitchField } from "../pitch/PitchField";
import { usePlayback } from "../pitch/usePlayback";

type FramesOnly = {
  run: {
    id: string;
    config: { teamSide: Side; duration: number };
    state: { events: Event[] };
  };
  rounds: { frames: Frame[] }[];
};
const NO_TRACES = new Map();

/** A stored match replaying on a loop; pauses while off-screen. */
export function HeroReplay({ runId }: { runId: string | null }) {
  const { data } = useReplay(runId, "frames") as unknown as {
    data?: FramesOnly;
  };
  const playback = usePlayback(),
    box = useRef<HTMLDivElement>(null);
  const frames = useMemo(
    () => data?.rounds.flatMap((r) => r.frames) ?? [],
    [data],
  );
  useEffect(() => {
    if (!frames.length) return;
    playback.setEnd(frames.at(-1)!.time);
    playback.setSpeed(1.25);
    if (reducedMotion()) {
      const goal = data?.run.state.events.find((e) => e.type === "goal");
      playback.seek(goal ? goal.time : frames.at(-1)!.time / 2);
      return;
    }
    playback.seek(0);
    playback.play();
    const loop = playback.subscribe(() => {
      const st = playback.getSnapshot();
      if (!st.playing && st.time >= st.end - 0.01 && visible.current)
        setTimeout(() => {
          playback.seek(0);
          playback.play();
        }, 1200);
    });
    return loop;
  }, [frames, playback, data]);
  const visible = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting) playback.play();
      else playback.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [playback, frames.length]);
  return (
    <div ref={box}>
      {data && frames.length ? (
        <Pitch
          frames={frames}
          events={data.run.state.events}
          traces={NO_TRACES}
          teamSide={data.run.config.teamSide}
          playback={playback}
          showIntent={false}
          label="Best stored match, replaying"
        />
      ) : (
        <PitchField label="Loading replay" />
      )}
    </div>
  );
}
