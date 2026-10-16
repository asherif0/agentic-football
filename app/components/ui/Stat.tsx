"use client";
import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, reducedMotion } from "../../lib/motion";
import s from "./ui.module.css";

/** A KPI whose number counts up the first time it appears. */
export function Stat({
  label,
  value,
  format = (n) => String(Math.round(n)),
  sub,
  text,
}: {
  label: ReactNode;
  value: number | null;
  format?: (n: number) => string;
  sub?: ReactNode;
  text?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    shown = useRef<number | null>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || value === null || text) return;
      if (reducedMotion() || shown.current === value) {
        el.textContent = format(value);
        shown.current = value;
        return;
      }
      const o = { n: shown.current ?? 0 };
      gsap.to(o, {
        n: value,
        duration: shown.current === null ? 1.1 : 0.6,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = format(o.n);
        },
        onComplete: () => {
          el.textContent = format(value);
        },
      });
      shown.current = value;
    },
    { dependencies: [value, text] },
  );
  return (
    <div className={s.stat}>
      <span className="eyebrow">{label}</span>
      <span ref={ref} className={s.statValue}>
        {text ?? (value === null ? "—" : format(value))}
      </span>
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}
