import {
  simRepo,
  ensureWorker,
  sameOrigin,
} from "../../../../lib/simulation/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = simRepo(),
    { id } = await params,
    s = r.seriesById(id);
  if (!s || s.kind !== "benchmark")
    return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...s, runs: s.runIds.map((id) => r.run(id)) });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const r = simRepo(),
      { id } = await params,
      body = await req.json();
    if (r.seriesById(id)?.kind !== "benchmark")
      throw new Error("Unknown benchmark");
    if (!["run", "pause", "stop"].includes(body.command))
      throw new Error("Invalid command");
    const s = r.seriesControl(id, body.command);
    ensureWorker();
    return Response.json(s);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
