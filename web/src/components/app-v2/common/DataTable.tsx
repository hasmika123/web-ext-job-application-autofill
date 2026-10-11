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
  /** Adds a checkbox column. Controlled when `selected` + `onToggle` are passed (from a client parent), else inert-but-clickable. */
  selectable?: boolean;
  selected?: ReadonlySet<string | number>;
  onToggle?: (key: string | number) => void;
  onToggleAll?: () => void;
  /** Renders in the trailing cell of each row; the default is a `⋮` button. Pass `false` for no trailing cell. */
  actions?: false | ((row: T, index: number) => ReactNode);
  /** Same as `actions={false}`. */
  noActions?: boolean;
  /** Header of the trailing cell (visible text). `inCard` tables default to "Actions"; others to an aria-only label. */
  actionsHeader?: ReactNode;
  /** Rendered under the rows (Pagination). */
  footer?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  /** Index (or predicate) of a highlighted row. */
  isActive?: (row: T) => boolean;
  empty?: ReactNode;
  /**
   * The table sits inside a SectionCard: no card chrome of its own, denser rows and header, a
   * scroll wrapper (`minWidth`) between `md` and `xl`, and mobile cards with a label-over-value
   * grid. This is the org admin's table. Default: a free-standing white card.
   */
  inCard?: boolean;
  /** `inCard` only: table min-width (px) before it scrolls inside its wrapper. */
  minWidth?: number;
  /** Checkbox accent: green (individual app) or blue (org); defaults to blue when `inCard`. */
  accent?: "green" | "blue";
  className?: string;
  "aria-label"?: string;
}

/**
 * Table: muted 12px header, hairline rows, hover tint, `⋮` actions. Below `md` the same data
 * renders as stacked cards (the `primary` column is the title, the rest are label: value lines),
 * so nothing scrolls sideways at 375px. No hooks: safe to render from a server component as long
 * as the column renderers are defined in that same server module.
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
  actionsHeader,
  footer,
  onRowClick,
  isActive,
  empty,
  inCard,
  minWidth = 860,
  accent,
  className,
  ...aria
}: DataTableProps<T>) {
  const hideActions = noActions || actions === false;
  const cell = (c: DataColumn<T>, row: T, i: number): ReactNode =>
    c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? "");
  const actionCell = (row: T, i: number) =>
    typeof actions === "function" ? (
      actions(row, i)
    ) : (
      <button
        type="button"
        aria-label="Row actions"
        className={cn("grid place-items-center rounded-lg text-v2-muted hover:bg-paper-2 hover:text-ink", inCard ? "h-10 w-10 sm:h-7 sm:w-7" : "h-10 w-10 sm:h-8 sm:w-8")}
      >
        <MoreVerticalIcon size={16} />
      </button>
    );
  const labelOf = (c: DataColumn<T>) => c.mobileLabel ?? (typeof c.header === "string" ? c.header : "");
  const mobileCols = columns.filter((c) => !c.hideOnMobile);
  const primary = mobileCols.find((c) => c.primary) ?? mobileCols[0];
  const allSelected = !!selected && rows.length > 0 && rows.every((r, i) => selected.has(rowKey(r, i)));
  const blue = (accent ?? (inCard ? "blue" : "green")) === "blue";
  const checkClass = cn("h-4 w-4 cursor-pointer rounded border-v2-line", blue ? "accent-[var(--color-v2-blue)]" : "accent-[var(--color-v2-lime-deep)]");
  const header = actionsHeader ?? (inCard ? "Actions" : undefined);

  const rowCheckbox = (k: string | number) => (
    <input
      type="checkbox"
      aria-label="Select row"
      {...(selected ? { checked: selected.has(k), readOnly: !onToggle } : {})}
      onChange={() => onToggle?.(k)}
      onClick={(e) => e.stopPropagation()}
      className={checkClass}
    />
  );

  if (inCard && rows.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-v2-line px-4 py-10 text-center text-[13.5px] text-v2-muted", className)}>
        {empty ?? "Nothing to show."}
      </div>
    );
  }

  const selectAll = (
    <input
      type="checkbox"
      aria-label="Select all rows"
      {...(selected ? { checked: allSelected, readOnly: !onToggleAll } : {})}
      onChange={onToggleAll}
      className={checkClass}
    />
  );

  return (
    <div
      className={cn(!inCard && "overflow-hidden rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft", className)}
      aria-label={aria["aria-label"]}
    >
      {/* md+ : real table */}
      <div className={cn("hidden md:block", inCard && "overflow-x-auto")}>
        <table className={cn("w-full border-collapse text-left", inCard ? "text-[12.5px]" : "text-[13.5px]")} style={inCard ? { minWidth } : undefined}>
          <thead>
            <tr
              className={cn(
                "text-[12px] text-v2-muted",
                inCard ? "bg-[#F6F8FC] font-medium" : "border-b border-v2-line/70 bg-paper-2/60 font-semibold",
              )}
            >
              {selectable && <th className={cn("w-10", inCard ? "rounded-l-lg px-3 py-2.5" : "py-3 pl-4 pr-1")}>{selectAll}</th>}
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    inCard
                      ? cn("whitespace-nowrap px-2.5 py-2.5 font-medium", !selectable && i === 0 && "rounded-l-lg pl-3")
                      : "px-3 py-3 font-semibold first:pl-5",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {!hideActions && (
                <th
                  scope="col"
                  className={cn(inCard ? "w-[68px] rounded-r-lg px-2.5 py-2.5 text-right font-medium" : "w-12 py-3 pr-4 text-right")}
                  aria-label={header ? undefined : "Actions"}
                >
                  {header}
                </th>
              )}
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
                    "transition-colors last:border-b-0",
                    inCard ? "border-b border-v2-line/70 text-ink-soft hover:bg-[#F8FAFE]" : "border-b border-v2-line/60 hover:bg-v2-blue-soft/40",
                    onRowClick && "cursor-pointer",
                    isActive?.(row) && "bg-v2-lime-soft/50",
                  )}
                >
                  {selectable && <td className={inCard ? "px-3 py-2.5" : "py-3 pl-4 pr-1"}>{rowCheckbox(k)}</td>}
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        "align-middle",
                        inCard ? cn("px-2.5 py-2.5", !selectable && ci === 0 && "pl-3") : "px-3 py-3.5 text-ink first:pl-5",
                        c.className,
                      )}
                    >
                      {cell(c, row, i)}
                    </td>
                  ))}
                  {!hideActions && <td className={cn("text-right", inCard ? "px-2.5 py-2.5" : "py-3 pr-4")}>{actionCell(row, i)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < md : stacked cards */}
      {inCard ? (
        <ul className="space-y-3 md:hidden">
          {rows.map((row, i) => {
            const k = rowKey(row, i);
            return (
              <li key={k} onClick={onRowClick ? () => onRowClick(row, i) : undefined} className="rounded-xl border border-v2-line bg-paper p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {selectable && <span className="flex-none">{rowCheckbox(k)}</span>}
                    <div className="min-w-0">{primary ? cell(primary, row, i) : null}</div>
                  </div>
                  {!hideActions && actionCell(row, i)}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                  {mobileCols
                    .filter((c) => c !== primary)
                    .map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[11px] text-v2-muted">{c.header}</dt>
                        <dd className="mt-0.5 break-words text-ink-soft">{cell(c, row, i)}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
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
                  {!hideActions && <div className="flex-none">{actionCell(row, i)}</div>}
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
      )}

      {!inCard && rows.length === 0 && (
        <div className="px-5 py-10 text-center text-[14px] text-v2-muted">{empty ?? "Nothing to show yet."}</div>
      )}
      {footer && <div className={cn(!inCard && "border-t border-v2-line/70 px-4 py-3")}>{footer}</div>}
    </div>
  );
}
