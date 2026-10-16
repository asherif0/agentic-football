"use client";
import { useEffect, useRef, useState } from "react";
import type { Event, Frame } from "../../lib/simulation/types";
import { clusterEvents } from "../lib/timeline";
export { clusterEvents };
const name = (type: string) =>
  type.replaceAll("-", " ").replace(/^./, (s) => s.toUpperCase());
export default function ReplayTimeline({
  events,
  frames,
  duration,
  cursor,
  onSeek,
  onAnnotate,
}: {
  events: Event[];
  frames: Frame[];
  duration: number;
  cursor: number;
  onSeek: (index: number) => void;
  onAnnotate?: (event: Event) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600),
    [selected, setSelected] = useState<Event[] | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setSelected(null), [duration, frames[0]?.players[0]?.id]);
  const groups = clusterEvents(events, duration, width);
  function seek(e: Event) {
    const index = frames.findIndex((f) => f.time >= e.time);
    onSeek(index < 0 ? Math.max(0, frames.length - 1) : index);
  }
  return (
    <div className="replay-timeline" ref={ref}>
      <div className="timeline-heading">
        <span>Replay timeline</span>
        <span>
          {(frames[cursor]?.time || 0).toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>
      <div className="timeline-markers" aria-label="Critical event markers">
        {groups.map((group) => (
          <button
            key={group.map((e) => e.id).join("-")}
            className={
              "event-marker " +
              (selected?.[0]?.id === group[0].id ? "active" : "")
            }
            style={{
              left: `${Math.max(0, Math.min(100, (group[0].time / Math.max(duration, 1)) * 100))}%`,
            }}
            aria-label={`${group[0].time.toFixed(1)} seconds: ${group.length > 1 ? group.length + " events" : name(group[0].type)}`}
            aria-expanded={selected?.[0]?.id === group[0].id}
            onClick={() => {
              setSelected(group);
              seek(group[0]);
            }}
          >
            {group.length > 1 ? group.length : "◆"}
          </button>
        ))}
      </div>
      <input
        aria-label="Replay position"
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={Math.min(cursor, Math.max(0, frames.length - 1))}
        onChange={(e) => onSeek(+e.target.value)}
        disabled={!frames.length}
      />
      {selected ? (
        <div
          className="timeline-callout"
          style={{
            left: Math.max(
              0,
              Math.min(
                width - Math.min(340, width),
                (selected[0].time / Math.max(duration, 1)) * width -
                  Math.min(340, width) / 2,
              ),
            ),
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              (
                ref.current?.querySelector(
                  ".event-marker.active",
                ) as HTMLButtonElement
              )?.focus();
              setSelected(null);
            }
          }}
        >
          <div className="section-heading">
            <strong>
              {selected.length > 1 ? "Event cluster" : "Critical event"}
            </strong>
            <button
              className="text-button"
              aria-label="Close event details"
              onClick={() => {
                (
                  ref.current?.querySelector(
                    ".event-marker.active",
                  ) as HTMLButtonElement
                )?.focus();
                setSelected(null);
              }}
            >
              ×
            </button>
          </div>
          {selected.map((e) => (
            <div className="timeline-event" key={e.id}>
              <button className="text-button" onClick={() => seek(e)}>
                {e.time.toFixed(1)}s · {name(e.type)}
              </button>
              <p>{e.detail}</p>
              {onAnnotate && (
                <button className="secondary" onClick={() => onAnnotate(e)}>
                  Annotate
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {events.length
            ? "Select an event marker to inspect or annotate."
            : "No bookmarked events in this match yet."}
        </p>
      )}
    </div>
  );
}
