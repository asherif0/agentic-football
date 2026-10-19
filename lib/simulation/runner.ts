import {
  candidates,
  observation,
  advance,
  measurements,
  scripted,
  blankStats,
} from "./engine";
import { DecisionInput, DecisionTrace, OTHER, Run, RunConfig } from "./types";
import {
  PlayerDecisionProvider,
  provider,
  ProviderFailure,
  tokenReservation,
  transient,
} from "./providers";
import { SimRepository } from "./repository";
import { estimatedCost } from "./pricing";
import { improvementRepository } from "../improvement/persistence";
const initialStats = () => ({ home: blankStats(), away: blankStats() });
const terminal = (r: Run) =>
  !["queued", "running", "paused"].includes(r.status);
export function performanceSummary(
  traces: DecisionTrace[],
  waiting: number[],
  wallMs: number,
) {
  const measured = traces.filter((t) => t.provider !== "scripted");
  const paid = measured.filter((t) => t.provider !== "mock" && t.attempts > 0);
  const times = paid.map((t) => t.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) =>
    times.length
      ? times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)]
      : null;
  return {
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    roundWaitingMs: waiting,
    failed: paid.filter((t) => t.error).length,
    decisions: paid.length,
    failureRate: paid.length
      ? paid.filter((t) => t.error).length / paid.length
      : null,
    decisionAttempts: paid.reduce((n, t) => n + t.attempts, 0),
    requestsPerSecond:
      waiting.reduce((a, b) => a + b, 0) > 0
        ? paid.reduce((n, t) => n + t.attempts, 0) /
          (waiting.reduce((a, b) => a + b, 0) / 1000)
        : null,
    decisionsPerSecond:
      waiting.reduce((a, b) => a + b, 0) > 0
        ? paid.length / (waiting.reduce((a, b) => a + b, 0) / 1000)
        : null,
  };
}
export function reserve(
  repo: SimRepository,
  run: Run,
  tokens: number,
  cost = 0,
  reservationId = crypto.randomUUID(),
): boolean {
  return repo.db.transaction(() => {
    const live = repo.run(run.id)!;
    if (live.command !== "run" || terminal(live)) return false;
    const series = run.seriesId ? repo.seriesById(run.seriesId) : undefined;
    if (series && series.command !== "run") return false;
    const group = series
      ? series.runIds.map((id) => repo.run(id)!).filter(Boolean)
      : [];
    if (
      live.requests >= live.config.requestLimit ||
      live.inputTokens + live.reservedTokens + tokens >
        live.config.inputTokenLimit ||
      (series &&
        (group.reduce((n, r) => n + r.requests, 0) >= series.requestLimit ||
          group.reduce((n, r) => n + r.inputTokens + r.reservedTokens, 0) +
            tokens >
            series.inputTokenLimit ||
          (series.costLimitUsd !== undefined &&
            group.reduce(
              (n, r) =>
                n + (r.estimatedCostUsd || 0) + (r.reservedCostUsd || 0),
              0,
            ) +
              cost >
              series.costLimitUsd)))
    )
      return false;
    if (
      series?.campaignId &&
      !improvementRepository(repo).reserve(
        series.campaignId,
        reservationId,
        tokens,
        cost,
        "decision",
        run.id,
      )
    )
      return false;
    live.requests++;
    if (cost) live.reservedCostUsd = (live.reservedCostUsd || 0) + cost;
    live.reservedTokens += tokens;
    repo.saveRun(live);
    run.requests = live.requests;
    run.reservedCostUsd = live.reservedCostUsd;
    run.reservedTokens = live.reservedTokens;
    return true;
  })();
}
function settle(
  repo: SimRepository,
  run: Run,
  reserved: number,
  input: number | null,
  output: number,
  reservedCost = 0,
  actualCost?: number,
  reservationId?: string,
) {
  repo.db.transaction(() => {
    if (reservationId)
      improvementRepository(repo).settle(
        reservationId,
        input,
        output,
        actualCost,
      );
    const live = repo.run(run.id)!;
    if (input !== null) {
      live.reservedTokens = Math.max(0, live.reservedTokens - reserved);
      live.inputTokens += input;
    }
    live.outputTokens += output;
    if (actualCost !== undefined) {
      live.reservedCostUsd = Math.max(
        0,
        (live.reservedCostUsd || 0) - reservedCost,
      );
      live.estimatedCostUsd = (live.estimatedCostUsd || 0) + actualCost;
    }
    repo.saveRun(live);
    run.estimatedCostUsd = live.estimatedCostUsd;
    run.reservedCostUsd = live.reservedCostUsd;
    run.inputTokens = live.inputTokens;
    run.outputTokens = live.outputTokens;
    run.reservedTokens = live.reservedTokens;
  })();
}
export async function executeRound(
  repo: SimRepository,
  run: Run,
  adapter: PlayerDecisionProvider,
  signal: AbortSignal,
) {
  const frozen = structuredClone(run.state),
    begin = performance.now();
  let limited = false;
  const history = [
    { time: 0, stats: initialStats() },
    ...repo.rounds(run.id).flatMap((r) => (r.stateStats ? [r.stateStats] : [])),
  ];
  const traces = await Promise.all(
    frozen.players.map(async (p) => {
      const actions = candidates(
          frozen,
          p,
          Math.min(run.config.interval, run.config.duration - frozen.time),
        ),
        obs = observation(
          frozen,
          p,
          run.config.versions.observation === "team-relative-v2"
            ? { duration: run.config.duration, history }
            : undefined,
        );
      const team =
        p.side === run.config.teamSide ? run.config.team : run.config.opponent;
      if (!team || run.config.provider === "mock") {
        const selected = scripted(
          frozen,
          p,
          actions,
          team ? "balanced" : run.config.bot,
        );
        return {
          round: frozen.round,
          time: frozen.time,
          playerId: p.id,
          provider: team ? ("mock" as const) : ("scripted" as const),
          model: team ? "mock-controller" : "scripted-" + run.config.bot,
          observation: obs,
          actions,
          selected,
          confidence: null,
          probabilities: null,
          attempts: 0,
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          error: null,
        };
      }
      const input: DecisionInput = {
        player: p,
        prompt: team.prompts[p.role].text,
        model: team.models[p.role],
        inference: team.inference?.[p.role],
        observation: obs,
        actions,
      };
      const started = performance.now();
      let attempts = 0,
        error: string | null = null,
        choice = "hold",
        confidence: number | null = null,
        probabilities: unknown = null,
        inputTokens: number | null = 0,
        outputTokens = 0;
      const attemptLog: NonNullable<DecisionTrace["attemptLog"]> = [];
      while (attempts < 2 && !signal.aborted) {
        const reservationId = crypto.randomUUID();
        const reserved = tokenReservation(input);
        const rate = run.config.pricing?.[input.model];
        const cost = rate
          ? estimatedCost(
              rate,
              reserved,
              input.inference?.maxOutputTokens ?? 256,
              true,
            )
          : 0;
        if (!reserve(repo, run, reserved, cost, reservationId)) {
          limited = true;
          error = "Request/token ceiling or control prevented dispatch";
          break;
        }
        attempts++;
        const attemptStart = performance.now();
        try {
          const result = await adapter.decide(
            input,
            AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
          );
          settle(
            repo,
            run,
            reserved,
            result.inputTokens,
            result.outputTokens,
            cost,
            rate && result.inputTokens !== null
              ? estimatedCost(rate, result.inputTokens, result.outputTokens)
              : undefined,
            reservationId,
          );
          inputTokens =
            inputTokens === null || result.inputTokens === null
              ? null
              : inputTokens + result.inputTokens;
          outputTokens += result.outputTokens;
          attemptLog.push({
            durationMs: performance.now() - attemptStart,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            error: actions.some((a) => a.id === result.choice)
              ? null
              : "Invalid choice",
          });
          if (!actions.some((a) => a.id === result.choice)) {
            error = "Provider returned an unknown action ID";
            break;
          }
          choice = result.choice;
          confidence = result.confidence;
          probabilities = result.probabilities;
          error = null;
          break;
        } catch (e) {
          const usage = e instanceof ProviderFailure ? e.usage : null;
          if (usage) {
            settle(
              repo,
              run,
              reserved,
              usage.inputTokens,
              usage.outputTokens,
              cost,
              rate && usage.inputTokens !== null
                ? estimatedCost(rate, usage.inputTokens, usage.outputTokens)
                : undefined,
              reservationId,
            );
            inputTokens =
              inputTokens === null || usage.inputTokens === null
                ? null
                : inputTokens + usage.inputTokens;
            outputTokens += usage.outputTokens;
          } else {
            inputTokens = null;
          }
          error =
            e instanceof ProviderFailure
              ? e.message
              : `Provider request failed (${(e as { status?: number }).status || "connection/timeout"})`; // Never log provider error bodies: they can contain request headers or credentials.
          attemptLog.push({
            durationMs: performance.now() - attemptStart,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? 0,
            error,
          });
          if (signal.aborted || !transient(e) || attempts >= 2) break;
        }
      }
      return {
        round: frozen.round,
        time: frozen.time,
        playerId: p.id,
        provider: run.config.provider,
        model: input.model,
        observation: obs,
        actions,
        selected: actions.find((a) => a.id === choice) || actions[0],
        confidence,
        probabilities,
        attempts,
        attemptLog,
        latencyMs: performance.now() - started,
        inputTokens,
        outputTokens,
        error,
      } satisfies DecisionTrace;
    }),
  );
  return { traces, waitingMs: performance.now() - begin, limited };
}
export function persistEvidence(repo: SimRepository, run: Run) {
  // RSI matches swap prompts inside a saved team, so no evidence record names them.
  if (run.matchId || run.config.rsi) return;
  const s = repo.store;
  repo.db.transaction(() => {
    const live = repo.run(run.id)!;
    if (live.matchId) {
      run.matchId = live.matchId;
      return;
    }
    const c = run.config,
      ours = run.state.stats[c.teamSide],
      them = run.state.stats[OTHER(c.teamSide)];
    const experiment = s.save("experiments", {
      label: `${run.evidenceOrigin.toUpperCase()} · ${c.label}`,
      teamId: c.team.id,
      comparatorTeamId: null,
      opponent: c.opponent?.label || `Local ${c.bot} bots`,
      models: c.team.models,
      setup: JSON.stringify({
        runId: run.id,
        versions: c.versions,
        scenarioIds: c.scenarioIds,
        seed: c.seed,
        teamSide: c.teamSide,
        provider: c.provider,
      }),
      variable: "Local simulator run",
      expectedOutcome: "Inspect local execution; not portal validation",
      hypothesisIds: [],
      shouts: "",
      synthetic: run.evidenceOrigin === "test fixture",
      evidenceOrigin: run.evidenceOrigin,
    });
    const match = s.save("matches", {
      label: `${run.evidenceOrigin.toUpperCase()} · ${c.label}`,
      experimentId: experiment.id,
      synthetic: experiment.synthetic,
      evidenceOrigin: run.evidenceOrigin,
      goalsFor: ours.goals,
      goalsAgainst: them.goals,
      shotsFor: ours.shots,
      shotsAgainst: them.shots,
      onTargetFor: ours.onTarget,
      onTargetAgainst: them.onTarget,
      dangerousTurnovers: ours.dangerousTurnovers,
      attachmentIds: [],
      replayUrl: "",
      latencyFailures: run.reason || "",
      executionFailures: "See simulator decision traces",
      primaryDiagnosis: `${run.status}: ${run.state.time.toFixed(1)} simulated seconds. Local mechanics only.`,
      nextHypothesis: "Review bookmarked sequences",
    });
    run.matchId = match.id;
    live.matchId = match.id;
    repo.saveRun(live);
  })();
}
export async function play(
  repo: SimRepository,
  run: Run,
  workerId: string,
  adapter?: PlayerDecisionProvider,
) {
  run.status = "running";
  run.workerId = workerId;
  run.phase = "Starting";
  repo.saveRun(run);
  const root = new AbortController();
  const watch = setInterval(() => {
    const live = repo.run(run.id);
    if (live?.command === "stop") root.abort();
  }, 100);
  try {
    const chosenProvider = adapter || provider(run.config.provider);
    while (run.state.time < run.config.duration - 1e-6) {
      const live = repo.run(run.id)!;
      run.command = live.command;
      if (live.command === "stop") {
        run.status = "stopped";
        run.reason = "Stopped by user";
        break;
      }
      if (live.command === "pause") {
        run.status = "paused";
        run.phase = "Paused";
        repo.saveRun(run);
        return;
      }
      run.phase = "Agents deciding";
      repo.saveRun(run);
      const result = await executeRound(repo, run, chosenProvider, root.signal);
      const latest = repo.run(run.id)!;
      run.command = latest.command;
      if (
        run.seriesId &&
        ["benchmark", "improvement"].includes(
          repo.seriesById(run.seriesId)?.kind || "",
        ) &&
        result.traces.some((t) =>
          /Provider request failed \((400|401|403|404)\)/.test(t.error || ""),
        )
      ) {
        repo.saveRound(run, {
          round: run.state.round,
          frames: [],
          traces: result.traces,
          measurements: [],
          waitingMs: result.waitingMs,
        });
        run.status = "failed";
        run.reason =
          "Model access or inference configuration unavailable; no provider substitution.";
        const models = new Set(
          result.traces
            .filter((t) =>
              /Provider request failed \((400|401|403|404)\)/.test(
                t.error || "",
              ),
            )
            .map((t) => t.model),
        );
        for (const id of repo.seriesById(run.seriesId)!.runIds) {
          const other = repo.run(id)!;
          if (
            other.status === "queued" &&
            Object.values(other.config.team.models).some((m) => models.has(m))
          ) {
            other.status = "failed";
            other.reason = run.reason;
            repo.saveRun(other);
          }
        }
        break;
      }
      if (root.signal.aborted || result.limited)
        repo.saveRound(run, {
          round: run.state.round,
          frames: [],
          traces: result.traces,
          measurements: [],
          waitingMs: result.waitingMs,
        });
      if (root.signal.aborted) {
        run.status = "stopped";
        run.reason =
          "Stopped by user; outstanding requests cancelled where possible";
        break;
      }
      if (result.limited) {
        run.status =
          run.command === "pause"
            ? "paused"
            : run.command === "stop"
              ? "stopped"
              : "limited";
        run.reason =
          run.status === "limited"
            ? "Request, input-token or estimated spend ceiling reached"
            : null;
        run.phase = run.status;
        repo.saveRun(run);
        if (run.status === "paused") return;
        break;
      }
      const round = run.state.round;
      const frames = advance(
        run.state,
        Object.fromEntries(result.traces.map((t) => [t.playerId, t.selected])),
        Math.min(run.config.interval, run.config.duration - run.state.time),
      );
      run.phase = "Playing";
      repo.saveRound(run, {
        round,
        frames,
        traces: result.traces,
        measurements: measurements(run.state),
        waitingMs: result.waitingMs,
        stateStats: {
          time: run.state.time,
          stats: structuredClone(run.state.stats),
        },
      });
      // Mock matches are deliberately paced so live controls and animation remain usable.
      if (run.config.provider === "mock")
        await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (run.status === "running") {
      run.status = "completed";
      run.reason = null;
    }
  } catch (e) {
    run.status = root.signal.aborted ? "stopped" : "failed";
    run.reason = e instanceof Error ? e.message : "Simulation worker failed";
  } finally {
    clearInterval(watch);
    if (run.status !== "paused") {
      run.phase = run.status;
      repo.saveRun(run);
      persistEvidence(repo, run);
    }
  }
}
