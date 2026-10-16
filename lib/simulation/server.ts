import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureLabCatalog } from "../catalog";
import { store } from "../store";
import { simulationRepository } from "./repository";
export function simRepo() {
  const s = store();
  ensureLabCatalog(s);
  const repo = simulationRepository(s);
  repo.ensureDefault();
  return repo;
}
export function ensureWorker() {
  const repo = simRepo();
  const heartbeat = repo.db
    .prepare("SELECT heartbeat FROM sim_worker WHERE id=1")
    .get() as { heartbeat: number } | undefined;
  if (heartbeat && Date.now() - heartbeat.heartbeat < 5000) return;
  const log = fs.openSync(
    path.join(
      process.env.FOOTBALL_DATA_DIR || path.join(process.cwd(), "data"),
      "simulation-worker.log",
    ),
    "a",
  );
  try {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/simulation-worker.ts"],
      {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: ["ignore", log, log],
      },
    );
    child.on("error", () => {});
    child.unref();
  } finally {
    fs.closeSync(log);
  }
}
export function workerStatus() {
  const repo = simRepo();
  const row = repo.db
    .prepare("SELECT heartbeat FROM sim_worker WHERE id=1")
    .get() as { heartbeat: number } | undefined;
  return {
    connected: !!row && Date.now() - row.heartbeat < 5000,
    keyConfigured: !!process.env.OPENAI_API_KEY,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !==
      (request.headers.get("host") || new URL(request.url).host)
  )
    throw new Error("Cross-origin simulation control is not allowed");
}
