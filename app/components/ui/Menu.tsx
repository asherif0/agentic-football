"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./primitives";
import s from "./menu.module.css";

export type MenuItem = {
  label: string;
  hint?: string;
  icon?: IconName;
  onSelect: () => void;
};

/** A button that opens a short list of actions. Escape or an outside click closes it. */
export function MenuButton({
  label,
  icon,
  items,
  size = "sm",
  variant = "outline",
  align = "end",
}: {
  label: string;
  icon?: IconName;
  items: MenuItem[];
  size?: "sm" | "md";
  variant?: "primary" | "solid" | "outline" | "ghost";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus(),
    );
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className={s.root} ref={root}>
      <Button
        size={size}
        variant={variant}
        icon={icon}
        iconRight="chevronDown"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      {open && (
        <div
          className={`${s.menu} ${align === "start" ? s.start : ""}`}
          role="menu"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const list = [
              ...(root.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ) ?? []),
            ];
            const i = list.indexOf(document.activeElement as HTMLButtonElement);
            list[
              (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length
            ]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={s.item}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} size={15} />}
              <span className={s.text}>
                <span>{item.label}</span>
                {item.hint && <span className={s.hint}>{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
