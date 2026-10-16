"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PreparationGate, PreparationProvider } from "../Preparation";
import { Button, Skeleton } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import { NavRail } from "./NavRail";
import { SquadChip } from "./SquadChip";
import { ThemeToggle } from "./ThemeToggle";
import { Toaster } from "./Toaster";
import { LIBRARY, NAV, activeHref } from "./nav";
import s from "./shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false),
    pathname = usePathname(),
    current = [...NAV, LIBRARY].find((n) => n.href === activeHref(pathname));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.getElementById("menu-button")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <PreparationProvider>
      <a href="#content" className="sr-only">
        Skip to content
      </a>
      <div className={s.shell}>
        {open && (
          <button
            className={s.backdrop}
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <NavRail open={open} onNavigate={() => setOpen(false)} />
        <div className={s.main}>
          <header className={s.topbar}>
            <Button
              id="menu-button"
              className={s.menuButton}
              variant="ghost"
              icon="menu"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="main-navigation"
              onClick={() => setOpen(true)}
            />
            <div className={s.crumbs}>
              <span>Lab</span>
              <Icon name="chevronRight" size={14} />
              <strong>{current?.label ?? "Lab"}</strong>
            </div>
            <div className={s.topRight}>
              <SquadChip />
              <ThemeToggle />
            </div>
          </header>
          <main id="content" className={s.content} tabIndex={-1}>
            <PreparationGate
              fallback={
                <div style={{ display: "grid", gap: 16 }} aria-label="Loading">
                  <Skeleton height={14} width={120} />
                  <Skeleton height={44} width="40%" />
                  <Skeleton height={320} />
                </div>
              }
            >
              {children}
            </PreparationGate>
          </main>
        </div>
        <Toaster />
      </div>
    </PreparationProvider>
  );
}
