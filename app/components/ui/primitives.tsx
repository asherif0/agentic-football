"use client";
import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ReactNode,
  HTMLAttributes,
  Ref,
} from "react";
import { Icon, type IconName } from "./Icon";
import { modelShort, seriesVar } from "../../lib/models";
import { ROLES, type Role } from "../../../lib/domain";
import s from "./ui.module.css";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");
export { cx };

type ButtonProps = {
  variant?: "primary" | "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  href?: string;
  external?: boolean;
  /** Renders a plain anchor that saves the response under this file name. */
  download?: string;
  ref?: Ref<HTMLButtonElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "outline",
  size = "md",
  icon,
  iconRight,
  href,
  external,
  download,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && !!icon;
  const cls = cx(
    s.button,
    s[variant],
    size !== "md" && s[size],
    iconOnly && s.iconOnly,
    className,
  );
  const iconSize = size === "sm" ? 14 : 16;
  const inner = (
    <>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && (
        <Icon
          name={iconRight}
          size={iconSize}
          className={iconRight === "arrowRight" ? s.arrow : undefined}
        />
      )}
    </>
  );
  if (href && download)
    return (
      <a href={href} download={download} className={cls}>
        {inner}
      </a>
    );
  if (href)
    return external ? (
      <a
        href={href}
        className={cls}
        target="_blank"
        rel="noreferrer"
        aria-label={rest["aria-label"]}
      >
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls} aria-label={rest["aria-label"]}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}

export function Card({
  title,
  sub,
  eyebrow,
  actions,
  pad = true,
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  sub?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  pad?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={cx(s.card, pad && s.cardPad, className)} {...rest}>
      {(title || actions || eyebrow) && (
        <header className={s.cardHead}>
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className={s.cardTitle}>{title}</h2>}
            {sub && <p className={s.cardSub}>{sub}</p>}
          </div>
          {actions && <div className={s.cardActions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({
  tone = "neutral",
  dot,
  children,
  title,
}: {
  tone?: "neutral" | "lime" | "solid" | "good" | "warn" | "bad";
  dot?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      className={cx(s.badge, tone !== "neutral" && s[`badge_${tone}`])}
      title={title}
    >
      {dot && <span className={s.badgeDot} />}
      {children}
    </span>
  );
}

export function Chip({
  pressed,
  swatch,
  children,
  ...rest
}: {
  pressed?: boolean;
  swatch?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={s.chip} aria-pressed={pressed} {...rest}>
      {swatch && <span className={s.swatch} style={{ background: swatch }} />}
      {children}
    </button>
  );
}

export function ModelChip({
  model,
  short,
}: {
  model: string;
  short?: boolean;
}) {
  return (
    <span className={s.modelChip} title={model}>
      <span className={s.swatch} style={{ background: seriesVar(model) }} />
      {short ? modelShort(model) : model}
    </span>
  );
}

/** Five bars, one per position, coloured by that position's model. */
export function ModelMix({
  models,
}: {
  models: Partial<Record<Role, string>>;
}) {
  return (
    <span
      className={s.modelMix}
      role="img"
      aria-label={ROLES.map((r) => `${r} ${models[r] ?? "unset"}`).join(", ")}
    >
      {ROLES.map((r) => (
        <span key={r} style={{ background: seriesVar(models[r] ?? "") }} />
      ))}
    </span>
  );
}

export function Field({
  label,
  hint,
  aside,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx(s.field, className)}>
      <span className={s.fieldLabel}>
        <span>{label}</span>
        {aside}
      </span>
      {children}
      {hint && <span className={s.fieldHint}>{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon = "info",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <Icon name={icon} />
      </span>
      <p className={s.emptyTitle}>{title}</p>
      {children && <p className={s.emptyBody}>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({
  height = 16,
  width = "100%",
  radius,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
}) {
  return (
    <div
      className={s.skeleton}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function Notice({
  tone = "neutral",
  icon = "info",
  children,
}: {
  tone?: "neutral" | "warn" | "bad" | "lime";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(s.notice, tone !== "neutral" && s[`notice_${tone}`])}
      role={tone === "bad" ? "alert" : undefined}
    >
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function DataTable({
  columns,
  children,
  label,
}: {
  columns: ReactNode[];
  children: ReactNode;
  label: string;
}) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
