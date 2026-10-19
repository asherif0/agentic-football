"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, type Role, type Workspace } from "../../../lib/domain";
import type {
  MatchResult,
  RsiEstimate,
  RsiRound,
  RsiScore,
  RsiSession,
} from "../../../lib/rsi/types";
import type { RunSummary } from "../../../lib/simulation/run-summary";
import { getJSON, postJSON, useResource } from "../../lib/data/cache";
import { useWorkspace } from "../../lib/data/hooks";
import { diffLines } from "../../lib/diff";
import { date, dateTime, plural } from "../../lib/format";
import { MODEL_OPTIONS, modelShort, writerFor } from "../../lib/models";
import { gsap, reducedMotion, useGSAP } from "../../lib/motion";
import { toast } from "../../lib/toast";
import { usePreparation } from "../Preparation";
import { PageHeader } from "../shell/PageHeader";
import { CopyButton } from "../ui/CopyButton";
import { Dialog } from "../ui/Overlay";
import { Badge, Button, Card, Field, Notice, Skeleton } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import { ScoreSteps, type StepPoint } from "./ScoreSteps";
import s from "./rsi.module.css";

type Spend = {
  matchesUsd: number;
  rewritesUsd: number;
  reservedUsd: number;
  totalUsd: number;
};
type ListSession = Omit<RsiSession, "start" | "best"> & {
  spend: Spend;
  best: Omit<RsiSession["best"], "prompts">;
};
type ListData = { sessions: ListSession[]; connected: boolean };
type Detail = {
  session: RsiSession & { spend: Spend };
  nextRoundUsd: number;
  runs: RunSummary[];
};
type Preview = {
  estimate: RsiEstimate;
  problem: string | null;
  reusedRunIds: string[];
  seeds: number[];
};

const LIVE = ["running", "paused"];
const money = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n === 0
      ? "$0"
      : n < 0.1
        ? `$${n.toFixed(3)}`
        : `$${n.toFixed(2)}`;
const pts = (sc: RsiScore | null | undefined) =>
  sc ? sc.points.toFixed(2) : "—";
/** Rounds that used an attempt; a writer call that never connected doesn't count. */
const used = (rounds: RsiRound[]) =>
  rounds.filter(
    (r) =>
      !(r.outcome === "failed" && !r.roles.length && !r.rewrite?.responseId),
  ).length;
const sign = (n: number, d = 2) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;
const scoreLine = (sc: RsiScore | null | undefined) =>
  sc
    ? `${sc.points.toFixed(2)} pts · ${sign(sc.goalDiff)} goal diff · ${sign(sc.onTargetDiff)} on target · ${sc.turnovers.toFixed(2)} dangerous turnovers`
    : "Not scored";
const short = (model: string) =>
  MODEL_OPTIONS.find((m) => m.id === model)?.short ?? modelShort(model);

/** Which part of the comparison made the best version win. */
function decidedBy(a: RsiScore | null, b: RsiScore | null) {
  if (!a || !b) return "";
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  if (!close(a.points, b.points)) return "on points";
  if (!close(a.goalDiff, b.goalDiff)) return "on goal difference";
  if (!close(a.onTargetDiff, b.onTargetDiff)) return "on shots on target";
  return "with fewer dangerous turnovers";
}

type Tone = "lime" | "warn" | "good" | "neutral" | "bad";
const STATUS: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Running", tone: "lime" },
  paused: { label: "Paused", tone: "warn" },
  completed: { label: "Finished", tone: "good" },
  limited: { label: "Spending limit reached", tone: "warn" },
  stopped: { label: "Stopped", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
};
const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  improved: { label: "New best", tone: "lime" },
  "no-better": { label: "No better", tone: "neutral" },
  "rejected-early": { label: "Rejected early", tone: "neutral" },
  "no-change": { label: "Nothing new", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
  limited: { label: "Stopped at limit", tone: "warn" },
  stopped: { label: "Stopped", tone: "neutral" },
};

type Setup = {
  formationId: string;
  teamId: string;
  model: string;
  bot: "balanced" | "press" | "counter";
  duration: number;
  matches: number;
  limit: string;
  maxRounds: string;
  patience: string;
  guidance: boolean;
};

export default function RsiView() {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    { value: prep, set: setPrep, ready } = usePreparation(),
    { data: ws } = useWorkspace(),
    w = ws?.records;
  const list = useResource<ListData>("rsi", () => getJSON("/api/rsi"), {
    refreshMs: (d) =>
      d?.sessions.some((x) => x.status === "running") ? 2500 : null,
  });
  const sessions = list.data?.sessions ?? [];
  const active = sessions.find((x) => LIVE.includes(x.status));
  const selectedId =
    params.get("session") || active?.id || sessions[0]?.id || null;
  const detail = useResource<Detail>(
    selectedId ? `rsi:${selectedId}` : null,
    () => getJSON(`/api/rsi/${selectedId}`),
    {
      refreshMs: (d) => (d?.session.status === "running" ? 2000 : null),
    },
  );
  const select = (id: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("session", id);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  /* ---------- setup ---------- */
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    if (setup || !w || !ready) return;
    const team =
      w.teams.find((t) => t.id === prep.team) ?? w.teams.at(-1) ?? null;
    const models = Object.values(prep.models ?? {}) as string[];
    const uniform = models.length && models.every((m) => m === models[0]);
    setSetup({
      formationId: team?.formationId ?? "",
      teamId: team?.id ?? "",
      model:
        uniform && MODEL_OPTIONS.some((m) => m.id === models[0])
          ? models[0]
          : "gpt-6-luna",
      bot: "balanced",
      duration: 20,
      matches: 4,
      limit: "1.00",
      maxRounds: "8",
      patience: "3",
      guidance: true,
    });
  }, [setup, w, ready, prep]);
  const patch = (p: Partial<Setup>) =>
    setSetup((old) => (old ? { ...old, ...p } : old));

  const formations = useMemo(
    () =>
      w
        ? w.formations.filter((f) =>
            w.teams.some((t) => t.formationId === f.id),
          )
        : [],
    [w],
  );
  const teams = useMemo(
    () =>
      w && setup
        ? w.teams
            .filter((t) => t.formationId === setup.formationId)
            .slice()
            .reverse()
        : [],
    [w, setup],
  );
  // Positions with at least one critical-events collection in this formation.
  const covered = useMemo(
    () =>
      w && setup
        ? ROLES.filter((r) =>
            w.collections.some(
              (c) => c.formationId === setup.formationId && c.role === r,
            ),
          )
        : [],
    [w, setup],
  );

  const body = useMemo(() => {
    if (!setup) return null;
    return {
      teamId: setup.teamId,
      scenarioId:
        prep.team === setup.teamId ? prep.scenario || undefined : undefined,
      provider: prep.provider === "mock" ? undefined : prep.provider,
      model: setup.model,
      inference: prep.inference,
      bot: setup.bot,
      duration: setup.duration,
      matchesPerRound: setup.matches,
      costLimitUsd: Number(setup.limit),
      maxRounds: Number(setup.maxRounds),
      patience: Number(setup.patience),
      guidance: setup.guidance && covered.length > 0,
    };
  }, [setup, prep, covered]);

  const [preview, setPreview] = useState<Preview | null>(null),
    [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!body?.teamId) return;
    const ctrl = { stale: false };
    const t = setTimeout(async () => {
      try {
        const res = await postJSON<Preview>(
          "/api/rsi",
          { ...body, action: "preview" },
          [],
        );
        if (!ctrl.stale) {
          setPreview(res);
          setPreviewError(null);
        }
      } catch (e) {
        if (!ctrl.stale) {
          setPreview(null);
          setPreviewError((e as Error).message);
        }
      }
    }, 300);
    return () => {
      ctrl.stale = true;
      clearTimeout(t);
    };
  }, [body]);

  const [confirming, setConfirming] = useState(false),
    [starting, setStarting] = useState(false);
  async function start() {
    if (!body) return;
    setStarting(true);
    try {
      const created = await postJSON<RsiSession>("/api/rsi", body, ["rsi"]);
      setConfirming(false);
      toast(
        "RSI started. You can leave this page; it keeps running.",
        "success",
      );
      select(created.id);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setStarting(false);
    }
  }

  async function control(id: string, command: "run" | "pause" | "stop") {
    try {
      await postJSON(`/api/rsi/${id}`, { command }, ["rsi", `rsi:${id}`]);
      toast(
        command === "stop"
          ? "Stopped. The best version so far is kept."
          : command === "pause"
            ? "Paused."
            : "Resumed.",
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const canStart =
    !!setup &&
    !!preview &&
    !preview.problem &&
    !previewError &&
    !active &&
    !!setup.teamId;
  const writer = setup ? writerFor(setup.model) : null;

  return (
    <>
      <PageHeader
        eyebrow="Recursive self-improvement"
        title="Let the lab tune your squad"
        description="Pick a starting version and a model. RSI plays a few matches, rewrites the players' prompts from what happened, replays the same matches and keeps whichever version scores best. It stops at your spending limit, and only the winner is saved."
      />
      <div className={s.layout}>
        <Card
          className={s.setup}
          eyebrow="New session"
          title="Setup"
          data-reveal
        >
          {!setup || !w ? (
            <div className={s.stack}>
              <Skeleton height={34} />
              <Skeleton height={34} />
              <Skeleton height={34} />
              <Skeleton height={120} />
            </div>
          ) : (
            <form
              className={s.stack}
              onSubmit={(e) => {
                e.preventDefault();
                if (canStart) setConfirming(true);
              }}
            >
              <fieldset className={s.group}>
                <legend className="eyebrow">Squad</legend>
                <Field label="Formation">
                  <Segmented
                    label="Formation"
                    size="sm"
                    full
                    value={setup.formationId}
                    options={formations.map((f) => ({
                      value: f.id,
                      label: f.family,
                    }))}
                    onChange={(v) => {
                      const team = w.teams
                        .filter((t) => t.formationId === v)
                        .at(-1);
                      patch({ formationId: v, teamId: team?.id ?? "" });
                    }}
                  />
                </Field>
                <Field label="Starting version">
                  <select
                    id="rsi-team"
                    value={setup.teamId}
                    onChange={(e) => patch({ teamId: e.target.value })}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Model"
                  hint={
                    writer === setup.model
                      ? `${short(setup.model)} plays all five positions and rewrites their prompts.`
                      : `${short(setup.model)} plays all five positions. It can't write text, so ${short(writer!)} rewrites the prompts.`
                  }
                >
                  <select
                    id="rsi-model"
                    value={setup.model}
                    onChange={(e) => patch({ model: e.target.value })}
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.short} · {m.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>

              <fieldset className={s.group}>
                <legend className="eyebrow">Matches</legend>
                <Field label="Opponent" hint="Scripted bots">
                  <Segmented
                    label="Opponent"
                    size="sm"
                    full
                    value={setup.bot}
                    options={[
                      { value: "balanced", label: "Balanced" },
                      { value: "press", label: "Press" },
                      { value: "counter", label: "Counter" },
                    ]}
                    onChange={(v) => patch({ bot: v as Setup["bot"] })}
                  />
                </Field>
                <div className={s.pair}>
                  <Field label="Match length">
                    <Segmented
                      label="Match length"
                      size="sm"
                      full
                      value={String(setup.duration)}
                      options={["10", "20", "30", "60"].map((v) => ({
                        value: v,
                        label: `${v}s`,
                      }))}
                      onChange={(v) => patch({ duration: Number(v) })}
                    />
                  </Field>
                  <Field label="Matches per round">
                    <Segmented
                      label="Matches per round"
                      size="sm"
                      full
                      value={String(setup.matches)}
                      options={["2", "4", "6", "8"].map((v) => ({
                        value: v,
                        label: v,
                      }))}
                      onChange={(v) => patch({ matches: Number(v) })}
                    />
                  </Field>
                </div>
                <p className={s.note}>
                  Every version plays the same seeds (
                  {preview?.seeds.join(", ") ?? "42, 43"}), once from each end.
                </p>
              </fieldset>

              <fieldset className={s.group}>
                <legend className="eyebrow">Budget</legend>
                <div className={s.triple}>
                  <Field label="Spending limit">
                    <span className={s.money}>
                      <span aria-hidden>$</span>
                      <input
                        id="rsi-limit"
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        max={100}
                        step={0.05}
                        value={setup.limit}
                        onChange={(e) => patch({ limit: e.target.value })}
                      />
                    </span>
                  </Field>
                  <Field label="Max rounds">
                    <input
                      id="rsi-rounds"
                      type="number"
                      min={1}
                      max={20}
                      value={setup.maxRounds}
                      onChange={(e) => patch({ maxRounds: e.target.value })}
                    />
                  </Field>
                  <Field label="Give up after">
                    <input
                      id="rsi-patience"
                      type="number"
                      min={1}
                      max={10}
                      value={setup.patience}
                      onChange={(e) => patch({ patience: e.target.value })}
                    />
                  </Field>
                </div>
                <p className={s.note}>
                  Ends early after {setup.patience || "–"} rounds in a row
                  without a new best.
                </p>
              </fieldset>

              <label
                className={s.check}
                aria-disabled={!covered.length || undefined}
              >
                <input
                  id="rsi-guidance"
                  type="checkbox"
                  checked={setup.guidance && covered.length > 0}
                  disabled={!covered.length}
                  onChange={(e) => patch({ guidance: e.target.checked })}
                />
                <span>
                  <span className={s.checkTitle}>Use my critical events</span>
                  <span className={s.note}>
                    {covered.length
                      ? `Sends your diagnoses for ${covered.join(", ")} to the writer.`
                      : "None saved for this formation yet. Annotate moments in Simulate to add some."}
                  </span>
                </span>
              </label>

              <EstimatePanel
                preview={preview}
                error={previewError}
                limit={Number(setup.limit)}
              />

              {active && (
                <Notice icon="info">
                  One session at a time. Stop or finish the current one to start
                  another.
                </Notice>
              )}
              <Button
                type="submit"
                variant="primary"
                icon="loop"
                disabled={!canStart}
              >
                Start RSI · up to {money(Number(setup.limit) || 0)}
              </Button>
            </form>
          )}
        </Card>

        <div className={s.main}>
          {list.loading && !list.data ? (
            <Card>
              <Skeleton height={240} />
            </Card>
          ) : !selectedId ? (
            <HowItWorks />
          ) : detail.data && detail.data.session.id === selectedId ? (
            <SessionPanel
              detail={detail.data}
              w={w}
              onControl={(c) => control(selectedId, c)}
              onUse={(teamId, label) => {
                setPrep((old) => ({
                  ...old,
                  team: teamId,
                  scenario: "",
                  lineup: {},
                }));
                toast(`Squad switched to ${label}.`, "success");
              }}
            />
          ) : (
            <Card>
              <Skeleton height={320} />
            </Card>
          )}
          {sessions.length > 0 && (
            <History
              sessions={sessions}
              selected={selectedId}
              onSelect={select}
            />
          )}
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Start RSI?"
        small
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="loop"
              disabled={starting}
              onClick={start}
              data-autofocus
            >
              {starting
                ? "Starting…"
                : `Spend up to ${money(Number(setup?.limit) || 0)}`}
            </Button>
          </>
        }
      >
        {setup && preview && (
          <div className={s.confirm}>
            <p>
              RSI will tune all five prompts in{" "}
              <strong>{teams.find((t) => t.id === setup.teamId)?.label}</strong>
              , playing {setup.matches} matches per round with{" "}
              {short(setup.model)}
              {writer !== setup.model
                ? ` and rewriting with ${short(writer!)}`
                : ""}
              .
            </p>
            <ul className={s.confirmList}>
              <li>
                It never spends more than {money(Number(setup.limit))}. A round
                only starts if it fits in what's left.
              </li>
              <li>
                It stops after {setup.maxRounds} rounds, or after{" "}
                {setup.patience} rounds in a row without improvement.
              </li>
              <li>
                You can pause or stop at any time. The best version so far is
                saved as new prompt versions and a team version.
              </li>
            </ul>
          </div>
        )}
      </Dialog>
    </>
  );
}

function EstimatePanel({
  preview,
  error,
  limit,
}: {
  preview: Preview | null;
  error: string | null;
  limit: number;
}) {
  if (error)
    return (
      <Notice tone="bad" icon="alert">
        {error}
      </Notice>
    );
  if (!preview)
    return (
      <div className={s.estimate}>
        <Skeleton height={96} />
      </div>
    );
  const e = preview.estimate;
  return (
    <div className={s.estimate} aria-live="polite">
      <div className={s.estimateHead}>
        <span className="eyebrow">Estimate</span>
        <strong className={s.fit}>
          {preview.problem
            ? "Limit too low"
            : `About ${plural(e.roundsThatFit, "round")} fit in ${money(limit)}`}
        </strong>
      </div>
      <dl className={s.rows}>
        <div>
          <dt>Per match</dt>
          <dd>{money(e.perMatchUsd)}</dd>
        </div>
        <div>
          <dt>Per round</dt>
          <dd title="Writer at its maximum, the matches with a 30% margin, and room for in-flight reservations">
            {money(e.perRoundUsd)}
          </dd>
        </div>
        <div>
          <dt>Baseline</dt>
          <dd>
            {e.baselineUsd === 0
              ? e.reused
                ? `Free · reuses ${plural(e.reused, "stored match", "stored matches")}`
                : "Free"
              : `${money(e.baselineUsd)}${e.reused ? ` · reuses ${e.reused}` : ""}`}
          </dd>
        </div>
      </dl>
      <p className={s.note}>{e.basis}</p>
      {preview.problem && (
        <Notice tone="warn" icon="coins">
          {preview.problem}
        </Notice>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <Card
      eyebrow="How it works"
      title="A loop that keeps only what wins"
      data-reveal
    >
      <ol className={s.how}>
        <li>
          <strong>Baseline.</strong> Your starting version plays the evaluation
          matches. Stored matches with identical settings are reused for free.
        </li>
        <li>
          <strong>Rewrite.</strong> The writer reads the scores, every player's
          decisions at flagged moments and every earlier attempt, then rewrites
          the prompts it thinks will help most, from one position to all five.
        </li>
        <li>
          <strong>Replay.</strong> The rewritten squad plays the same seeds from
          both ends. If it falls behind in both matches of the first seed, the
          rest are skipped.
        </li>
        <li>
          <strong>Keep the best.</strong> It replaces the best only with more
          points per match, or equal points and a better goal difference, shots
          on target or fewer dangerous turnovers.
        </li>
      </ol>
      <Notice icon="coins">
        Your limit is a hard cap. Each round's matches are capped at what's
        left, the writer call is reserved at its maximum, and a round only
        starts when it fits.
      </Notice>
    </Card>
  );
}

/** Positions whose best prompt differs from the start. */
const changedRoles = (ss: RsiSession) =>
  ROLES.filter((r) => ss.best.prompts[r] !== ss.start[r].text);

function SessionPanel({
  detail,
  w,
  onControl,
  onUse,
}: {
  detail: Detail;
  w: Workspace | undefined;
  onControl: (c: "run" | "pause" | "stop") => void;
  onUse: (teamId: string, label: string) => void;
}) {
  const ss = detail.session,
    status = STATUS[ss.status] ?? {
      label: ss.status,
      tone: "neutral" as const,
    },
    runs = new Map(detail.runs.map((r) => [r.id, r])),
    spentPct = Math.min(
      100,
      (ss.spend.totalUsd / ss.config.costLimitUsd) * 100,
    ),
    current = ss.rounds.at(-1);
  const points: StepPoint[] = [
    {
      round: 0,
      value: ss.baseline.score?.points ?? null,
      kind: "start",
      label: `Start · ${scoreLine(ss.baseline.score)}`,
    },
    ...ss.rounds.map((r) => ({
      round: r.n,
      value: r.score?.points ?? null,
      kind:
        r.outcome === "improved" ||
        r.outcome === "no-better" ||
        r.outcome === "rejected-early"
          ? r.outcome
          : ("other" as const),
      label: `Round ${r.n} · ${OUTCOME[r.outcome ?? ""]?.label ?? "In progress"} · ${scoreLine(r.score)}`,
    })),
  ];
  const playing = (ids: string[]) => {
    const list = ids.map((id) => runs.get(id)).filter(Boolean) as RunSummary[];
    const done = list.filter(
      (r) => !["queued", "running", "paused"].includes(r.status),
    ).length;
    return `${done} of ${list.length}`;
  };
  const stage =
    ss.status !== "running"
      ? null
      : ss.baseline.stage === "evaluating"
        ? `Playing baseline matches · ${playing(ss.baseline.runIds.filter((id) => !ss.baseline.reusedRunIds.includes(id)))} done`
        : current?.stage === "rewriting"
          ? `Round ${current.n} · ${short(ss.config.writer.model)} is rewriting the prompts`
          : current?.stage === "evaluating"
            ? `Round ${current.n} · playing matches · ${playing(current.runIds)} done`
            : "Preparing the next round";

  return (
    <>
      <Card data-reveal>
        <div className={s.sessionHead}>
          <div>
            <span className="eyebrow">Session · {dateTime(ss.createdAt)}</span>
            <h2 className={s.sessionTitle}>{ss.config.teamLabel}</h2>
            <p className={s.meta}>
              {short(ss.config.model)} plays
              {ss.config.writer.model !== ss.config.model
                ? ` · ${short(ss.config.writer.model)} writes`
                : " and writes"}{" "}
              · {ss.config.bot} bots · {ss.config.duration}s matches ·{" "}
              {ss.config.seeds.length * 2} per round
            </p>
          </div>
          <div className={s.controls}>
            <Badge tone={status.tone} dot={ss.status === "running"}>
              {status.label}
            </Badge>
            {ss.status === "running" && (
              <Button size="sm" icon="pause" onClick={() => onControl("pause")}>
                Pause
              </Button>
            )}
            {ss.status === "paused" && (
              <Button size="sm" icon="play" onClick={() => onControl("run")}>
                Resume
              </Button>
            )}
            {LIVE.includes(ss.status) && (
              <Button
                size="sm"
                variant="ghost"
                icon="close"
                onClick={() => onControl("stop")}
              >
                Stop
              </Button>
            )}
          </div>
        </div>
        {(stage || ss.reason) && (
          <p className={s.stage} role="status">
            {stage && <span className={s.pulse} aria-hidden />}
            {stage ?? ss.reason}
          </p>
        )}
        <div className={s.kpis}>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Spent</span>
            <span className={s.kpiValue}>{money(ss.spend.totalUsd)}</span>
            <span className={s.meter} aria-hidden>
              <span style={{ width: `${spentPct}%` }} />
            </span>
            <span className={s.kpiSub}>
              of {money(ss.config.costLimitUsd)}
              {LIVE.includes(ss.status) && ss.spend.reservedUsd > 0
                ? ` · ${money(ss.spend.reservedUsd)} reserved`
                : ""}
            </span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Start</span>
            <span className={s.kpiValue}>{pts(ss.baseline.score)}</span>
            <span className={s.kpiSub}>points per match</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Best</span>
            <span className={s.kpiValue}>{pts(ss.best.score)}</span>
            <span className={s.kpiSub}>
              {ss.best.round
                ? `from round ${ss.best.round}`
                : "still the start"}
            </span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Rounds</span>
            <span className={s.kpiValue}>
              {used(ss.rounds)}
              <span className={s.kpiOf}>/{ss.config.maxRounds}</span>
            </span>
            <span className={s.kpiSub}>
              {LIVE.includes(ss.status)
                ? `next ≈ ${money(detail.nextRoundUsd)}`
                : `${ss.noImprovement} without gain at the end`}
            </span>
          </div>
        </div>
        {ss.baseline.score && (
          <ScoreSteps
            points={points}
            rounds={Math.max(
              ss.rounds.length,
              Math.min(ss.config.maxRounds, 4),
            )}
          />
        )}
      </Card>

      <BestCard ss={ss} w={w} onUse={onUse} />

      <Card eyebrow="Rounds" title="What the writer tried" data-reveal>
        <ol className={s.rounds}>
          {[...ss.rounds].reverse().map((r) => (
            <RoundItem key={r.n} r={r} ss={ss} runs={runs} />
          ))}
          <li className={s.round}>
            <div className={s.roundHead}>
              <span className={s.roundNo}>Start</span>
              <span className={s.roundTitle}>{ss.config.teamLabel}</span>
              {ss.baseline.stage === "done" ? (
                <Badge>Baseline</Badge>
              ) : (
                <Badge tone="lime" dot>
                  Playing
                </Badge>
              )}
            </div>
            <Matches
              results={ss.baseline.results}
              ids={ss.baseline.runIds}
              runs={runs}
              reused={ss.baseline.reusedRunIds}
            />
            {ss.baseline.score && (
              <p className={s.score}>{scoreLine(ss.baseline.score)}</p>
            )}
          </li>
        </ol>
      </Card>
    </>
  );
}

function RoundItem({
  r,
  ss,
  runs,
}: {
  r: RsiRound;
  ss: RsiSession;
  runs: Map<string, RunSummary>;
}) {
  const ref = useRef<HTMLLIElement>(null),
    o = r.outcome ? OUTCOME[r.outcome] : null;
  useGSAP(
    () => {
      if (!ref.current || reducedMotion()) return;
      gsap.fromTo(
        ref.current,
        { y: 6 },
        { y: 0, duration: 0.4, ease: "power2.out" },
      );
    },
    { scope: ref },
  );
  const cost =
    (r.rewrite ? (r.rewrite.costUsd ?? r.rewrite.reservedUsd) : 0) +
    r.runIds.reduce((n, id) => {
      const run = runs.get(id);
      return n + (run ? (run.cost ?? 0) + (run.reservedCost ?? 0) : 0);
    }, 0);
  return (
    <li
      className={`${s.round} ${r.outcome === "improved" ? s.roundBest : ""}`}
      ref={ref}
    >
      <div className={s.roundHead}>
        <span className={s.roundNo}>R{r.n}</span>
        <span className={s.roundTitle}>
          {r.roles.length
            ? r.roles.join(" · ")
            : r.stage === "rewriting"
              ? "Rewriting"
              : "No prompts changed"}
        </span>
        {o ? (
          <Badge tone={o.tone}>{o.label}</Badge>
        ) : (
          <Badge tone="lime" dot>
            {r.stage === "rewriting" ? "Rewriting" : "Playing"}
          </Badge>
        )}
        <span className={s.cost}>{money(cost)}</span>
      </div>
      {r.changes.length > 0 && (
        <ul className={s.changes}>
          {r.changes.map((c, i) => (
            <li key={i}>
              <span className={s.roleTag}>{c.role}</span>
              {c.change}
            </li>
          ))}
        </ul>
      )}
      {r.runIds.length > 0 && (
        <Matches results={r.results} ids={r.runIds} runs={runs} />
      )}
      {r.score && <p className={s.score}>{scoreLine(r.score)}</p>}
      {r.reason && r.stage === "done" && <p className={s.reason}>{r.reason}</p>}
      {r.roles.length > 0 && (
        <details className={s.prompt}>
          <summary>Rewritten prompts and changes from the start</summary>
          {r.rationale && <p className={s.rationale}>{r.rationale}</p>}
          {r.roles.map((role) => (
            <div key={role} className={s.promptBlock}>
              <span className={s.roleTag}>{role}</span>
              <Diff before={ss.start[role].text} after={r.prompts[role]!} />
            </div>
          ))}
        </details>
      )}
    </li>
  );
}

function Matches({
  results,
  ids,
  runs,
  reused = [],
}: {
  results: MatchResult[];
  ids: string[];
  runs: Map<string, RunSummary>;
  reused?: string[];
}) {
  const byId = new Map(results.map((r) => [r.runId, r]));
  return (
    <div className={s.matches}>
      {ids.map((id) => {
        const res = byId.get(id),
          run = runs.get(id);
        const status = run?.status ?? res?.status ?? "queued";
        const done = status === "completed",
          gf = res?.goalsFor ?? run?.score.for,
          ga = res?.goalsAgainst ?? run?.score.against,
          letter =
            !done || gf === undefined || ga === undefined
              ? null
              : gf > ga
                ? "W"
                : gf === ga
                  ? "D"
                  : "L";
        const seed = run
          ? `${run.seed} ${run.side}`
          : res
            ? `${res.seed} ${res.side}`
            : "";
        return (
          <Link
            key={id}
            href={`/simulate?run=${id}`}
            className={`${s.match} ${letter ? s[`m${letter}`] : s.mPending}`}
            title={`Seed ${seed}${reused.includes(id) ? " · reused stored match" : ""} · open replay`}
          >
            <span className={s.mLetter}>
              {letter ??
                (["queued", "running", "paused"].includes(status) ? "…" : "–")}
            </span>
            <span className={s.mScore}>
              {done ? `${gf}–${ga}` : status === "running" ? "live" : status}
            </span>
            <span className={s.mSeed}>
              s{seed}
              {reused.includes(id) ? " · stored" : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <pre className={s.diff} aria-label="Changes from the start">
      {diffLines(before, after).map((l, i) => (
        <div
          key={i}
          className={`${s.line} ${l.type === "add" ? s.add : l.type === "del" ? s.del : ""}`}
        >
          <span className={s.sign}>
            {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
          </span>
          <span>{l.text || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function BestCard({
  ss,
  w,
  onUse,
}: {
  ss: RsiSession;
  w: Workspace | undefined;
  onUse: (teamId: string, label: string) => void;
}) {
  const [view, setView] = useState<"changes" | "prompt" | null>(null),
    [picked, setPicked] = useState<Role | null>(null);
  const finished = !LIVE.includes(ss.status),
    roles = changedRoles(ss);
  if (ss.best.round === 0 || !roles.length) {
    if (!finished || !ss.baseline.score) return null;
    return (
      <Card eyebrow="Result" title="No version beat the start" data-reveal>
        <p className={s.muted}>
          None of the rewrites scored better than the starting version on these
          matches, so nothing was saved. Try more matches per round or turn on
          your critical events.
        </p>
      </Card>
    );
  }
  const role = picked && roles.includes(picked) ? picked : roles[0],
    // A full rewrite shares no lines with the start, so open on the prompt itself.
    shown =
      view ??
      (diffLines(ss.start[role].text, ss.best.prompts[role]).some(
        (l) => l.type === "same",
      )
        ? "changes"
        : "prompt"),
    saved = ss.saved?.promptIds.length
      ? w?.prompts.filter((p) => ss.saved!.promptIds.includes(p.id))
      : undefined,
    savedPrompt = saved?.find((p) => p.role === role),
    savedTeam = ss.saved?.teamId
      ? w?.teams.find((t) => t.id === ss.saved!.teamId)
      : undefined;
  return (
    <Card
      eyebrow={finished ? "Result" : "Best so far"}
      title={`Round ${ss.best.round} beat the start ${decidedBy(ss.best.score, ss.baseline.score)}`}
      className={s.best}
      data-reveal
    >
      <dl className={s.compare}>
        <div>
          <dt>Best</dt>
          <dd>{scoreLine(ss.best.score)}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{scoreLine(ss.baseline.score)}</dd>
        </div>
      </dl>
      <div className={s.bestBar}>
        <Segmented
          label="Changed position"
          size="sm"
          value={role}
          options={roles.map((r) => ({ value: r, label: r }))}
          onChange={(v) => setPicked(v as Role)}
        />
        <Segmented
          label="Best version view"
          size="sm"
          value={shown}
          options={[
            { value: "changes", label: "Changes" },
            { value: "prompt", label: "Full prompt" },
          ]}
          onChange={(v) => setView(v as "changes" | "prompt")}
        />
      </div>
      {shown === "changes" ? (
        <Diff before={ss.start[role].text} after={ss.best.prompts[role]} />
      ) : (
        <pre className={s.full}>{ss.best.prompts[role]}</pre>
      )}
      <div className={s.bestActions}>
        {savedTeam ? (
          <>
            <Badge tone="good">
              Saved {plural(saved?.length ?? 0, "prompt version")} ·{" "}
              {savedTeam.label}
            </Badge>
            {savedPrompt && (
              <Button
                size="sm"
                href={`/prompts?prompt=${savedPrompt.id}`}
                icon="prompt"
              >
                Open {role} in Prompts
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              icon="squad"
              onClick={() => onUse(savedTeam.id, savedTeam.label)}
            >
              Use in squad
            </Button>
          </>
        ) : (
          <span className={s.muted}>
            Saved as new prompt versions and a team version when the session
            ends.
          </span>
        )}
        <CopyButton
          size="sm"
          text={ss.best.prompts[role]}
          label={`Copy ${role} prompt`}
        />
      </div>
      <p className={s.note}>
        Judged on {plural(ss.best.score?.matches ?? 0, "match", "matches")}, so
        treat it as a strong lead and confirm it in Simulate before relying on
        it.
      </p>
    </Card>
  );
}

function History({
  sessions,
  selected,
  onSelect,
}: {
  sessions: ListSession[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card eyebrow="History" title="Sessions" data-reveal>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Starting version</th>
              <th scope="col">Model</th>
              <th scope="col">Rounds</th>
              <th scope="col">Start → best</th>
              <th scope="col">Spent</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((x) => (
              <tr
                key={x.id}
                aria-selected={x.id === selected}
                tabIndex={0}
                onClick={() => onSelect(x.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(x.id);
                  }
                }}
              >
                <td>{date(x.createdAt)}</td>
                <td className={s.cellLabel}>{x.config.teamLabel}</td>
                <td>{short(x.config.model)}</td>
                <td>{used(x.rounds)}</td>
                <td>
                  {pts(x.baseline.score)} → {pts(x.best.score)}
                  {x.best.round ? ` (R${x.best.round})` : ""}
                </td>
                <td>
                  {money(x.spend.totalUsd)} / {money(x.config.costLimitUsd)}
                </td>
                <td>
                  <Badge
                    tone={STATUS[x.status]?.tone ?? "neutral"}
                    dot={x.status === "running"}
                  >
                    {STATUS[x.status]?.label ?? x.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
