import { STARTER_LAYOUTS } from "../catalog";
import { PRICING } from "./pricing";
import { requiredKeys } from "./providers";
import type Database from "better-sqlite3";
import { createStore } from "../store";
import { ROLES, Role, Workspace } from "../domain";
import { DEFAULT_LAYOUT, initialState, frame } from "./engine";
import {
  DecisionTrace,
  Frame,
  Layout,
  Measurement,
  Run,
  RunConfig,
  SnapshotTeam,
  VERSIONS,
} from "./types";
export type Scenario = {
  id: string;
  createdAt: string;
  formationId: string;
  label: string;
  parentId: string | null;
  layout: Layout;
};
export type Series = {
  id: string;
  createdAt: string;
  label: string;
  runIds: string[];
  requestLimit: number;
  inputTokenLimit: number;
  kind?: "benchmark" | "improvement";
  campaignId?: string;
  costLimitUsd?: number;
  manifest?: any;
  command: "run" | "pause" | "stop";
  status: string;
  reason: string | null;
};
export function validateLayout(layout: Layout) {
  for (const role of ROLES) {
    const p = layout?.[role];
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0.01 ||
      p.x > 0.99 ||
      p.y < 0.01 ||
      p.y > 0.99
    )
      throw new Error(
        `${role}: position must be inside normalized pitch (0.01–0.99).`,
      );
  }
}
export function plannedCalls(
  duration: number,
  interval: number,
  headToHead: boolean,
) {
  return Math.ceil(duration / interval) * (headToHead ? 10 : 5);
}
export function simulationRepository(store = createStore()) {
  const db = store.db;
  db.exec(
    `CREATE TABLE IF NOT EXISTS sim_scenarios(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sim_runs(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sim_rounds(run_id TEXT NOT NULL,round INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(run_id,round));CREATE TABLE IF NOT EXISTS sim_series(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sim_decisions(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sim_worker(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,heartbeat INTEGER NOT NULL);`,
  );
  const get = <T>(table: string, id: string): T | undefined => {
    const row = db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(id) as
      { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  };
  const list = <T>(table: string): T[] =>
    db
      .prepare(`SELECT body FROM ${table} ORDER BY rowid DESC`)
      .all()
      .map((row) => JSON.parse((row as { body: string }).body));
  const write = (table: string, id: string, body: unknown) =>
    db
      .prepare(
        `INSERT INTO ${table}(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`,
      )
      .run(id, JSON.stringify(body));
  function scenario(input: Omit<Scenario, "id" | "createdAt">) {
    if (!store.read().formations.some((f) => f.id === input.formationId))
      throw new Error("Unknown formation revision.");
    validateLayout(input.layout);
    if (!input.label.trim()) throw new Error("Scenario label required.");
    if (input.parentId && !get<Scenario>("sim_scenarios", input.parentId))
      throw new Error("Unknown scenario parent");
    const s = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    write("sim_scenarios", s.id, s);
    return s;
  }
  function ensureDefault() {
    for (const [formationId, layout] of Object.entries(STARTER_LAYOUTS))
      if (
        store.read().formations.some((f) => f.id === formationId) &&
        !list<Scenario>("sim_scenarios").some(
          (s) => s.formationId === formationId,
        )
      )
        scenario({
          formationId,
          label: "2–1–1 suggested layout v1",
          parentId: null,
          layout,
        });
    if (
      !list<Scenario>("sim_scenarios").some(
        (s) => s.formationId === "formation-112-r1",
      ) &&
      store.read().formations.some((f) => f.id === "formation-112-r1")
    )
      scenario({
        formationId: "formation-112-r1",
        label: "1–1–2 suggested local layout v1",
        parentId: null,
        layout: DEFAULT_LAYOUT,
      });
  }
  function snapshot(
    teamId: string,
    scenarioId: string,
    models: Record<Role, string>,
    inference?: SnapshotTeam["inference"],
  ): SnapshotTeam {
    const w = store.read(),
      t = w.teams.find((t) => t.id === teamId),
      sc = get<Scenario>("sim_scenarios", scenarioId);
    if (!t || !sc || sc.formationId !== t.formationId)
      throw new Error(
        "Team and scenario must reference the same formation revision.",
      );
    const formation = w.formations.find((f) => f.id === t.formationId)!;
    validateLayout(sc.layout);
    for (const r of ROLES)
      if (!models?.[r]?.trim()) throw new Error(`Model required for ${r}`);
    return {
      id: t.id,
      label: t.label,
      formation,
      prompts: Object.fromEntries(
        ROLES.map((r) => {
          const p = w.prompts.find((p) => p.id === t.promptIds[r]);
          if (!p || p.formationId !== t.formationId || p.role !== r)
            throw new Error("Invalid team manifest");
          return [r, { id: p.id, text: p.text }];
        }),
      ) as SnapshotTeam["prompts"],
      models,
      ...(inference
        ? {
            inference: Object.fromEntries(
              ROLES.map((r) => {
                const v = inference[r];
                if (
                  !v ||
                  !["none", "low", "medium", "high", "xhigh", "max"].includes(
                    v.reasoningEffort,
                  ) ||
                  !Number.isInteger(v.maxOutputTokens) ||
                  v.maxOutputTokens < 256 ||
                  v.maxOutputTokens > 4096
                )
                  throw new Error(`Invalid inference settings for ${r}`);
                if (models[r] === "gpt-6.1-sol" && v.reasoningEffort === "none")
                  throw new Error(
                    "gpt-6.1-sol requires reasoning effort low or higher",
                  );
                return [r, v];
              }),
            ) as SnapshotTeam["inference"],
          }
        : {}),
      layout: sc.layout,
    };
  }
  function buildConfig(input: any): RunConfig {
    if (!["decisions", "responses", "mock"].includes(input.provider))
      throw new Error("Choose a valid provider.");
    if (input.provider !== "mock") {
      const need = requiredKeys([
        ...Object.values((input.models ?? {}) as Record<string, string>),
        ...(input.opponentTeamId
          ? Object.values(
              (input.opponentModels ?? {}) as Record<string, string>,
            )
          : []),
      ]);
      if (
        (need.openai || input.provider === "decisions") &&
        !process.env.OPENAI_API_KEY
      )
        throw new Error("OPENAI_API_KEY is not configured on the server.");
      if (need.jev && !process.env.JEV_API_KEY)
        throw new Error("JEV_API_KEY is not configured on the server.");
    }
    for (const [key, min, max] of [
      ["duration", 1, 600],
      ["interval", 0.25, 3],
      ["requestLimit", 1, 50000],
      ["inputTokenLimit", 1, 100000000],
    ] as const) {
      if (!Number.isFinite(input[key]) || input[key] < min || input[key] > max)
        throw new Error(`${key} must be between ${min} and ${max}.`);
    }
    if (
      !Number.isInteger(input.requestLimit) ||
      !Number.isInteger(input.inputTokenLimit) ||
      !Number.isInteger(input.seed)
    )
      throw new Error("Seed and limits must be integers.");
    if (
      !["balanced", "press", "counter"].includes(input.bot) ||
      !["home", "away"].includes(input.teamSide)
    )
      throw new Error("Invalid opponent or side");
    const team = snapshot(
        input.teamId,
        input.scenarioId,
        input.models,
        input.inference,
      ),
      opponent = input.opponentTeamId
        ? snapshot(
            input.opponentTeamId,
            input.opponentScenarioId,
            input.opponentModels,
            input.opponentInference,
          )
        : null;
    if (
      input.provider === "decisions" &&
      [team, ...(opponent ? [opponent] : [])].some((t) =>
        ROLES.some((r) => t.models[r] !== "gpt-6-luna"),
      )
    )
      throw new Error("Decisions currently supports gpt-6-luna only.");
    return {
      label: input.label?.trim() || `${team.label} simulation`,
      team,
      opponent,
      bot: input.bot,
      provider: input.provider,
      teamSide: input.teamSide,
      seed: input.seed,
      duration: input.duration,
      interval: input.interval,
      requestLimit: input.requestLimit,
      inputTokenLimit: input.inputTokenLimit,
      scenarioIds: [
        input.scenarioId,
        ...(opponent ? [input.opponentScenarioId] : []),
      ],
      versions: VERSIONS,
      pricing: Object.fromEntries(
        [
          ...Object.values(team.models),
          ...Object.values(opponent?.models || {}),
        ]
          .filter((m) => PRICING[m])
          .map((m) => [m, PRICING[m]]),
      ),
    };
  }
  function create(config: RunConfig, seriesId: string | null = null) {
    const now = new Date().toISOString();
    const run: Run = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "queued",
      command: "run",
      phase: "Queued",
      config: structuredClone(config),
      state: initialState(config),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      reservedTokens: 0,
      reason: null,
      seriesId,
      evidenceOrigin:
        config.provider === "mock" ? "test fixture" : "local simulation",
      matchId: null,
      workerId: null,
    };
    write("sim_runs", run.id, run);
    return run;
  }
  const saveRun = (run: Run) => {
    run.updatedAt = new Date().toISOString();
    write("sim_runs", run.id, run);
  };
  function control(id: string, command: "run" | "pause" | "stop") {
    return db.transaction(() => {
      const r = get<Run>("sim_runs", id);
      if (!r) throw new Error("Run not found");
      if (!["queued", "running", "paused"].includes(r.status))
        throw new Error("Run is already finished");
      r.command = command;
      if (command === "pause" && r.status === "queued") r.status = "paused";
      if (command === "run" && r.status === "paused") r.status = "queued";
      if (command === "stop" && r.status !== "running") {
        r.status = "stopped";
        r.reason = "Stopped by user";
      }
      saveRun(r);
      return r;
    })();
  }
  function rounds(id: string) {
    return db
      .prepare("SELECT body FROM sim_rounds WHERE run_id=? ORDER BY round")
      .all(id)
      .map(
        (row) =>
          JSON.parse((row as { body: string }).body) as {
            round: number;
            frames: Frame[];
            traces: DecisionTrace[];
            measurements: Measurement[];
            waitingMs: number;
            stateStats?: { time: number; stats: Run["state"]["stats"] };
          },
      );
  }
  function saveRound(
    run: Run,
    payload: {
      round: number;
      frames: Frame[];
      traces: DecisionTrace[];
      measurements: Measurement[];
      waitingMs: number;
      stateStats?: { time: number; stats: Run["state"]["stats"] };
    },
  ) {
    db.transaction(() => {
      db.prepare("INSERT INTO sim_rounds VALUES(?,?,?)").run(
        run.id,
        (
          db
            .prepare(
              "SELECT COALESCE(MAX(round),-1)+1 AS n FROM sim_rounds WHERE run_id=?",
            )
            .get(run.id) as { n: number }
        ).n,
        JSON.stringify(payload),
      );
      const live = get<Run>("sim_runs", run.id);
      run.command = live?.command || run.command;
      saveRun(run);
    })();
  }
  function createSeries(input: any) {
    return db.transaction(() => {
      const a = buildConfig(input),
        b = buildConfig({
          ...input,
          teamId: input.challengerTeamId,
          scenarioId: input.challengerScenarioId,
        });
      if (a.team.formation.id !== b.team.formation.id)
        throw new Error(
          "Paired champion/challenger series must use the same formation revision",
        );
      if (a.team.id === b.team.id)
        throw new Error(
          "Choose distinct champion and challenger team versions.",
        );
      if (
        !Number.isInteger(input.seriesRequestLimit) ||
        input.seriesRequestLimit < 1 ||
        input.seriesRequestLimit > 500000 ||
        !Number.isInteger(input.seriesInputTokenLimit) ||
        input.seriesInputTokenLimit < 1 ||
        input.seriesInputTokenLimit > 1000000000
      )
        throw new Error("Invalid series limits");
      const id = crypto.randomUUID(),
        runIds: string[] = [];
      for (const seed of [input.seed, input.seed + 1, input.seed + 2])
        for (const teamSide of ["home", "away"] as const)
          for (const config of [a, b])
            runIds.push(
              create(
                {
                  ...config,
                  label: config.team.label + " · paired",
                  seed,
                  teamSide,
                },
                id,
              ).id,
            );
      const series: Series = {
        id,
        createdAt: new Date().toISOString(),
        label: input.seriesLabel || "Paired comparison · 3 seeds × 2 sides",
        runIds,
        requestLimit: input.seriesRequestLimit,
        inputTokenLimit: input.seriesInputTokenLimit,
        command: "run",
        status: "queued",
        reason: null,
      };
      write("sim_series", id, series);
      return series;
    })();
  }
  function seriesControl(id: string, command: "run" | "pause" | "stop") {
    return db.transaction(() => {
      const s = get<Series>("sim_series", id);
      if (!s) throw new Error("Series not found");
      s.command = command;
      s.status =
        command === "run"
          ? "queued"
          : command === "pause"
            ? "paused"
            : "stopped";
      write("sim_series", id, s);
      for (const runId of s.runIds) {
        const r = get<Run>("sim_runs", runId);
        if (r && ["queued", "running", "paused"].includes(r.status))
          control(runId, command);
      }
      return s;
    })();
  }
  function promotion(input: any) {
    const w = store.read(),
      team = w.teams.find((t) => t.id === input.teamId);
    if (
      !team ||
      !input.reason?.trim() ||
      !["champion", "challenger", "rejected"].includes(input.outcome)
    )
      throw new Error("Team, outcome and reason required.");
    if (!Array.isArray(input.runIds))
      throw new Error("Run evidence list required.");
    for (const id of input.runIds) {
      const r = get<Run>("sim_runs", id);
      if (
        !r ||
        r.config.team.id !== team.id ||
        r.status !== "completed" ||
        r.evidenceOrigin !== "local simulation"
      )
        throw new Error(
          "Promotion evidence must be completed, non-fixture simulations of this team.",
        );
    }
    if (input.outcome === "champion" && !input.runIds.length)
      throw new Error("Completed simulation evidence required for a champion");
    const d = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      family: w.formations.find((f) => f.id === team.formationId)!.family,
      teamId: team.id,
      outcome: input.outcome,
      reason: input.reason,
      runIds: input.runIds,
      evidenceOrigin: "local simulation",
    };
    write("sim_decisions", d.id, d);
    return d;
  }
  return {
    db,
    store,
    ensureDefault,
    scenario,
    snapshot,
    buildConfig,
    create,
    saveRun,
    control,
    rounds,
    saveRound,
    createSeries,
    seriesControl,
    promotion,
    run: (id: string) => get<Run>("sim_runs", id),
    runs: () => list<Run>("sim_runs"),
    scenarios: () => list<Scenario>("sim_scenarios"),
    series: () => list<Series>("sim_series"),
    decisions: () => list<any>("sim_decisions"),
    saveSeries: (s: Series) => write("sim_series", s.id, s),
    seriesById: (id: string) => get<Series>("sim_series", id),
  };
}
export type SimRepository = ReturnType<typeof simulationRepository>;
