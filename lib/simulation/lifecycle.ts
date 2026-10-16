import type { SimRepository } from "./repository";
import { persistEvidence } from "./runner";
/** Acquire one worker lease and preserve evidence for work abandoned by its predecessor. */
export function acquireWorker(
  repo: SimRepository,
  owner: string,
  now = Date.now(),
) {
  return repo.db.transaction(() => {
    const previous = repo.db
      .prepare("SELECT * FROM sim_worker WHERE id=1")
      .get() as { owner: string; heartbeat: number } | undefined;
    if (previous && now - previous.heartbeat < 10000) return false;
    repo.db
      .prepare(
        "INSERT INTO sim_worker VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,heartbeat=excluded.heartbeat",
      )
      .run(owner, now);
    for (const run of repo.runs().filter((r) => r.status === "running")) {
      run.status = "interrupted";
      run.reason = "Simulation worker restarted; create a new run to repeat.";
      repo.saveRun(run);
      persistEvidence(repo, run);
    }
    return true;
  })();
}
