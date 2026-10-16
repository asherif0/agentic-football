import { simRepo, sameOrigin } from "../../../lib/simulation/server";
import { improvementRepository } from "../../../lib/improvement/persistence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(improvementRepository(simRepo()).strategies());
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return Response.json(
      improvementRepository(simRepo()).strategy(await req.json()),
      { status: 201 },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
