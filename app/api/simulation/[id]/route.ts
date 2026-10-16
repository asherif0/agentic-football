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
    view = new URL(req.url).searchParams.get("view"),
    run = r.run(id);
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  const rounds = r.rounds(id);
  const performance = performanceSummary(
    rounds.flatMap((x) => x.traces),
    rounds.map((x) => x.waitingMs),
    Date.parse(run.updatedAt) - Date.parse(run.createdAt),
  );
  // view=frames: positions only (dashboard hero). view=replay: traces without
  // the bulky observation payloads. Default: the complete stored snapshot.
  if (view === "frames")
    return Response.json({
      run: {
        id: run.id,
        config: {
          teamSide: run.config.teamSide,
          duration: run.config.duration,
          team: { label: run.config.team.label },
        },
        state: { events: run.state.events },
      },
      rounds: rounds.map((x) => ({ round: x.round, frames: x.frames })),
    });
  if (view === "replay")
    return Response.json({
      run,
      rounds: rounds.map((x) => ({
        ...x,
        traces: x.traces.map(({ observation, attemptLog, ...t }) => t),
      })),
      performance,
    });
  return Response.json({ run, rounds, performance });
}
