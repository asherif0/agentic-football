import {
  simRepo,
  sameOrigin,
  ensureWorker,
  workerStatus,
} from "../../../lib/simulation/server";
import { rsiRepository } from "../../../lib/rsi/persistence";
import { createRsi, previewRsi, withSpend } from "../../../lib/rsi/engine";
import { proposalModels } from "../../lib/models";
import { DEFAULT_PROPOSAL_MODEL } from "../../../lib/prompt-proposals";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const keys = () => ({
  openai: !!process.env.OPENAI_API_KEY,
  jev: !!process.env.JEV_API_KEY,
});
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
        rounds: v.rounds.map((r) => ({ ...r, text: undefined })),
        start: undefined,
        best: { ...v.best, prompts: undefined },
      };
    }),
    writers: proposalModels(keys(), process.env.PROMPT_REVISION_MODEL),
    defaultWriter: process.env.PROMPT_REVISION_MODEL || DEFAULT_PROPOSAL_MODEL,
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
