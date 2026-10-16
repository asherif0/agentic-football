"use client";
import { useRunIndex } from "../../lib/data/hooks";
import s from "./shell.module.css";

/** Quiet simulator status: only says more when something is actually running. */
export function WorkerStatus() {
  const { data } = useRunIndex();
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
    </div>
  );
}
