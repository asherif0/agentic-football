"use client";
import { useState, useRef, useEffect } from "react";
import { ROLES, type Role, type Workspace } from "../../lib/domain";
import type { Layout } from "../../lib/simulation/types";
import { usePreparation } from "./Preparation";
const initial: Layout = {
  GK: { x: 0.06, y: 0.5 },
  DEF: { x: 0.25, y: 0.5 },
  MID: { x: 0.46, y: 0.5 },
  FOR1: { x: 0.7, y: 0.3 },
  FOR2: { x: 0.65, y: 0.72 },
};
export default function ScenarioEditor({
  workspace: w,
  onSaved,
}: {
  workspace: Workspace;
  onSaved?: () => void;
}) {
  const { value: p, set } = usePreparation(),
    [positions, setPositions] = useState(initial),
    [name, setName] = useState("Starting layout"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    pitch = useRef<SVGSVGElement>(null),
    drag = useRef<Role | null>(null);
  const formationId = w.teams.find((t) => t.id === p.team)?.formationId;
  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        const sc =
          d.scenarios?.find(
            (s: any) => s.id === p.scenario && s.formationId === formationId,
          ) || d.scenarios?.find((s: any) => s.formationId === formationId);
        if (sc) setPositions(sc.layout);
      })
      .catch(() => setError("Could not load starting positions"));
  }, [formationId, p.scenario]);
  function move(role: Role, x: number, y: number) {
    setPositions((old) => ({
      ...old,
      [role]: {
        x: Math.max(0.01, Math.min(0.99, x)),
        y: Math.max(0.01, Math.min(0.99, y)),
      },
    }));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/simulation/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formationId,
            label: name,
            parentId: p.scenario || null,
            layout: positions,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      set((old) => ({ ...old, scenario: d.id }));
      setNotice("Starting positions saved as a new scenario.");
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="workspace-section scenario-panel">
      <summary>Starting positions & scenarios</summary>
      <p className="muted">
        Drag a player or use arrow keys. Positions apply to this local
        simulator.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <label>
        Scenario name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <svg
        ref={pitch}
        viewBox="0 0 400 200"
        className="sim-pitch editor-pitch"
        aria-label="Starting position editor"
        onPointerMove={(e) => {
          if (!drag.current || !pitch.current) return;
          const b = pitch.current.getBoundingClientRect();
          move(
            drag.current,
            (e.clientX - b.left) / b.width,
            (e.clientY - b.top) / b.height,
          );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <rect width="400" height="200" fill="#10271f" />
        <rect
          x="8"
          y="8"
          width="384"
          height="184"
          fill="none"
          stroke="#77998a"
        />
        <path d="M200 8v184" stroke="#77998a" />
        <circle cx="200" cy="100" r="28" fill="none" stroke="#77998a" />
        {ROLES.map((role) => (
          <g
            key={role}
            transform={`translate(${positions[role].x * 400},${positions[role].y * 200})`}
            role="button"
            tabIndex={0}
            aria-label={`${role} position, x ${positions[role].x.toFixed(2)}, y ${positions[role].y.toFixed(2)}. Use arrow keys.`}
            onKeyDown={(e) => {
              const keys: Record<string, [number, number]> = {
                ArrowLeft: [-0.02, 0],
                ArrowRight: [0.02, 0],
                ArrowUp: [0, -0.02],
                ArrowDown: [0, 0.02],
              };
              const d = keys[e.key];
              if (d) {
                e.preventDefault();
                move(role, positions[role].x + d[0], positions[role].y + d[1]);
              }
            }}
            onPointerDown={(e) => {
              drag.current = role;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
          >
            <circle r="10" fill="#c6ef8a" />
            <text y="-15" textAnchor="middle" fontSize="10" fill="white">
              {role}
            </text>
          </g>
        ))}
      </svg>
      <button
        className="secondary"
        disabled={busy || !name.trim() || !formationId}
        onClick={save}
      >
        {busy ? "Saving…" : "Save starting positions"}
      </button>
    </details>
  );
}
