import {
  simRepo,
  sameOrigin,
  ensureWorker,
} from "../../../../lib/simulation/server";
import { rsiRepository } from "../../../../lib/rsi/persistence";
import {
  controlRsi,
  nextRoundUsd,
  withSpend,
} from "../../../../lib/rsi/engine";
import { runSummary } from "../../../../lib/simulation/run-summary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  const { id } = await params,
    repo = simRepo(),
    s = rsiRepository(repo).get(id);
  if (!s) return Response.json({ error: "Session not found" }, { status: 404 });
  const ids = [...s.baseline.runIds, ...s.rounds.flatMap((r) => r.runIds)];
  const count = repo.db.prepare(
    "SELECT COUNT(*) AS n FROM sim_rounds WHERE run_id=?",
  );
  return Response.json({
    session: {
      ...withSpend(repo, s),
      config: { ...s.config, baseline: undefined },
    },
    nextRoundUsd: nextRoundUsd(s),
    runs: ids.flatMap((runId) => {
      const run = repo.run(runId);
      return run
        ? [runSummary(run, (count.get(runId) as { n: number }).n)]
        : [];
    }),
  });
}
export async function POST(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { id } = await params,
      body = await req.json();
    if (!["run", "pause", "stop"].includes(body.command))
      throw new Error("Choose pause, resume or stop.");
    const repo = simRepo(),
      s = controlRsi(repo, id, body.command);
    if (body.command === "run") ensureWorker();
    return Response.json(withSpend(repo, s));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
