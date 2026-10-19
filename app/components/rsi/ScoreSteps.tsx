"use client";
import { useWidth, Legend } from "../charts/Charts";
import s from "./rsi.module.css";

export type StepPoint = {
  round: number;
  value: number | null;
  kind: "start" | "improved" | "no-better" | "rejected-early" | "other";
  label: string;
};

const H = 188,
  PAD = { l: 44, r: 14, t: 14, b: 28 };

/** Points per match by round: each candidate as a mark, the best so far as a step line. */
export function ScoreSteps({
  points,
  rounds,
}: {
  points: StepPoint[];
  rounds: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(280);
  const W = Math.max(width, 280),
    span = Math.max(1, rounds),
    x = (r: number) => PAD.l + (r / span) * (W - PAD.l - PAD.r),
    y = (v: number) => PAD.t + (1 - v / 3) * (H - PAD.t - PAD.b);
  const scored = points.filter((p) => p.value !== null);
  let best: number | null = null;
  const steps: { round: number; value: number }[] = [];
  for (const p of [...scored].sort((a, b) => a.round - b.round)) {
    if (p.kind === "start" || p.kind === "improved") best = p.value!;
    if (best !== null) steps.push({ round: p.round, value: best });
  }
  const last = steps.at(-1);
  const path = steps
    .map((p, i) =>
      i === 0 ? `M${x(p.round)},${y(p.value)}` : `H${x(p.round)}V${y(p.value)}`,
    )
    .join("");
  return (
    <div className={s.chart} ref={ref}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Points per match for the starting version and each round's candidate"
      >
        {[0, 1, 2, 3].map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              className={s.grid}
            />
            <text
              x={PAD.l - 10}
              y={y(v)}
              className={s.axis}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v} pts
            </text>
          </g>
        ))}
        {Array.from({ length: span + 1 }, (_, r) => (
          <text
            key={r}
            x={x(r)}
            y={H - 8}
            className={s.axis}
            textAnchor={r === 0 ? "start" : r === span ? "end" : "middle"}
          >
            {r === 0 ? "Start" : `R${r}`}
          </text>
        ))}
        {path && (
          <path
            d={last && last.round < span ? `${path}H${x(last.round)}` : path}
            className={s.stepLine}
            fill="none"
          />
        )}
        {scored.map((p) => (
          <g key={p.round}>
            <title>{p.label}</title>
            <circle
              cx={x(p.round)}
              cy={y(p.value!)}
              r={p.kind === "start" || p.kind === "improved" ? 6 : 5}
              className={s[`mark_${p.kind}`]}
            />
          </g>
        ))}
      </svg>
      <p className={s.note}>
        Equal points are split by goal difference, then shots on target, then
        fewer dangerous turnovers. Hover a mark for its full score.
      </p>
      <Legend
        items={[
          { label: "Best so far", color: "var(--text)", kind: "bar" },
          { label: "Improved", color: "var(--accent)", kind: "dot" },
          { label: "No better", color: "var(--chart-draw)", kind: "dot" },
          { label: "Rejected early", kind: "ring" },
        ]}
      />
    </div>
  );
}
