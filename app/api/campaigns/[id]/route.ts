import {
  simRepo,
  sameOrigin,
  ensureWorker,
} from "../../../../lib/simulation/server";
import { improvementRepository } from "../../../../lib/improvement/persistence";
import { controlCampaign } from "../../../../lib/improvement/engine";
import {
  exportImprovement,
  exportSimulation,
} from "../../../../lib/improvement/portable";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  const { id } = await params,
    repo = simRepo(),
    db = improvementRepository(repo),
    campaign = db.campaign(id);
  if (!campaign)
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (new URL(req.url).searchParams.has("export"))
    return Response.json({
      schemaVersion: 1,
      records: repo.store.read(),
      simulation: exportSimulation(repo),
      improvement: exportImprovement(repo),
    });
  const generations = db.generations(id);
  return Response.json({
    campaign,
    usage: db.totals(id),
    generations,
    evidence: generations.flatMap((g) =>
      g.evidenceId ? [db.evidence(g.evidenceId)] : [],
    ),
    series: repo.series().filter((s) => s.campaignId === id),
    adoptions: db.list<any>("lab_adoptions").filter((a) => a.campaignId === id),
  });
}
export async function POST(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { id } = await params,
      body = await req.json();
    if (!["run", "pause", "stop", "approve", "reject"].includes(body.command))
      throw new Error("Invalid campaign control");
    const c = controlCampaign(simRepo(), id, body.command);
    if (
      body.command === "run" ||
      body.command === "approve" ||
      body.command === "reject"
    )
      ensureWorker();
    return Response.json(c);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
