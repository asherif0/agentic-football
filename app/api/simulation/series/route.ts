import { simRepo, sameOrigin, ensureWorker } from "@/lib/simulation/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json(),
      r = simRepo();
    const result = body.id
      ? r.seriesControl(body.id, body.command)
      : r.createSeries(body);
    ensureWorker();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const r = simRepo(),
    id = new URL(req.url).searchParams.get("id");
  const series = id ? r.seriesById(id) : null;
  return Response.json(
    series
      ? {
          series,
          runs: series.runIds.map((id) => ({
            run: r.run(id),
            rounds: r.rounds(id),
          })),
        }
      : r.series(),
  );
}
