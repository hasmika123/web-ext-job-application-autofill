"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { BottomSheet, Button, ChevronRightIcon, EmptyState, ErrorState, ListSkeleton, TableSkeleton, cn } from "@kiwiply/ui";
import { DataTable, Pagination } from "@/components/app-v2/common";
import type { DataColumn } from "@/components/app-v2/common";
import type { ListQueryResult } from "@/lib/list-query";
import { clearFilters, hasActiveFilters } from "./AdminFilterBar";
import { useNarrow } from "./useNarrow";

/**
 * AdminTable: the one table of the admin console (E2E-A15.0; ADMIN-E2E-PLAN section 3.6 / 9.2). It is `DataTable` +
 * `Pagination` + the page-kit states wired to a `useListQuery` result, so a page story writes columns and nothing else:
 *
 *   first load            skeleton (a table shape on a desktop, a list shape on a phone)
 *   later loads           the old rows stay (dimmed, aria-busy) until the new ones arrive
 *   failure, nothing yet  `ErrorState` with the request id and Retry
 *   failure after rows    the rows stay, with an inline "Couldn't refresh" Retry above them
 *   no rows               "No {what} yet", or "No {what} match" + Clear filters while a search / filter is applied
 *   from `md` up          a real table; paging is 1-based in the footer, 0-based in the hook
 *   below `md`            cards: the title column and one sub column, tap = a BottomSheet with every column,
 *                         the `details` content and the row actions as its footer; paging is Previous / Next at 44 px
 *                         (no horizontal scroll)
 *
 *   const list = useListQuery<UserRow>("/api/admin/users", { filters: { plan: undefined } });
 *   <AdminFilterBar list={list} ... />
 *   <AdminTable list={list} what="users" label="Users" rowKey={(u) => u.login}
 *     columns={[{ key: "name", header: "User", primary: true, render: (u) => <PersonCell .../> },
 *               { key: "plan", header: "Plan", sub: true, render: (u) => <PlanChip plan={u.plan} /> }, ...]}
 *     onRowClick={(u) => router.push(`/admin/users/${u.login}`)} rowActions={(u) => <UserMenu user={u} />} />
 *
 * The title and sub cells are drawn inside the card's button, so they must not contain links or buttons of their own.
 */

export interface AdminColumn<T> extends DataColumn<T> {
  /** Cards: the second line under the title (default: the first other visible column). */
  sub?: boolean;
}

export interface AdminTableProps<T> {
  list: ListQueryResult<T>;
  columns: AdminColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Accessible name of the table. */
  label: string;
  /** What the rows are, lower-case plural: "users". Used in "Couldn't load users" and "No users match". */
  what: string;
  /** Replaces the "No {what} yet" empty state (when nothing is filtered). */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  /** Click a table row / tap "Open" in the phone sheet. */
  onRowClick?: (row: T) => void;
  /** Trailing cell on a desktop, the sheet's footer on a phone. Icon-only controls in it need a Tooltip + aria-label. */
  rowActions?: (row: T) => ReactNode;
  /** Extra content under the facts in the phone sheet (a triage form, a timeline). */
  details?: (row: T) => ReactNode;
  /** The phone sheet's title: the row's name ("priya.nair"). Defaults to the table's `label`. */
  sheetTitle?: (row: T) => string;
  /** Skeleton rows on the first load. */
  skeletonRows?: number;
  className?: string;
}

const SKELETON_ROWS = 6; // rows of the first-load skeleton: enough to hint a table, few enough not to shift the page
const SHEET_ID = "admin-table-sheet";

function summaryOf(page: number, size: number, total: number, shown: number): string {
  if (total === 0) return "No rows";
  const from = page * size + 1;
  return `Showing ${from.toLocaleString("en-US")}–${(from + shown - 1).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

export default function AdminTable<T>({ list, columns, rowKey, label, what, empty, onRowClick, rowActions, details, sheetTitle, skeletonRows = SKELETON_ROWS, className }: AdminTableProps<T>) {
  const narrow = useNarrow();
  const [openKey, setOpenKey] = useState<string | number | null>(null);
  const filtered = hasActiveFilters(list);

  if (list.isLoading) {
    return narrow ? <ListSkeleton count={skeletonRows} label={`Loading ${what}`} className={className} /> : <TableSkeleton count={skeletonRows} columns={Math.max(columns.length, 2)} label={`Loading ${what}`} className={className} />;
  }
  if (list.error && !list.data) {
    return <ErrorState what={what} description={list.error.message} requestId={list.error.requestId} onRetry={list.refetch} className={className} />;
  }

  const rows = list.items;
  const visible = columns.filter((c) => !c.hideOnMobile);
  const title = visible.find((c) => c.primary) ?? visible[0];
  const sub = visible.find((c) => c.sub && c !== title) ?? visible.find((c) => c !== title);
  const cell = (c: AdminColumn<T>, row: T, i: number): ReactNode => (c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? ""));
  const openRow = openKey === null ? undefined : rows.find((r) => rowKey(r) === openKey);

  const emptyView = filtered ? (
    <EmptyState
      variant="inline"
      title={`No ${what} match`}
      description="Nothing fits this search and these filters."
      action={
        <Button type="button" variant="ghost" onClick={() => clearFilters(list)} className="min-h-11 sm:min-h-0">
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState variant="inline" title={empty?.title ?? `No ${what} yet`} description={empty?.description} action={empty?.action} />
  );

  const pages = Math.max(1, Math.ceil(list.total / list.size));
  const summary = summaryOf(list.page, list.size, list.total, rows.length);
  // Page numbers are too small a target for a thumb: a phone gets Previous / Next at 44 px with "Page 2 of 3" between them.
  const footer =
    list.total === 0 ? null : narrow ? (
      <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" aria-label="Previous page" disabled={list.page <= 0} onClick={() => list.setPage(list.page - 1)} className="min-h-11 flex-none">
          Previous
        </Button>
        <p className="min-w-0 text-center text-[12.5px] leading-snug text-v2-muted">
          {summary}
          <span className="block">
            Page {list.page + 1} of {pages}
          </span>
        </p>
        <Button type="button" variant="ghost" aria-label="Next page" disabled={list.page + 1 >= pages} onClick={() => list.setPage(list.page + 1)} className="min-h-11 flex-none">
          Next
        </Button>
      </nav>
    ) : (
      <Pagination tone="blue" page={list.page + 1} pages={pages} summary={summary} onPageChange={(p) => list.setPage(p - 1)} />
    );

  return (
    <div role="region" aria-label={label} className={cn("min-w-0", className)} aria-busy={list.isFetching || undefined}>
      {list.error && (
        <ErrorState variant="inline" what={what} title={`Couldn't refresh ${what}`} description={list.error.message} requestId={list.error.requestId} onRetry={list.refetch} className="mb-2 rounded-xl border border-v2-line/70" />
      )}
      <div className={cn("transition-opacity", list.isFetching && "opacity-60")}>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft">{emptyView}</div>
        ) : narrow ? (
          <>
            <ul className="divide-y divide-v2-line/60 overflow-hidden rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft">
              {rows.map((row, i) => (
                <li key={rowKey(row)}>
                  <button type="button" onClick={() => setOpenKey(rowKey(row))} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block min-w-0 font-semibold text-ink">{title ? cell(title, row, i) : null}</span>
                      {sub && <span className="mt-0.5 block min-w-0 text-[13px] text-ink-soft">{cell(sub, row, i)}</span>}
                    </span>
                    <ChevronRightIcon aria-hidden size={16} className="flex-none text-v2-muted" />
                  </button>
                </li>
              ))}
            </ul>
            {footer && <div className="mt-3">{footer}</div>}
          </>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => rowKey(row)}
            onRowClick={onRowClick ? (row) => onRowClick(row) : undefined}
            actions={rowActions ? (row) => rowActions(row) : false}
            footer={footer}
          />
        )}
      </div>
      {narrow && (
        <BottomSheet
          id={SHEET_ID}
          open={openRow !== undefined}
          onClose={() => setOpenKey(null)}
          title={openRow !== undefined ? (sheetTitle?.(openRow) ?? label) : label}
          footer={
            openRow !== undefined && (rowActions || onRowClick) ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {rowActions?.(openRow)}
                {onRowClick && (
                  <Button type="button" onClick={() => onRowClick(openRow)} className="min-h-11">
                    Open
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {openRow !== undefined && (
            <div className="space-y-4">
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
                {columns
                  .filter((c) => c !== title)
                  .map((c, i) => (
                    <div key={c.key} className="contents">
                      <dt className="max-w-[9rem] text-v2-muted">{c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.key)}</dt>
                      <dd className="min-w-0 break-words text-ink">{cell(c, openRow, i)}</dd>
                    </div>
                  ))}
              </dl>
              {details?.(openRow)}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
