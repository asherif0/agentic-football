import { NextRequest, NextResponse } from "next/server";
import { ensureLabCatalog } from "../../../lib/catalog";
import { store } from "../../../lib/store";
import { manualPortal } from "../../../lib/portal";
import { simRepo, sameOrigin } from "../../../lib/simulation/server";
import {
  exportImprovement,
  exportSimulation,
  importPortable,
} from "../../../lib/improvement/portable";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const s = store();
    ensureLabCatalog(s);
    const w = s.read();
    const id = request.nextUrl.searchParams.get("experiment");
    if (id) {
      const e = w.experiments.find((x) => x.id === id);
      if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(manualPortal.prepare(e, w));
    }
    const portable = request.nextUrl.searchParams.has("export")
      ? {
          improvement: exportImprovement(simRepo()),
          simulation: exportSimulation(simRepo()),
        }
      : {};
    return NextResponse.json({
      schemaVersion: 1,
      records: w,
      attachments: s.db.prepare("SELECT * FROM attachments").all(),
      ...portable,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const s = store();
    if (body.action === "import")
      return NextResponse.json({
        added: importPortable(simRepo(), body.manifest),
      });
    return NextResponse.json(s.save(body.kind, body.record), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
