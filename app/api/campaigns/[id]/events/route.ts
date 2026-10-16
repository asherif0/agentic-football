import { simRepo } from "../../../../../lib/simulation/server";
import { improvementRepository } from "../../../../../lib/improvement/persistence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    repo = simRepo(),
    db = improvementRepository(repo);
  if (!db.campaign(id))
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setInterval>;
      let expiry: ReturnType<typeof setTimeout>;
      const close = () => {
        clearInterval(timer);
        clearTimeout(expiry);
        try {
          controller.close();
        } catch {}
      };
      const send = () => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ campaign: db.campaign(id), generations: db.generations(id), usage: db.totals(id) })}\n\n`,
            ),
          );
        } catch {
          close();
        }
      };
      timer = setInterval(send, 1500);
      send();
      req.signal.addEventListener("abort", close, { once: true });
      expiry = setTimeout(close, 55000);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
