import OpenAI from "openai";
import { store } from "../../../lib/store";
import {
  DEFAULT_PROPOSAL_MODEL,
  generateProposal,
} from "../../../lib/prompt-proposals";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({
    configured: !!process.env.OPENAI_API_KEY,
    model: process.env.PROMPT_REVISION_MODEL || DEFAULT_PROPOSAL_MODEL,
  });
}
let generating = false;
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host)
    return Response.json(
      { error: "Cross-origin prompt generation is not allowed" },
      { status: 403 },
    );
  if (generating)
    return Response.json(
      { error: "Another proposal is generating. Please wait." },
      { status: 409 },
    );
  generating = true;
  try {
    const body = await req.json();
    const w = store().read();
    const collection = w.collections.find((c) => c.id === body.collectionId);
    if (!collection) throw new Error("Save an annotation collection first.");
    const model =
      body.model || process.env.PROMPT_REVISION_MODEL || DEFAULT_PROPOSAL_MODEL;
    if (typeof model !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(model))
      throw new Error("Invalid model name");
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 0,
    });
    const proposal = await generateProposal(collection, w, model, (request) =>
      client.responses.create(request),
    );
    return Response.json(proposal);
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    // Provider errors may contain request data; return only safe actionable diagnostics.
    const message = err.status
      ? `OpenAI request failed (HTTP ${err.status}). Check API access, model availability and quota; no automatic retry or revision saved.`
      : err.name?.startsWith("API")
        ? "OpenAI request failed or timed out. No automatic retry or revision saved."
        : err.message || "Could not generate proposal";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    generating = false;
  }
}
