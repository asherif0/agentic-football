"use client";
import { useLayoutEffect, useRef } from "react";
import { ROLES, type Role } from "../../../lib/domain";
import type { Layout } from "../../../lib/simulation/types";
import { gsap, reducedMotion } from "../../lib/motion";
import { modelShort, seriesVar } from "../../lib/models";
import { PitchField } from "./PitchField";
import s from "./pitch.module.css";

/**
 * The squad on its starting layout (attacking right). Each player is ringed in
 * the colour of its model, so a mixed-model squad reads at a glance.
 */
export function LineupPitch({
  layout,
  models,
  selected,
  onSelect,
}: {
  layout: Layout;
  models: Record<Role, string>;
  selected?: Role | null;
  onSelect?: (role: Role) => void;
}) {
  const nodes = useRef(new Map<Role, SVGGElement>()),
    placed = useRef(false);
  useLayoutEffect(() => {
    for (const role of ROLES) {
      const el = nodes.current.get(role),
        p = layout[role];
      if (!el || !p) continue;
      const to = { x: p.x * 40, y: p.y * 20 };
      if (!placed.current || reducedMotion()) gsap.set(el, to);
      else
        gsap.to(el, {
          ...to,
          duration: 0.8,
          ease: "power3.inOut",
          delay: ROLES.indexOf(role) * 0.04,
        });
    }
    placed.current = true;
  }, [layout]);
  return (
    <PitchField label="Squad lineup">
      <text className={s.dir} x={39.6} y={21.15} textAnchor="end">
        Attack →
      </text>
      {ROLES.map((role) => (
        <g
          key={role}
          ref={(el) => {
            if (el) nodes.current.set(role, el);
            else nodes.current.delete(role);
          }}
          className={`${s.player} ${s.ours}`}
          role="button"
          tabIndex={0}
          aria-pressed={selected === role}
          aria-label={`${role}: ${models[role]}`}
          onClick={() => onSelect?.(role)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(role);
            }
          }}
        >
          <circle className={s.hit} r={1.8} />
          {selected === role && <circle className={s.select} r={1.75} />}
          <circle
            className={s.modelRing}
            r={1.32}
            style={{
              stroke: seriesVar(models[role]),
              transition: "stroke .3s",
            }}
          />
          <circle className={s.disc} r={1.0} />
          <text className={s.role} style={{ fontSize: "0.5px" }}>
            {role}
          </text>
          <text className={s.lineupModel} y={2.35}>
            {modelShort(models[role])}
          </text>
        </g>
      ))}
    </PitchField>
  );
}
