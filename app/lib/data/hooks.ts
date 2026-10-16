"use client";
import { useEffect } from "react";
import { evict, getJSON, load, useResource } from "./cache";
import type {
  AnalyticsResponse,
  ReplayResponse,
  RunIndex,
  WorkspaceResponse,
} from "./types";

const ACTIVE = ["queued", "running", "paused"];

export function useWorkspace() {
  return useResource<WorkspaceResponse>("workspace", () =>
    getJSON("/api/workspace"),
  );
}

/** Stored runs without replay payloads. Polls only while something is active. */
export function useRunIndex() {
  return useResource<RunIndex>("runs", () => getJSON("/api/runs"), {
    refreshMs: (d) =>
      d?.runs.some((r) => ACTIVE.includes(r.status)) ? 4000 : null,
  });
}

export function analyticsQuery(filters: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  return q.toString();
}

export function useAnalytics(filters: Record<string, string | undefined> = {}) {
  const qs = analyticsQuery(filters);
  return useResource<AnalyticsResponse>(
    "analytics?" + qs,
    () => getJSON("/api/analytics?" + qs),
    {
      refreshMs: (d) =>
        d?.benchmarks.some((b) => b.status === "running") ? 5000 : null,
    },
  );
}

/**
 * One run's replay (frames + slim traces). Finished runs are cached (newest 3);
 * active runs follow the SSE stream and refetch when new rounds arrive.
 */
export function useReplay(
  id: string | null,
  view: "replay" | "frames" = "replay",
) {
  const key = id ? `replay:${view}:${id}` : null;
  const res = useResource<ReplayResponse>(
    key,
    () => getJSON(`/api/simulation/${id}?view=${view}`),
    { maxAgeMs: Infinity },
  );
  const active = !!res.data && ACTIVE.includes(res.data.run.status);
  useEffect(() => {
    if (key) evict(`replay:${view}:`, 3);
  }, [key, view]);
  useEffect(() => {
    if (!key || !active || view !== "replay") return;
    let rounds = res.data?.rounds.length ?? 0;
    const source = new EventSource(`/api/simulation/${id}/events`);
    source.onmessage = (m) => {
      const d = JSON.parse(m.data) as {
        run: { status: string };
        roundCount: number;
      };
      if (d.roundCount !== rounds || !ACTIVE.includes(d.run.status)) {
        rounds = d.roundCount;
        load(key, undefined, true).catch(() => {});
      }
    };
    return () => source.close();
  }, [key, active, id, view]);
  return res;
}
