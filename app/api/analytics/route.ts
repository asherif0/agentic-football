import { simRepo } from "../../../lib/simulation/server";
import { analytics } from "../../../lib/simulation/analytics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      result = analytics(simRepo(), Object.fromEntries(url.searchParams));
    return Response.json(
      result,
      url.searchParams.get("export") === "json"
        ? {
            headers: {
              "Content-Disposition":
                "attachment; filename=football-analytics.json",
            },
          }
        : undefined,
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
