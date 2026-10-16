import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  KINDS,
  Kind,
  RecordData,
  Workspace,
  emptyWorkspace,
  validate,
} from "./domain";
import { seed } from "./seed";
export function createStore(
  filename = path.join(
    process.env.FOOTBALL_DATA_DIR || path.join(process.cwd(), "data"),
    "lab.sqlite",
  ),
) {
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL);",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS evidence_origins(record_id TEXT PRIMARY KEY,origin TEXT NOT NULL)",
  );
  for (const row of db
    .prepare(
      "SELECT id,body FROM records WHERE kind IN ('experiments','matches')",
    )
    .all() as { id: string; body: string }[]) {
    const d = JSON.parse(row.body);
    db.prepare("INSERT OR IGNORE INTO evidence_origins VALUES(?,?)").run(
      row.id,
      d.evidenceOrigin || (d.synthetic ? "test fixture" : "portal"),
    );
  }
  const read = (): Workspace => {
    const w = emptyWorkspace();
    for (const row of db
      .prepare("SELECT kind,body FROM records ORDER BY rowid")
      .all() as { kind: Kind; body: string }[]) {
      const d = JSON.parse(row.body);
      if (row.kind === "experiments" || row.kind === "matches")
        d.evidenceOrigin =
          d.evidenceOrigin ||
          (
            db
              .prepare("SELECT origin FROM evidence_origins WHERE record_id=?")
              .get(d.id) as { origin: string } | undefined
          )?.origin ||
          (d.synthetic ? "test fixture" : "portal");
      w[row.kind].push(d);
    }
    return w;
  };
  const insert = db.prepare("INSERT INTO records(kind,id,body) VALUES(?,?,?)");
  const save = (kind: Kind, input: any) => {
    if (!KINDS.includes(kind)) throw new Error("Unknown record type");
    const d = {
      ...input,
      id: input.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    } as RecordData;
    if (kind === "experiments" || kind === "matches")
      d.evidenceOrigin =
        d.evidenceOrigin || (d.synthetic ? "test fixture" : "portal");
    return db.transaction(() => {
      const w = read();
      validate(kind, d, w);
      if (w[kind].some((x) => x.id === d.id))
        throw new Error("Versions are immutable; create a new ID");
      if (kind === "matches")
        d.attachmentIds.forEach((id: string) => {
          if (!db.prepare("SELECT id FROM attachments WHERE id=?").get(id))
            throw new Error("Unknown attachment");
        });
      insert.run(kind, d.id, JSON.stringify(d));
      return d;
    })();
  };
  const importData = (input: any) =>
    db.transaction(() => {
      if (input.schemaVersion !== 1 || !input.records)
        throw new Error("Unsupported manifest");
      const w = read();
      let added = 0;
      const pending: { kind: Kind; d: RecordData }[] = [];
      for (const kind of KINDS) {
        const records =
          input.records[kind] ?? (kind === "collections" ? [] : undefined);
        if (!Array.isArray(records))
          throw new Error(`Missing collection: ${kind}`);
        for (const original of records) {
          const d = { ...original };
          if (kind === "experiments" || kind === "matches")
            d.evidenceOrigin =
              d.evidenceOrigin || (d.synthetic ? "test fixture" : "portal");
          const old = w[kind].find((x) => x.id === d.id);
          if (old) {
            if (JSON.stringify(old) !== JSON.stringify(d))
              throw new Error(`Immutable ID conflict: ${d.id}`);
            continue;
          }
          w[kind].push(d);
          pending.push({ kind, d: d as RecordData });
        }
      }
      // Validate the entire import graph, including evidence referenced by later prompt revisions.
      for (const { kind, d } of pending) {
        validate(kind, d, {
          ...w,
          [kind]: w[kind].filter((x) => x.id !== d.id),
        });
        insert.run(kind, d.id, JSON.stringify(d));
        added++;
      }
      return added;
    })();
  const initialize = () => {
    if (
      !(db.prepare("SELECT COUNT(*) AS n FROM records").get() as { n: number })
        .n
    )
      importData({ schemaVersion: 1, records: seed() });
  };
  return { db, read, save, importData, initialize };
}
let singleton: ReturnType<typeof createStore> | undefined;
export function store() {
  if (!singleton) {
    singleton = createStore();
    singleton.initialize();
  }
  return singleton;
}
