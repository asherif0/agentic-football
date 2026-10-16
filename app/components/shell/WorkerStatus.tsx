"use client";
import { useState } from "react";
import { invalidate } from "../../lib/data/cache";
import { useRunIndex } from "../../lib/data/hooks";
import s from "./shell.module.css";

/** Quiet simulator status: only says more when something is actually running. */
export function WorkerStatus() {
  const { data } = useRunIndex(),
    [waking, setWaking] = useState(false);
  const active =
    data?.runs.filter((r) => ["queued", "running", "paused"].includes(r.status))
      .length ?? 0;
  const stored = data?.runs.filter((r) => r.hasReplay).length ?? 0;
  return (
    <div className={s.worker} aria-live="polite">
      <span className={`${s.workerDot} ${active ? s.workerOn : ""}`} />
      {data
        ? active
          ? `${active} match${active === 1 ? "" : "es"} in progress`
          : `${stored} stored replays`
        : "Loading…"}
      {active > 0 && data && !data.connected && (
        <button
          type="button"
          className={s.wake}
          disabled={waking}
          title="Queued matches need the background simulator. This starts it."
          onClick={() => {
            setWaking(true);
            // GET /api/simulation starts the worker when its heartbeat is stale.
            fetch("/api/simulation")
              .catch(() => {})
              .finally(() => {
                setWaking(false);
                invalidate("runs");
              });
          }}
        >
          {waking ? "Waking…" : "Wake simulator"}
        </button>
      )}
    </div>
  );
}
