"use client";
import { useEffect, useRef } from "react";
import { dismiss, useToasts } from "../../lib/toast";
import { gsap, reducedMotion } from "../../lib/motion";
import s from "./shell.module.css";

export function Toaster() {
  const toasts = useToasts(),
    ref = useRef<HTMLDivElement>(null),
    seen = useRef(new Set<number>());
  useEffect(() => {
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      const el = ref.current?.querySelector(`[data-toast="${t.id}"]`);
      if (el && !reducedMotion())
        gsap.from(el, { y: 16, autoAlpha: 0, duration: 0.4 });
    }
  }, [toasts]);
  return (
    <div ref={ref} className={s.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-toast={t.id}
          className={`${s.toast} ${t.tone === "error" ? s.toastError : ""}`}
        >
          <span className={s.toastMark} />
          <span>{t.message}</span>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
