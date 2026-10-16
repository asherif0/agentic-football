import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { NAV } from "./nav";
import s from "./page.module.css";

export function PageHeader({
  step,
  eyebrow,
  title,
  description,
  actions,
}: {
  step?: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={s.header} data-reveal>
      <div className={s.headText}>
        <span className={s.step}>
          {step && <span className={s.stepNum}>{step}</span>}
          <span className="eyebrow">{eyebrow}</span>
        </span>
        <h1 className={s.title}>{title}</h1>
        {description && <p className={s.description}>{description}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}

/** The guided hand-off to the next stage of the journey. */
export function NextStep({ href }: { href: string }) {
  const n = NAV.find((x) => x.href === href);
  if (!n) return null;
  return (
    <Link href={n.href} className={s.next} data-reveal>
      <span className={s.nextStep}>Next · {n.step}</span>
      <span>
        <span className={s.nextTitle}>{n.label}</span>
        <p className={s.nextBlurb}>{n.blurb}</p>
      </span>
      <span className={s.nextArrow}>
        <Icon name="arrowRight" />
      </span>
    </Link>
  );
}
