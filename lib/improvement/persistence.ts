import { stableJSON } from "./keys";
import { createHash } from "node:crypto";
import type { SimRepository } from "../simulation/repository";
import type { RunConfig } from "../simulation/types";
import { ROLES } from "../domain";
import type {
  ActiveTeam,
  Campaign,
  EvidenceBundle,
  Generation,
  Strategy,
} from "./types";

export const TABLES = [
  "lab_strategies",
  "lab_campaigns",
  "lab_generations",
  "lab_evidence",
  "lab_adoptions",
  "lab_active",
  "lab_budget",
] as const;
type Table = (typeof TABLES)[number];
export function improvementRepository(repo: SimRepository) {
  const db = repo.db;
  for (const t of TABLES)
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,body TEXT NOT NULL)`,
    );
  function get<T>(t: Table, id: string): T | undefined {
    const row = db.prepare(`SELECT body FROM ${t} WHERE id=?`).get(id) as
      { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  function list<T>(t: Table): T[] {
    return db
      .prepare(`SELECT body FROM ${t} ORDER BY rowid DESC`)
      .all()
      .map((r) => JSON.parse((r as { body: string }).body));
  }
  function put(t: Table, d: { id: string }, immutable = false) {
    db.prepare(
      immutable
        ? `INSERT INTO ${t} VALUES(?,?)`
        : `INSERT INTO ${t} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`,
    ).run(d.id, JSON.stringify(d));
  }
  function strategy(input: any): Strategy {
    const w = repo.store.read();
    if (
      !input.label?.trim() ||
      !input.brief?.trim() ||
      input.brief.length > 10000
    )
      throw new Error(
        "Strategy needs a name and brief (up to 10,000 characters).",
      );
    if (!w.formations.some((f) => f.id === input.formationId))
      throw new Error("Unknown formation revision");
    if (
      input.parentId &&
      get<Strategy>("lab_strategies", input.parentId)?.formationId !==
        input.formationId
    )
      throw new Error("Strategy parent must use the same formation revision");
    if (
      !Array.isArray(input.sourceIds) ||
      input.sourceIds.some((id: string) => !w.sources.some((s) => s.id === id))
    )
      throw new Error("Unknown strategy source");
    if (
      !Array.isArray(input.protectedInstructions) ||
      input.protectedInstructions.some(
        (s: any) => typeof s !== "string" || !s.trim(),
      ) ||
      input.protectedInstructions.join("\n").length > 2000
    )
      throw new Error(
        "Protected instructions must be nonempty text, at most 2,000 characters combined",
      );
    const guidance = input.roleGuidance || {};
    if (
      Object.keys(guidance).some((r) => !ROLES.includes(r as any)) ||
      Object.values(guidance).some(
        (v) => typeof v !== "string" || v.length > 2000,
      )
    )
      throw new Error("Invalid role guidance");
    const d: Strategy = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      label: input.label.trim(),
      brief: input.brief.trim(),
      formationId: input.formationId,
      parentId: input.parentId || null,
      sourceIds: [...new Set(input.sourceIds)] as string[],
      protectedInstructions: input.protectedInstructions,
      roleGuidance: guidance,
    };
    put("lab_strategies", d, true);
    return d;
  }
  function saveCampaign(c: Campaign) {
    c.updatedAt = new Date().toISOString();
    put("lab_campaigns", c);
  }
  function totals(id: string) {
    const rows = list<any>("lab_budget").filter((r) => r.campaignId === id);
    return {
      requests: rows.length,
      inputTokens: rows.reduce(
        (n, r) => n + (r.inputTokens ?? r.reservedInput),
        0,
      ),
      reservedInputTokens: rows
        .filter((r) => r.inputTokens === null)
        .reduce((n, r) => n + r.reservedInput, 0),
      outputTokens: rows.reduce((n, r) => n + (r.outputTokens || 0), 0),
      costUsd: rows.reduce((n, r) => n + (r.costUsd ?? r.reservedCost), 0),
      reservedCostUsd: rows
        .filter((r) => r.costUsd === null)
        .reduce((n, r) => n + r.reservedCost, 0),
    };
  }
  function reserve(
    campaignId: string,
    id: string,
    tokens: number,
    cost: number,
    kind: "proposal" | "decision",
    runId?: string,
  ) {
    return db.transaction(() => {
      const c = get<Campaign>("lab_campaigns", campaignId);
      if (!c || c.status !== "running" || get("lab_budget", id)) return false;
      const t = totals(c.id),
        b = c.manifest.budget;
      if (
        t.requests + 1 > b.requests ||
        t.inputTokens + tokens > b.inputTokens ||
        t.costUsd + cost > b.costUsd + 1e-10
      )
        return false;
      put(
        "lab_budget",
        {
          id,
          campaignId,
          kind,
          runId: runId || null,
          createdAt: new Date().toISOString(),
          reservedInput: tokens,
          reservedCost: cost,
          inputTokens: null,
          outputTokens: 0,
          costUsd: null,
        } as any,
        true,
      );
      return true;
    })();
  }
  function settle(
    id: string,
    inputTokens: number | null,
    outputTokens: number,
    costUsd?: number,
  ) {
    db.transaction(() => {
      const r = get<any>("lab_budget", id);
      if (!r || r.settled) return;
      if (inputTokens !== null) {
        r.inputTokens = inputTokens;
        r.outputTokens = outputTokens;
        if (costUsd !== undefined) r.costUsd = costUsd;
        r.settled = true;
      }
      put("lab_budget", r);
    })();
  }
  function active(profile: string) {
    return get<ActiveTeam>("lab_active", profile);
  }
  function changeActive(
    profile: string,
    teamId: string,
    expected: number,
    reason: string,
    extra: any = {},
  ) {
    return db.transaction(() => {
      const current = active(profile);
      if ((current?.revision || 0) !== expected)
        throw new Error("Active team changed; stale adoption prevented.");
      if (!repo.store.read().teams.some((t) => t.id === teamId))
        throw new Error("Unknown team version");
      const a: ActiveTeam = {
        id: profile,
        teamId,
        revision: expected + 1,
        updatedAt: new Date().toISOString(),
      };
      put("lab_active", a);
      put(
        "lab_adoptions",
        {
          ...extra,
          id: crypto.randomUUID(),
          createdAt: a.updatedAt,
          profile,
          teamId,
          previousTeamId: current?.teamId || null,
          revision: a.revision,
          reason,
          evidenceOrigin: "local simulation",
        } as any,
        true,
      );
      return a;
    })();
  }
  return {
    get,
    list,
    put,
    strategy,
    saveCampaign,
    totals,
    reserve,
    settle,
    active,
    changeActive,
    campaign: (id: string) => get<Campaign>("lab_campaigns", id),
    campaigns: () => list<Campaign>("lab_campaigns"),
    generations: (id: string) =>
      list<Generation>("lab_generations")
        .filter((g) => g.campaignId === id)
        .sort((a, b) => a.number - b.number),
    strategies: () => list<Strategy>("lab_strategies"),
    evidence: (id: string) => get<EvidenceBundle>("lab_evidence", id),
  };
}
export function profileKey(config: RunConfig) {
  const data = {
    formation: config.team.formation.id,
    models: config.team.models,
    inference: config.team.inference || null,
    layout: config.team.layout,
    provider: config.provider,
    versions: config.versions,
    duration: config.duration,
    interval: config.interval,
    opponent: "balanced/press/counter",
  };
  return createHash("sha256").update(stableJSON(data)).digest("hex");
}
