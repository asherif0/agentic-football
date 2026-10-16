"use client";
import { clock } from "../../lib/playback";
import { Icon } from "../ui/Icon";
import { Segmented } from "../ui/Segmented";
import { usePlaybackState, type Playback } from "./usePlayback";
import s from "./controls.module.css";

const SPEEDS = ["0.5", "1", "2", "4"] as const;

export function Transport({
  playback,
  live,
  disabled,
}: {
  playback: Playback;
  /** Shown only while the match is still being simulated. */
  live?: boolean;
  disabled?: boolean;
}) {
  const st = usePlaybackState(playback);
  return (
    <div className={s.transport} aria-label="Replay controls" role="group">
      <button
        type="button"
        className={s.tbtn}
        aria-label="Restart"
        disabled={disabled}
        onClick={() => playback.seek(0)}
      >
        <Icon name="restart" size={17} />
      </button>
      <button
        type="button"
        className={s.tbtn}
        aria-label="Back 5 seconds"
        disabled={disabled}
        onClick={() => playback.skip(-5)}
      >
        <Icon name="back" size={17} />
      </button>
      <button
        type="button"
        className={`${s.tbtn} ${s.play}`}
        aria-label={st.playing ? "Pause" : "Play"}
        disabled={disabled}
        onClick={() => playback.toggle()}
      >
        <Icon name={st.playing ? "pause" : "play"} size={18} />
      </button>
      <button
        type="button"
        className={s.tbtn}
        aria-label="Forward 5 seconds"
        disabled={disabled}
        onClick={() => playback.skip(5)}
      >
        <Icon name="forward" size={17} />
      </button>
      <span className={s.clock} aria-live="off">
        {clock(st.time)} <span>/ {clock(st.end)}</span>
      </span>
      <span className={s.spacer} />
      {live && (
        <button
          type="button"
          className={s.live}
          aria-pressed={st.follow}
          onClick={() => playback.setFollow(!st.follow)}
        >
          <span className={s.liveDot} />
          {st.follow ? "Following live" : "Follow live"}
        </button>
      )}
      <Segmented
        size="sm"
        label="Playback speed"
        value={String(st.speed) as (typeof SPEEDS)[number]}
        onChange={(v) => playback.setSpeed(Number(v))}
        options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))}
      />
    </div>
  );
}
