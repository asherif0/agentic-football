"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, reducedMotion } from "../../lib/motion";
import { Button, cx } from "./primitives";
import s from "./ui.module.css";

function useOverlay(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLElement>(
          "[data-autofocus],button,input,select,textarea",
        )
        ?.focus(),
    );
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, onClose]);
  return panel;
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useOverlay(open, onClose);
  useEffect(() => {
    if (open && panel.current && !reducedMotion())
      // fromTo, not from: Strict Mode runs effects twice in dev, and a second
      // `from` would treat the half-faded state as its end point.
      gsap.fromTo(
        panel.current,
        { x: 48, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, duration: 0.45 },
      );
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={s.overlay} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx(s.drawer, wide && s.drawerWide)}
      >
        <header className={s.panelHead}>
          <div>
            <h2 className={s.panelTitle}>{title}</h2>
            {sub && (
              <p
                className="muted"
                style={{ marginTop: 4, fontSize: "var(--fs-small)" }}
              >
                {sub}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            aria-label="Close"
            onClick={onClose}
          />
        </header>
        <div className={s.panelBody}>{children}</div>
        {footer && <footer className={s.panelFoot}>{footer}</footer>}
      </div>
    </>,
    document.body,
  );
}

export function Dialog({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  small,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  small?: boolean;
  /** Fits two prompts side by side; stacks on phones. */
  wide?: boolean;
}) {
  const panel = useOverlay(open, onClose);
  useEffect(() => {
    if (open && panel.current && !reducedMotion())
      gsap.fromTo(
        panel.current,
        { y: 16, scale: 0.98, autoAlpha: 0 },
        { y: 0, scale: 1, autoAlpha: 1, duration: 0.4 },
      );
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={s.overlay} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx(s.dialog, small && s.dialogSm, wide && s.dialogWide)}
      >
        <header className={s.panelHead}>
          <div>
            <h2 className={s.panelTitle}>{title}</h2>
            {sub && (
              <p
                className="muted"
                style={{ marginTop: 4, fontSize: "var(--fs-small)" }}
              >
                {sub}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            aria-label="Close"
            onClick={onClose}
          />
        </header>
        <div className={s.panelBody}>{children}</div>
        {footer && <footer className={s.panelFoot}>{footer}</footer>}
      </div>
    </>,
    document.body,
  );
}
