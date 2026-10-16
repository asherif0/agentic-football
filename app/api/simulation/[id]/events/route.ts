import { simRepo } from "@/lib/simulation/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    r = simRepo();
  if (!r.run(id)) return new Response("Not found", { status: 404 });
  let timer: ReturnType<typeof setInterval>;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          const run = r.run(id)!;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ run, roundCount: (r.db.prepare("SELECT COUNT(*) AS n FROM sim_rounds WHERE run_id=?").get(id) as { n: number }).n })}\n\n`,
            ),
          );
        } catch {
          clearInterval(timer);
        }
      };
      send();
      timer = setInterval(send, 700);
      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
