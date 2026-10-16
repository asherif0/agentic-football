import {
  simRepo,
  sameOrigin,
  ensureWorker,
  workerStatus,
} from "../../../lib/simulation/server";
import { improvementRepository } from "../../../lib/improvement/persistence";
import {
  previewCampaign,
  createCampaign,
} from "../../../lib/improvement/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const repo = simRepo(),
    db = improvementRepository(repo);
  return Response.json({
    campaigns: db.campaigns().map((c) => ({ ...c, usage: db.totals(c.id) })),
    strategies: db.strategies(),
    activeTeams: db.list("lab_active"),
    adoptions: db.list("lab_adoptions"),
    ...workerStatus(),
  });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const input = await req.json(),
      repo = simRepo();
    if (input.action === "preview")
      return Response.json(previewCampaign(repo, input));
    const c = createCampaign(repo, input);
    ensureWorker();
    return Response.json(c, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
