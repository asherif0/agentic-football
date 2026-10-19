import OpenAI from "openai";
import { ROLES, type Role } from "../domain";
import { plannedCalls, type SimRepository } from "../simulation/repository";
import type { Run, RunConfig, Side } from "../simulation/types";
import { PRICING, estimatedCost } from "../simulation/pricing";
import { conditionKey } from "../improvement/evaluation";
import { stableJSON } from "../improvement/keys";
import {
  modelShort,
  proposalModelProblem,
  providerFor,
  writerFor,
} from "../../app/lib/models";
import { estimateMatchCost, FALLBACK_USAGE } from "../../app/lib/squad";
import { rsiRepository } from "./persistence";
import { earlyReject, evaluate, isBetter, matchResult } from "./score";
import {
  guidanceCollections,
  MAX_INPUT_TOKENS,
  WRITER_OUTPUT_TOKENS,
  parseRewrite,
  requestRewrite,
  rewriteInput,
  sameText,
  type CreateResponse,
} from "./rewrite";
import {
  RSI_VERSION,
  type MatchResult,
  type RoundOutcome,
  type RsiEstimate,
  type RsiRound,
  type RsiScore,
  type RsiSession,
  type RsiStatus,
} from "./types";

export const SEEDS = [42, 43, 44, 45];
export const MATCH_COUNTS = [2, 4, 6, 8];
/** Safety margin on the per-match estimate when deciding whether a round fits. */
export const MARGIN = 1.3;
const ACTIVE = ["queued", "running", "paused"];
const FINISHED: RsiStatus[] = ["completed", "limited", "stopped", "failed"];

const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const keys = () => ({
  openai: !!process.env.OPENAI_API_KEY,
  jev: !!process.env.JEV_API_KEY,
});
const signed = (n: number, digits = 2) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
export const describeScore = (s: RsiScore | null) =>
  s
    ? `${s.points.toFixed(2)} pts, ${signed(s.goalDiff)} goal diff, ${signed(s.onTargetDiff)} shots on target, ${s.turnovers.toFixed(2)} dangerous turnovers per match (${s.matches} matches)`
    : "not scored";

const matchList = (seeds: number[]) =>
  seeds.flatMap((seed) =>
    (["home", "away"] as Side[]).map((side) => ({ seed, side })),
  );
const slot = (r: { seed: number; side: Side }) => `${r.seed}:${r.side}`;

/** Average tokens per decision from stored matches where all five players used one model. */
function observedUsage(repo: SimRepository) {
  const sums: Record<string, { input: number; output: number; n: number }> = {};
  for (const r of repo.runs()) {
    if (r.status !== "completed" || !r.requests || !r.inputTokens) continue;
    const models = new Set(Object.values(r.config.team.models));
    if (models.size !== 1 || r.config.opponent) continue;
    const m = [...models][0];
    sums[m] ??= { input: 0, output: 0, n: 0 };
    sums[m].input += r.inputTokens;
    sums[m].output += r.outputTokens;
    sums[m].n += r.requests;
  }
  return Object.fromEntries(
    Object.entries(sums).map(([m, v]) => [
      m,
      { input: v.input / v.n, output: v.output / v.n },
    ]),
  );
}

function failedDecisions(repo: SimRepository, run: Run) {
  return repo
    .rounds(run.id)
    .flatMap((r) => r.traces)
    .filter((t) => t.provider !== "scripted" && t.error).length;
}

/** Stored, finished matches that already measure the starting version under the same conditions. */
function reusable(
  repo: SimRepository,
  baseline: RunConfig,
  seeds: number[],
  origins: Run["evidenceOrigin"][],
) {
  const key = conditionKey(baseline),
    prompts = stableJSON(ROLES.map((r) => baseline.team.prompts[r].text)),
    wanted = new Set(matchList(seeds).map(slot)),
    found = new Map<string, Run>();
  for (const r of repo.runs()) {
    const k = slot({ seed: r.config.seed, side: r.config.teamSide });
    if (
      found.has(k) ||
      !wanted.has(k) ||
      r.status !== "completed" ||
      !origins.includes(r.evidenceOrigin) ||
      r.config.bot !== baseline.bot ||
      conditionKey(r.config) !== key ||
      stableJSON(ROLES.map((x) => r.config.team.prompts[x].text)) !== prompts ||
      failedDecisions(repo, r) > 0
    )
      continue;
    found.set(k, r);
  }
  return [...found.values()];
}

function int(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  const n =
    value === undefined || value === null || value === ""
      ? fallback
      : Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function previewRsi(repo: SimRepository, input: any) {
  const w = repo.store.read(),
    team = w.teams.find((t) => t.id === input.teamId);
  if (!team) throw new Error("Choose a starting version.");
  const formation = w.formations.find((f) => f.id === team.formationId);
  if (!formation)
    throw new Error("The starting version's formation is missing.");
  const matches = int(input.matchesPerRound, 4, 2, 8, "Matches per round");
  if (!MATCH_COUNTS.includes(matches))
    throw new Error("Matches per round must be 2, 4, 6 or 8.");
  const seeds = SEEDS.slice(0, matches / 2),
    duration = int(input.duration, 20, 10, 120, "Match length"),
    maxRounds = int(input.maxRounds, 8, 1, 20, "Max rounds"),
    patience = int(input.patience, 3, 1, 10, "Rounds without improvement"),
    costLimitUsd = Number(input.costLimitUsd);
  if (
    !Number.isFinite(costLimitUsd) ||
    costLimitUsd < 0.01 ||
    costLimitUsd > 100
  )
    throw new Error("Set a spending limit from $0.01 to $100.");
  const bot = input.bot ?? "balanced";
  if (!["balanced", "press", "counter"].includes(bot))
    throw new Error("Choose an opponent style.");
  const model = String(input.model ?? "").trim();
  if (!model) throw new Error("Choose a model.");
  const models = Object.fromEntries(ROLES.map((r) => [r, model])) as Record<
    Role,
    string
  >;
  const provider =
    input.provider === "mock" ? "mock" : providerFor(models, input.provider);
  const writerModel = writerFor(model);
  const writerPricing = PRICING[writerModel] ?? null;
  if (provider !== "mock") {
    const problem = proposalModelProblem(
      writerModel,
      keys(),
      process.env.PROMPT_REVISION_MODEL,
    );
    if (problem) throw new Error(problem);
    if (!writerPricing)
      throw new Error(
        `No price is known for ${writerModel}, so the spending limit can't be enforced.`,
      );
    if (!PRICING[model])
      throw new Error(
        `No price is known for ${model}, so the spending limit can't be enforced.`,
      );
  }
  const scenarios = repo
      .scenarios()
      .filter((s) => s.formationId === team.formationId),
    scenarioId = scenarios.some((s) => s.id === input.scenarioId)
      ? input.scenarioId
      : scenarios[0]?.id;
  if (!scenarioId)
    throw new Error("This formation has no starting layout yet.");
  const collectionIds =
    input.guidance === false
      ? []
      : guidanceCollections(w, team.formationId).map((c) => c.id as string);
  const calls = plannedCalls(duration, 1, false);
  const baseline = repo.buildConfig({
    teamId: team.id,
    scenarioId,
    models,
    inference: input.inference,
    provider,
    bot,
    teamSide: "home",
    seed: seeds[0],
    duration,
    interval: 1,
    requestLimit: calls * 2,
    inputTokenLimit: 100000000,
    label: `RSI · ${team.label}`,
  });
  const reused = reusable(
    repo,
    baseline,
    seeds,
    provider === "mock" ? ["test fixture"] : ["local simulation", "rsi"],
  );
  const usage = observedUsage(repo),
    observed = !!usage[model];
  let perMatchUsd = 0,
    headroomUsd = 0,
    rewriteMaxUsd = 0;
  if (provider !== "mock") {
    perMatchUsd = estimateMatchCost(models, duration, 1, usage).total ?? 0;
    // Five decisions are reserved at once while a match plays; keep room for them.
    headroomUsd = ROLES.reduce((n, r) => {
      const u = usage[models[r]] ?? FALLBACK_USAGE;
      return (
        n +
        estimatedCost(
          PRICING[models[r]],
          u.input + 2048,
          baseline.team.inference?.[r]?.maxOutputTokens ?? 256,
          true,
        )
      );
    }, 0);
    rewriteMaxUsd = estimatedCost(
      writerPricing!,
      MAX_INPUT_TOKENS,
      WRITER_OUTPUT_TOKENS,
      true,
    );
  }
  const missing = matches - reused.length,
    baselineUsd = missing ? missing * perMatchUsd * MARGIN + headroomUsd : 0,
    perRoundUsd = rewriteMaxUsd + matches * perMatchUsd * MARGIN + headroomUsd,
    roundsThatFit =
      perRoundUsd > 0
        ? Math.max(
            0,
            Math.min(
              maxRounds,
              Math.floor((costLimitUsd - baselineUsd) / perRoundUsd),
            ),
          )
        : maxRounds;
  const estimate: RsiEstimate = {
    perMatchUsd,
    perRoundUsd,
    rewriteMaxUsd,
    headroomUsd,
    baselineUsd,
    reused: reused.length,
    roundsThatFit,
    basis:
      provider === "mock"
        ? "Mock players make no paid calls."
        : observed
          ? "Based on token use in your stored matches."
          : "Based on default token use; no stored matches for this model yet.",
  };
  const problem =
    roundsThatFit < 1
      ? `A ${usd(costLimitUsd)} limit can't cover the baseline and one round. Raise it to at least ${usd(baselineUsd + perRoundUsd)}.`
      : null;
  return {
    config: {
      teamId: team.id,
      teamLabel: team.label,
      formationId: team.formationId,
      formationName: formation.label || formation.family,
      scenarioId,
      model,
      models,
      inference: baseline.team.inference,
      provider,
      writer: {
        model: writerModel,
        reasoningEffort: "low" as const,
        maxOutputTokens: WRITER_OUTPUT_TOKENS,
        pricing: writerPricing,
      },
      bot,
      duration,
      interval: 1,
      seeds,
      costLimitUsd,
      maxRounds,
      patience,
      collectionIds,
      baseline,
    },
    reusedRunIds: reused.map((r) => r.id),
    estimate,
    problem,
  };
}

export function createRsi(repo: SimRepository, input: any) {
  const preview = previewRsi(repo, input);
  if (preview.problem) throw new Error(preview.problem);
  const db = rsiRepository(repo);
  if (db.active().length)
    throw new Error(
      "Another RSI session is still active. Stop it or let it finish first.",
    );
  const w = repo.store.read(),
    team = w.teams.find((t) => t.id === preview.config.teamId)!,
    now = new Date().toISOString(),
    start = Object.fromEntries(
      ROLES.map((r) => {
        const p = w.prompts.find((p) => p.id === team.promptIds[r])!;
        return [r, { id: p.id, text: p.text, label: p.label }];
      }),
    ) as RsiSession["start"],
    reused = preview.reusedRunIds.map((id) => repo.run(id)!),
    s: RsiSession = {
      id: crypto.randomUUID(),
      version: RSI_VERSION,
      createdAt: now,
      updatedAt: now,
      label: `${team.label} · ${modelShort(preview.config.model)}`,
      status: "running",
      reason: null,
      config: preview.config,
      estimate: preview.estimate,
      start,
      baseline: {
        stage: "evaluating",
        runIds: reused.map((r) => r.id),
        reusedRunIds: reused.map((r) => r.id),
        seriesIds: [],
        results: [],
        score: null,
      },
      rounds: [],
      best: {
        round: 0,
        prompts: Object.fromEntries(
          ROLES.map((r) => [r, start[r].text]),
        ) as Record<Role, string>,
        ids: Object.fromEntries(ROLES.map((r) => [r, start[r].id])) as Record<
          Role,
          string
        >,
        score: null,
        results: [],
      },
      noImprovement: 0,
      saved: null,
    };
  repo.db
    .transaction(() => {
      const have = new Set(
        reused.map((r) =>
          slot({ seed: r.config.seed, side: r.config.teamSide }),
        ),
      );
      const missing = matchList(s.config.seeds).filter(
        (m) => !have.has(slot(m)),
      );
      if (missing.length) {
        s.reason = `Playing ${missing.length} baseline ${missing.length === 1 ? "match" : "matches"}`;
        schedule(repo, s, "baseline", missing, promptsFor(s.best));
      } else concludeBaseline(s, reused);
      db.save(s);
    })
    .immediate();
  return s;
}

const promptsFor = (best: RsiSession["best"]) =>
  Object.fromEntries(
    ROLES.map((r) => [r, { id: best.ids[r], text: best.prompts[r] }]),
  ) as RunConfig["team"]["prompts"];

/** Queue matches for the baseline or a round in one series capped at what's left of the budget. */
function schedule(
  repo: SimRepository,
  s: RsiSession,
  target: "baseline" | RsiRound,
  matches: { seed: number; side: Side }[],
  prompts: RunConfig["team"]["prompts"],
) {
  const db = rsiRepository(repo),
    remaining = Math.max(0, s.config.costLimitUsd - db.spend(s).totalUsd),
    id = crypto.randomUUID(),
    round = target === "baseline" ? 0 : target.n,
    title = round ? `round ${round}` : "baseline",
    origin: Run["evidenceOrigin"] =
      s.config.provider === "mock" ? "test fixture" : "rsi",
    runIds = matches.map((m) => {
      const config = structuredClone(s.config.baseline);
      config.seed = m.seed;
      config.teamSide = m.side;
      config.team.prompts = structuredClone(prompts);
      config.label = `RSI · ${s.label} · ${title}`;
      config.rsi = { sessionId: s.id, round };
      return repo.create(config, id, origin).id;
    });
  repo.saveSeries({
    id,
    createdAt: new Date().toISOString(),
    label: `RSI · ${s.label} · ${title}`,
    kind: "rsi",
    rsiId: s.id,
    runIds,
    requestLimit: 500000,
    inputTokenLimit: 1000000000,
    costLimitUsd: remaining,
    command: "run",
    status: "queued",
    reason: null,
  });
  const into = target === "baseline" ? s.baseline : target;
  into.seriesIds.push(id);
  into.runIds.push(...runIds);
}

function concludeBaseline(s: RsiSession, runs: Run[]) {
  const results = runs.map(matchResult),
    score = evaluate(results);
  s.baseline.stage = "done";
  s.baseline.results = results;
  s.baseline.score = score;
  s.best.score = score;
  s.best.results = results;
  s.reason = `Baseline: ${describeScore(score)}`;
}

function stopSeries(
  repo: SimRepository,
  seriesIds: string[],
  command: "pause" | "stop" | "run",
) {
  for (const id of seriesIds) {
    const series = repo.seriesById(id);
    if (
      series &&
      series.runIds.some((r) => ACTIVE.includes(repo.run(r)?.status || ""))
    )
      repo.seriesControl(id, command);
  }
}

function conclude(
  round: RsiRound,
  outcome: RoundOutcome,
  reason: string,
  results = round.results,
) {
  round.stage = "done";
  round.outcome = outcome;
  round.reason = reason;
  round.results = results;
  round.score = evaluate(results);
  round.finishedAt = new Date().toISOString();
}

/** Estimated cost of one more full round, using this session's actual match costs once known. */
export function nextRoundUsd(s: RsiSession) {
  const own = [
    ...s.baseline.results.filter(
      (r) => !s.baseline.reusedRunIds.includes(r.runId),
    ),
    ...s.rounds.flatMap((r) => r.results),
  ].filter((r) => r.status === "completed");
  const perMatch = own.length
    ? own.reduce((n, r) => n + r.costUsd, 0) / own.length
    : s.estimate.perMatchUsd;
  return (
    s.estimate.rewriteMaxUsd +
    s.config.seeds.length * 2 * perMatch * MARGIN +
    s.estimate.headroomUsd
  );
}

/** Rounds that used an attempt: a writer call that never connected doesn't count. */
export const attempts = (s: RsiSession) =>
  s.rounds.filter(
    (r) =>
      !(r.outcome === "failed" && !r.roles.length && !r.rewrite?.responseId),
  ).length;

function stopReason(repo: SimRepository, s: RsiSession) {
  if (attempts(s) >= s.config.maxRounds)
    return {
      status: "completed" as const,
      reason: `Finished all ${s.config.maxRounds} rounds.`,
    };
  if (s.noImprovement >= s.config.patience)
    return {
      status: "completed" as const,
      reason: `No improvement in the last ${s.config.patience} ${s.config.patience === 1 ? "round" : "rounds"}.`,
    };
  if (s.config.provider === "mock") return null;
  const left = s.config.costLimitUsd - rsiRepository(repo).spend(s).totalUsd,
    need = nextRoundUsd(s);
  if (left < need)
    return {
      status: "limited" as const,
      reason: `Spending limit reached: another round needs about ${usd(need)} and ${usd(Math.max(0, left))} is left.`,
    };
  return null;
}

/** Ends the session and saves the best version when it beat the starting one. */
function finish(
  repo: SimRepository,
  id: string,
  status: RsiStatus,
  reason: string,
) {
  const db = rsiRepository(repo);
  return repo.db
    .transaction(() => {
      const s = db.get(id)!;
      if (FINISHED.includes(s.status)) return s;
      stopSeries(
        repo,
        [...s.baseline.seriesIds, ...s.rounds.flatMap((r) => r.seriesIds)],
        "stop",
      );
      for (const r of s.rounds)
        if (r.stage !== "done")
          conclude(
            r,
            status === "limited" ? "limited" : "stopped",
            status === "limited"
              ? "The spending limit was reached during this round."
              : "The session ended before this round finished.",
            r.runIds
              .map((x) => repo.run(x))
              .filter((x): x is Run => x?.status === "completed")
              .map(matchResult),
          );
      s.status = status;
      s.reason = reason;
      s.finishedAt = new Date().toISOString();
      if (s.best.round > 0 && !s.saved) s.saved = saveBest(repo, s);
      return db.save(s);
    })
    .immediate();
}

function saveBest(repo: SimRepository, s: RsiSession) {
  const w = repo.store.read(),
    team = w.teams.find((t) => t.id === s.config.teamId)!,
    promptIds = { ...team.promptIds },
    saved: string[] = [],
    changed: Role[] = [];
  for (const role of ROLES) {
    if (sameText(s.best.prompts[role], s.start[role].text)) continue;
    const parent = w.prompts.find((p) => p.id === s.start[role].id)!,
      origin = s.rounds
        .filter((r) => r.prompts[role] === s.best.prompts[role])
        .at(-1)!;
    const p = repo.store.save("prompts", {
      label: `${parent.label} · RSI r${origin.n}`,
      role,
      formationId: parent.formationId,
      parentId: parent.id,
      text: s.best.prompts[role],
      rationale: `${origin.rationale}\n\nRSI: ${describeScore(s.baseline.score)} at the start; ${describeScore(s.best.score)} for the best version, against scripted ${s.config.bot} bots on seeds ${s.config.seeds.join(", ")}, home and away. Few matches, so treat this as a lead and confirm it in Simulate.`,
      hypothesisIds: parent.hypothesisIds ?? [],
      status: "draft",
      rsi: {
        version: RSI_VERSION,
        sessionId: s.id,
        round: origin.n,
        baselineScore: s.baseline.score,
        bestScore: s.best.score,
        runIds: s.best.results.map((r) => r.runId),
        models: s.config.models,
        bot: s.config.bot,
        seeds: s.config.seeds,
        duration: s.config.duration,
      },
      aiProposal: {
        actor: "rsi",
        version: RSI_VERSION,
        model: origin.rewrite?.model,
        responseId: origin.rewrite?.responseId,
        inputTokens: origin.rewrite?.inputTokens,
        outputTokens: origin.rewrite?.outputTokens,
        originalProposal: {
          rationale: origin.rationale,
          changes: origin.changes
            .filter((c) => c.role === role)
            .map((c) => c.change),
        },
      },
    });
    promptIds[role] = p.id;
    saved.push(p.id);
    changed.push(role);
  }
  if (!saved.length) return { promptIds: [], teamId: null };
  const t = repo.store.save("teams", {
    label: `${team.label} · RSI r${s.best.round}`,
    formationId: team.formationId,
    parentId: team.id,
    promptIds,
    rsiSessionId: s.id,
  });
  return { promptIds: saved, teamId: t.id };
}

function pauseFor(repo: SimRepository, s: RsiSession, reason: string) {
  s.status = "paused";
  s.reason = reason;
  stopSeries(
    repo,
    [...s.baseline.seriesIds, ...s.rounds.flatMap((r) => r.seriesIds)],
    "pause",
  );
  rsiRepository(repo).save(s);
}

function settleBaseline(repo: SimRepository, s: RsiSession) {
  const runs = s.baseline.runIds.map((id) => repo.run(id)!),
    own = runs.filter((r) => !s.baseline.reusedRunIds.includes(r.id));
  if (own.some((r) => ACTIVE.includes(r.status))) return;
  if (own.some((r) => r.status === "limited")) {
    finish(
      repo,
      s.id,
      "limited",
      "The spending limit was reached during the baseline matches.",
    );
    return;
  }
  const broken = own.find((r) => r.status !== "completed");
  if (broken) {
    pauseFor(
      repo,
      s,
      `A baseline match ended as ${broken.status}. Resume to replay it.`,
    );
    return;
  }
  concludeBaseline(s, runs);
  rsiRepository(repo).save(s);
}

function settleRound(repo: SimRepository, s: RsiSession, round: RsiRound) {
  const db = rsiRepository(repo),
    runs = round.runIds.map((id) => repo.run(id)!),
    results = runs.filter((r) => r.status === "completed").map(matchResult),
    playing = runs.some((r) => ACTIVE.includes(r.status));
  if (
    playing &&
    s.config.seeds.length > 1 &&
    earlyReject(results, s.best.results, s.config.seeds[0])
  ) {
    stopSeries(repo, round.seriesIds, "stop");
    conclude(
      round,
      "rejected-early",
      `Behind the best version in both seed ${s.config.seeds[0]} matches, so the remaining ${runs.length - results.length} were skipped.`,
      results,
    );
    s.noImprovement++;
    s.reason = `Round ${round.n} rejected early`;
    db.save(s);
    return;
  }
  if (playing) return;
  if (runs.some((r) => r.status === "limited")) {
    conclude(
      round,
      "limited",
      "The spending limit was reached during this round.",
      results,
    );
    db.save(s);
    finish(
      repo,
      s.id,
      "limited",
      `Spending limit reached during round ${round.n}. The best version so far is kept.`,
    );
    return;
  }
  const broken = runs.find((r) => r.status !== "completed");
  if (broken) {
    pauseFor(
      repo,
      s,
      `A round ${round.n} match ended as ${broken.status}. Resume to replay it.`,
    );
    return;
  }
  const score = evaluate(results);
  if (isBetter(score, s.best.score)) {
    conclude(
      round,
      "improved",
      `Beat the best version from ${s.best.round ? `round ${s.best.round}` : "the start"}.`,
      results,
    );
    s.best = {
      round: round.n,
      prompts: { ...s.best.prompts, ...round.prompts },
      ids: {
        ...s.best.ids,
        ...Object.fromEntries(
          round.roles.map((r) => [r, `rsi-${s.id}-r${round.n}-${r}`]),
        ),
      },
      score,
      results,
    };
    s.noImprovement = 0;
  } else {
    conclude(
      round,
      "no-better",
      `Didn't beat the best version from ${s.best.round ? `round ${s.best.round}` : "the start"}.`,
      results,
    );
    s.noImprovement++;
  }
  s.reason = `Round ${round.n}: ${describeScore(score)}`;
  db.save(s);
}

function apiProblem(e: unknown) {
  if (e instanceof OpenAI.APIConnectionTimeoutError)
    return "The writer didn't answer within 150 seconds. Its reserved cost stays counted; resume to try again.";
  if (e instanceof OpenAI.APIConnectionError) {
    const code = (e.cause as { code?: string } | undefined)?.code;
    return `Couldn't reach the writer's API${code ? ` (${code})` : ""}, even after one retry. Nothing was charged; resume to try again.`;
  }
  if (e instanceof OpenAI.APIError)
    return `The writer request failed (HTTP ${e.status}). Its reserved cost stays counted.`;
  return (e as Error).message || "The writer request failed.";
}

async function startRound(
  repo: SimRepository,
  initial: RsiSession,
  createResponse?: CreateResponse,
) {
  const db = rsiRepository(repo),
    n = initial.rounds.length + 1,
    { input, reservedInputTokens } = rewriteInput(repo, initial, n),
    rate = initial.config.writer.pricing,
    reservedUsd =
      initial.config.provider !== "mock" && rate
        ? estimatedCost(
            rate,
            reservedInputTokens,
            initial.config.writer.maxOutputTokens,
            true,
          )
        : 0;
  const claimed = repo.db
    .transaction(() => {
      const s = db.get(initial.id)!;
      if (s.status !== "running" || s.rounds.length !== n - 1) return null;
      s.rounds.push({
        n,
        stage: "rewriting",
        roles: [],
        prompts: {},
        rationale: "",
        changes: [],
        seriesIds: [],
        runIds: [],
        results: [],
        score: null,
        rewrite: {
          model: s.config.writer.model,
          responseId: null,
          reservedInputTokens,
          reservedUsd,
          inputTokens: null,
          outputTokens: 0,
          costUsd: null,
        },
        startedAt: new Date().toISOString(),
      });
      s.reason = `Round ${n}: ${s.config.writer.model} is rewriting the squad's prompts`;
      return db.save(s);
    })
    .immediate();
  if (!claimed) return;
  let result: any,
    failure: string | null = null,
    unbilled = false;
  try {
    result = await requestRewrite(claimed, n, input, createResponse);
  } catch (e) {
    failure = apiProblem(e);
    // A connection that never opened can't be billed, so its reservation is released.
    unbilled =
      e instanceof OpenAI.APIConnectionError &&
      !(e instanceof OpenAI.APIConnectionTimeoutError);
  }
  repo.db
    .transaction(() => {
      const s = db.get(initial.id)!,
        round = s.rounds.find((r) => r.n === n)!;
      if (failure) {
        if (unbilled) round.rewrite = { ...round.rewrite!, costUsd: 0 };
        conclude(round, "failed", failure, []);
        if (s.status === "running") pauseFor(repo, s, failure);
        else db.save(s);
        return;
      }
      const inputTokens = result.usage?.input_tokens ?? null,
        outputTokens = result.usage?.output_tokens ?? 0;
      round.rewrite = {
        ...round.rewrite!,
        model: result.model || round.rewrite!.model,
        responseId: result.id ?? null,
        inputTokens,
        outputTokens,
        costUsd:
          inputTokens === null
            ? null
            : s.config.provider !== "mock" && rate
              ? estimatedCost(rate, inputTokens, outputTokens)
              : 0,
      };
      if (FINISHED.includes(s.status)) {
        if (round.stage !== "done")
          conclude(
            round,
            "stopped",
            "The session ended while the writer was answering.",
            [],
          );
        db.save(s);
        return;
      }
      let rewrite;
      try {
        if (result.status !== "completed")
          throw new Error("The writer's answer was incomplete or refused.");
        rewrite = parseRewrite(result.output_text);
      } catch (e) {
        conclude(round, "failed", (e as Error).message, []);
        s.noImprovement++;
        db.save(s);
        return;
      }
      // Only prompts that differ from the current best count as changes.
      const changed = ROLES.filter(
        (r) =>
          rewrite.prompts[r] !== undefined &&
          !sameText(rewrite.prompts[r]!, s.best.prompts[r]),
      );
      round.roles = changed;
      round.prompts = Object.fromEntries(
        changed.map((r) => [r, rewrite.prompts[r]!]),
      );
      round.rationale = rewrite.rationale;
      round.changes = rewrite.changes.filter((c) => changed.includes(c.role));
      const tried = (r: Role, text: string) =>
        s.rounds.some(
          (x) => x.n !== n && !!x.prompts[r] && sameText(x.prompts[r]!, text),
        );
      if (
        !changed.length ||
        changed.every((r) => tried(r, round.prompts[r]!))
      ) {
        conclude(
          round,
          "no-change",
          changed.length
            ? "The writer returned prompts that were already tried, so no matches were played."
            : "The writer didn't change any prompt, so no matches were played.",
          [],
        );
        s.noImprovement++;
        db.save(s);
        return;
      }
      round.stage = "evaluating";
      const prompts = promptsFor(s.best);
      for (const r of changed)
        prompts[r] = { id: `rsi-${s.id}-r${n}-${r}`, text: round.prompts[r]! };
      schedule(repo, s, round, matchList(s.config.seeds), prompts);
      s.reason = `Round ${n}: playing ${round.runIds.length} matches`;
      if (s.status !== "running") stopSeries(repo, round.seriesIds, "pause");
      db.save(s);
    })
    .immediate();
}

/** One step of a running session. The worker calls this before each match it plays. */
export async function advanceRsi(
  repo: SimRepository,
  id: string,
  createResponse?: CreateResponse,
) {
  const db = rsiRepository(repo);
  const next = repo.db
    .transaction(() => {
      const s = db.get(id);
      if (!s || s.status !== "running") return null;
      if (s.baseline.stage === "evaluating") {
        settleBaseline(repo, s);
        return null;
      }
      const current = s.rounds.at(-1);
      if (current?.stage === "evaluating") {
        settleRound(repo, s, current);
        return null;
      }
      if (current?.stage === "rewriting") return null;
      const stop = stopReason(repo, s);
      if (stop) {
        finish(repo, s.id, stop.status, stop.reason);
        return null;
      }
      return s;
    })
    .immediate();
  if (next) await startRound(repo, next, createResponse);
}

/** Replace matches that were interrupted or failed so a resumed session can finish the stage. */
function replayUnfinished(repo: SimRepository, s: RsiSession) {
  const target =
    s.baseline.stage === "evaluating"
      ? ("baseline" as const)
      : s.rounds.at(-1)?.stage === "evaluating"
        ? s.rounds.at(-1)!
        : null;
  if (!target) return;
  const into = target === "baseline" ? s.baseline : target,
    broken = into.runIds
      .map((id) => repo.run(id)!)
      .filter((r) => ["failed", "interrupted", "stopped"].includes(r.status));
  if (!broken.length) return;
  into.runIds = into.runIds.filter((id) => !broken.some((r) => r.id === id));
  schedule(
    repo,
    s,
    target,
    broken.map((r) => ({ seed: r.config.seed, side: r.config.teamSide })),
    broken[0].config.team.prompts,
  );
}

export function controlRsi(
  repo: SimRepository,
  id: string,
  command: "run" | "pause" | "stop",
) {
  const db = rsiRepository(repo),
    s = db.get(id);
  if (!s) throw new Error("RSI session not found");
  if (FINISHED.includes(s.status))
    throw new Error("This session has already finished.");
  if (command === "stop") return finish(repo, id, "stopped", "Stopped by you.");
  return repo.db
    .transaction(() => {
      const live = db.get(id)!;
      if (command === "pause" && live.status === "running") {
        pauseFor(repo, live, "Paused by you.");
        return db.get(id)!;
      }
      if (command === "run" && live.status === "paused") {
        live.status = "running";
        live.reason = "Resumed";
        replayUnfinished(repo, live);
        stopSeries(
          repo,
          [
            ...live.baseline.seriesIds,
            ...live.rounds.flatMap((r) => r.seriesIds),
          ],
          "run",
        );
        db.save(live);
      }
      return live;
    })
    .immediate();
}

/** After a worker restart, a round caught mid-rewrite can't be trusted: record it and pause. */
export function recoverRsi(repo: SimRepository) {
  const db = rsiRepository(repo);
  for (const s of db.list().filter((s) => s.status === "running")) {
    const r = s.rounds.at(-1);
    if (r?.stage !== "rewriting") continue;
    conclude(
      r,
      "failed",
      "Interrupted while the writer was answering. Its reserved cost stays counted.",
      [],
    );
    pauseFor(
      repo,
      s,
      "The simulator restarted during a rewrite. Resume to continue.",
    );
  }
}

export type RsiView = RsiSession & {
  spend: ReturnType<ReturnType<typeof rsiRepository>["spend"]>;
};
export function withSpend(repo: SimRepository, s: RsiSession): RsiView {
  return { ...s, spend: rsiRepository(repo).spend(s) };
}
export type { MatchResult };
