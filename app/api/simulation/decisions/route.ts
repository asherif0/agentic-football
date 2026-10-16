import { simRepo, sameOrigin } from "@/lib/simulation/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return Response.json(simRepo().promotion(await req.json()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
