import {
  simRepo,
  ensureWorker,
  sameOrigin,
} from "../../../lib/simulation/server";
import {
  previewBenchmark,
  createBenchmark,
} from "../../../lib/simulation/benchmarks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const repo = simRepo();
  return Response.json(repo.series().filter((s) => s.kind === "benchmark"));
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const input = await req.json();
    const repo = simRepo();
    if (input.action === "preview")
      return Response.json(previewBenchmark(repo, input));
    const benchmark = createBenchmark(repo, input);
    ensureWorker();
    return Response.json(benchmark, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
