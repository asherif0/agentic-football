import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { store } from "../../../../lib/store";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]+$/.test(id))
    return new NextResponse("Not found", { status: 404 });
  const row = store()
    .db.prepare("SELECT * FROM attachments WHERE id=?")
    .get(id) as { name: string } | undefined;
  if (!row) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await fs.readFile(
      path.join(process.cwd(), "data", "attachments", id),
    );
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      },
    });
  } catch {
    return new NextResponse(
      "Attachment bytes unavailable; restore data/attachments from backup.",
      { status: 404 },
    );
  }
}
