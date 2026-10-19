"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, type RecordData, type Role } from "../../../lib/domain";
import type { InferenceSettings, Layout } from "../../../lib/simulation/types";
import { postJSON, invalidate } from "../../lib/data/cache";
import { useAnalytics, useRunIndex, useWorkspace } from "../../lib/data/hooks";
import { promptEvidence, rankVersions } from "../../lib/evidence";
import { int, signed, usd } from "../../lib/format";
import {
  EFFORTS,
  MODEL_OPTIONS,
  apiLabel,
  usesInference,
  inferenceIssues,
  isUniform,
  modelLabel,
  parseModelMap,
  providerFor,
  seriesVar,
} from "../../lib/models";
import { defaultInference, estimateMatchCost } from "../../lib/squad";
import { toast } from "../../lib/toast";
import { LineupPitch } from "../pitch/LineupPitch";
import { usePreparation } from "../Preparation";
import ScenarioEditor from "../ScenarioEditor";
import { NextStep, PageHeader } from "../shell/PageHeader";
import { Dialog, Drawer } from "../ui/Overlay";
import {
  Badge,
  Button,
  Chip,
  Field,
  ModelMix,
  Notice,
  Skeleton,
} from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import s from "./squad.module.css";

const DEFAULT_LAYOUT: Layout = {
  GK: { x: 0.06, y: 0.5 },
  DEF: { x: 0.25, y: 0.5 },
  MID: { x: 0.46, y: 0.5 },
  FOR1: { x: 0.7, y: 0.3 },
  FOR2: { x: 0.65, y: 0.72 },
};

export default function SquadView() {
  const { value: p, set } = usePreparation(),
    { data: ws } = useWorkspace(),
    { data: index } = useRunIndex(),
    { data: analytics } = useAnalytics({}),
    [focus, setFocus] = useState<Role | null>(null),
    [saving, setSaving] = useState(false),
    [setups, setSetups] = useState(false),
    [positions, setPositions] = useState(false);
  const patch = (x: Partial<typeof p>) => set((old) => ({ ...old, ...x }));
  const w = ws?.records;

  // Fall back to a known team if the saved one no longer exists.
  useEffect(() => {
    if (w && !w.teams.some((t) => t.id === p.team) && w.teams.length)
      patch({
        team: (w.teams.find((t) => t.id === "team-provisional") ?? w.teams[0])
          .id,
        lineup: {},
        scenario: "",
      });
  }, [w, p.team]);

  const evidence = useMemo(
    () => promptEvidence(analytics?.runs ?? []),
    [analytics],
  );
  const usage = useMemo(() => {
    const u: Record<string, { input: number; output: number }> = {};
    for (const g of analytics?.groups ?? []) {
      const m = parseModelMap(g.modelMap);
      if (!isUniform(m) || !g.decisions) continue;
      u[m.GK] = {
        input: g.inputTokens / g.decisions,
        output: g.outputTokens / g.decisions,
      };
    }
    return u;
  }, [analytics]);

  if (!w)
    return (
      <>
        <PageHeader step="01" eyebrow="Squad" title="Build your squad" />
        <Skeleton height={480} />
      </>
    );

  const team = w.teams.find((t) => t.id === p.team) ?? w.teams[0];
  const formation = w.formations.find((f) => f.id === team?.formationId);
  const teams = w.teams.filter((t) => t.formationId === formation?.id);
  const scenarios = (index?.scenarios ?? []).filter(
    (x) => x.formationId === formation?.id,
  );
  const scenario = scenarios.find((x) => x.id === p.scenario) ?? scenarios[0];
  const lineup = p.lineup ?? {};
  const promptFor = (r: Role) => lineup[r] ?? team?.promptIds[r];
  const dirty = ROLES.some(
    (r) => lineup[r] && lineup[r] !== team?.promptIds[r],
  );
  const provider = providerFor(p.models, p.provider);
  const cost = estimateMatchCost(p.models, 60, p.interval, usage);
  const issues = inferenceIssues(p.models, p.inference);

  const setModels = (models: Record<Role, string>) =>
    patch({
      models,
      provider: providerFor(
        models,
        p.provider === "mock" ? "mock" : p.provider,
      ),
    });
  const setInference = (role: Role, v: Partial<InferenceSettings>) =>
    patch({
      inference: { ...p.inference, [role]: { ...p.inference[role], ...v } },
    });
  function chooseTeam(id: string) {
    patch({ team: id, lineup: {}, scenario: "" });
  }
  function chooseFormation(id: string) {
    const options = w!.teams.filter((t) => t.formationId === id);
    const tested = options.filter((t) =>
      ROLES.some((r) => evidence.get(t.promptIds[r])?.matches),
    );
    chooseTeam((tested.at(-1) ?? options.at(-1))!.id);
  }
  function select(role: Role) {
    setFocus(role);
    document
      .getElementById(`player-${role}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const formations = w.formations.filter((f) =>
    w.teams.some((t) => t.formationId === f.id),
  );

  return (
    <>
      <PageHeader
        step="01"
        eyebrow="Squad"
        title="Build your squad"
        description="Give each of the five players a prompt version and a model. Mixing models in one team is fully supported; every player decides independently."
        actions={
          <>
            <Button
              icon="trophy"
              onClick={() => setSetups(true)}
              disabled={!analytics?.groups.length}
            >
              Load a tested setup
            </Button>
            <Button variant="primary" href="/simulate" iconRight="arrowRight">
              Simulate
            </Button>
          </>
        }
      />

      <div className={s.config} data-reveal>
        <Field label="Formation">
          <Segmented
            label="Formation"
            value={formation?.id ?? ""}
            onChange={chooseFormation}
            options={formations.map((f) => ({ value: f.id, label: f.family }))}
          />
        </Field>
        <Field label="Team version" className={s.configWide}>
          <select value={team?.id} onChange={(e) => chooseTeam(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starting positions" className={s.configWide}>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={scenario?.id ?? ""}
              onChange={(e) => patch({ scenario: e.target.value })}
            >
              {!scenarios.length && <option value="">Default layout</option>}
              {scenarios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <Button
              icon="pitch"
              aria-label="Edit starting positions"
              onClick={() => setPositions(true)}
            />
          </div>
        </Field>
      </div>

      <div className={s.layout}>
        <div className={s.pitchCol} data-reveal>
          <LineupPitch
            layout={scenario?.layout ?? DEFAULT_LAYOUT}
            models={p.models}
            selected={focus}
            onSelect={select}
          />
          <div className={s.legend}>
            {MODEL_OPTIONS.map((m) => (
              <span key={m.id} className={s.legendItem}>
                <span
                  className={s.legendRing}
                  style={{ borderColor: seriesVar(m.id) }}
                />
                {m.id}
              </span>
            ))}
          </div>
          <div className={s.summary}>
            <div>
              <span className="eyebrow">Model mix</span>
              <span className={s.summaryValue}>{modelLabel(p.models)}</span>
              <span className={s.mixBar}>
                {ROLES.map((r) => (
                  <span
                    key={r}
                    style={{ background: seriesVar(p.models[r]) }}
                    title={`${r}: ${p.models[r]}`}
                  />
                ))}
              </span>
            </div>
            <div>
              <span className="eyebrow">Runs on</span>
              <span className={s.summaryValue}>
                {apiLabel(p.models, provider)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {provider === "responses"
                  ? "Each player calls its own model"
                  : provider === "decisions"
                    ? "gpt-6-luna for every player"
                    : "Scripted test controllers"}
              </span>
            </div>
            <div>
              <span className="eyebrow">Per 60 s match</span>
              <span className={s.summaryValue}>
                {cost.total === null ? "—" : `≈ ${usd(cost.total)}`}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {int(cost.decisions)} decisions at {p.interval}s
              </span>
            </div>
          </div>
          {dirty && (
            <Notice tone="warn" icon="alert">
              <strong>Unsaved prompt swaps.</strong> Matches always use a saved
              team version, so save this lineup before simulating it.
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Button
                  size="sm"
                  variant="solid"
                  onClick={() => setSaving(true)}
                >
                  Save as team version
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ lineup: {} })}
                >
                  Discard swaps
                </Button>
              </div>
            </Notice>
          )}
          {issues.map((i) => (
            <Notice key={i} tone="bad" icon="alert">
              {i}
            </Notice>
          ))}
        </div>

        <div className={s.cards} data-reveal>
          <div className={s.bulk}>
            <span className="eyebrow" style={{ marginRight: 4 }}>
              All players
            </span>
            {MODEL_OPTIONS.map((m) => (
              <Chip
                key={m.id}
                swatch={seriesVar(m.id)}
                pressed={ROLES.every((r) => p.models[r] === m.id)}
                onClick={() =>
                  setModels(
                    Object.fromEntries(ROLES.map((r) => [r, m.id])) as Record<
                      Role,
                      string
                    >,
                  )
                }
              >
                {m.short}
              </Chip>
            ))}
          </div>
          {ROLES.map((role) => (
            <PlayerCard
              key={role}
              role={role}
              selected={focus === role}
              onFocus={() => setFocus(role)}
              duty={formation?.roles?.[role]}
              prompts={w.prompts.filter(
                (x) => x.role === role && x.formationId === formation?.id,
              )}
              promptId={promptFor(role)}
              teamPromptId={team?.promptIds[role]}
              onPrompt={(id) => {
                const next = { ...lineup };
                if (id === team?.promptIds[role]) delete next[role];
                else next[role] = id;
                patch({ lineup: next });
              }}
              evidence={evidence}
              model={p.models[role]}
              onModel={(m) => setModels({ ...p.models, [role]: m })}
              inference={p.inference[role] ?? defaultInference()[role]}
              onInference={(v) => setInference(role, v)}
              cost={cost.perRole[role]}
            />
          ))}
        </div>
      </div>

      <NextStep href="/simulate" />

      <SaveTeamDialog
        open={saving}
        onClose={() => setSaving(false)}
        team={team}
        promptIds={
          Object.fromEntries(ROLES.map((r) => [r, promptFor(r)])) as Record<
            Role,
            string
          >
        }
        onSaved={(id) => {
          patch({ team: id, lineup: {} });
          setSaving(false);
        }}
      />
      <Dialog
        open={setups}
        onClose={() => setSetups(false)}
        title="Load a tested setup"
        sub="Configurations with completed local matches. Small samples: use as a starting point, not a ranking."
      >
        <div className={s.setups}>
          {[...(analytics?.groups ?? [])]
            .sort(
              (a, b) =>
                (b.goalDifferencePer60 ?? -99) - (a.goalDifferencePer60 ?? -99),
            )
            .map((g) => {
              const models = parseModelMap(g.modelMap);
              return (
                <button
                  key={g.id + g.modelMap + g.teamId}
                  type="button"
                  className={s.setup}
                  onClick={() => {
                    const r = index?.runs.find((x) => g.runIds.includes(x.id));
                    patch({
                      team: g.teamId,
                      lineup: {},
                      scenario: "",
                      models,
                      inference: r?.team.inference ?? defaultInference(),
                      provider: providerFor(models, g.provider),
                    });
                    setSetups(false);
                    toast(
                      `Loaded ${modelLabel(models)} · ${g.formation}.`,
                      "success",
                    );
                  }}
                >
                  <span className={s.setupTitle}>
                    <ModelMix models={models} /> {modelLabel(models)} ·{" "}
                    {g.formation}
                  </span>
                  <span className={s.setupGd}>
                    {signed(g.goalDifferencePer60, 1)} GD/60
                  </span>
                  <span className={s.setupMeta}>
                    {g.team} · {g.matches} matches · {g.wins}W {g.draws}D{" "}
                    {g.matches - g.wins - g.draws}L · {g.provider}
                  </span>
                </button>
              );
            })}
        </div>
      </Dialog>
      <Drawer
        open={positions}
        onClose={() => setPositions(false)}
        title="Starting positions"
        sub="Drag players or use arrow keys. Saving creates a new layout; existing ones never change."
        wide
      >
        <div className="legacy">
          <ScenarioEditor workspace={w} onSaved={() => invalidate("runs")} />
        </div>
      </Drawer>
    </>
  );
}

function PlayerCard({
  role,
  selected,
  onFocus,
  duty,
  prompts,
  promptId,
  teamPromptId,
  onPrompt,
  evidence,
  model,
  onModel,
  inference,
  onInference,
  cost,
}: {
  role: Role;
  selected: boolean;
  onFocus: () => void;
  duty?: { placement?: string; responsibility?: string };
  prompts: RecordData[];
  promptId?: string;
  teamPromptId?: string;
  onPrompt: (id: string) => void;
  evidence: ReturnType<typeof promptEvidence>;
  model: string;
  onModel: (m: string) => void;
  inference: InferenceSettings;
  onInference: (v: Partial<InferenceSettings>) => void;
  cost: number | null;
}) {
  const ranks = rankVersions(
    prompts.map((x) => x.id),
    evidence,
  );
  const known = MODEL_OPTIONS.some((m) => m.id === model);
  const [custom, setCustom] = useState(!known);
  const ref = useRef<HTMLElement>(null);
  const rank = promptId ? ranks[promptId] : undefined;
  return (
    <section
      ref={ref}
      id={`player-${role}`}
      className={s.card}
      data-selected={selected}
      onFocusCapture={onFocus}
      onClick={onFocus}
    >
      <div className={s.cardHead}>
        <span className={s.role}>{role}</span>
        <div className={s.duty}>
          <span className={s.dutyTitle}>{duty?.placement || role}</span>
          {duty?.responsibility && (
            <span className={s.dutyText}>{duty.responsibility}</span>
          )}
        </div>
        <span className={s.cost} title="Estimated per 60 s match">
          {cost === null ? "—" : usd(cost)}
        </span>
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Prompt</span>
        <div className={s.promptSelect}>
          <select
            aria-label={`${role} prompt version`}
            value={promptId}
            onChange={(e) => onPrompt(e.target.value)}
          >
            {prompts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
                {ranks[x.id].label === "Untested" ? " · untested" : ""}
              </option>
            ))}
          </select>
          {rank && <Badge tone={rank.tone}>{rank.label.split(" · ")[0]}</Badge>}
        </div>
      </div>
      {promptId !== teamPromptId && (
        <span className={s.swapped}>Swapped from team version · unsaved</span>
      )}
      <div className={s.row}>
        <span className={s.rowLabel}>Model</span>
        <div className={s.models}>
          {MODEL_OPTIONS.map((m) => (
            <Chip
              key={m.id}
              swatch={seriesVar(m.id)}
              pressed={model === m.id && !custom}
              title={m.note}
              onClick={() => {
                setCustom(false);
                onModel(m.id);
              }}
            >
              {m.short}
            </Chip>
          ))}
          <Chip pressed={custom} onClick={() => setCustom(true)}>
            Other…
          </Chip>
          {custom && (
            <input
              aria-label={`${role} custom model id`}
              style={{
                width: 160,
                minHeight: 30,
                padding: "4px 10px",
                fontSize: 12.5,
              }}
              placeholder="model id"
              value={model}
              onChange={(e) => onModel(e.target.value)}
            />
          )}
        </div>
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Reasoning</span>
        {!usesInference(model) ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Not used: Jev returns a choice with probabilities
          </span>
        ) : (
          <div className={s.inline}>
            <select
              aria-label={`${role} reasoning effort`}
              value={inference.reasoningEffort}
              onChange={(e) =>
                onInference({
                  reasoningEffort: e.target
                    .value as InferenceSettings["reasoningEffort"],
                })
              }
            >
              {EFFORTS.map((x) => (
                <option
                  key={x}
                  value={x}
                  disabled={model === "gpt-6.1-sol" && x === "none"}
                >
                  {x}
                </option>
              ))}
            </select>
            <input
              aria-label={`${role} max output tokens`}
              type="number"
              min={256}
              max={4096}
              step={256}
              value={inference.maxOutputTokens}
              onChange={(e) =>
                onInference({ maxOutputTokens: Number(e.target.value) })
              }
              style={{ width: 96 }}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              max output tokens
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function SaveTeamDialog({
  open,
  onClose,
  team,
  promptIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  team?: RecordData;
  promptIds: Record<Role, string>;
  onSaved: (id: string) => void;
}) {
  const [label, setLabel] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && team) setLabel(`${team.label} · custom lineup`);
  }, [open, team]);
  if (!team) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      small
      title="Save as a team version"
      sub="Team versions are permanent records. The current version stays unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !label.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const x = await postJSON<{ id: string }>(
                  "/api/workspace",
                  {
                    kind: "teams",
                    record: {
                      label,
                      formationId: team.formationId,
                      parentId: team.id,
                      promptIds,
                    },
                  },
                  ["workspace"],
                );
                toast("Team version saved.", "success");
                onSaved(x.id);
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save team version"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          data-autofocus
        />
      </Field>
    </Dialog>
  );
}
