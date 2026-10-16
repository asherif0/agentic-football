import type { ReactNode, Ref, SVGProps } from "react";
import s from "./pitch.module.css";

export const VIEWBOX = "-1.6 -1.6 43.2 23.2";

/** Static futsal markings in engine units (40 × 20, origin top-left). */
export function PitchMarkings({ grid = true }: { grid?: boolean }) {
  return (
    <g aria-hidden="true">
      {[0, 8, 16, 24, 32].map((x) => (
        <rect key={x} className={s.stripe} x={x} y={0} width={4} height={20} />
      ))}
      {grid && (
        <g className={s.grid}>
          {[5, 10, 15, 25, 30, 35].map((x) => (
            <line key={"x" + x} x1={x} y1={0} x2={x} y2={20} />
          ))}
          {[5, 15].map((y) => (
            <line key={"y" + y} x1={0} y1={y} x2={40} y2={y} />
          ))}
        </g>
      )}
      <g className={s.lines}>
        <rect x={0} y={0} width={40} height={20} rx={0.3} />
        <line x1={20} y1={0} x2={20} y2={20} />
        <circle cx={20} cy={10} r={3} />
        <circle className={s.spot} cx={20} cy={10} r={0.16} />
        <path d="M0 4 A6 6 0 0 1 6 10 A6 6 0 0 1 0 16" />
        <path d="M40 4 A6 6 0 0 0 34 10 A6 6 0 0 0 40 16" />
        <circle className={s.spot} cx={6} cy={10} r={0.14} />
        <circle className={s.spot} cx={34} cy={10} r={0.14} />
        <rect className={s.goal} x={-1} y={8.5} width={1} height={3} />
        <rect className={s.goal} x={40} y={8.5} width={1} height={3} />
      </g>
    </g>
  );
}

export function PitchField({
  children,
  label,
  grid,
  ref,
  ...rest
}: {
  children?: ReactNode;
  label: string;
  grid?: boolean;
  ref?: Ref<SVGSVGElement>;
} & Omit<SVGProps<SVGSVGElement>, "ref">) {
  return (
    <svg
      ref={ref}
      viewBox={VIEWBOX}
      className={s.svg}
      role="group"
      aria-label={label}
      {...rest}
    >
      <PitchMarkings grid={grid} />
      {children}
    </svg>
  );
}
