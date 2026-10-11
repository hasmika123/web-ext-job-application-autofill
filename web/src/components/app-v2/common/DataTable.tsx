import type { ReactNode } from "react";
import { MoreVerticalIcon, cn } from "@kiwiply/ui";

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer; defaults to `String(row[key])`. */
  render?: (row: T, index: number) => ReactNode;
  /** Extra classes for both the header and the cells (widths, alignment). */
  className?: string;
  /** Card layout (< md): this column becomes the card title (render once, no label). */
  primary?: boolean;
  /** Card layout (< md): skip this column. */
  hideOnMobile?: boolean;
  /** Card layout (< md): label shown before the value (defaults to `header` when it is text). */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Adds a checkbox column. Controlled when `selected` + `onToggle` are passed (from a client parent). */
  selectable?: boolean;
  selected?: ReadonlySet<string | number>;
  onToggle?: (key: string | number) => void;
  onToggleAll?: () => void;
  /** Renders in the trailing cell of each row; the default is a `⋮` button. */
  actions?: (row: T, index: number) => ReactNode;
  /** Hide the trailing actions cell entirely. */
  noActions?: boolean;
  /** Rendered under the rows (Pagination). */
  footer?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  /** Index (or predicate) of a highlighted row. */
  isActive?: (row: T) => boolean;
  empty?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * White card table: muted 12px header, hairline rows, hover tint, `⋮` actions. Below `md` the same
 * data renders as stacked cards (the `primary` column is the title, the rest are label: value
 * lines), so nothing scrolls sideways at 375px. No hooks: safe to render from a server component
 * as long as the column renderers are defined in that same server module.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  actions,
  noActions,
  footer,
  onRowClick,
  isActive,
  empty,
  className,
  ...aria
}: DataTableProps<T>) {
  const cell = (c: DataColumn<T>, row: T, i: number): ReactNode =>
    c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? "");
  const actionCell = (row: T, i: number) =>
    actions ? (
      actions(row, i)
    ) : (
      <button
        type="button"
        aria-label="Row actions"
        className="grid h-8 w-8 place-items-center rounded-lg text-v2-muted hover:bg-paper-2 hover:text-ink"
      >
        <MoreVerticalIcon size={16} />
      </button>
    );
  const labelOf = (c: DataColumn<T>) => c.mobileLabel ?? (typeof c.header === "string" ? c.header : "");
  const mobileCols = columns.filter((c) => !c.hideOnMobile);
  const primary = mobileCols.find((c) => c.primary) ?? mobileCols[0];
  const allSelected = !!selected && rows.length > 0 && rows.every((r, i) => selected.has(rowKey(r, i)));

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft", className)}
      aria-label={aria["aria-label"]}
    >
      {/* md+ : real table */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-v2-line/70 bg-paper-2/60 text-[12px] font-semibold text-v2-muted">
              {selectable && (
                <th className="w-10 py-3 pl-4 pr-1">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={onToggleAll}
                    readOnly={!onToggleAll}
                    className="h-4 w-4 rounded border-v2-line accent-[var(--color-v2-lime-deep)]"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-3 font-semibold first:pl-5", c.className)}>
                  {c.header}
                </th>
              ))}
              {!noActions && <th className="w-12 py-3 pr-4" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const k = rowKey(row, i);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  className={cn(
                    "border-b border-v2-line/60 transition-colors last:border-b-0 hover:bg-v2-blue-soft/40",
                    onRowClick && "cursor-pointer",
                    isActive?.(row) && "bg-v2-lime-soft/50",
                  )}
                >
                  {selectable && (
                    <td className="py-3 pl-4 pr-1">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected?.has(k) ?? false}
                        onChange={() => onToggle?.(k)}
                        readOnly={!onToggle}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-v2-line accent-[var(--color-v2-lime-deep)]"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-3.5 align-middle text-ink first:pl-5", c.className)}>
                      {cell(c, row, i)}
                    </td>
                  ))}
                  {!noActions && <td className="py-3 pr-4 text-right">{actionCell(row, i)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < md : stacked cards */}
      <ul className="divide-y divide-v2-line/60 md:hidden">
        {rows.map((row, i) => {
          const k = rowKey(row, i);
          return (
            <li
              key={k}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              className={cn("flex flex-col gap-2.5 p-4", onRowClick && "cursor-pointer", isActive?.(row) && "bg-v2-lime-soft/50")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 font-semibold text-ink">{primary ? cell(primary, row, i) : null}</div>
                {!noActions && <div className="flex-none">{actionCell(row, i)}</div>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {mobileCols
                  .filter((c) => c !== primary)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-v2-muted">{labelOf(c)}</dt>
                      <dd className="min-w-0 text-ink">{cell(c, row, i)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <div className="px-5 py-10 text-center text-[14px] text-v2-muted">{empty ?? "Nothing to show yet."}</div>
      )}
      {footer && <div className="border-t border-v2-line/70 px-4 py-3">{footer}</div>}
    </div>
  );
}
