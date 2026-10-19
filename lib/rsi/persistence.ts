import type { SimRepository } from "../simulation/repository";
import type { RsiSession } from "./types";

export function rsiRepository(repo: SimRepository) {
  const db = repo.db;
  db.exec(
    "CREATE TABLE IF NOT EXISTS rsi_sessions(id TEXT PRIMARY KEY,body TEXT NOT NULL)",
  );
  function get(id: string): RsiSession | undefined {
    const row = db
      .prepare("SELECT body FROM rsi_sessions WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  function list(): RsiSession[] {
    return db
      .prepare("SELECT body FROM rsi_sessions ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse((r as { body: string }).body));
  }
  function save(s: RsiSession) {
    s.updatedAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO rsi_sessions VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    ).run(s.id, JSON.stringify(s));
    return s;
  }
  const series = (s: RsiSession) =>
    repo.series().filter((x) => x.rsiId === s.id);
  /** Money spent or still reserved: the session's own matches plus writer calls. */
  function spend(s: RsiSession) {
    let matchesUsd = 0,
      reservedUsd = 0;
    for (const x of series(s))
      for (const id of x.runIds) {
        const r = repo.run(id);
        if (!r) continue;
        matchesUsd += (r.estimatedCostUsd || 0) + (r.reservedCostUsd || 0);
        reservedUsd += r.reservedCostUsd || 0;
      }
    let rewritesUsd = 0;
    for (const r of s.rounds) {
      if (!r.rewrite) continue;
      rewritesUsd += r.rewrite.costUsd ?? r.rewrite.reservedUsd;
      if (r.rewrite.costUsd === null) reservedUsd += r.rewrite.reservedUsd;
    }
    return {
      matchesUsd,
      rewritesUsd,
      reservedUsd,
      totalUsd: matchesUsd + rewritesUsd,
    };
  }
  const active = () =>
    list().filter((s) => s.status === "running" || s.status === "paused");
  return { db, get, list, save, series, spend, active };
}
export type RsiRepository = ReturnType<typeof rsiRepository>;
