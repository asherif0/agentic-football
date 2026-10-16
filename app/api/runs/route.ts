import { seriesSummary } from "@/lib/simulation/summary";
import { runSummary } from "@/lib/simulation/run-summary";
import { simRepo, workerStatus } from "@/lib/simulation/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Passive run index for the dashboard. Unlike GET /api/simulation it never
// starts the simulation worker, so browsing stored matches has no side effects.
export async function GET() {
  const r = simRepo(),
    counts = new Map(
      (
        r.db
          .prepare(
            "SELECT run_id, COUNT(*) AS n FROM sim_rounds GROUP BY run_id",
          )
          .all() as { run_id: string; n: number }[]
      ).map((row) => [row.run_id, row.n]),
    ),
    runs = r.runs();
  return Response.json({
    runs: runs.map((run) => runSummary(run, counts.get(run.id) ?? 0)),
    scenarios: r.scenarios(),
    series: r.series().map((s) => ({
      ...s,
      manifest: undefined,
      summary: seriesSummary(
        s.runIds.map((id) => runs.find((run) => run.id === id) ?? r.run(id)!),
      ),
    })),
    decisions: r.decisions(),
    ...workerStatus(),
  });
}
