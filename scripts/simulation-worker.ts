import { acquireWorker } from "../lib/simulation/lifecycle";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { createStore } from "../lib/store";
import { simulationRepository } from "../lib/simulation/repository";
import { play, persistEvidence } from "../lib/simulation/runner";
import { improvementRepository } from "../lib/improvement/persistence";
import { advanceCampaign, recoverCampaigns } from "../lib/improvement/engine";
import { rsiRepository } from "../lib/rsi/persistence";
import { advanceRsi, recoverRsi } from "../lib/rsi/engine";
const store = createStore();
store.initialize();
const repo = simulationRepository(store);
const owner = `${process.pid}:${crypto.randomUUID()}`;
let exiting = false;
const acquired = acquireWorker(repo, owner);
if (!acquired) {
  store.db.close();
  process.exit(0);
}
recoverCampaigns(repo);
recoverRsi(repo);
const beat = setInterval(() => {
  const r = repo.db
    .prepare("UPDATE sim_worker SET heartbeat=? WHERE id=1 AND owner=?")
    .run(Date.now(), owner);
  if (!r.changes) process.exit(1);
}, 1000);
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    exiting = true;
    for (const run of repo
      .runs()
      .filter((r) => r.status === "running" && r.workerId === owner)) {
      run.status = "interrupted";
      run.reason = "Worker stopped";
      repo.saveRun(run);
      persistEvidence(repo, run);
    }
    clearInterval(beat);
    repo.db.prepare("DELETE FROM sim_worker WHERE id=1 AND owner=?").run(owner);
    process.exit(0);
  });
async function main() {
  while (!exiting) {
    for (const campaign of improvementRepository(repo)
      .campaigns()
      .filter((c) => c.status === "running")) {
      try {
        await advanceCampaign(repo, campaign.id);
      } catch {
        const db = improvementRepository(repo),
          live = db.campaign(campaign.id);
        if (live && live.status === "running") {
          live.status = "paused";
          live.reason =
            "Campaign stage failed; inspect its saved evidence before resuming";
          db.saveCampaign(live);
          for (const s of repo.series().filter((s) => s.campaignId === live.id))
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
    for (const session of rsiRepository(repo)
      .list()
      .filter((s) => s.status === "running")) {
      try {
        await advanceRsi(repo, session.id);
      } catch (e) {
        const db = rsiRepository(repo),
          live = db.get(session.id);
        if (live && live.status === "running") {
          live.status = "paused";
          live.reason = `RSI step failed: ${e instanceof Error ? e.message : "unknown error"}`;
          db.save(live);
          for (const s of db.series(live))
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
    const run = repo
      .runs()
      .reverse()
      .find(
        (r) =>
          r.status === "queued" &&
          r.command === "run" &&
          (!r.seriesId || repo.seriesById(r.seriesId)?.command === "run"),
      );
    if (run) {
      dotenv.config({ path: ".env.local", quiet: true, override: true });
      if (run.seriesId) {
        const series = repo.seriesById(run.seriesId);
        if (series) {
          series.status = "running";
          repo.saveSeries(series);
        }
      }
      await play(repo, run, owner);
    } else await new Promise((resolve) => setTimeout(resolve, 150));
    for (const series of repo.series()) {
      if (series.command !== "run") continue;
      const runs = series.runIds.map((id) => repo.run(id)!);
      if (runs.some((r) => r.status === "limited")) {
        series.status = "limited";
        series.reason = "A match or series ceiling was reached";
        series.command = "stop";
        repo.saveSeries(series);
        for (const r of runs.filter((r) => r.status === "queued")) {
          r.status = "limited";
          r.reason = series.reason;
          repo.saveRun(r);
        }
      } else {
        series.status = runs.every(
          (r) => !["queued", "running", "paused"].includes(r.status),
        )
          ? runs.every((r) => r.status === "completed")
            ? "completed"
            : runs.some((r) => r.status === "completed")
              ? "partial"
              : "failed"
          : runs.some((r) => r.status === "running")
            ? "running"
            : "queued";
        repo.saveSeries(series);
      }
    }
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Worker failed");
  process.exitCode = 1;
  clearInterval(beat);
});
