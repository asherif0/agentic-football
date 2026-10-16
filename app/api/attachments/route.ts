import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { store } from "../../../lib/store";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new Error("File required");
    if (file.size > 25 * 1024 * 1024)
      throw new Error("Maximum file size is 25 MB");
    const id = crypto.randomUUID(),
      root = path.join(process.cwd(), "data", "attachments");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, id),
      Buffer.from(await file.arrayBuffer()),
    );
    store()
      .db.prepare("INSERT INTO attachments VALUES(?,?,?,?)")
      .run(id, file.name, file.type || "application/octet-stream", file.size);
    return NextResponse.json({ id, name: file.name, size: file.size });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
