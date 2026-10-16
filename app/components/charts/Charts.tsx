"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, useGSAP, reducedMotion } from "../../lib/motion";
import { Segmented } from "../ui/Segmented";
import s from "./charts.module.css";

/* ───────── shared helpers ───────── */

export type Shape = "circle" | "square" | "diamond";
export type ChartRow = {
  id: string;
  label: string;
  sub?: string;
  group?: string;
  color: string;
  shape?: Shape;
};
type Tip = {
  x: number;
  y: number;
  title: string;
  rows: [string, string][];
} | null;

export function useWidth<T extends HTMLElement>(min = 240) {
  const ref = useRef<T>(null),
    [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) =>
      setWidth(Math.max(min, e[0].contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}

/** Round, human tick values covering [min, max]. */
export function ticks(min: number, max: number, count = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count,
    pow = Math.pow(10, Math.floor(Math.log10(raw))),
    step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
    out.push(Number(v.toFixed(10)));
  return out;
}
const scale =
  (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
    d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Bars grow and dots pop the first time a chart gets data. */
function useDrawIn(key: string) {
  const ref = useRef<SVGSVGElement>(null),
    done = useRef(false);
  useGSAP(
    () => {
      if (!ref.current || !key || done.current) return;
      done.current = true;
      if (reducedMotion()) return;
      const grow = ref.current.querySelectorAll("[data-anim=grow]"),
        pop = ref.current.querySelectorAll("[data-anim=pop]");
      if (grow.length)
        gsap.from(grow, {
          scaleX: 0,
          transformOrigin: "0% 50%",
          duration: 0.8,
          stagger: 0.03,
          ease: "power3.out",
        });
      if (pop.length)
        gsap.from(pop, {
          scale: 0,
          transformOrigin: "50% 50%",
          duration: 0.5,
          stagger: 0.03,
          delay: 0.25,
          ease: "back.out(2)",
        });
    },
    { dependencies: [key] },
  );
  return ref;
}

export function MarkShape({
  shape = "circle",
  x,
  y,
  r = 5,
  color,
  ...rest
}: {
  shape?: Shape;
  x: number;
  y: number;
  r?: number;
  color: string;
} & React.SVGProps<SVGElement>) {
  const style = { fill: color };
  if (shape === "square")
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={1.5}
        style={style}
        className={`${s.mark} ${s.dotRing}`}
        {...(rest as any)}
      />
    );
  if (shape === "diamond")
    return (
      <path
        d={`M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z`}
        style={style}
        className={`${s.mark} ${s.dotRing}`}
        {...(rest as any)}
      />
    );
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      style={style}
      className={`${s.mark} ${s.dotRing}`}
      {...(rest as any)}
    />
  );
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className={s.tooltip}
      style={{ left: tip.x, top: tip.y }}
      role="status"
    >
      <strong>{tip.title}</strong>
      {tip.rows.map(([k, v]) => (
        <div key={k} className={s.tipRow}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export type LegendItem = {
  label: string;
  color?: string;
  kind?: "bar" | "dot" | "ring" | "square";
};
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className={s.legend}>
      {items.map((i) => (
        <span key={i.label} className={s.legendItem}>
          <span
            className={`${s.sw} ${i.kind === "dot" ? s.swDot : i.kind === "ring" ? s.swRing : i.kind === "square" ? s.swSquare : ""}`}
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Card with title, legend, and a chart ↔ table toggle. */
export function ChartFrame({
  title,
  sub,
  legend,
  tools,
  table,
  foot,
  children,
  className,
}: {
  title: string;
  sub?: ReactNode;
  legend?: LegendItem[];
  tools?: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  foot?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={`${s.frame} ${className ?? ""}`} data-reveal>
      <header className={s.head}>
        <div>
          <h2 className={s.title}>{title}</h2>
          {sub && <p className={s.sub}>{sub}</p>}
        </div>
        <div className={s.tools}>
          {tools}
          <Segmented
            size="sm"
            label={`${title} view`}
            value={view}
            onChange={setView}
            options={[
              {
                value: "chart",
                icon: "chart",
                label: <span className="sr-only">Chart</span>,
                title: "Chart",
              },
              {
                value: "table",
                icon: "table",
                label: <span className="sr-only">Table</span>,
                title: "Table",
              },
            ]}
          />
        </div>
      </header>
      {legend && view === "chart" && <Legend items={legend} />}
      {view === "chart" ? (
        children
      ) : (
        <div className={s.table}>
          <table aria-label={title}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {foot && <p className={s.foot}>{foot}</p>}
    </section>
  );
}

/* ───────── row-based layout (labels left, marks right) ───────── */

const ROW = 40,
  GROUP = 28,
  AXIS = 26;
function layoutRows<T extends ChartRow>(rows: T[]) {
  let y = 0;
  const placed: (T & { y: number })[] = [],
    groups: { label: string; y: number }[] = [];
  let last: string | undefined;
  for (const r of rows) {
    if (r.group && r.group !== last) {
      groups.push({ label: r.group, y: y + 18 });
      y += GROUP;
      last = r.group;
    }
    placed.push({ ...r, y: y + ROW / 2 });
    y += ROW;
  }
  return { placed, groups, height: y };
}

function RowLabels({
  placed,
  groups,
  labelW,
}: {
  placed: (ChartRow & { y: number })[];
  groups: { label: string; y: number }[];
  labelW: number;
}) {
  return (
    <>
      {groups.map((g) => (
        <text key={g.label} className={s.groupLabel} x={0} y={g.y}>
          {g.label}
        </text>
      ))}
      {placed.map((r) => (
        <g key={r.id}>
          <circle
            cx={5}
            cy={r.y - (r.sub ? 6 : 0)}
            r={4}
            style={{ fill: r.color }}
          />
          <text
            className={s.rowLabel}
            x={16}
            y={r.y - (r.sub ? 6 : 0)}
            dominantBaseline="central"
          >
            {clip(r.label, labelW - 18)}
          </text>
          {r.sub && (
            <text
              className={s.rowSub}
              x={16}
              y={r.y + 9}
              dominantBaseline="central"
            >
              {clip(r.sub, labelW - 18)}
            </text>
          )}
        </g>
      ))}
    </>
  );
}
const clip = (t: string, px: number) => {
  const max = Math.max(4, Math.floor(px / 6.6));
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/* ───────── W / D / L stacked bars ───────── */

export function ResultBars({
  rows,
}: {
  rows: (ChartRow & { w: number; d: number; l: number; note?: string })[];
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null),
    [active, setActive] = useState<string | null>(null);
  const svg = useDrawIn(width ? rows.map((r) => r.id).join() : "");
  const { placed, groups, height } = layoutRows(rows);
  const labelW = Math.min(230, width * 0.38),
    noteW = 64,
    x0 = labelW + 8,
    x1 = Math.max(x0 + 40, width - noteW),
    max = Math.max(1, ...rows.map((r) => r.w + r.d + r.l)),
    x = scale(0, max, x0, x1);
  const bar = 12;
  return (
    <div ref={box} className={`${s.plot} ${active ? s.dim : ""}`}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height + AXIS}
          role="img"
          aria-label="Wins, draws and losses per configuration"
        >
          {ticks(0, max, Math.min(max, 5)).map((t) => (
            <g key={t}>
              <line className={s.grid} x1={x(t)} x2={x(t)} y1={0} y2={height} />
              <text
                className={s.tick}
                x={x(t)}
                y={height + 16}
                textAnchor="middle"
              >
                {t}
              </text>
            </g>
          ))}
          <RowLabels placed={placed} groups={groups} labelW={labelW} />
          {placed.map((r) => {
            let at = x0;
            const segs = (
              [
                ["Wins", r.w, "var(--chart-win)"],
                ["Draws", r.d, "var(--chart-draw)"],
                ["Losses", r.l, "var(--chart-loss)"],
              ] as const
            ).map(([k, v, c]) => {
              const w = Math.max(0, x(v) - x0 - (v ? 2 : 0));
              const el = v ? (
                <rect
                  key={k}
                  className={s.mark}
                  data-anim="grow"
                  x={at}
                  y={r.y - bar / 2}
                  width={w}
                  height={bar}
                  rx={3}
                  style={{ fill: c }}
                />
              ) : null;
              at += v ? w + 2 : 0;
              return el;
            });
            return (
              <g
                key={r.id}
                className={s.hitRow}
                data-active={active === r.id}
                onMouseEnter={() => {
                  setActive(r.id);
                  setTip({
                    x: x0 + (at - x0) / 2,
                    y: r.y - 8,
                    title: r.label,
                    rows: [
                      ["Wins", String(r.w)],
                      ["Draws", String(r.d)],
                      ["Losses", String(r.l)],
                      ...(r.note
                        ? [["GD / 60", r.note] as [string, string]]
                        : []),
                    ],
                  });
                }}
                onMouseLeave={() => {
                  setActive(null);
                  setTip(null);
                }}
              >
                <rect
                  className={s.rowBg}
                  x={x0 - 4}
                  y={r.y - ROW / 2 + 2}
                  width={width - x0 + 4}
                  height={ROW - 4}
                  rx={6}
                />
                {segs}
                <text
                  className={s.valueStrong}
                  x={width}
                  y={r.y}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {r.note ?? `${r.w}-${r.d}-${r.l}`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────── diverging lollipop (e.g. goal difference per 60) ───────── */

export function Lollipop({
  rows,
  format = (n) => n.toFixed(1),
  label = "Value",
}: {
  rows: (ChartRow & { value: number | null; detail?: [string, string][] })[];
  format?: (n: number) => string;
  label?: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null),
    [active, setActive] = useState<string | null>(null);
  const svg = useDrawIn(width ? rows.map((r) => r.id).join() : "");
  const { placed, groups, height } = layoutRows(rows);
  const labelW = Math.min(230, width * 0.38),
    x0 = labelW + 24,
    x1 = width - 44,
    m = Math.max(0.5, ...rows.map((r) => Math.abs(r.value ?? 0))) * 1.1,
    x = scale(-m, m, x0, x1);
  return (
    <div ref={box} className={`${s.plot} ${active ? s.dim : ""}`}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height + AXIS}
          role="img"
          aria-label={label}
        >
          {ticks(-m, m, 4).map((t) => (
            <g key={t}>
              <line
                className={t === 0 ? s.zero : s.grid}
                x1={x(t)}
                x2={x(t)}
                y1={0}
                y2={height}
              />
              <text
                className={s.tick}
                x={x(t)}
                y={height + 16}
                textAnchor="middle"
              >
                {t > 0 ? "+" + format(t) : format(t)}
              </text>
            </g>
          ))}
          <RowLabels placed={placed} groups={groups} labelW={labelW} />
          {placed.map((r) => {
            if (r.value === null) return null;
            const vx = x(r.value),
              zx = x(0);
            return (
              <g
                key={r.id}
                className={s.hitRow}
                data-active={active === r.id}
                onMouseEnter={() => {
                  setActive(r.id);
                  setTip({
                    x: vx,
                    y: r.y - 8,
                    title: r.label,
                    rows: [
                      [label, (r.value! > 0 ? "+" : "") + format(r.value!)],
                      ...(r.detail ?? []),
                    ],
                  });
                }}
                onMouseLeave={() => {
                  setActive(null);
                  setTip(null);
                }}
              >
                <rect
                  className={s.rowBg}
                  x={x0 - 4}
                  y={r.y - ROW / 2 + 2}
                  width={width - x0 + 4}
                  height={ROW - 4}
                  rx={6}
                />
                <line
                  className={`${s.mark} ${s.stem}`}
                  data-anim="grow"
                  x1={Math.min(zx, vx)}
                  x2={Math.max(zx, vx)}
                  y1={r.y}
                  y2={r.y}
                  style={{
                    stroke: r.color,
                    transformOrigin: r.value < 0 ? "100% 50%" : undefined,
                  }}
                />
                <g data-anim="pop">
                  <MarkShape shape={r.shape} x={vx} y={r.y} color={r.color} />
                </g>
                <text
                  className={s.valueStrong}
                  x={r.value >= 0 ? vx + 12 : vx - 12}
                  y={r.y}
                  textAnchor={r.value >= 0 ? "start" : "end"}
                  dominantBaseline="central"
                >
                  {(r.value > 0 ? "+" : r.value < 0 ? "−" : "") +
                    format(Math.abs(r.value))}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────── range plot (median → p95) ───────── */

export function RangePlot({
  rows,
  format,
}: {
  rows: (ChartRow & {
    low: number | null;
    high: number | null;
    detail?: [string, string][];
  })[];
  format: (n: number) => string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null),
    [active, setActive] = useState<string | null>(null);
  const svg = useDrawIn(width ? rows.map((r) => r.id).join() : "");
  const { placed, groups, height } = layoutRows(rows);
  const labelW = Math.min(230, width * 0.38),
    x0 = labelW + 12,
    x1 = width - 96,
    max = Math.max(1, ...rows.map((r) => r.high ?? r.low ?? 0)) * 1.05,
    x = scale(0, max, x0, x1);
  return (
    <div ref={box} className={`${s.plot} ${active ? s.dim : ""}`}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height + AXIS}
          role="img"
          aria-label="Decision latency, median to 95th percentile"
        >
          {ticks(0, max, 4).map((t) => (
            <g key={t}>
              <line className={s.grid} x1={x(t)} x2={x(t)} y1={0} y2={height} />
              <text
                className={s.tick}
                x={x(t)}
                y={height + 16}
                textAnchor="middle"
              >
                {format(t)}
              </text>
            </g>
          ))}
          <RowLabels placed={placed} groups={groups} labelW={labelW} />
          {placed.map((r) => {
            if (r.low === null) return null;
            const lo = x(r.low),
              hi = x(r.high ?? r.low);
            return (
              <g
                key={r.id}
                className={s.hitRow}
                data-active={active === r.id}
                onMouseEnter={() => {
                  setActive(r.id);
                  setTip({
                    x: (lo + hi) / 2,
                    y: r.y - 8,
                    title: r.label,
                    rows: [
                      ["Median", format(r.low!)],
                      [
                        "95th percentile",
                        r.high === null ? "—" : format(r.high),
                      ],
                      ...(r.detail ?? []),
                    ],
                  });
                }}
                onMouseLeave={() => {
                  setActive(null);
                  setTip(null);
                }}
              >
                <rect
                  className={s.rowBg}
                  x={x0 - 4}
                  y={r.y - ROW / 2 + 2}
                  width={width - x0 + 4}
                  height={ROW - 4}
                  rx={6}
                />
                <rect
                  className={s.mark}
                  data-anim="grow"
                  x={x0}
                  y={r.y - 1}
                  width={Math.max(0, lo - x0)}
                  height={2}
                  style={{ fill: "var(--chart-grid)" }}
                />
                <rect
                  className={s.mark}
                  data-anim="grow"
                  x={lo}
                  y={r.y - 5}
                  width={Math.max(2, hi - lo)}
                  height={10}
                  rx={5}
                  style={{ fill: r.color, opacity: 0.35 }}
                />
                <g data-anim="pop">
                  <MarkShape shape={r.shape} x={lo} y={r.y} color={r.color} />
                </g>
                <line
                  className={s.mark}
                  x1={hi}
                  x2={hi}
                  y1={r.y - 7}
                  y2={r.y + 7}
                  style={{ stroke: r.color, strokeWidth: 2 }}
                />
                <text
                  className={s.value}
                  x={width}
                  y={r.y}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {format(r.low)} · {r.high === null ? "—" : format(r.high)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────── scatter ───────── */

export function Scatter({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  height = 300,
}: {
  points: (ChartRow & {
    x: number | null;
    y: number | null;
    detail?: [string, string][];
  })[];
  xLabel: string;
  yLabel: string;
  formatX: (n: number) => string;
  formatY: (n: number) => string;
  height?: number;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null),
    [active, setActive] = useState<string | null>(null);
  const valid = points.filter(
    (p) => p.x !== null && p.y !== null,
  ) as (ChartRow & { x: number; y: number; detail?: [string, string][] })[];
  const svg = useDrawIn(width ? valid.map((r) => r.id).join() : "");
  const left = 48,
    right = 16,
    top = 12,
    bottom = 40;
  const xs = valid.map((p) => p.x),
    ys = valid.map((p) => p.y);
  const xMin = 0,
    xMax = Math.max(1, ...xs) * 1.1,
    yAbs = Math.max(0.5, ...ys.map(Math.abs)) * 1.2,
    yMin = Math.min(0, ...ys) < 0 ? -yAbs : 0,
    yMax = yAbs;
  const x = scale(xMin, xMax, left, width - right),
    y = scale(yMin, yMax, height - bottom, top);
  return (
    <div ref={box} className={`${s.plot} ${active ? s.dim : ""}`}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height}
          role="img"
          aria-label={`${yLabel} against ${xLabel}`}
        >
          {ticks(yMin, yMax, 4).map((t) => (
            <g key={"y" + t}>
              <line
                className={t === 0 ? s.zero : s.grid}
                x1={left}
                x2={width - right}
                y1={y(t)}
                y2={y(t)}
              />
              <text
                className={s.tick}
                x={left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="central"
              >
                {formatY(t)}
              </text>
            </g>
          ))}
          {ticks(xMin, xMax, 5).map((t) => (
            <text
              key={"x" + t}
              className={s.tick}
              x={x(t)}
              y={height - bottom + 16}
              textAnchor="middle"
            >
              {formatX(t)}
            </text>
          ))}
          <line
            className={s.axis}
            x1={left}
            x2={width - right}
            y1={height - bottom}
            y2={height - bottom}
          />
          <text
            className={s.tick}
            x={width - right}
            y={height - 4}
            textAnchor="end"
          >
            {xLabel} →
          </text>
          <text className={s.tick} x={left - 40} y={top - 2} textAnchor="start">
            ↑ {yLabel}
          </text>
          {valid.map((p) => (
            <g
              key={p.id}
              data-active={active === p.id}
              onMouseEnter={() => {
                setActive(p.id);
                setTip({
                  x: x(p.x),
                  y: y(p.y) - 8,
                  title: p.label,
                  rows: [
                    [yLabel, formatY(p.y)],
                    [xLabel, formatX(p.x)],
                    ...(p.detail ?? []),
                  ],
                });
              }}
              onMouseLeave={() => {
                setActive(null);
                setTip(null);
              }}
            >
              <circle className={s.hit} cx={x(p.x)} cy={y(p.y)} r={16} />
              <g data-anim="pop">
                <MarkShape
                  shape={p.shape}
                  x={x(p.x)}
                  y={y(p.y)}
                  r={6}
                  color={p.color}
                />
              </g>
            </g>
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────── heatmap (rows × columns, sequential) ───────── */

const SEQ = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
];
export function Heatmap({
  rows,
  columns,
  values,
  format = (n) => String(Math.round(n)),
  invert,
}: {
  rows: ChartRow[];
  columns: string[];
  values: (number | null)[][];
  format?: (n: number) => string;
  /** Lower is better (e.g. latency): darkest cells are the smallest values. */
  invert?: boolean;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const svg = useDrawIn(
    width ? rows.map((r) => r.id).join() + columns.join() : "",
  );
  const { placed, groups, height } = layoutRows(rows);
  const labelW = Math.min(230, width * 0.38),
    x0 = labelW + 8,
    cw = (width - x0) / Math.max(1, columns.length);
  const flat = values.flat().filter((v): v is number => v !== null),
    lo = Math.min(...flat, 0),
    hi = Math.max(...flat, 1);
  const step = (v: number) => {
    const k = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    return Math.min(4, Math.floor((invert ? 1 - k : k) * 4.999));
  };
  return (
    <div ref={box} className={s.plot}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height + AXIS}
          role="img"
          aria-label="Heatmap"
        >
          <RowLabels placed={placed} groups={groups} labelW={labelW} />
          {columns.map((c, j) => (
            <text
              key={c}
              className={s.tick}
              x={x0 + cw * j + cw / 2}
              y={height + 16}
              textAnchor="middle"
            >
              {c}
            </text>
          ))}
          {placed.map((r, i) =>
            columns.map((c, j) => {
              const v = values[i]?.[j] ?? null;
              // Zero of a "more is better" metric stays neutral so real values stand out.
              const k = v === null || (!invert && v === 0) ? -1 : step(v);
              return (
                <g
                  key={r.id + c}
                  onMouseEnter={() =>
                    setTip({
                      x: x0 + cw * j + cw / 2,
                      y: r.y - ROW / 2 + 2,
                      title: `${r.label} · ${c}`,
                      rows: [["Value", v === null ? "—" : format(v)]],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                >
                  <rect
                    data-anim="pop"
                    x={x0 + cw * j + 1}
                    y={r.y - ROW / 2 + 1}
                    width={cw - 2}
                    height={ROW - 2}
                    rx={6}
                    style={{ fill: k < 0 ? "var(--surface-2)" : SEQ[k] }}
                  />
                  <text
                    className={s.cellText}
                    x={x0 + cw * j + cw / 2}
                    y={r.y}
                    style={{
                      fill: k < 0 ? "var(--text-3)" : `var(--seq-ink-${k + 1})`,
                    }}
                  >
                    {v === null ? "—" : format(v)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────── simple horizontal bars ───────── */

export function BarList({
  rows,
  format,
  label,
}: {
  rows: (ChartRow & { value: number | null; detail?: [string, string][] })[];
  format: (n: number) => string;
  label: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null),
    [active, setActive] = useState<string | null>(null);
  const svg = useDrawIn(width ? rows.map((r) => r.id).join() : "");
  const { placed, groups, height } = layoutRows(rows);
  const labelW = Math.min(230, width * 0.38),
    x0 = labelW + 8,
    x1 = width - 64,
    max = Math.max(1e-9, ...rows.map((r) => r.value ?? 0)),
    x = scale(0, max, x0, x1);
  return (
    <div ref={box} className={`${s.plot} ${active ? s.dim : ""}`}>
      {width > 0 && (
        <svg
          ref={svg}
          className={s.svg}
          width={width}
          height={height + 8}
          role="img"
          aria-label={label}
        >
          <line className={s.axis} x1={x0} x2={x0} y1={0} y2={height} />
          <RowLabels placed={placed} groups={groups} labelW={labelW} />
          {placed.map((r) =>
            r.value === null ? (
              <text
                key={r.id}
                className={s.value}
                x={x0 + 8}
                y={r.y}
                dominantBaseline="central"
              >
                unknown
              </text>
            ) : (
              <g
                key={r.id}
                className={s.hitRow}
                data-active={active === r.id}
                onMouseEnter={() => {
                  setActive(r.id);
                  setTip({
                    x: x(r.value!),
                    y: r.y - 8,
                    title: r.label,
                    rows: [[label, format(r.value!)], ...(r.detail ?? [])],
                  });
                }}
                onMouseLeave={() => {
                  setActive(null);
                  setTip(null);
                }}
              >
                <rect
                  className={s.rowBg}
                  x={x0 - 4}
                  y={r.y - ROW / 2 + 2}
                  width={width - x0 + 4}
                  height={ROW - 4}
                  rx={6}
                />
                <rect
                  className={s.mark}
                  data-anim="grow"
                  x={x0}
                  y={r.y - 6}
                  width={Math.max(2, x(r.value) - x0)}
                  height={12}
                  rx={4}
                  style={{ fill: r.color }}
                />
                <text
                  className={s.valueStrong}
                  x={x(r.value) + 8}
                  y={r.y}
                  dominantBaseline="central"
                >
                  {format(r.value)}
                </text>
              </g>
            ),
          )}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}
