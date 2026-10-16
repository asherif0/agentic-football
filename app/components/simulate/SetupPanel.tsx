"use client";
import { useState } from "react";
import { ROLES, type Workspace } from "../../../lib/domain";
import type { RunIndex } from "../../lib/data/types";
import { postJSON } from "../../lib/data/cache";
import { int, usd } from "../../lib/format";
import { inferenceIssues, modelLabel, providerFor } from "../../lib/models";
import { estimateMatchCost } from "../../lib/squad";
import { toast } from "../../lib/toast";
import ModelAssignments from "../ModelAssignments";
import { usePreparation } from "../Preparation";
import { Drawer } from "../ui/Overlay";
import { Button, Field, ModelMix, Notice } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import s from "./simulate.module.css";

/**
 * Configure and start a new match with the current squad. Starting a match
 * calls the model provider; nothing here runs until "Start" is pressed.
 */
export function SetupPanel({
  open,
  onClose,
  workspace: w,
  index,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  index: RunIndex;
  onStarted: (runId: string) => void;
}) {
  const { value: p, set } = usePreparation(),
    [series, setSeries] = useState(false),
    [challenger, setChallenger] = useState(""),
    [seriesLimit, setSeriesLimit] = useState(3600),
    [seriesTokens, setSeriesTokens] = useState(36000000),
    [useActive, setUseActive] = useState(true),
    [busy, setBusy] = useState(false);
  const patch = (x: Partial<typeof p>) => set((old) => ({ ...old, ...x }));
  const team = w.teams.find((t) => t.id === p.team),
    formation = w.formations.find((f) => f.id === team?.formationId),
    scenarios = index.scenarios.filter(
      (x) => x.formationId === team?.formationId,
    ),
    scenario = scenarios.find((x) => x.id === p.scenario) ?? scenarios[0],
    provider = providerFor(p.models, p.provider),
    opponentTeam = w.teams.find((t) => t.id === p.opponent),
    opScenarios = index.scenarios.filter(
      (x) => x.formationId === opponentTeam?.formationId,
    ),
    challengers = w.teams.filter(
      (t) => t.formationId === team?.formationId && t.id !== team?.id,
    ),
    dirty = Object.keys(p.lineup ?? {}).length > 0;
  const calls =
    provider === "mock"
      ? 0
      : Math.ceil(p.duration / Math.max(p.interval, 0.25)) *
        (p.opponent ? 10 : 5) *
        (series ? 12 : 1);
  const cost =
    provider === "mock"
      ? 0
      : estimateMatchCost(p.models, p.duration, p.interval).total;
  const issues =
    provider === "responses" ? inferenceIssues(p.models, p.inference) : [];
  const blocked =
    !scenario ||
    (provider !== "mock" && !index.keyConfigured) ||
    issues.length > 0 ||
    (series && !challenger);

  async function start() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      const body = {
        useActiveTeam: useActive && !series,
        label: team?.label,
        teamId: p.team,
        scenarioId: scenario!.id,
        provider,
        models: p.models,
        ...(provider === "responses"
          ? { inference: p.inference, opponentInference: p.opponentInference }
          : {}),
        opponentTeamId: p.opponent || null,
        opponentScenarioId: p.opScenario || opScenarios[0]?.id,
        opponentModels: p.opponentModels,
        bot: p.bot,
        teamSide: p.side,
        seed: p.seed,
        duration: p.duration,
        interval: p.interval,
        requestLimit: p.limit,
        inputTokenLimit: p.tokenLimit,
        challengerTeamId: challenger,
        challengerScenarioId: scenario!.id,
        seriesRequestLimit: seriesLimit,
        seriesInputTokenLimit: seriesTokens,
      };
      const r = await postJSON<any>(
        series ? "/api/simulation/series" : "/api/simulation",
        body,
        ["runs", "analytics"],
      );
      toast(
        series ? "Series scheduled: 12 matches." : "Match started.",
        "success",
      );
      onStarted(series ? r.runIds[0] : r.id);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const num = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    hint?: string,
    step?: number,
  ) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New match"
      sub="Uses your current squad. Starting calls the model provider and is billed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="play"
            disabled={blocked || busy}
            onClick={start}
          >
            {busy
              ? "Starting…"
              : series
                ? "Start 12-match series"
                : "Start match"}
          </Button>
        </>
      }
    >
      <div className={s.setup}>
        <section className={s.setupGroup}>
          <span className="eyebrow">Squad</span>
          <div className={s.squadCard}>
            <div className={s.squadRow}>
              <strong>{team?.label ?? "No squad selected"}</strong>
              <Button
                href="/squad"
                size="sm"
                variant="ghost"
                iconRight="arrowRight"
              >
                Edit squad
              </Button>
            </div>
            <div className={s.squadRow}>
              <span
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
              >
                <ModelMix models={p.models} /> {modelLabel(p.models)}
              </span>
              <span className="muted">{formation?.name}</span>
            </div>
            <div className={s.squadRow}>
              <span className="muted">Provider</span>
              <select
                style={{ width: "auto" }}
                value={provider}
                onChange={(e) => patch({ provider: e.target.value })}
                aria-label="Decision provider"
              >
                <option
                  value="decisions"
                  disabled={
                    provider === "responses" &&
                    !ROLES.every((r) => p.models[r] === "gpt-6-luna")
                  }
                >
                  Decisions · gpt-6-luna only
                </option>
                <option value="responses">
                  Responses · any model per player
                </option>
                <option value="mock">Mock · fixture, no API calls</option>
              </select>
            </div>
          </div>
          {dirty && (
            <Notice tone="warn" icon="alert">
              Your squad has unsaved prompt swaps. Matches use the saved team
              version; save it on the Squad page first.
            </Notice>
          )}
          <Field label="Starting positions">
            <select
              value={scenario?.id ?? ""}
              onChange={(e) => patch({ scenario: e.target.value })}
            >
              {!scenarios.length && (
                <option value="">No layout for this formation</option>
              )}
              {scenarios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className={s.setupGroup}>
          <span className="eyebrow">Opponent</span>
          <Segmented<"bot" | "team">
            full
            label="Opponent type"
            value={p.opponent ? "team" : "bot"}
            onChange={(v) =>
              patch(
                v === "bot"
                  ? { opponent: "", limit: 300 }
                  : { opponent: w.teams[0]?.id ?? "", limit: 600 },
              )
            }
            options={[
              { value: "bot", label: "Scripted bot" },
              { value: "team", label: "Another agent team" },
            ]}
          />
          {p.opponent ? (
            <>
              <div className={s.setupGrid}>
                <Field label="Team">
                  <select
                    value={p.opponent}
                    onChange={(e) =>
                      patch({ opponent: e.target.value, opScenario: "" })
                    }
                  >
                    {w.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Their positions">
                  <select
                    value={p.opScenario || opScenarios[0]?.id || ""}
                    onChange={(e) => patch({ opScenario: e.target.value })}
                  >
                    {opScenarios.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {provider === "responses" && (
                <div className="legacy">
                  <ModelAssignments
                    title="Opponent models"
                    models={p.opponentModels}
                    inference={p.opponentInference}
                    onModels={(opponentModels) => patch({ opponentModels })}
                    onInference={(opponentInference) =>
                      patch({ opponentInference })
                    }
                  />
                </div>
              )}
            </>
          ) : (
            <Segmented
              full
              label="Bot style"
              value={p.bot}
              onChange={(bot) => patch({ bot })}
              options={[
                { value: "balanced", label: "Balanced" },
                { value: "press", label: "Pressing" },
                { value: "counter", label: "Counter" },
              ]}
            />
          )}
        </section>

        <section className={s.setupGroup}>
          <span className="eyebrow">Match</span>
          <div className={s.setupGrid}>
            {num(
              "Duration (s)",
              p.duration,
              (duration) => patch({ duration }),
              "1–600 simulated seconds",
            )}
            {num(
              "Decision interval (s)",
              p.interval,
              (interval) => patch({ interval }),
              "0.25–3 s between decisions",
              0.25,
            )}
            {num("Seed", p.seed, (seed) => patch({ seed }))}
            <Field label="Starting side">
              <Segmented
                full
                label="Starting side"
                value={p.side}
                onChange={(side) => patch({ side })}
                options={[
                  { value: "home", label: "Home →" },
                  { value: "away", label: "← Away" },
                ]}
              />
            </Field>
          </div>
        </section>

        <section className={s.setupGroup}>
          <span className="eyebrow">Ceilings</span>
          <div className={s.setupGrid}>
            {num(
              "Request ceiling",
              p.limit,
              (limit) => patch({ limit }),
              "Retries included",
            )}
            {num("Input-token ceiling", p.tokenLimit, (tokenLimit) =>
              patch({ tokenLimit }),
            )}
          </div>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: "var(--fs-small)",
            }}
          >
            <input
              type="checkbox"
              checked={series}
              onChange={(e) => setSeries(e.target.checked)}
            />
            Paired champion / challenger series (3 seeds × 2 sides × 2 versions)
          </label>
          {series && (
            <div className={s.setupGrid}>
              <Field label="Challenger">
                <select
                  value={challenger}
                  onChange={(e) => setChallenger(e.target.value)}
                >
                  <option value="">Choose a team version</option>
                  {challengers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              {num("Series request ceiling", seriesLimit, setSeriesLimit)}
              {num("Series token ceiling", seriesTokens, setSeriesTokens)}
            </div>
          )}
          {!series && (
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: "var(--fs-small)",
              }}
            >
              <input
                type="checkbox"
                checked={useActive}
                onChange={(e) => setUseActive(e.target.checked)}
              />
              Use the locally adopted team when a campaign matches these
              settings
            </label>
          )}
        </section>

        <div className={s.plan}>
          <span className="eyebrow">Plan</span>
          <span className={s.planBig}>
            {int(calls)} model calls ·{" "}
            {cost === null ? "cost unknown" : `≈ ${usd(cost)}`}
          </span>
          <span className="muted">
            Before retries. 30 s timeout, at most one transient retry. A ceiling
            stops the match cleanly.
          </span>
        </div>
        {provider !== "mock" && !index.keyConfigured && (
          <Notice tone="warn" icon="alert">
            No OPENAI_API_KEY is configured on the server, so only Mock matches
            can start.
          </Notice>
        )}
        {issues.map((i) => (
          <Notice key={i} tone="bad" icon="alert">
            {i}
          </Notice>
        ))}
      </div>
    </Drawer>
  );
}
