"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, reducedMotion } from "../../lib/motion";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";
import { cx } from "./primitives";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: IconName;
  title?: string;
};

/** Radio-style toggle with a sliding thumb. Arrow keys move the selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  full,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  full?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    thumb = useRef<HTMLSpanElement>(null),
    placed = useRef(false);
  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(
      '[aria-checked="true"]',
    );
    if (!el || !thumb.current) return;
    const to = { x: el.offsetLeft, width: el.offsetWidth };
    if (!placed.current || reducedMotion()) gsap.set(thumb.current, to);
    else gsap.to(thumb.current, { ...to, duration: 0.35, ease: "power3.out" });
    placed.current = true;
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const active = el.querySelector<HTMLElement>('[aria-checked="true"]');
      if (active && thumb.current)
        gsap.set(thumb.current, {
          x: active.offsetLeft,
          width: active.offsetWidth,
        });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className={cx(
        s.segmented,
        full && s.segmentedFull,
        size === "sm" && s.segmentSm,
        className,
      )}
      onKeyDown={(e) => {
        const d =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : 0;
        if (!d) return;
        e.preventDefault();
        const next = options[(index + d + options.length) % options.length];
        onChange(next.value);
        requestAnimationFrame(() =>
          root.current
            ?.querySelector<HTMLElement>('[aria-checked="true"]')
            ?.focus(),
        );
      }}
    >
      <span
        ref={thumb}
        className={s.thumb}
        aria-hidden="true"
        style={{ width: 0 }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={s.segment}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={size === "sm" ? 14 : 15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
