import type { ReactNode } from "react";
export default function DataTable({
  columns,
  children,
  label,
}: {
  columns: string[];
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="table-scroll">
      <table aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
