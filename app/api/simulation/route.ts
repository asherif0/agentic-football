import { seriesSummary } from "@/lib/simulation/summary";
import { resolveActiveTeam } from "@/lib/improvement/local-team";
import {
  simRepo,
  ensureWorker,
  workerStatus,
  sameOrigin,
} from "@/lib/simulation/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const r = simRepo();
  ensureWorker();
  return Response.json({
    runs: r.runs(),
    scenarios: r.scenarios(),
    series: r.series().map((s) => ({
      ...s,
      summary: seriesSummary(s.runIds.map((id) => r.run(id)!)),
    })),
    decisions: r.decisions(),
    ...workerStatus(),
  });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const r = simRepo(),
      body = await req.json();
    const run = r.create(
      resolveActiveTeam(r, r.buildConfig(body), body.useActiveTeam === true),
    );
    ensureWorker();
    return Response.json(run);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
