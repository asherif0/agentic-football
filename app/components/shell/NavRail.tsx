"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { gsap, reducedMotion } from "../../lib/motion";
import { Icon } from "../ui/Icon";
import { BrandMark } from "./BrandMark";
import { LIBRARY, NAV, activeHref } from "./nav";
import { WorkerStatus } from "./WorkerStatus";
import s from "./shell.module.css";

export function NavRail({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname(),
    active = activeHref(pathname),
    nav = useRef<HTMLDivElement>(null),
    indicator = useRef<HTMLSpanElement>(null),
    placed = useRef(false);
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!indicator.current) return;
    if (!el) {
      gsap.to(indicator.current, { opacity: 0, duration: 0.2 });
      return;
    }
    const to = { y: el.offsetTop, opacity: 1 };
    if (!placed.current || reducedMotion()) gsap.set(indicator.current, to);
    else
      gsap.to(indicator.current, { ...to, duration: 0.45, ease: "power3.out" });
    placed.current = true;
  }, [active]);
  const item = (n: (typeof NAV)[number] | typeof LIBRARY) => (
    <Link
      key={n.href}
      href={n.href}
      className={s.navItem}
      aria-current={active === n.href ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon name={n.icon} size={18} />
      <span>{n.label}</span>
      {"step" in n && n.step && <span className={s.navStep}>{n.step}</span>}
    </Link>
  );
  return (
    <aside
      id="main-navigation"
      className={`${s.rail} ${open ? s.railOpen : ""}`}
      aria-label="Main"
    >
      <Link href="/" className={s.brand} onClick={onNavigate}>
        <BrandMark className={s.brandMark} />
        <span className={s.brandText}>
          <span className={s.brandName}>Agentic Football</span>
          <span className={s.brandSub}>Lab · 5v5</span>
        </span>
      </Link>
      <nav ref={nav} className={s.nav} aria-label="Primary">
        <span ref={indicator} className={s.indicator} aria-hidden="true" />
        <span className={s.navLabel}>Workflow</span>
        {NAV.map(item)}
        <span className={s.navLabel} style={{ marginTop: 18 }}>
          Reference
        </span>
        {item(LIBRARY)}
      </nav>
      <div className={s.railFoot}>
        <WorkerStatus />
      </div>
    </aside>
  );
}
