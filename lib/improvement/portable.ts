import type { SimRepository } from "../simulation/repository";
import { improvementRepository, TABLES, profileKey } from "./persistence";
import type { Campaign, Generation, Strategy } from "./types";
import { createHash } from "node:crypto";
import { stableJSON } from "./keys";
import { ROLES } from "../domain";
export function exportImprovement(repo: SimRepository) {
  const db = improvementRepository(repo);
  return {
    version: 1,
    tables: Object.fromEntries(TABLES.map((t) => [t, db.list<any>(t)])),
  };
}
export function exportSimulation(repo: SimRepository) {
  return {
    scenarios: repo.scenarios(),
    runs: repo.runs(),
    series: repo.series(),
    decisions: repo.decisions(),
    rounds: repo
      .runs()
      .map((r) => ({ runId: r.id, rounds: repo.rounds(r.id) })),
  };
}
export function importPortable(repo: SimRepository, input: any) {
  const db = improvementRepository(repo);
  repo.db.exec(
    "CREATE TABLE IF NOT EXISTS lab_import_receipts(id TEXT PRIMARY KEY,hash TEXT NOT NULL)",
  );
  return repo.db.transaction(() => {
    const receipt = (table: string, row: any) => {
      const key = `${table}/${row.id}`;
      const hash = createHash("sha256").update(stableJSON(row)).digest("hex");
      const old = repo.db
        .prepare("SELECT hash FROM lab_import_receipts WHERE id=?")
        .get(key) as { hash: string } | undefined;
      return {
        matches: old?.hash === hash,
        save: () =>
          repo.db
            .prepare(
              "INSERT INTO lab_import_receipts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash",
            )
            .run(key, hash),
      };
    };
    const added = repo.store.importData(input);
    const simulation = input.simulation;
    if (simulation) {
      for (const [key, table] of [
        ["scenarios", "sim_scenarios"],
        ["runs", "sim_runs"],
        ["series", "sim_series"],
        ["decisions", "sim_decisions"],
      ] as const) {
        if (!Array.isArray(simulation[key]))
          throw new Error(`Invalid simulation ${key}`);
        for (const original of simulation[key]) {
          if (typeof original.id !== "string")
            throw new Error("Invalid simulation ID");
          if (
            key === "runs" &&
            !repo.store
              .read()
              .teams.some((t) => t.id === original.config?.team?.id)
          )
            throw new Error("Imported run references an unknown team");
          const row = repo.db
            .prepare(`SELECT body FROM ${table} WHERE id=?`)
            .get(original.id) as { body: string } | undefined;
          if (row) {
            if (
              stableJSON(JSON.parse(row.body)) !== stableJSON(original) &&
              !receipt(table, original).matches
            )
              throw new Error(
                "Simulation import conflicts with existing history",
              );
            continue;
          }
          const d = structuredClone(original);
          if (
            key === "runs" &&
            ["queued", "running", "paused"].includes(d.status)
          ) {
            d.command = "pause";
            d.status = "paused";
            d.workerId = null;
          }
          if (
            key === "series" &&
            ["queued", "running", "paused"].includes(d.status)
          ) {
            d.command = "pause";
            if (["queued", "running", "paused"].includes(d.status))
              d.status = "paused";
          }
          repo.db
            .prepare(`INSERT INTO ${table} VALUES(?,?)`)
            .run(d.id, JSON.stringify(d));
          receipt(table, original).save();
        }
      }
      if (!Array.isArray(simulation.rounds))
        throw new Error("Missing simulation rounds");
      for (const group of simulation.rounds) {
        if (!repo.run(group.runId) || !Array.isArray(group.rounds))
          throw new Error("Invalid replay import");
        for (const [i, round] of group.rounds.entries()) {
          const old = repo.db
            .prepare("SELECT body FROM sim_rounds WHERE run_id=? AND round=?")
            .get(group.runId, i) as { body: string } | undefined;
          if (old && old.body !== JSON.stringify(round))
            throw new Error("Replay history conflict");
          if (!old)
            repo.db
              .prepare("INSERT INTO sim_rounds VALUES(?,?,?)")
              .run(group.runId, i, JSON.stringify(round));
        }
      }
    }
    if (!input.improvement) return added;
    if (input.improvement.version !== 1)
      throw new Error("Unsupported campaign export version");
    for (const table of TABLES) {
      const rows = input.improvement.tables?.[table];
      if (!Array.isArray(rows)) throw new Error(`Missing ${table}`);
      for (const row of rows) {
        if (typeof row.id !== "string" || !row.id)
          throw new Error("Invalid improvement ID");
        const old = db.get<any>(table, row.id);
        if (old) {
          if (
            stableJSON(old) !== stableJSON(row) &&
            !receipt(table, row).matches
          )
            throw new Error("Improvement history conflict");
          continue;
        }
        const copy = structuredClone(row);
        // Imported pointers never deploy a team; imported jobs require an explicit resume.
        if (table === "lab_active") continue;
        if (table === "lab_campaigns") {
          copy.status = "paused";
          copy.reason =
            "Imported campaign; explicitly resume after checking settings";
          copy.activeRevision = db.active(copy.manifest.profile)?.revision || 0;
          copy.imported = true;
        }
        db.put(table, copy, true);
        receipt(table, row).save();
      }
    }
    const w = repo.store.read();
    for (const s of db.strategies()) {
      if (
        !w.formations.some((f) => f.id === s.formationId) ||
        s.sourceIds.some((id) => !w.sources.some((x) => x.id === id)) ||
        (s.parentId && !db.get<Strategy>("lab_strategies", s.parentId))
      )
        throw new Error("Broken imported strategy references");
    }
    for (const c of db.campaigns()) {
      if (
        !db.get("lab_strategies", c.manifest.strategy.id) ||
        !w.teams.some((t) => t.id === c.incumbentTeamId) ||
        !w.teams.some((t) => t.id === c.manifest.baseline.team.id)
      )
        throw new Error("Broken imported campaign references");
      const m = c.manifest,
        b = m.budget;
      const originalTeam = w.teams.find((t) => t.id === m.baseline.team.id)!,
        incumbent = w.teams.find((t) => t.id === c.incumbentTeamId)!;
      if (
        originalTeam.formationId !== m.strategy.formationId ||
        incumbent.formationId !== originalTeam.formationId ||
        m.baseline.team.formation.id !== originalTeam.formationId ||
        ROLES.some((role) => {
          const snapshot = m.baseline.team.prompts[role],
            prompt = w.prompts.find(
              (p) => p.id === originalTeam.promptIds[role],
            );
          return (
            !snapshot ||
            snapshot.id !== prompt?.id ||
            snapshot.text !== prompt?.text
          );
        })
      )
        throw new Error(
          "Imported campaign formation or immutable prompt snapshot mismatch",
        );
      if (
        !Number.isInteger(m.maxGenerations) ||
        m.maxGenerations < 1 ||
        m.maxGenerations > 10 ||
        !Number.isInteger(b.requests) ||
        b.requests < 1 ||
        b.requests > 500000 ||
        !Number.isInteger(b.inputTokens) ||
        b.inputTokens < 1 ||
        b.inputTokens > 1e9 ||
        !Number.isFinite(b.costUsd) ||
        b.costUsd <= 0 ||
        b.costUsd > 1000 ||
        m.test.alpha !== 0.05 / m.maxGenerations ||
        m.test.failureLimit !== 0.01 ||
        m.test.screeningSeeds !== 1 ||
        m.test.validationSeeds !== 3 ||
        m.baseline.interval !== 1 ||
        m.baseline.duration < 1 ||
        m.baseline.duration > 600 ||
        m.profile !== profileKey(m.baseline) ||
        stableJSON(m.strategy) !==
          stableJSON(db.get("lab_strategies", m.strategy.id))
      )
        throw new Error(
          "Imported campaign changed frozen settings or exceeded supported limits",
        );
    }
    for (const g of db.list<Generation>("lab_generations")) {
      if (
        !db.campaign(g.campaignId) ||
        (g.promptId && !w.prompts.some((p) => p.id === g.promptId)) ||
        (g.challengerTeamId &&
          !w.teams.some((t) => t.id === g.challengerTeamId)) ||
        (g.evidenceId && !db.evidence(g.evidenceId))
      )
        throw new Error("Broken imported generation references");
    }
    for (const b of db.list<any>("lab_evidence")) {
      if (
        !db.campaign(b.campaignId) ||
        !db.get("lab_generations", b.generationId) ||
        b.author !== "machine" ||
        !Array.isArray(b.runs) ||
        b.runs.some((r: any) => !repo.run(r.id))
      )
        throw new Error("Broken imported machine evidence references");
    }
    for (const r of db.list<any>("lab_budget")) {
      if (
        !db.campaign(r.campaignId) ||
        !Number.isFinite(r.reservedInput) ||
        r.reservedInput < 0 ||
        !Number.isFinite(r.reservedCost) ||
        r.reservedCost < 0 ||
        (r.inputTokens !== null &&
          (!Number.isFinite(r.inputTokens) || r.inputTokens < 0)) ||
        (r.costUsd !== null && (!Number.isFinite(r.costUsd) || r.costUsd < 0))
      )
        throw new Error("Invalid imported budget reservation");
    }
    for (const p of w.prompts.filter((p) => p.campaignId)) {
      const g = db.get<Generation>("lab_generations", p.generationId),
        b = db.evidence(p.evidenceBundleId);
      if (
        !g ||
        !b ||
        g.campaignId !== p.campaignId ||
        b.generationId !== g.id ||
        g.promptId !== p.id ||
        !db.get("lab_strategies", p.strategyId)
      )
        throw new Error("Broken imported prompt provenance");
    }
    return added;
  })();
}
