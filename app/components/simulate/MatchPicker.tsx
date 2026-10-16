"use client";
import { useMemo, useState } from "react";
import type { RunSummary } from "../../../lib/simulation/run-summary";
import { dateTime } from "../../lib/format";
import { modelLabel } from "../../lib/models";
import { result, statusLabel } from "../../lib/runs";
import { Drawer } from "../ui/Overlay";
import { Badge, EmptyState, ModelMix } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import s from "./simulate.module.css";

type Origin = "local simulation" | "test fixture" | "all";

/** Every stored match, newest first. Picking one loads its replay. */
export function MatchPicker({
  open,
  onClose,
  runs,
  current,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  runs: RunSummary[];
  current: string | null;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [origin, setOrigin] = useState<Origin>("local simulation"),
    [formation, setFormation] = useState("all"),
    [showEmpty, setShowEmpty] = useState(false);
  const formations = useMemo(
    () => [...new Set(runs.map((r) => r.team.family))],
    [runs],
  );
  const list = runs.filter(
    (r) =>
      (origin === "all" || r.evidenceOrigin === origin) &&
      (formation === "all" || r.team.family === formation) &&
      (showEmpty || r.hasReplay) &&
      `${r.label} ${r.team.label} ${Object.values(r.team.models).join(" ")} ${r.opponent.label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const hidden = runs.filter((r) => !r.hasReplay).length;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Stored matches"
      sub={`${runs.filter((r) => r.hasReplay).length} replays · playback never calls a model`}
    >
      <div className={s.pickerTools}>
        <input
          type="search"
          placeholder="Search by squad, model or opponent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-autofocus
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Segmented<Origin>
            size="sm"
            label="Evidence"
            value={origin}
            onChange={setOrigin}
            options={[
              { value: "local simulation", label: "Local sims" },
              { value: "test fixture", label: "Fixtures" },
              { value: "all", label: "All" },
            ]}
          />
          {formations.length > 1 && (
            <Segmented
              size="sm"
              label="Formation"
              value={formation}
              onChange={setFormation}
              options={[
                { value: "all", label: "All" },
                ...formations.map((f) => ({ value: f, label: f })),
              ]}
            />
          )}
        </div>
        {hidden > 0 && (
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--text-3)",
            }}
          >
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
            />
            Show {hidden} runs that stopped before kickoff
          </label>
        )}
      </div>
      {list.length ? (
        <ul className={s.runList}>
          {list.map((r) => {
            const res = result(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={s.runRow}
                  aria-current={r.id === current}
                  disabled={!r.hasReplay}
                  onClick={() => {
                    onPick(r.id);
                    onClose();
                  }}
                >
                  <span
                    className={`${s.res} ${res === "W" ? s.resW : res === "L" ? s.resL : ""}`}
                    aria-label={`${res === "W" ? "Win" : res === "D" ? "Draw" : "Loss"} ${r.score.for}–${r.score.against}`}
                  >
                    {r.score.for}–{r.score.against}
                  </span>
                  <span className={s.runMain}>
                    <span className={s.runTitle}>
                      <ModelMix models={r.team.models} />
                      {modelLabel(r.team.models)}
                    </span>
                    <span className={s.runMeta}>
                      {r.team.label} · {r.team.family} · vs {r.opponent.label}
                    </span>
                  </span>
                  <span className={s.runSide}>
                    {r.status === "completed" ? (
                      <span>
                        {Math.round(r.played)}s · seed {r.seed} · {r.side}
                      </span>
                    ) : (
                      <Badge tone="warn">
                        {statusLabel[r.status] ?? r.status}
                      </Badge>
                    )}
                    <span>{dateTime(r.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon="search" title="No matches found">
          Try another filter or search term.
        </EmptyState>
      )}
    </Drawer>
  );
}
