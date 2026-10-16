import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import fs from "node:fs";
import { createStore } from "../lib/store";
import { ensureLabCatalog } from "../lib/catalog";
import { simulationRepository } from "../lib/simulation/repository";
import {
  createBenchmark,
  previewBenchmark,
} from "../lib/simulation/benchmarks";
import { analytics } from "../lib/simulation/analytics";
const s = createStore();
s.initialize();
ensureLabCatalog(s);
const r = simulationRepository(s);
r.ensureDefault();
const action = process.argv[2] || "preview";
if (action === "start") {
  const old = r
    .series()
    .find(
      (b) =>
        b.kind === "benchmark" &&
        b.manifest?.pilotKey === "authorized-2026-10-16",
    );
  const b =
    old ||
    createBenchmark(r, { label: "GPT model × formation pilot · 16 Oct 2026" });
  if (!old) {
    b.manifest.pilotKey = "authorized-2026-10-16";
    r.saveSeries(b);
  }
  fs.writeFileSync(
    "data/model-pilot-manifest.json",
    JSON.stringify(b, null, 2),
  );
  process.stdout.write(
    JSON.stringify({
      id: b.id,
      status: b.status,
      matches: b.runIds.length,
      normalCalls: b.manifest.normalRequests,
      limits: {
        requests: b.requestLimit,
        inputTokens: b.inputTokenLimit,
        costUsd: b.costLimitUsd,
      },
    }),
  );
} else if (action === "status" || action === "export") {
  const b = r
    .series()
    .find(
      (b) =>
        b.kind === "benchmark" &&
        b.manifest?.pilotKey === "authorized-2026-10-16",
    );
  if (!b) throw new Error("Pilot not started");
  const runs = b.runIds.map((id) => r.run(id)!);
  const summary = {
    id: b.id,
    status: b.status,
    counts: Object.fromEntries(
      [...new Set(runs.map((v) => v.status))].map((status) => [
        status,
        runs.filter((v) => v.status === status).length,
      ]),
    ),
    requests: runs.reduce((n, v) => n + v.requests, 0),
    estimatedCost: runs.reduce((n, v) => n + (v.estimatedCostUsd || 0), 0),
    reservedCost: runs.reduce((n, v) => n + (v.reservedCostUsd || 0), 0),
    active: runs
      .filter((v) => v.status === "running")
      .map((v) => ({
        model: v.config.team.models.GK,
        formation: v.config.team.formation.name,
        time: v.state.time,
        phase: v.phase,
      })),
    failures: runs
      .filter((v) => v.status === "failed")
      .slice(0, 3)
      .map((v) => v.reason),
  };
  if (action === "export") {
    const result = analytics(r, { benchmark: b.id });
    fs.writeFileSync(
      "data/model-pilot-results.json",
      JSON.stringify(result, null, 2),
    );
    const lines = [
      "# GPT model × formation pilot",
      "",
      `Completed: ${summary.counts.completed || 0} / ${b.runIds.length}. Status: ${summary.status}. Requests: ${summary.requests} / ${b.requestLimit}.`,
      `Estimated settled cost: $${summary.estimatedCost.toFixed(4)}. Conservative reservations: $${summary.reservedCost.toFixed(4)}. Ceiling: $${b.costLimitUsd}.`,
      `Partial limited matches: ${runs.filter((r) => r.status === "limited" && r.state.time > 0).length}. Unrun limited matches: ${runs.filter((r) => r.status === "limited" && r.state.time === 0).length}.`,
      "",
      ...result.insights.map((x) => "- " + x),
      "",
      "## Configuration results",
      "",
      "| Model | Formation | Matches | W / D / L | GF / GA | Overall median / p95 (ms) | Successful median (ms) | Failed decisions | Estimated cost |",
      "|---|---|---:|---|---|---|---|---|---|",
      ...result.groups.map(
        (g) =>
          `| ${g.model} | ${g.formation} | ${g.matches} | ${g.wins} / ${g.draws} / ${g.matches - g.wins - g.draws} | ${g.goalsFor} / ${g.goalsAgainst} | ${g.medianMs?.toFixed(0) ?? "Unknown"} / ${g.p95Ms?.toFixed(0) ?? "Unknown"} | ${g.successfulMedianMs?.toFixed(0) ?? "Unknown"} | ${g.failures} / ${g.decisions} | ${g.cost?.toFixed(4) ?? "Unknown"} |`,
      ),
      "",
      "Short, local simulations do not establish general model intelligence or portal performance. Adaptive prompts were not part of this comparison.",
      "Browser screenshots and desktop/mobile interaction checks were blocked by the saved browser permission policy.",
    ];
    fs.writeFileSync("data/model-pilot-insights.md", lines.join("\n"));
  }
  process.stdout.write(JSON.stringify(summary));
} else {
  const p = previewBenchmark(r);
  process.stdout.write(
    JSON.stringify({
      matches: p.plannedMatches,
      normalRequests: p.normalRequests,
      models: p.models,
      teamIds: p.teamIds,
      requestLimit: p.requestLimit,
      costLimitUsd: p.costLimitUsd,
    }),
  );
}
s.db.close();
