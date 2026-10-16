import { simRepo } from "@/lib/simulation/server";
import { performanceSummary } from "@/lib/simulation/runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = simRepo(),
    { id } = await params,
    run = r.run(id);
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  const rounds = r.rounds(id);
  return Response.json({
    run,
    rounds,
    performance: performanceSummary(
      rounds.flatMap((x) => x.traces),
      rounds.map((x) => x.waitingMs),
      Date.parse(run.updatedAt) - Date.parse(run.createdAt),
    ),
  });
}
