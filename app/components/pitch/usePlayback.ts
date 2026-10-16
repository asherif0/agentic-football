"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { gsap } from "../../lib/motion";

export type PlaybackSnapshot = {
  time: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  end: number;
};

/**
 * Replay clock driven by gsap.ticker. Drawing code subscribes with onTick and
 * mutates the DOM directly every frame; React subscribes to a ~10 Hz snapshot.
 */
export function createPlayback() {
  let time = 0,
    playing = false,
    speed = 1,
    end = 0,
    follow = false,
    dirty = true,
    lastEmit = 0,
    snap: PlaybackSnapshot = { time, playing, speed, follow, end };
  const tickers = new Set<(t: number, seeked: boolean) => void>(),
    listeners = new Set<() => void>();
  let seeked = false;
  const emit = (force = false) => {
    const now = performance.now();
    if (!force && now - lastEmit < 90) return;
    lastEmit = now;
    snap = { time, playing, speed, follow, end };
    listeners.forEach((l) => l());
  };
  const tick = (_t: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 100) / 1000;
    if (follow) {
      const target = Math.max(0, end - 0.5);
      time =
        Math.abs(target - time) > 3
          ? target
          : time + (target - time) * Math.min(1, dt * 4);
      dirty = true;
    } else if (playing) {
      time = Math.min(end, time + dt * speed);
      dirty = true;
      if (time >= end) {
        playing = false;
        emit(true);
      }
    }
    if (dirty) {
      tickers.forEach((f) => f(time, seeked));
      seeked = false;
      dirty = false;
      emit();
    }
  };
  return {
    tick,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => snap,
    onTick(fn: (t: number, seeked: boolean) => void) {
      tickers.add(fn);
      dirty = true;
      return () => {
        tickers.delete(fn);
      };
    },
    play() {
      if (time >= end - 0.01) time = 0;
      follow = false;
      playing = true;
      dirty = true;
      emit(true);
    },
    pause() {
      playing = false;
      emit(true);
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    seek(t: number) {
      time = Math.max(0, Math.min(end, t));
      follow = false;
      seeked = true;
      dirty = true;
      emit(true);
    },
    skip(delta: number) {
      this.seek(time + delta);
    },
    setSpeed(s: number) {
      speed = s;
      emit(true);
    },
    setEnd(e: number) {
      end = Math.max(0, e);
      if (time > end) time = end;
      dirty = true;
      emit(true);
    },
    setFollow(f: boolean) {
      follow = f;
      if (f) playing = false;
      dirty = true;
      emit(true);
    },
    redraw() {
      dirty = true;
    },
    get time() {
      return time;
    },
  };
}
export type Playback = ReturnType<typeof createPlayback>;

/** One playback clock per mounted viewer; the ticker is removed on unmount. */
export function usePlayback() {
  const pb = useMemo(() => createPlayback(), []);
  useEffect(() => {
    gsap.ticker.add(pb.tick);
    return () => gsap.ticker.remove(pb.tick);
  }, [pb]);
  return pb;
}

export function usePlaybackState(pb: Playback) {
  return useSyncExternalStore(pb.subscribe, pb.getSnapshot, pb.getSnapshot);
}
