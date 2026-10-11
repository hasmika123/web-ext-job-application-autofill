import type { ReactNode } from "react";
import { MoreHorizontalIcon, cn } from "@kiwiply/ui";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Classes for the <td>/<th> (width, alignment). */
  className?: string;
  /**
   * Stacked-card (< md) behaviour: `title` = the card's heading line (first column default),
   * `hide` = omit, default = a "Label  value" row.
   */
  mobile?: "title" | "hide";
}

/**
 * DataTable (local: `app-v2/common` DataTable wraps its own card, and these tables sit inside a SectionCard) — table with a muted header, hairline rows, hover tint and a `⋮` actions
 * column. Under `md` every row becomes a stacked card (375px = no horizontal page scroll).
 * Between md and xl the table scrolls inside its own wrapper if the columns do not fit.
 * Pure markup (no state), so it works from server and client components alike.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  actions = true,
  empty,
  className,
  minWidth = 860,
  label,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  selectable?: boolean;
  /** Render a trailing `⋮` actions column (true), a custom cell, or none (false). */
  actions?: boolean | ((row: T) => ReactNode);
  empty?: ReactNode;
  className?: string;
  /** Table min-width (px) before it scrolls inside its wrapper. */
  minWidth?: number;
  label?: string;
}) {
  const actionCell = (row: T) =>
    typeof actions === "function" ? (
      actions(row)
    ) : (
      <button
        type="button"
        aria-label="Row actions"
        className="grid h-7 w-7 place-items-center rounded-lg text-[18px] leading-none text-v2-muted hover:bg-[#EEF2FA]"
      >
        <MoreHorizontalIcon size={17} />
      </button>
    );

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const bodyCols = columns.filter((c) => c !== titleCol && c.mobile !== "hide");

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-v2-line px-4 py-10 text-center text-[13.5px] text-v2-muted", className)}>
        {empty ?? "Nothing to show."}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* md+ : real table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left" style={{ minWidth }} aria-label={label}>
          <thead>
            <tr className="bg-[#F6F8FC] text-[12px] font-medium text-v2-muted">
              {selectable && (
                <th scope="col" className="w-9 rounded-l-lg px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all" className="h-4 w-4 rounded border-v2-line accent-[#1E6FF5]" />
                </th>
              )}
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-2.5 py-2.5 font-medium",
                    !selectable && i === 0 && "rounded-l-lg pl-3",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {actions !== false && (
                <th scope="col" className="w-[68px] rounded-r-lg px-2.5 py-2.5 text-right font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-b border-v2-line/70 text-[12.5px] text-v2-ink-soft last:border-b-0 hover:bg-[#F8FAFE]">
                {selectable && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" aria-label="Select row" className="h-4 w-4 rounded border-v2-line accent-[#1E6FF5]" />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td key={c.key} className={cn("px-2.5 py-2.5 align-middle", !selectable && ci === 0 && "pl-3", c.className)}>
                    {c.cell(row, i)}
                  </td>
                ))}
                {actions !== false && <td className="px-2.5 py-2.5 text-right">{actionCell(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md : stacked cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row, i) => (
          <li key={rowKey(row, i)} className="rounded-xl border border-v2-line bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {selectable && (
                  <input type="checkbox" aria-label="Select row" className="h-4 w-4 flex-none rounded border-v2-line accent-[#1E6FF5]" />
                )}
                <div className="min-w-0">{titleCol.cell(row, i)}</div>
              </div>
              {actions !== false && actionCell(row)}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
              {bodyCols.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[11px] text-v2-muted">{c.header}</dt>
                  <dd className="mt-0.5 break-words text-v2-ink-soft">{c.cell(row, i)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
