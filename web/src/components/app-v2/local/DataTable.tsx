import type { CSSProperties, ReactNode } from "react";
import { cn } from "@kiwiply/ui";

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes on the cell wrapper (e.g. text alignment). */
  className?: string;
}

/**
 * Card table. md+ = CSS grid rows (`template` is the grid-template-columns, without the select
 * column); under md every row becomes a stacked card: the first column is the card title, the
 * rest render as `label  value` lines, `actions` closes the card. No horizontal scrolling.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  template,
  selectable,
  actions,
  actionsHeader = "Actions",
  footer,
  className,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  template: string;
  selectable?: boolean;
  actions?: (row: T) => ReactNode;
  actionsHeader?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const cols = [selectable ? "24px" : null, template, actions ? "128px" : null].filter(Boolean).join(" ");
  const style = { "--cols": cols } as CSSProperties;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-v2-line bg-white", className)} style={style}>
      <div
        role="row"
        className="hidden items-center gap-3 border-b border-v2-line px-4 py-2.5 text-[12px] font-semibold text-v2-muted md:grid md:grid-cols-[var(--cols)]"
      >
        {selectable && <span />}
        {columns.map((c) => (
          <span key={c.key} className={c.className}>
            {c.header}
          </span>
        ))}
        {actions && <span className="text-right">{actionsHeader}</span>}
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="grid grid-cols-1 gap-2 border-b border-v2-line/70 px-4 py-3.5 last:border-b-0 hover:bg-[#F8FAFF] md:grid-cols-[var(--cols)] md:items-center md:gap-3"
          >
            {selectable && (
              <input
                type="checkbox"
                aria-label="Select row"
                className="hidden h-4 w-4 rounded border-v2-line accent-[#20B33D] md:block"
              />
            )}
            {columns.map((c, i) => (
              <div
                key={c.key}
                className={cn(
                  "min-w-0",
                  i > 0 && "flex items-center justify-between gap-3 md:block",
                  c.className,
                )}
              >
                {i > 0 && <span className="text-[12px] font-semibold text-v2-muted md:hidden">{c.header}</span>}
                <div className={i > 0 ? "min-w-0 text-right md:text-left" : "min-w-0"}>{c.cell(row)}</div>
              </div>
            ))}
            {actions && <div className="flex items-center justify-end gap-1.5">{actions(row)}</div>}
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-v2-line px-4 py-3">{footer}</div>}
    </div>
  );
}
