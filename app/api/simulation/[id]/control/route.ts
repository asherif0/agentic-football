import { simRepo, ensureWorker, sameOrigin } from "@/lib/simulation/server";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { command } = await req.json();
    if (!["run", "pause", "stop"].includes(command))
      throw new Error("Invalid command");
    const run = simRepo().control((await params).id, command);
    ensureWorker();
    return Response.json(run);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
