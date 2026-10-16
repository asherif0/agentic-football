"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * A tiny module-level request cache. It outlives route changes (the module
 * stays loaded), dedupes concurrent requests and lets mutations invalidate
 * keys by prefix. Snapshots are immutable so useSyncExternalStore stays stable.
 */
export type Snapshot<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  updatedAt: number;
};
const EMPTY: Snapshot<never> = {
  data: undefined,
  error: null,
  loading: true,
  updatedAt: 0,
};
const snaps = new Map<string, Snapshot<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const fetchers = new Map<string, () => Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function put(key: string, patch: Partial<Snapshot<unknown>>) {
  snaps.set(key, { ...(snaps.get(key) ?? EMPTY), ...patch });
  listeners.get(key)?.forEach((l) => l());
}

export function load<T>(
  key: string,
  fetcher?: () => Promise<T>,
  force = false,
) {
  const run = (fetcher ?? fetchers.get(key)) as (() => Promise<T>) | undefined;
  if (!run) return Promise.resolve(undefined as T | undefined);
  if (!force && inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = run()
    .then(
      (data) => {
        put(key, { data, error: null, loading: false, updatedAt: Date.now() });
        return data;
      },
      (err: unknown) => {
        put(key, {
          error: err instanceof Error ? err.message : String(err),
          loading: false,
        });
        throw err;
      },
    )
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Refetches every watched key starting with prefix; drops unwatched ones. */
export function invalidate(prefix: string) {
  for (const key of [...snaps.keys()])
    if (key.startsWith(prefix)) {
      if (listeners.get(key)?.size) load(key, undefined, true).catch(() => {});
      else snaps.delete(key);
    }
}

/** Forgets the oldest unwatched keys with this prefix beyond `keep`. */
export function evict(prefix: string, keep: number) {
  const keys = [...snaps.entries()]
    .filter(([k]) => k.startsWith(prefix) && !listeners.get(k)?.size)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([k]) => k);
  for (const k of keys.slice(keep)) snaps.delete(k);
}

export function peek<T>(key: string) {
  return snaps.get(key)?.data as T | undefined;
}

export function useResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: {
    refreshMs?: (data: T | undefined) => number | null;
    maxAgeMs?: number;
  } = {},
) {
  const maxAge = options.maxAgeMs ?? 30_000;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      const set = listeners.get(key) ?? new Set();
      set.add(cb);
      listeners.set(key, set);
      return () => set.delete(cb);
    },
    [key],
  );
  const snap = useSyncExternalStore(
    subscribe,
    () => (key ? ((snaps.get(key) as Snapshot<T>) ?? EMPTY) : EMPTY),
    () => EMPTY as Snapshot<T>,
  );
  useEffect(() => {
    if (!key) return;
    fetchers.set(key, () => fetcherRef.current());
    const s = snaps.get(key);
    if (!s || Date.now() - s.updatedAt > maxAge) load(key).catch(() => {});
    const onFocus = () => {
      const s = snaps.get(key);
      if (s && Date.now() - s.updatedAt > maxAge) load(key).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [key, maxAge]);
  const interval = key ? (options.refreshMs?.(snap.data) ?? null) : null;
  useEffect(() => {
    if (!key || !interval) return;
    const t = setInterval(
      () => load(key, undefined, true).catch(() => {}),
      interval,
    );
    return () => clearInterval(t);
  }, [key, interval]);
  return {
    ...snap,
    reload: () =>
      key ? load<T>(key, undefined, true) : Promise.resolve(undefined),
  };
}

/** GET JSON, retrying once on a 5xx (SQLite can be briefly busy while the worker writes). */
export async function getJSON<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { signal, cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return body as T;
    if (attempt === 0 && r.status >= 500) {
      await new Promise((res) => setTimeout(res, 400));
      continue;
    }
    throw new Error(body?.error || `Request failed (${r.status})`);
  }
}

/** POST JSON and invalidate the given cache prefixes on success. */
export async function postJSON<T = any>(
  url: string,
  body: unknown,
  invalidates: string[] = [],
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
  invalidates.forEach(invalidate);
  return d as T;
}
