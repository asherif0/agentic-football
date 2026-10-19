import {
  simRepo,
  sameOrigin,
  ensureWorker,
  workerStatus,
} from "../../../lib/simulation/server";
import { rsiRepository } from "../../../lib/rsi/persistence";
import { createRsi, previewRsi, withSpend } from "../../../lib/rsi/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const repo = simRepo(),
    db = rsiRepository(repo);
  return Response.json({
    // Lists stay light: round prompt texts are only in the detail route.
    sessions: db.list().map((s) => {
      const v = withSpend(repo, s);
      return {
        ...v,
        config: { ...v.config, baseline: undefined },
        rounds: v.rounds.map((r) => ({ ...r, prompts: undefined })),
        start: undefined,
        best: { ...v.best, prompts: undefined },
      };
    }),
    ...workerStatus(),
  });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const input = await req.json(),
      repo = simRepo();
    if (input.action === "preview") {
      const p = previewRsi(repo, input);
      return Response.json({
        estimate: p.estimate,
        problem: p.problem,
        reusedRunIds: p.reusedRunIds,
        provider: p.config.provider,
        seeds: p.config.seeds,
      });
    }
    const s = createRsi(repo, input);
    ensureWorker();
    return Response.json(withSpend(repo, s), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
