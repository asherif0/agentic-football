"use client";
import { useSyncExternalStore } from "react";

export type Toast = {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
};
let toasts: Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: Toast["tone"] = "info") {
  const t = { id: next++, message, tone };
  toasts = [...toasts, t].slice(-4);
  emit();
  setTimeout(() => dismiss(t.id), tone === "error" ? 7000 : 3800);
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
const EMPTY: Toast[] = [];
export function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => EMPTY,
  );
}
