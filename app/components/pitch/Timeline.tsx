"use client";
import { useEffect, useRef, useState } from "react";
import type { Event } from "../../../lib/simulation/types";
import { clock } from "../../lib/playback";
import { clusterEvents, eventName } from "../../lib/timeline";
import { Icon } from "../ui/Icon";
import type { Playback } from "./usePlayback";
import s from "./controls.module.css";

/** Scrubber with clustered event markers; the head moves every frame. */
export function Timeline({
  events,
  duration,
  playback,
  onAnnotate,
  isAnnotated,
}: {
  events: Event[];
  duration: number;
  playback: Playback;
  onAnnotate?: (e: Event) => void;
  isAnnotated?: (e: Event) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    fill = useRef<HTMLDivElement>(null),
    head = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    [width, setWidth] = useState(600),
    [open, setOpen] = useState<Event[] | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setOpen(null), [events]);
  useEffect(
    () =>
      playback.onTick((t) => {
        const k = duration > 0 ? Math.min(1, t / duration) : 0;
        if (fill.current) fill.current.style.transform = `scaleX(${k})`;
        if (head.current) head.current.style.left = `${k * 100}%`;
        if (input.current && document.activeElement !== input.current)
          input.current.value = String(t);
      }),
    [playback, duration],
  );
  const groups = clusterEvents(events, duration, width);
  const pct = (t: number) =>
    `${Math.max(0, Math.min(100, (t / Math.max(duration, 0.01)) * 100))}%`;
  const closeCallout = () => {
    ref.current
      ?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
      ?.focus();
    setOpen(null);
  };
  return (
    <div className={s.timeline} ref={ref}>
      <div className={s.track}>
        {groups.map((g) => {
          const goal = g.some((e) => e.type === "goal");
          const isOpen = open?.[0]?.id === g[0].id;
          return (
            <span key={g.map((e) => e.id).join("-")}>
              <span className={s.markerStem} style={{ left: pct(g[0].time) }} />
              <button
                type="button"
                className={`${s.marker} ${goal ? s.markerGoal : ""}`}
                style={{ left: pct(g[0].time) }}
                aria-expanded={isOpen}
                aria-label={`${g[0].time.toFixed(1)} seconds: ${g.length > 1 ? g.length + " events" : eventName(g[0].type)}`}
                title={g
                  .map((e) => `${e.time.toFixed(1)}s ${eventName(e.type)}`)
                  .join("\n")}
                onClick={() => {
                  setOpen(isOpen ? null : g);
                  playback.seek(g[0].time);
                }}
              >
                {g.length > 1 ? g.length : goal ? "G" : "•"}
              </button>
            </span>
          );
        })}
        <div className={s.rail}>
          <div
            ref={fill}
            className={s.fill}
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        <input
          ref={input}
          className={s.scrub}
          type="range"
          min={0}
          max={duration}
          step={0.05}
          defaultValue={0}
          aria-label="Replay position"
          aria-valuetext={clock(playback.time)}
          onChange={(e) => playback.seek(+e.target.value)}
          disabled={!duration}
        />
        <div ref={head} className={s.head} style={{ left: 0 }} />
      </div>
      {open && (
        <div
          className={s.callout}
          style={{
            left: Math.max(
              0,
              Math.min(
                width - Math.min(340, width),
                (open[0].time / Math.max(duration, 0.01)) * width - 170,
              ),
            ),
          }}
          onKeyDown={(e) => e.key === "Escape" && closeCallout()}
        >
          <div className={s.calloutHead}>
            <span className="eyebrow">
              {open.length > 1 ? `${open.length} events` : "Key event"}
            </span>
            <button
              type="button"
              className={s.linkButton}
              aria-label="Close event details"
              onClick={closeCallout}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {open.map((e) => (
            <div className={s.calloutEvent} key={e.id}>
              <button
                type="button"
                className={s.linkButton}
                onClick={() => playback.seek(e.time)}
              >
                {clock(e.time)} · {eventName(e.type)}
              </button>
              <p>{e.detail}</p>
              {onAnnotate && (
                <button
                  type="button"
                  className={s.linkButton}
                  onClick={() => onAnnotate(e)}
                >
                  {isAnnotated?.(e)
                    ? "Annotated ✓ · add diagnosis"
                    : "Annotate this moment"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
