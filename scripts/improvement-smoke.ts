/** Production HTTP + worker smoke test. All generated evidence uses mock agents in an isolated SQLite directory. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { ROLES } from "../lib/domain";
async function main() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "football-improvement-"),
  );
  const port = await new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  const log = fs.openSync(path.join(directory, "http.log"), "a");
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, FOOTBALL_DATA_DIR: directory },
      stdio: ["ignore", log, log],
    },
  );
  const base = `http://127.0.0.1:${port}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function api(url: string, body?: any) {
    const r = await fetch(
      base + url,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const d = await r.json();
    if (!r.ok) throw new Error(`${url}: ${d.error}`);
    return d;
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(100);
    }
    assert(ready, "HTTP server did not start");
    const workspace = await api("/api/workspace"),
      sim = await api("/api/simulation");
    const strategy = await api("/api/strategies", {
      label: "[fixture] HTTP smoke strategy",
      formationId: "formation-112-r1",
      brief: "Exercise the improvement loop without inference",
      roleGuidance: {},
      protectedInstructions: ["Keep the assigned formation."],
      sourceIds: [workspace.records.sources[0].id],
    });
    const input = {
      label: "[fixture] HTTP campaign smoke",
      teamId: "team-provisional",
      strategyId: strategy.id,
      scenarioId: sim.scenarios.find(
        (s: any) => s.formationId === "formation-112-r1",
      ).id,
      provider: "mock",
      models: Object.fromEntries(ROLES.map((r) => [r, "gpt-6-luna"])),
      duration: 1,
      seed: 42,
      requestLimit: 1000,
      inputTokenLimit: 1000000,
      costLimitUsd: 1,
      maxGenerations: 1,
    };
    const preview = await api("/api/campaigns", {
      ...input,
      action: "preview",
    });
    assert.equal(preview.schedule.maximumPlannedRequests, 271);
    const c = await api("/api/campaigns", input);
    await api(`/api/campaigns/${c.id}`, { command: "pause" });
    assert.equal(
      (await api(`/api/campaigns/${c.id}`)).campaign.status,
      "paused",
    );
    await api(`/api/campaigns/${c.id}`, { command: "run" });
    let detail: any;
    for (let i = 0; i < 300; i++) {
      detail = await api(`/api/campaigns/${c.id}`);
      if (
        ["completed", "limited", "stopped", "paused"].includes(
          detail.campaign.status,
        )
      )
        break;
      await sleep(100);
    }
    assert.equal(detail.campaign.status, "completed", detail.campaign.reason);
    assert.equal(detail.generations[0].outcome, "rejected");
    assert.equal(detail.usage.costUsd, 0);
    assert.equal(detail.usage.requests, 1);
    assert.equal(detail.adoptions.length, 0);
    const after = await api("/api/workspace");
    assert.equal(
      after.records.prompts.length,
      workspace.records.prompts.length + 1,
    );
    assert.equal(
      after.records.teams.length,
      workspace.records.teams.length + 1,
    );
    assert.equal(after.records.decisions.length, 0);
    const saved = await api("/api/simulation");
    assert.equal(saved.runs.length, 18);
    assert(
      saved.runs.every(
        (r: any) =>
          r.evidenceOrigin === "test fixture" && r.status === "completed",
      ),
    );
    const replay = await api(`/api/simulation/${saved.runs[0].id}`);
    assert(replay.rounds[0].frames.length > 0);
    const ac = new AbortController(),
      stream = await fetch(`${base}/api/campaigns/${c.id}/events`, {
        signal: ac.signal,
      }),
      reader = stream.body!.getReader(),
      chunk = await reader.read();
    assert(new TextDecoder().decode(chunk.value).startsWith("data: "));
    ac.abort();
    const portable = await api(`/api/campaigns/${c.id}?export=1`);
    assert(portable.improvement.tables.lab_evidence.length > 0);
    assert.equal(portable.simulation.runs.length, 18);
    const report = {
      at: new Date().toISOString(),
      result: "passed",
      campaignId: c.id,
      databaseDirectory: directory,
      matches: 18,
      generatedPrompts: 1,
      paidRequests: 0,
      estimatedCostUsd: 0,
      checks: [
        "production HTTP APIs",
        "worker persistence",
        "pause/resume",
        "candidate generation",
        "paired screening rejection",
        "fixture separation",
        "replay frames",
        "SSE reconnection boundary",
        "portable export",
      ],
    };
    fs.writeFileSync(
      "data/improvement-smoke-report.json",
      JSON.stringify(report, null, 2),
    );
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally {
    try {
      const db = new Database(path.join(directory, "lab.sqlite"));
      const row = db
        .prepare("SELECT owner FROM sim_worker WHERE id=1")
        .get() as { owner: string } | undefined;
      db.close();
      const pid = Number(row?.owner.split(":")[0]);
      if (pid > 1) process.kill(pid, "SIGTERM");
    } catch {}
    server.kill("SIGTERM");
    fs.closeSync(log);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
