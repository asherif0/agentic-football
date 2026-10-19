"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import type { RecordData } from "../../lib/domain";
import DataTable from "./DataTable";
export default function RecordBrowser({
  records,
  name,
  requestedId,
  children,
  storageKey,
  statusOf,
}: {
  records: RecordData[];
  name: (r: RecordData) => string;
  requestedId?: string | null;
  children: (r: RecordData) => ReactNode;
  storageKey?: string;
  /** Label used by the status filter and column. */
  statusOf?: (r: RecordData) => string;
}) {
  const filterKey =
    statusOf ?? ((r: RecordData) => r.evidenceOrigin || r.status || "draft");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState(0);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (storageKey) {
      try {
        const raw = sessionStorage.getItem("football-record-" + storageKey);
        if (raw) {
          const s = JSON.parse(raw);
          setQuery(s.query || "");
          setStatus(s.status || "");
          setSelected(s.selected || null);
          setPage(s.page || 0);
        }
      } catch {}
    }
    setRestored(true);
  }, [storageKey]);
  useEffect(() => {
    if (restored && storageKey)
      sessionStorage.setItem(
        "football-record-" + storageKey,
        JSON.stringify({ query, status, selected, page }),
      );
  }, [restored, storageKey, query, status, selected, page]);
  useEffect(() => {
    if (requestedId && records.some((r) => r.id === requestedId))
      setSelected(requestedId);
  }, [requestedId]);
  const backButton = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null);
  function open(id: string) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(id);
  }
  function close() {
    setSelected("closed");
    setTimeout(() => opener.current?.isConnected && opener.current.focus(), 0);
  }
  const filtered = records
    .filter(
      (r) =>
        (!status || filterKey(r) === status) &&
        `${name(r)} ${r.role || ""} ${r.observation || ""} ${r.formationId || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  const active =
    records.find((r) => r.id === selected) ||
    (!selected && requestedId
      ? records.find((r) => r.id === requestedId)
      : undefined);
  useEffect(() => {
    if (active) backButton.current?.focus();
  }, [active?.id]);
  return (
    <div className={active ? "record-browser has-detail" : "record-browser"}>
      <section className="record-index">
        <div className="toolbar record-filters">
          <input
            type="search"
            aria-label="Search records"
            placeholder="Search records…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <select
            aria-label="Record status or origin"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses / origins</option>
            {[...new Set(records.map(filterKey))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="muted">{filtered.length} records</span>
        </div>
        <DataTable
          label="Workspace records"
          columns={["Name", "Status / origin", "Created", ""]}
        >
          {filtered.slice(page * 20, page * 20 + 20).map((r) => (
            <tr key={r.id} aria-selected={active?.id === r.id}>
              <td>
                <button className="text-button" onClick={() => open(r.id)}>
                  {name(r)}
                </button>
                {r.role && <small>{r.role}</small>}
              </td>
              <td>
                {statusOf
                  ? statusOf(r)
                  : r.evidenceOrigin || r.status || "Recorded"}
              </td>
              <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Inspect ${name(r)}`}
                  onClick={() => open(r.id)}
                >
                  ↗
                </button>
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={4}>No matching records.</td>
            </tr>
          )}
        </DataTable>
        <div className="pagination">
          <button
            className="secondary"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {Math.min(page + 1, Math.max(1, Math.ceil(filtered.length / 20)))} /{" "}
            {Math.max(1, Math.ceil(filtered.length / 20))}
          </span>
          <button
            className="secondary"
            disabled={(page + 1) * 20 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
      {active && (
        <section
          className="record-detail"
          aria-label="Selected record"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <button ref={backButton} className="text-button" onClick={close}>
            ← Back to records
          </button>
          {children(active)}
        </section>
      )}
    </div>
  );
}
