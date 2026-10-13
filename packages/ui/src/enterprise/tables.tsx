"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Button from "../primitives/Button";
import EmptyState from "../primitives/EmptyState";
import ErrorState from "../primitives/ErrorState";
import IconButton from "../primitives/IconButton";
import Input from "../primitives/Input";
import { TableSkeleton } from "../primitives/ListSkeleton";
import Menu from "../primitives/Menu";
import type { MenuEntry } from "../primitives/Menu";
import Select from "../primitives/Select";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, MoreVerticalIcon, SearchIcon } from "../primitives/icons";
import { cn } from "../primitives/cn";
import { useNarrow } from "./sheets";

/**
 * FilterBar + DataTable (X2.15; promoted from the admin kit and decoupled from `useListQuery`): both are controlled by
 * plain props, so a page binds them to its own list query (URL-synced, server-driven) and neither one filters or sorts
 * the loaded page itself.
 */

/* ── FilterBar ───────────────────────────────────────────────────────────────────── */

export const SEARCH_DEBOUNCE_MS = 300; // config-literal-ok: how long typing rests before the list is asked (UI timing)

export interface FilterDef {
  /** The filter's name on the wire (`?plan=PRO`). */
  name: string;
  /** "Plan": the accessible name, and the text of the "no filter" option unless `allLabel` is given. */
  label: string;
  options: { value: string; label: string }[];
  /** The first option, meaning "no filter" (default `Any {label}`). */
  allLabel?: string;
}

export interface FilterBarProps {
  /** The applied search text. */
  query: string;
  onQueryChange: (q: string) => void;
  /** The applied value of each filter by name ("" = none). */
  values: Record<string, string>;
  onFilterChange: (name: string, value: string) => void;
  /** The search box; `false` for a bar of filters only. */
  search?: { placeholder?: string; label?: string } | false;
  filters?: FilterDef[];
  /** Extra controls at the end of the row (an export button, a view switch). */
  actions?: ReactNode;
  /** Narrower search and selects, for a bar that must fit one row beside other controls. */
  compact?: boolean;
  className?: string;
}

/** True while any search text or filter is applied. */
export function hasActiveFilters(query: string, values: Record<string, string>): boolean {
  return query.trim() !== "" || Object.values(values).some((v) => v !== "");
}

/** A search box and a row of dropdown filters. Typing is debounced; Enter sends at once; Esc clears the box; "Clear filters" shows only while something is applied. */
export function FilterBar({ query, onQueryChange, values, onFilterChange, search = {}, filters = [], actions, compact, className }: FilterBarProps) {
  const [text, setText] = useState(query);
  const sent = useRef(query); // the last value this bar sent: a `query` that differs came from outside (URL, Clear)

  useEffect(() => {
    if (query !== sent.current) {
      sent.current = query;
      setText(query);
    }
  }, [query]);

  useEffect(() => {
    if (text === sent.current) return;
    const timer = setTimeout(() => {
      if (text === sent.current) return;
      sent.current = text;
      onQueryChange(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `onQueryChange` is the page's setter; the timer restarts on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function sendNow() {
    if (text === sent.current) return;
    sent.current = text;
    onQueryChange(text);
  }

  const active = hasActiveFilters(query, values) || text.trim() !== "";
  return (
    <div role="search" className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {search !== false && (
        <div className={cn("relative w-full min-w-0 sm:flex-none", compact ? "sm:w-60" : "sm:w-72")}>
          <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={text}
            placeholder={search.placeholder ?? "Search"}
            aria-label={search.label ?? search.placeholder ?? "Search"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendNow();
              } else if (e.key === "Escape" && text !== "") {
                setText("");
              }
            }}
            className="pl-9"
          />
        </div>
      )}
      {filters.map((f) => (
        <div key={f.name} className={cn("min-w-0 flex-1 basis-[calc(50%-0.3rem)] sm:flex-none sm:basis-auto", compact ? "sm:w-36" : "sm:w-44")}>
          <Select
            aria-label={f.label}
            value={values[f.name] ?? ""}
            onChange={(v) => onFilterChange(f.name, v)}
            options={[{ value: "", label: f.allLabel ?? `Any ${f.label.toLowerCase()}` }, ...f.options]}
          />
        </div>
      ))}
      {active && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-0"
          onClick={() => {
            setText("");
            sent.current = "";
            onQueryChange("");
            for (const name of Object.keys(values)) if (values[name] !== "") onFilterChange(name, "");
          }}
        >
          Clear filters
        </Button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── DataTable ───────────────────────────────────────────────────────────────────── */

export interface DataTableColumn<T> {
  key: string;
  /** The header text, or a node (a "select all" checkbox); a node needs `headerLabel` for the card layout's label. */
  header: ReactNode;
  /** Plain-text name of a node `header` (read by screen readers; the card layout's label). */
  headerLabel?: string;
  /** Cell renderer; defaults to `String(row[key])`. */
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  /** Card layout (below md): this column is the card title (rendered once, no label). */
  primary?: boolean;
  /** Card layout: skip this column. */
  hideOnMobile?: boolean;
  /** Clicking the header asks the page to sort by this key. */
  sortable?: boolean;
}

export type SortDir = "asc" | "desc";

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Accessible name of the table ("Consultants"). */
  label: string;
  /** What an error says could not load: "the consultants". */
  what?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when there are no rows and no error (use `hasFilters` to say "no matches" instead of "nothing yet"). */
  empty?: ReactNode;
  hasFilters?: boolean;
  onRowClick?: (row: T) => void;
  /** The row's actions menu (a kebab); omit for none. */
  rowActions?: (row: T) => MenuEntry[];
  sort?: { key: string; dir: SortDir } | null;
  onSort?: (key: string) => void;
  /** 1-based page and how many there are; the pager shows when more than one. */
  page?: number;
  pageCount?: number;
  onPage?: (page: number) => void;
  className?: string;
}

function cell<T>(col: DataTableColumn<T>, row: T, i: number): ReactNode {
  if (col.render) return col.render(row, i);
  const v = (row as Record<string, unknown>)[col.key];
  return v == null ? "" : String(v);
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-2 pt-3 text-[13px] text-ink-soft">
      <IconButton aria-label="Previous page" title="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ArrowLeftIcon size={16} />
      </IconButton>
      <span className="tabular-nums">
        Page {page} of {pageCount}
      </span>
      <IconButton aria-label="Next page" title="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        <ArrowRightIcon size={16} />
      </IconButton>
    </nav>
  );
}

/**
 * skeleton -> rows -> empty -> error, one table. From `md` it is a real table (sticky header, sortable columns, a kebab
 * per row); below `md` every row becomes a card (the `primary` column is the title, the rest are label/value lines).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  what,
  loading,
  error,
  onRetry,
  empty,
  hasFilters,
  onRowClick,
  rowActions,
  sort,
  onSort,
  page = 1,
  pageCount = 1,
  onPage,
  className,
}: DataTableProps<T>) {
  const narrow = useNarrow();
  if (error) return <ErrorState what={what ?? label.toLowerCase()} description={error} onRetry={onRetry} className={className} />;
  if (loading) return <TableSkeleton count={5} columns={Math.min(columns.length, 5)} label={`Loading ${label.toLowerCase()}`} className={className} />;
  if (rows.length === 0) {
    return (
      <div className={className}>
        {empty ?? <EmptyState variant="inline" title={hasFilters ? "No matches" : "Nothing here yet"} description={hasFilters ? "Try a different search or clear the filters." : undefined} />}
      </div>
    );
  }
  const pager = onPage ? <Pager page={page} pageCount={pageCount} onPage={onPage} /> : null;

  if (narrow) {
    const title = columns.find((c) => c.primary) ?? columns[0];
    const rest = columns.filter((c) => c !== title && !c.hideOnMobile);
    return (
      <div className={className}>
        <ul aria-label={label} className="space-y-2.5">
          {rows.map((row, i) => (
            <li key={rowKey(row)} className="rounded-[var(--radius)] border border-line bg-paper">
              <div className="flex items-start gap-2 p-3">
                {onRowClick ? (
                  <button type="button" onClick={() => onRowClick(row)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <div className="truncate text-[14px] font-semibold text-ink">{cell(title, row, i)}</div>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{cell(title, row, i)}</div>
                )}
                {rowActions && (
                  <Menu
                    trigger={
                      <IconButton aria-label="Row actions" title="Row actions">
                        <MoreVerticalIcon size={16} />
                      </IconButton>
                    }
                    items={rowActions(row)}
                  />
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line/60 px-3 py-2.5 text-[13px]">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted">{c.headerLabel ?? c.header}</dt>
                    <dd className="min-w-0 truncate text-ink">{cell(c, row, i)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        {pager}
      </div>
    );
  }

  function rowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (onRowClick && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
        <table aria-label={label} className="w-full border-collapse text-left text-[13.5px]">
          <thead className="bg-paper-2/60 text-[12px] uppercase tracking-[.04em] text-muted">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("px-3 py-2.5 font-semibold", c.className)}>
                    {c.sortable && onSort ? (
                      <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 uppercase tracking-[.04em] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
                        {c.header}
                        {active && (sort!.dir === "asc" ? <ArrowUpIcon aria-hidden size={12} /> : <ArrowDownIcon aria-hidden size={12} />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className="w-10 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((row, i) => (
              <tr
                key={rowKey(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={(e) => rowKeyDown(e, row)}
                className={cn(onRowClick && "cursor-pointer hover:bg-paper-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle text-ink", c.className)}>
                    {cell(c, row, i)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={
                        <IconButton aria-label="Row actions" title="Row actions">
                          <MoreVerticalIcon size={16} />
                        </IconButton>
                      }
                      items={rowActions(row)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager}
    </div>
  );
}
