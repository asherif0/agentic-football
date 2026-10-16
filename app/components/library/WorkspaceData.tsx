"use client";
import { getJSON, invalidate, postJSON } from "../../lib/data/cache";
import { useWorkspace } from "../../lib/data/hooks";
import { download } from "../../lib/download";
import { toast } from "../../lib/toast";

/** Workspace backup, import and evidence attachments. */
export default function WorkspaceData() {
  const { data } = useWorkspace();
  async function upload(file: File) {
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/attachments", { method: "POST", body });
      const a = await r.json();
      if (!r.ok) throw new Error(a.error);
      invalidate("workspace");
      toast(
        `Uploaded ${a.name}. Select it in a match's attachment list.`,
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div className="legacy">
      <div className="grid">
        <section className="card">
          <h3>Workspace backup</h3>
          <p className="muted">
            JSON contains records and attachment references. Back up the data/
            folder for the database and original attachment bytes.
          </p>
          <div className="toolbar">
            <button
              className="secondary"
              onClick={async () => {
                try {
                  download(
                    "agentic-football-workspace.json",
                    await getJSON("/api/workspace?export=1"),
                  );
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
            >
              Export JSON records
            </button>
            <label className="file-button">
              Import JSON
              <input
                type="file"
                accept="application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const manifest = JSON.parse(await file.text());
                    const x = await postJSON<{ added: number }>(
                      "/api/workspace",
                      { action: "import", manifest },
                      ["workspace", "runs", "analytics"],
                    );
                    toast(`Imported ${x.added} records.`, "success");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
              />
            </label>
          </div>
        </section>
        <section className="card">
          <h3>Evidence attachments</h3>
          <p className="muted">
            Original bytes preserved · up to 25 MB per file.
          </p>
          <label className="file-button">
            Upload report, replay or setup JSON
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </label>
          {data?.attachments.length ? (
            data.attachments.map((a) => (
              <div key={a.id}>
                <a href={`/api/attachments/${a.id}`}>{a.name}</a>{" "}
                <small>{a.id}</small>
              </div>
            ))
          ) : (
            <p className="muted">No attachments uploaded.</p>
          )}
        </section>
      </div>
    </div>
  );
}
