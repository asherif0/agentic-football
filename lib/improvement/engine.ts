import OpenAI from "openai";
import { randomInt } from "node:crypto";
import { ROLES } from "../domain";
import type { SimRepository, Series } from "../simulation/repository";
import type { RunConfig, Run } from "../simulation/types";
import { OTHER } from "../simulation/types";
import { PRICING, estimatedCost } from "../simulation/pricing";
import { DEFAULT_PROPOSAL_MODEL } from "../prompt-proposals";
import { improvementRepository, profileKey } from "./persistence";
import { assess, conditionKey } from "./evaluation";
import {
  generationInput,
  generationSchema,
  INSTRUCTIONS,
  parseGeneration,
} from "./proposals";
import {
  IMPROVEMENT_VERSION,
  type Campaign,
  type EvidenceBundle,
  type Generation,
} from "./types";

export function previewCampaign(repo: SimRepository, input: any) {
  const db = improvementRepository(repo),
    strategy = db.get<any>("lab_strategies", input.strategyId);
  if (!strategy) throw new Error("Save and select a strategy revision first");
  const requests = input.requestLimit,
    inputTokens = input.inputTokenLimit,
    costUsd = input.costLimitUsd,
    maxGenerations = input.maxGenerations ?? 3;
  if (
    !Number.isInteger(requests) ||
    requests < 1 ||
    requests > 500000 ||
    !Number.isInteger(inputTokens) ||
    inputTokens < 1 ||
    inputTokens > 1e9 ||
    !Number.isFinite(costUsd) ||
    costUsd <= 0 ||
    costUsd > 1000 ||
    !Number.isInteger(maxGenerations) ||
    maxGenerations < 1 ||
    maxGenerations > 10
  )
    throw new Error(
      "Set campaign request, input-token, dollar and generation limits",
    );
  const baseline = repo.buildConfig({
    ...input,
    bot: "balanced",
    teamSide: "home",
    seed: input.seed ?? 42,
    duration: input.duration ?? 60,
    interval: 1,
    requestLimit: Math.min(50000, requests),
    inputTokenLimit: Math.min(1e8, inputTokens),
    opponentTeamId: null,
  });
  if (strategy.formationId !== baseline.team.formation.id)
    throw new Error("Strategy and team must use the same formation revision");
  const model =
    input.generatorModel ||
    process.env.PROMPT_REVISION_MODEL ||
    DEFAULT_PROPOSAL_MODEL;
  if (
    !PRICING[model] ||
    (baseline.provider !== "mock" &&
      Object.values(baseline.team.models).some((m) => !baseline.pricing?.[m]))
  )
    throw new Error("Every campaign model needs a dated pricing snapshot");
  const selectedRunIds: string[] = input.selectedRunIds || [];
  if (
    !Array.isArray(selectedRunIds) ||
    selectedRunIds.length > 30 ||
    new Set(selectedRunIds).size !== selectedRunIds.length
  )
    throw new Error("Select at most 30 unique discovery runs");
  const origin =
    baseline.provider === "mock" ? "test fixture" : "local simulation";
  for (const id of selectedRunIds) {
    const run = repo.run(id);
    if (
      !run ||
      run.config.team.id !== baseline.team.id ||
      conditionKey(run.config) !== conditionKey(baseline) ||
      run.evidenceOrigin !== origin
    )
      throw new Error(
        "Discovery run does not match the campaign team and frozen settings",
      );
  }
  const annotationIds: string[] = input.annotationIds || [],
    w = repo.store.read();
  if (
    !Array.isArray(annotationIds) ||
    annotationIds.length > 30 ||
    new Set(annotationIds).size !== annotationIds.length
  )
    throw new Error("Select at most 30 unique annotations");
  for (const id of annotationIds) {
    const a = w.annotations.find((a) => a.id === id),
      m = w.matches.find((m) => m.id === a?.matchId),
      e = w.experiments.find((e) => e.id === m?.experimentId);
    if (
      !a ||
      !m ||
      !e ||
      m.evidenceOrigin !== origin ||
      e.teamId !== baseline.team.id
    )
      throw new Error(
        "Annotation must belong to this team's simulation evidence",
      );
  }
  const callsPerMatch = Math.ceil(baseline.duration) * 5,
    screeningMatches = 12,
    validationMatches = 36;
  const discoveryMatches = selectedRunIds.some(
    (id) => repo.run(id)?.status === "completed",
  )
    ? 0
    : 6;
  return {
    version: IMPROVEMENT_VERSION,
    label: input.label?.trim() || `${baseline.team.label} improvement`,
    strategy,
    baseline,
    profile: profileKey(baseline),
    generator: {
      model,
      reasoningEffort: "low" as const,
      maxOutputTokens: 4096,
      pricing: PRICING[model],
    },
    budget: { requests, inputTokens, costUsd },
    maxGenerations,
    reviewBeforeAdoption: !!input.reviewBeforeAdoption,
    selectedRunIds,
    annotationIds,
    evidenceOrigin: origin as Campaign["manifest"]["evidenceOrigin"],
    seed: input.seed ?? 42,
    test: {
      screeningSeeds: 1,
      validationSeeds: 3,
      failureLimit: 0.01,
      alpha: 0.05 / maxGenerations,
    },
    schedule: {
      screeningMatches,
      validationMatches,
      discoveryMatches,
      normalRequestsPerGeneration: 48 * callsPerMatch + 1,
      maximumPlannedRequests:
        (48 * maxGenerations + discoveryMatches) * callsPerMatch +
        maxGenerations,
    },
    pricingNote:
      "Estimated cost; unknown usage keeps its full reservation. Mock campaigns make no API calls.",
  };
}
export function createCampaign(repo: SimRepository, input: any) {
  const p = previewCampaign(repo, input),
    db = improvementRepository(repo);
  return repo.db.transaction(() => {
    if (
      db
        .campaigns()
        .some(
          (c) =>
            ["running", "paused", "review"].includes(c.status) &&
            c.manifest.profile === p.profile,
        )
    )
      throw new Error(
        "A campaign already exists for these settings; stop it before starting another",
      );
    const active = db.active(p.profile);
    if (active && active.teamId !== p.baseline.team.id)
      throw new Error(
        "Select the active team or explicitly change the local team before starting",
      );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const c: Campaign = {
      id,
      createdAt: now,
      updatedAt: now,
      label: p.label,
      status: "running",
      reason: null,
      manifest: {
        version: p.version,
        strategy: p.strategy,
        baseline: p.baseline,
        profile: p.profile,
        generator: p.generator,
        budget: p.budget,
        maxGenerations: p.maxGenerations,
        reviewBeforeAdoption: p.reviewBeforeAdoption,
        selectedRunIds: p.selectedRunIds,
        annotationIds: p.annotationIds,
        seed: randomInt(1, 1_000_000_000),
        test: p.test,
        evidenceOrigin: p.evidenceOrigin,
      },
      incumbentTeamId: p.baseline.team.id,
      activeRevision: active?.revision || 0,
      generation: 0,
      noAdoption: 0,
    };
    // Selecting a baseline is not a promotion; only a validated candidate advances the active pointer.
    db.put("lab_campaigns", c, true);
    return c;
  })();
}
function seeds(
  c: Campaign,
  g: Generation,
  stage: "discovery" | "screening" | "validation",
) {
  const start =
    c.manifest.seed +
    g.number * 100 +
    (stage === "validation" ? 10 : stage === "discovery" ? 30 : 0);
  return Array.from(
    { length: stage === "validation" ? 3 : 1 },
    (_, i) => start + i,
  );
}
function snapshotFor(
  repo: SimRepository,
  c: Campaign,
  teamId: string,
): RunConfig {
  const config = structuredClone(c.manifest.baseline),
    w = repo.store.read(),
    team = w.teams.find((t) => t.id === teamId)!;
  config.team.id = team.id;
  config.team.label = team.label;
  for (const role of ROLES) {
    const p = w.prompts.find((p) => p.id === team.promptIds[role])!;
    config.team.prompts[role] = { id: p.id, text: p.text };
  }
  return config;
}
function schedule(
  repo: SimRepository,
  c: Campaign,
  g: Generation,
  stage: "discovery" | "screening" | "validation",
) {
  const db = improvementRepository(repo);
  repo.db.transaction(() => {
    const id = crypto.randomUUID(),
      runIds: string[] = [],
      teamIds =
        stage === "discovery"
          ? [g.incumbentTeamId]
          : [g.incumbentTeamId, g.challengerTeamId!];
    let order = 0;
    for (const seed of seeds(c, g, stage))
      for (const bot of ["balanced", "press", "counter"] as const)
        for (const side of ["home", "away"] as const) {
          const teams = order++ % 2 ? [...teamIds].reverse() : teamIds;
          for (const teamId of teams) {
            const config = snapshotFor(repo, c, teamId);
            config.seed = seed;
            config.bot = bot;
            config.teamSide = side;
            config.label = `${c.label} · G${g.number} ${stage} · ${config.team.label}`;
            runIds.push(repo.create(config, id).id);
          }
        }
    const s: Series = {
      id,
      createdAt: new Date().toISOString(),
      label: `${c.label} · G${g.number} ${stage}`,
      kind: "improvement",
      campaignId: c.id,
      requestLimit: c.manifest.budget.requests,
      inputTokenLimit: c.manifest.budget.inputTokens,
      costLimitUsd: c.manifest.budget.costUsd,
      runIds,
      command: "run",
      status: "queued",
      reason: null,
    };
    repo.saveSeries(s);
    if (c.status === "running") {
      c.reason = `Generation ${g.number}: ${stage}`;
      db.saveCampaign(c);
    }
    g.seriesId = id;
    g.stage = stage;
    db.put("lab_generations", g);
  })();
}
export function eligibleEvidence(
  repo: SimRepository,
  c: Campaign,
  g: Generation,
) {
  const ids = new Set([
    ...c.manifest.selectedRunIds,
    ...repo
      .series()
      .filter((s) => s.campaignId === c.id)
      .flatMap((s) => s.runIds),
  ]);
  return repo
    .runs()
    .filter(
      (r) =>
        ids.has(r.id) &&
        r.status === "completed" &&
        r.config.team.id === g.incumbentTeamId &&
        r.evidenceOrigin === c.manifest.evidenceOrigin &&
        conditionKey(r.config) === conditionKey(c.manifest.baseline),
    )
    .slice(0, 6);
}
function bundle(
  repo: SimRepository,
  c: Campaign,
  g: Generation,
  runs: Run[],
): EvidenceBundle {
  const w = repo.store.read();
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    campaignId: c.id,
    generationId: g.id,
    author: "machine",
    evidenceOrigin: c.manifest.evidenceOrigin,
    previousAttempts: improvementRepository(repo)
      .generations(c.id)
      .filter((prior) => prior.stage === "done" && prior.id !== g.id)
      .slice(-2)
      .map((prior) => ({
        id: prior.id,
        role: prior.proposal?.role || null,
        outcome: prior.outcome || "inconclusive",
        rationale: prior.proposal?.rationale || prior.reason || "",
        proposedTextExcerpt: prior.proposal?.text.slice(0, 1500) || "",
        assessments: prior.assessments || [],
      })),
    runs: runs.map((r, index) => {
      const rounds = repo.rounds(r.id),
        event = r.state.events.find((e) => e.bookmark),
        round =
          rounds.find((x) =>
            x.traces.some((t) => t.time >= (event?.time ?? r.state.time) - 1),
          ) || rounds.at(-1);
      return {
        id: r.id,
        teamId: r.config.team.id,
        seed: r.config.seed,
        bot: r.config.bot,
        side: r.config.teamSide,
        formationId: r.config.team.formation.id,
        goalsFor: r.state.stats[r.config.teamSide].goals,
        goalsAgainst: r.state.stats[OTHER(r.config.teamSide)].goals,
        stats: r.state.stats,
        individual: r.state.individual,
        events: r.state.events.filter((e) => e.bookmark).slice(0, 4),
        failedDecisions: rounds
          .flatMap((x) => x.traces)
          .filter((t) => t.provider !== "scripted" && t.error).length,
        traceSamples:
          round?.traces
            .filter(
              (t) =>
                t.provider !== "scripted" &&
                t.playerId.endsWith(ROLES[index % 5]),
            )
            .map((t) => ({
              round: t.round,
              time: t.time,
              playerId: t.playerId,
              selected: t.selected,
              error: t.error,
              observation: t.observation,
            })) || [],
      };
    }),
    annotations: w.annotations
      .filter((a) => c.manifest.annotationIds.includes(a.id))
      .map((a) => {
        const match = w.matches.find((m) => m.id === a.matchId),
          experiment = w.experiments.find((e) => e.id === match?.experimentId),
          team = w.teams.find((t) => t.id === experiment?.teamId);
        return {
          ...a,
          testedTeamId: team?.id,
          testedPromptId: team?.promptIds[a.role],
          evidenceOrigin: match?.evidenceOrigin,
        };
      }),
  };
}
function finish(
  repo: SimRepository,
  c: Campaign,
  g: Generation,
  outcome: Generation["outcome"],
  reason: string,
) {
  const db = improvementRepository(repo);
  repo.db.transaction(() => {
    g.stage = "done";
    g.outcome = outcome;
    g.reason = reason;
    db.put("lab_generations", g);
    c.noAdoption = outcome === "adopted" ? 0 : c.noAdoption + 1;
    c.reason = reason;
    if (
      ["running", "review"].includes(c.status) &&
      (g.number >= c.manifest.maxGenerations || c.noAdoption >= 2)
    )
      c.status = "completed";
    db.saveCampaign(c);
  })();
}
export function adoptGeneration(
  repo: SimRepository,
  campaignId: string,
  generationId: string,
  manual = false,
) {
  const db = improvementRepository(repo);
  return repo.db.transaction(() => {
    const c = db.campaign(campaignId)!,
      g = db.get<Generation>("lab_generations", generationId)!;
    if (
      !c ||
      !g ||
      g.campaignId !== c.id ||
      !["validation", "review"].includes(g.stage) ||
      g.assessments?.at(-1)?.outcome !== "pass" ||
      g.assessments?.at(-1)?.stage !== "validation"
    )
      throw new Error("Fresh validation must pass before adoption");
    const suite = repo.seriesById(g.seriesId!);
    if (
      !suite ||
      assess(
        repo,
        c,
        suite.runIds,
        g.incumbentTeamId,
        g.challengerTeamId!,
        "validation",
        seeds(c, g, "validation"),
      ).outcome !== "pass"
    )
      throw new Error("Fresh validation evidence no longer qualifies");
    if (c.manifest.evidenceOrigin !== "local simulation") {
      finish(
        repo,
        c,
        g,
        "inconclusive",
        "Fixture validation passed; real active teams are unchanged",
      );
      return;
    }
    if (!["running", "review"].includes(c.status))
      throw new Error("Campaign is not eligible for adoption");
    const active = db.changeActive(
      c.manifest.profile,
      g.challengerTeamId!,
      g.activeRevision,
      manual
        ? "Reviewed validated candidate"
        : "Automatic fresh-validation adoption",
      {
        campaignId: c.id,
        generationId: g.id,
        assessment: g.assessments.at(-1),
        actor: manual ? "human" : "automatic",
      },
    );
    c.incumbentTeamId = active.teamId;
    c.activeRevision = active.revision;
    c.status = "running";
    finish(
      repo,
      c,
      g,
      "adopted",
      "Challenger adopted for future local simulations",
    );
  })();
}
export function controlCampaign(
  repo: SimRepository,
  id: string,
  command: "run" | "pause" | "stop" | "approve" | "reject",
) {
  const db = improvementRepository(repo);
  return repo.db.transaction(() => {
    const c = db.campaign(id);
    if (!c) throw new Error("Campaign not found");
    if (["completed", "limited", "stopped"].includes(c.status))
      throw new Error("Campaign is finished; start a new campaign");
    const g = db.generations(id).at(-1);
    if (command === "approve") {
      if (c.status !== "review" || !g)
        throw new Error("No candidate awaiting review");
      adoptGeneration(repo, id, g.id, true);
      return db.campaign(id)!;
    }
    if (command === "reject") {
      if (c.status !== "review" || !g)
        throw new Error("No candidate awaiting review");
      c.status = "running";
      finish(repo, c, g, "rejected", "Candidate declined during review");
      return db.campaign(id)!;
    }
    if (command === "run" && g?.stage === "generating")
      throw new Error(
        "Generation result is uncertain. Stop this campaign and start a new one; its reservation is retained.",
      );
    if (
      command === "run" &&
      (db.active(c.manifest.profile)?.revision || 0) !== c.activeRevision
    )
      throw new Error(
        "Active team changed. Start a new campaign from the selected team.",
      );
    if (command === "run" && c.status === "review")
      throw new Error("Approve or reject the candidate first");
    c.status =
      command === "run"
        ? g?.stage === "review"
          ? "review"
          : "running"
        : command === "pause"
          ? "paused"
          : "stopped";
    c.reason = command === "run" ? null : `Campaign ${c.status} by user`;
    db.saveCampaign(c);
    for (const s of repo.series().filter((s) => s.campaignId === id))
      if (
        s.runIds.some((id) =>
          ["queued", "running", "paused"].includes(repo.run(id)?.status || ""),
        )
      )
        repo.seriesControl(s.id, command);
    return c;
  })();
}
export function recoverCampaigns(repo: SimRepository) {
  const db = improvementRepository(repo);
  for (const c of db.campaigns().filter((c) => c.status === "running")) {
    const g = db.generations(c.id).at(-1);
    if (
      g?.stage === "generating" ||
      repo
        .series()
        .filter((s) => s.campaignId === c.id)
        .some((s) =>
          s.runIds.some((id) => repo.run(id)?.status === "interrupted"),
        )
    ) {
      c.status = "paused";
      c.reason =
        g?.stage === "generating"
          ? "Worker interrupted during generation; unknown usage remains reserved"
          : "Worker interruption recorded; resume to assess incomplete comparisons";
      db.saveCampaign(c);
      for (const s of repo.series().filter((s) => s.campaignId === c.id))
        if (
          s.runIds.some((id) =>
            ["queued", "running", "paused"].includes(
              repo.run(id)?.status || "",
            ),
          )
        )
          repo.seriesControl(s.id, "pause");
    }
  }
}
export async function advanceCampaign(
  repo: SimRepository,
  id: string,
  createResponse?: (request: any) => Promise<any>,
) {
  const db = improvementRepository(repo);
  let c = db.campaign(id);
  if (!c || c.status !== "running") return;
  let g = db.generations(id).at(-1);
  if (!g || g.stage === "done") {
    if (c.generation >= c.manifest.maxGenerations || c.noAdoption >= 2) {
      c.status = "completed";
      db.saveCampaign(c);
      return;
    }
    const active = db.active(c.manifest.profile);
    if ((active?.revision || 0) !== c.activeRevision) {
      c.status = "paused";
      c.reason =
        "Active team changed; start a new campaign from the selected team";
      db.saveCampaign(c);
      return;
    }
    c.reason = null;
    g = {
      id: crypto.randomUUID(),
      campaignId: id,
      number: ++c.generation,
      createdAt: new Date().toISOString(),
      stage: "observe",
      incumbentTeamId: c.incumbentTeamId,
      activeRevision: c.activeRevision,
    };
    repo.db.transaction(() => {
      db.put("lab_generations", g!);
      db.saveCampaign(c!);
    })();
  }
  if (g.stage === "generating") return;
  if (["discovery", "screening", "validation"].includes(g.stage)) {
    const series = repo.seriesById(g.seriesId!)!;
    const runs = series.runIds.map((id) => repo.run(id)!);
    if (runs.some((r) => ["queued", "running", "paused"].includes(r.status)))
      return;
    if (runs.some((r) => r.status !== "completed")) {
      const limited = runs.some((r) => r.status === "limited");
      finish(
        repo,
        c,
        g,
        "inconclusive",
        "Comparison did not complete; no adoption",
      );
      c = db.campaign(id)!;
      c.status = limited ? "limited" : "paused";
      db.saveCampaign(c);
      return;
    }
    if (g.stage === "discovery") {
      g.stage = "observe";
      db.put("lab_generations", g);
    } else {
      const stage = g.stage as "screening" | "validation",
        assessment = assess(
          repo,
          c,
          series.runIds,
          g.incumbentTeamId,
          g.challengerTeamId!,
          stage,
          seeds(c, g, stage),
        );
      g.assessments = [
        ...(g.assessments || []).filter((a) => a.stage !== stage),
        assessment,
      ];
      db.put("lab_generations", g);
      if (assessment.outcome !== "pass") {
        finish(repo, c, g, assessment.outcome, assessment.reason);
        if (assessment.outcome === "inconclusive") {
          c.status = "paused";
          db.saveCampaign(c);
        }
        return;
      }
      if (stage === "screening") {
        schedule(repo, c, g, "validation");
        return;
      }
      if (c.manifest.reviewBeforeAdoption) {
        g.stage = "review";
        db.put("lab_generations", g);
        c.status = "review";
        c.reason = "Validation passed; awaiting review";
        db.saveCampaign(c);
        return;
      }
      try {
        adoptGeneration(repo, id, g.id);
      } catch (e) {
        c.status = "paused";
        c.reason = (e as Error).message;
        db.saveCampaign(c);
      }
      return;
    }
  }
  if (g.stage === "observe") {
    const selected = c.manifest.selectedRunIds.map((id) => repo.run(id)!);
    if (
      g.number === 1 &&
      selected.some((r) => ["queued", "running", "paused"].includes(r.status))
    ) {
      if (c.reason !== "Waiting for selected discovery runs to finish") {
        c.reason = "Waiting for selected discovery runs to finish";
        db.saveCampaign(c);
      }
      return;
    }
    const runs = eligibleEvidence(repo, c, g);
    if (!runs.length) {
      schedule(repo, c, g, "discovery");
      return;
    }
    const evidence = bundle(repo, c, g, runs);
    repo.db.transaction(() => {
      db.put("lab_evidence", evidence, true);
      g!.evidenceId = evidence.id;
      g!.stage = "propose";
      db.put("lab_generations", g!);
    })();
  }
  if (g.stage !== "propose") return;
  try {
    const evidence = db.evidence(g.evidenceId!)!,
      w = repo.store.read(),
      payload = generationInput(c, evidence, w, g.incumbentTeamId),
      rate = c.manifest.generator.pricing;
    const fixture = c.manifest.evidenceOrigin === "test fixture",
      reservationId = crypto.randomUUID(),
      cost = fixture
        ? 0
        : estimatedCost(
            rate,
            payload.reservedInputTokens,
            c.manifest.generator.maxOutputTokens,
            true,
          );
    const reserved = repo.db.transaction(() => {
      if (db.get<Generation>("lab_generations", g!.id)?.stage !== "propose")
        return "busy";
      if (
        !db.reserve(
          c!.id,
          reservationId,
          fixture ? 0 : payload.reservedInputTokens,
          cost,
          "proposal",
        )
      )
        return "limited";
      g!.stage = "generating";
      c!.reason = `Generation ${g!.number}: proposing one role revision`;
      db.saveCampaign(c!);
      db.put("lab_generations", g!);
      return "reserved";
    })();
    if (reserved === "busy") return;
    if (reserved === "limited") {
      g.stage = "done";
      g.outcome = "inconclusive";
      g.reason = "Campaign budget cannot reserve the next proposal";
      db.put("lab_generations", g);
      c.status = "limited";
      c.reason = g.reason;
      db.saveCampaign(c);
      return;
    }
    let result: any;
    if (fixture && !createResponse) {
      const parent = w.prompts.find(
        (p) =>
          p.id ===
          w.teams.find((t) => t.id === g!.incumbentTeamId)!.promptIds.MID,
      )!;
      result = {
        status: "completed",
        id: "mock-proposal",
        model: c.manifest.generator.model,
        usage: { input_tokens: 0, output_tokens: 0 },
        output_text: JSON.stringify({
          outcome: "proposal",
          role: "MID",
          text:
            parent.text +
            "\nFixture-only revision: offer a passing outlet after turnovers.\n" +
            c.manifest.strategy.protectedInstructions.join("\n"),
          rationale: "Synthetic workflow exercise; no tactical validation",
          evidenceIds: [evidence.runs[0].id],
          sourceIds: [],
          uncertainties: ["Mock decisions do not measure prompt quality"],
        }),
      };
    } else {
      if (!process.env.OPENAI_API_KEY && !createResponse)
        throw new Error("OPENAI_API_KEY is not configured");
      const create =
        createResponse ||
        ((request: any) =>
          new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 60000,
            maxRetries: 0,
          }).responses.create(request));
      result = await create({
        model: c.manifest.generator.model,
        instructions: INSTRUCTIONS,
        reasoning: { effort: c.manifest.generator.reasoningEffort },
        input: payload.input,
        store: false,
        max_output_tokens: c.manifest.generator.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "local_prompt_candidate",
            strict: true,
            schema: generationSchema(),
          },
        },
      });
    }
    const inputTokens = result.usage?.input_tokens ?? null,
      outputTokens = result.usage?.output_tokens ?? 0;
    db.settle(
      reservationId,
      inputTokens,
      outputTokens,
      inputTokens === null
        ? undefined
        : fixture
          ? 0
          : estimatedCost(rate, inputTokens, outputTokens),
    );
    // Persist late responses and their usage, but do not advance a paused or stopped campaign.
    c = db.campaign(id)!;
    if (result.status !== "completed")
      throw new Error("Proposal was incomplete or refused");
    const proposal = parseGeneration(result.output_text, c, evidence);
    repo.db.transaction(() => {
      g!.proposal = proposal;
      if (proposal.outcome === "insufficient_evidence") {
        finish(repo, c!, g!, "insufficient", proposal.rationale);
        return;
      }
      const team = w.teams.find((t) => t.id === g!.incumbentTeamId)!,
        parent = w.prompts.find((p) => p.id === team.promptIds[proposal.role])!;
      if (
        db
          .generations(c!.id)
          .some(
            (prior) =>
              prior.id !== g!.id &&
              prior.incumbentTeamId === g!.incumbentTeamId &&
              prior.proposal?.role === proposal.role &&
              prior.proposal?.text === proposal.text,
          )
      ) {
        finish(
          repo,
          c!,
          g!,
          "insufficient",
          "Identical prompt already proposed under this team; no duplicate revision or tests scheduled",
        );
        return;
      }
      if (parent.text === proposal.text) {
        finish(
          repo,
          c!,
          g!,
          "insufficient",
          "Proposal did not change the prompt",
        );
        return;
      }
      const prompt = repo.store.save("prompts", {
        label: `${parent.label} · auto G${g!.number}`,
        role: proposal.role,
        formationId: parent.formationId,
        parentId: parent.id,
        text: proposal.text,
        rationale: proposal.rationale,
        hypothesisIds: parent.hypothesisIds,
        status: "draft",
        campaignId: c!.id,
        generationId: g!.id,
        evidenceBundleId: evidence.id,
        strategyId: c!.manifest.strategy.id,
        aiProposal: {
          actor: fixture ? "mock" : "automatic",
          version: IMPROVEMENT_VERSION,
          model: result.model,
          responseId: result.id,
          inputTokens,
          outputTokens,
          originalProposal: proposal,
          settings: c!.manifest.generator,
        },
      });
      const candidate = repo.store.save("teams", {
        label: `${team.label} · G${g!.number}`,
        formationId: team.formationId,
        parentId: team.id,
        promptIds: { ...team.promptIds, [proposal.role]: prompt.id },
        campaignId: c!.id,
        generationId: g!.id,
        strategyId: c!.manifest.strategy.id,
      });
      g!.promptId = prompt.id;
      g!.challengerTeamId = candidate.id;
      g!.stage = "screening";
      // Scheduling and candidate writes share one transaction: interrupted work cannot create orphan duplicates.
      schedule(repo, c!, g!, "screening");
      if (c!.status !== "running")
        repo.seriesControl(
          g!.seriesId!,
          c!.status === "stopped" ? "stop" : "pause",
        );
    })();
  } catch (e) {
    c = db.campaign(id)!;
    if (!["stopped", "limited"].includes(c.status)) {
      c.status = "paused";
      c.reason =
        e instanceof OpenAI.APIError
          ? `Proposal request failed (HTTP ${e.status || "connection/timeout"}); usage remains conservatively reserved`
          : (e as Error).message;
      db.saveCampaign(c);
    }
  }
}
