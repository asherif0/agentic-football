"use client";
export function ControlIcon({
  kind,
}: {
  kind: "play" | "pause" | "restart" | "back" | "forward" | "stop";
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {kind === "play" ? (
        <path d="m8 5 11 7-11 7Z" fill="currentColor" />
      ) : kind === "pause" ? (
        <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="4" />
      ) : kind === "stop" ? (
        <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
      ) : kind === "restart" ? (
        <path
          d="M5 8a8 8 0 1 1-1 8M5 3v6h6"
          stroke="currentColor"
          strokeWidth="2"
        />
      ) : (
        <path
          d={
            kind === "back"
              ? "m11 5-8 7 8 7V5Zm10 0-8 7 8 7V5Z"
              : "m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z"
          }
          fill="currentColor"
        />
      )}
    </svg>
  );
}
export default function Transport({
  playing,
  onPlay,
  onSeek,
  cursor,
  count,
  speed,
  onSpeed,
  time,
}: {
  playing: boolean;
  onPlay: () => void;
  onSeek: (i: number) => void;
  cursor: number;
  count: number;
  speed: number;
  onSpeed: (s: number) => void;
  time: number;
}) {
  return (
    <div className="transport" aria-label="Replay playback controls">
      <button
        className="icon-button"
        aria-label="Restart replay"
        disabled={!count}
        onClick={() => onSeek(0)}
      >
        <ControlIcon kind="restart" />
      </button>
      <button
        className="icon-button"
        aria-label="Skip back five seconds"
        disabled={!count}
        onClick={() => onSeek(Math.max(0, cursor - 100))}
      >
        <ControlIcon kind="back" />
      </button>
      <button
        className="transport-play"
        aria-label={playing ? "Pause replay" : "Play replay"}
        disabled={!count}
        onClick={onPlay}
      >
        <ControlIcon kind={playing ? "pause" : "play"} />
      </button>
      <button
        className="icon-button"
        aria-label="Skip forward five seconds"
        disabled={!count}
        onClick={() => onSeek(Math.min(count - 1, cursor + 100))}
      >
        <ControlIcon kind="forward" />
      </button>
      <span className="transport-clock">
        {time.toFixed(1)}s <small>Replay</small>
      </span>
      <select
        aria-label="Playback speed"
        value={speed}
        onChange={(e) => onSpeed(+e.target.value)}
      >
        {[0.5, 1, 2, 4, 8].map((v) => (
          <option key={v} value={v}>
            {v}×
          </option>
        ))}
      </select>
    </div>
  );
}
