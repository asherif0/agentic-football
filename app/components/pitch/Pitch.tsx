"use client";
import { useEffect, useMemo, useRef } from "react";
import type { Role } from "../../../lib/domain";
import type { Event, Frame, Side } from "../../../lib/simulation/types";
import { gsap, reducedMotion } from "../../lib/motion";
import { isUniform, seriesVar } from "../../lib/models";
import { currentDecision, sampleFrame, trail } from "../../lib/playback";
import type { Round } from "../../lib/data/types";
import { PitchField } from "./PitchField";
import type { Playback } from "./usePlayback";
import s from "./pitch.module.css";

type Trace = Round["traces"][number];
const PULSE: Record<string, { color: string; r: number }> = {
  goal: { color: "var(--accent)", r: 3.2 },
  "shot-on-target": { color: "#ffffff", r: 2 },
  shot: { color: "#ffffffaa", r: 1.6 },
  save: { color: "#ffffff", r: 1.8 },
  "dangerous-turnover": { color: "#ef6b6b", r: 1.6 },
  interception: { color: "#ffffff88", r: 1.3 },
};
const SVGNS = "http://www.w3.org/2000/svg";
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * Animated replay. Positions are written straight to the SVG on every
 * playback tick (no React render per frame); React only re-renders when the
 * run, selection or toggles change.
 */
export function Pitch({
  frames,
  events,
  traces,
  teamSide,
  models,
  playback,
  selected,
  onSelect,
  showIntent = true,
  label = "Match replay",
}: {
  frames: Frame[];
  events: Event[];
  traces: Map<string, Trace[]>;
  teamSide: Side;
  models?: Partial<Record<Role, string>>;
  playback: Playback;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  showIntent?: boolean;
  label?: string;
}) {
  const nodes = useRef(new Map<string, SVGGElement>()),
    intents = useRef(new Map<string, SVGLineElement>()),
    heads = useRef(new Map<string, SVGCircleElement>()),
    ball = useRef<SVGCircleElement>(null),
    trailRef = useRef<SVGPolylineElement>(null),
    ring = useRef<SVGCircleElement>(null),
    selectRing = useRef<SVGCircleElement>(null),
    pulses = useRef<SVGGElement>(null),
    goalText = useRef<SVGTextElement>(null);
  const roster = useMemo(
    () =>
      (frames[0]?.players ?? []).map((p) => ({
        id: p.id,
        side: p.side,
        role: p.role,
      })),
    [frames[0]],
  );
  const ours = roster.filter((p) => p.side === teamSide);
  const mixed = models ? !isUniform(models) : false;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const intentRef = useRef(showIntent);
  intentRef.current = showIntent;

  useEffect(() => {
    if (!frames.length) return;
    const drawn = new Map<string, { x: number; y: number }>();
    let blend: {
        from: Map<string, { x: number; y: number }>;
        start: number;
      } | null = null,
      lastT = -1;
    const motion = !reducedMotion();

    function pulse(x: number, y: number, type: string, side: Side) {
      const p = PULSE[type];
      if (!p || !pulses.current || !motion) return;
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", String(y));
      c.setAttribute("r", "0.3");
      c.setAttribute("class", s.pulse);
      c.style.stroke =
        type === "goal" && side !== teamSide ? "#ffffff" : p.color;
      pulses.current.appendChild(c);
      gsap.to(c, {
        attr: { r: p.r },
        opacity: 0,
        duration: type === "goal" ? 1.1 : 0.75,
        ease: "power2.out",
        onComplete: () => c.remove(),
      });
      if (type === "goal" && goalText.current) {
        goalText.current.textContent = side === teamSide ? "GOAL" : "CONCEDED";
        goalText.current.style.fill =
          side === teamSide ? "var(--accent)" : "#ffffff";
        gsap.fromTo(
          goalText.current,
          { opacity: 0, scale: 0.6, transformOrigin: "20px 10px" },
          {
            opacity: 1,
            scale: 1,
            duration: 0.45,
            ease: "back.out(2)",
            onComplete: () => {
              gsap.to(goalText.current, {
                opacity: 0,
                duration: 0.6,
                delay: 0.7,
              });
            },
          },
        );
      }
    }

    const off = playback.onTick((t, seeked) => {
      const f = sampleFrame(frames, t);
      if (!f) return;
      if (seeked && motion && drawn.size)
        blend = { from: new Map(drawn), start: performance.now() };
      let k = 1;
      if (blend) {
        k = ease(Math.min(1, (performance.now() - blend.start) / 240));
        if (k >= 1) blend = null;
        else playback.redraw();
      }
      const pos = new Map<string, { x: number; y: number }>();
      for (const p of f.players) {
        const from = blend?.from.get(p.id);
        const x = from ? from.x + (p.x - from.x) * k : p.x,
          y = from ? from.y + (p.y - from.y) * k : p.y;
        pos.set(p.id, { x, y });
        drawn.set(p.id, { x, y });
        nodes.current
          .get(p.id)
          ?.setAttribute(
            "transform",
            `translate(${x.toFixed(3)} ${y.toFixed(3)})`,
          );
      }
      const bx = f.ball.x,
        by = f.ball.y;
      ball.current?.setAttribute("cx", bx.toFixed(3));
      ball.current?.setAttribute("cy", by.toFixed(3));
      trailRef.current?.setAttribute(
        "points",
        trail(frames, t, 0.7)
          .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
          .concat(`${bx.toFixed(2)},${by.toFixed(2)}`)
          .join(" "),
      );
      const owner = f.ball.owner ? pos.get(f.ball.owner) : null;
      if (ring.current) {
        ring.current.style.display = owner ? "" : "none";
        if (owner) {
          ring.current.setAttribute("cx", owner.x.toFixed(3));
          ring.current.setAttribute("cy", owner.y.toFixed(3));
        }
      }
      const sel = selectedRef.current ? pos.get(selectedRef.current) : null;
      if (selectRing.current) {
        selectRing.current.style.display = sel ? "" : "none";
        if (sel)
          selectRing.current.setAttribute(
            "transform",
            `translate(${sel.x.toFixed(3)} ${sel.y.toFixed(3)})`,
          );
      }
      for (const [id, line] of intents.current) {
        const me = pos.get(id),
          d = intentRef.current ? currentDecision(traces.get(id), t) : null,
          a = d?.selected;
        const target = a?.playerId ? pos.get(a.playerId) : a?.target;
        const head = heads.current.get(id);
        const show = !!(
          me &&
          target &&
          a &&
          a.type !== "hold" &&
          Math.hypot(target.x - me.x, target.y - me.y) > 0.6
        );
        line.style.display = show ? "" : "none";
        if (head) head.style.display = show ? "" : "none";
        if (show && me && target) {
          line.setAttribute("x1", me.x.toFixed(3));
          line.setAttribute("y1", me.y.toFixed(3));
          line.setAttribute("x2", target.x.toFixed(3));
          line.setAttribute("y2", target.y.toFixed(3));
          head?.setAttribute("cx", target.x.toFixed(3));
          head?.setAttribute("cy", target.y.toFixed(3));
        }
      }
      if (!seeked && t > lastT && t - lastT < 1)
        for (const e of events)
          if (e.time > lastT && e.time <= t && PULSE[e.type]) {
            const at = (e.playerId && pos.get(e.playerId)) || { x: bx, y: by };
            pulse(at.x, at.y, e.type, e.side);
          }
      lastT = t;
    });
    playback.redraw();
    return off;
  }, [frames, events, traces, playback, teamSide]);

  useEffect(() => {
    playback.redraw();
  }, [selected, showIntent, playback]);

  useEffect(() => {
    if (!selectRing.current || reducedMotion()) return;
    const tween = gsap.to(selectRing.current.querySelector("circle"), {
      rotation: 360,
      svgOrigin: "0 0",
      duration: 6,
      repeat: -1,
      ease: "none",
    });
    return () => {
      tween.kill();
    };
  }, []);

  const first = frames[0];
  const attackRight = teamSide === "home";
  return (
    <PitchField label={label}>
      <text
        className={s.dir}
        x={attackRight ? 39.6 : 0.4}
        y={21.15}
        textAnchor={attackRight ? "end" : "start"}
      >
        {attackRight ? "Your attack →" : "← Your attack"}
      </text>
      <g>
        {ours.map((p) => (
          <line
            key={p.id}
            className={s.intent}
            ref={(el) => {
              if (el) intents.current.set(p.id, el);
              else intents.current.delete(p.id);
            }}
            style={{ display: "none" }}
          />
        ))}
        {ours.map((p) => (
          <circle
            key={p.id}
            r={0.16}
            className={s.intentHead}
            ref={(el) => {
              if (el) heads.current.set(p.id, el);
              else heads.current.delete(p.id);
            }}
            style={{ display: "none" }}
          />
        ))}
      </g>
      <polyline ref={trailRef} className={s.trail} />
      <circle
        ref={ring}
        className={s.possession}
        r={1.05}
        style={{ display: "none" }}
      />
      <g ref={selectRing} style={{ display: "none" }}>
        <circle className={s.select} r={1.3} />
      </g>
      {roster.map((p) => {
        const start = first.players.find((x) => x.id === p.id)!;
        const isOurs = p.side === teamSide;
        return (
          <g
            key={p.id}
            ref={(el) => {
              if (el) nodes.current.set(p.id, el);
              else nodes.current.delete(p.id);
            }}
            className={`${s.player} ${isOurs ? s.ours : s.theirs}`}
            transform={`translate(${start.x} ${start.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={selected === p.id}
            aria-label={`${p.role}, ${isOurs ? "your squad" : "opponent"}${isOurs && models?.[p.role] ? `, ${models[p.role]}` : ""}`}
            onClick={() => onSelect?.(selected === p.id ? null : p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(selected === p.id ? null : p.id);
              }
            }}
          >
            <circle className={s.hit} r={1.25} />
            {isOurs && mixed && models?.[p.role] && (
              <circle
                className={s.modelRing}
                r={0.95}
                style={{ stroke: seriesVar(models[p.role]!) }}
              />
            )}
            <circle className={s.disc} r={0.74} />
            <text className={s.role}>{p.role}</text>
          </g>
        );
      })}
      <circle
        ref={ball}
        className={s.ball}
        r={0.33}
        cx={first?.ball.x}
        cy={first?.ball.y}
      />
      <g ref={pulses} />
      <text ref={goalText} className={s.goalText} x={20} y={10} opacity={0}>
        GOAL
      </text>
    </PitchField>
  );
}
