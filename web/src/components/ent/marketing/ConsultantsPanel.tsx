"use client";

import { Button, ChevronDownIcon, DataTable, EmptyState, FilterBar, FilterIcon, HandshakeIcon, MemberAvatar, Menu, Select, useNarrow } from "@kiwiply/ui";
import type { DataTableColumn, MenuEntry } from "@kiwiply/ui";
import { AssignmentStatusPill, Check, PersonChip, PriorityPill } from "./parts";
import {
  AVAILABILITY_LABEL,
  filtersApplied,
  formatDay,
  nextSort,
  PAGE_SIZES,
  pageCount as pagesOf,
  showingText,
  type BoardQuery,
  type Filters,
  type Marketer,
  type Row,
  type SortKey,
} from "@/lib/ent/marketing-assignments";

export type ConsultantsState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: Row[]; total: number };

/** The window of page buttons: first, last, the current and its neighbours, with gaps. */
export function pageWindow(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const set = new Set([0, count - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * The right panel: the selected marketer's consultants (server-side search, filters, sort and paging; the table turns into cards on a
 * phone), the Bulk Actions menu, Assign Consultants, and the footer pager. Every action goes through the page (it owns the undo toast).
 */
export default function ConsultantsPanel({
  marketer,
  state,
  query,
  onChange,
  filters,
  canManage,
  selected,
  onToggle,
  onTogglePage,
  rowMenu,
  bulkMenu,
  onAssign,
  onRetry,
  moreOpen,
  onMore,
}: {
  marketer: Marketer | null;
  state: ConsultantsState;
  query: BoardQuery;
  onChange: (c: Partial<BoardQuery>) => void;
  filters: Filters | null;
  canManage: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  rowMenu: (row: Row) => MenuEntry[];
  bulkMenu: MenuEntry[];
  onAssign: () => void;
  onRetry: () => void;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const narrow = useNarrow();
  const rows = state.status === "ok" ? state.items : [];
  const total = state.status === "ok" ? state.total : 0;
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.consultantId));
  const someOn = rows.some((r) => selected.has(r.consultantId));
  const applied = filtersApplied(query);
  const clients = filters?.clients ?? [];
  const moreCount = (query.availability ? 1 : 0) + (query.noBackup ? 1 : 0);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "select",
      header: canManage ? <Check checked={allOn} indeterminate={someOn} onChange={onTogglePage} label="Select all consultants on this page" /> : "",
      headerLabel: "Select",
      className: "w-9",
      hideOnMobile: true,
      render: (r) => (canManage ? <Check checked={selected.has(r.consultantId)} onChange={() => onToggle(r.consultantId)} label={`Select ${r.name}`} /> : null),
    },
    {
      key: "name",
      header: "Consultant",
      primary: true,
      sortable: true,
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          {canManage && narrow && <Check checked={selected.has(r.consultantId)} onChange={() => onToggle(r.consultantId)} label={`Select ${r.name}`} />}
          <MemberAvatar name={r.name} size={34} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-bold text-ink">{r.name}</span>
            <span className="block truncate text-[12px] font-normal text-muted">{r.jobTitle ?? (r.availability ? AVAILABILITY_LABEL[r.availability] : "")}</span>
          </span>
        </span>
      ),
    },
    { key: "marketer", header: "Assigned Marketer", render: (r) => <PersonChip person={r.marketer} /> },
    { key: "backup", header: "Backup Marketer", render: (r) => <PersonChip person={r.backup} none="No backup" /> },
    { key: "status", header: "Status", sortable: true, render: (r) => <AssignmentStatusPill status={r.status} /> },
    { key: "priority", header: "Priority", sortable: true, render: (r) => <PriorityPill priority={r.priority} /> },
    { key: "activeApps", header: "Active Apps", sortable: true, className: "text-right tabular-nums", render: (r) => <span className="tabular-nums">{r.activeApps}</span> },
    { key: "lastActivity", header: "Last Activity", sortable: true, render: (r) => <span className="whitespace-nowrap text-ink-soft">{formatDay(r.lastActivityAt) || "—"}</span> },
  ];

  const filterDefs = [
    { name: "status", label: "Status", allLabel: "All Statuses", options: (filters?.statuses ?? ["ACTIVE", "PAUSED"]).map((s) => ({ value: s, label: s === "ACTIVE" ? "Active" : "Paused" })) },
    { name: "priority", label: "Priority", allLabel: "All Priorities", options: (filters?.priorities ?? ["HIGH", "MEDIUM", "LOW"]).map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() })) },
    ...(clients.length > 0 ? [{ name: "client", label: "Client", allLabel: "All Clients", options: clients.map((c) => ({ value: String(c.id), label: c.name })) }] : []),
  ];
  const values = { status: query.status, priority: query.priority, client: query.clientId };
  const onFilter = (name: string, v: string) => onChange(name === "client" ? { clientId: v } : ({ [name]: v } as Partial<BoardQuery>));

  const count = pagesOf(total, query.size);

  return (
    <section aria-label="Assigned consultants" className="flex min-w-0 flex-col rounded-2xl border border-line bg-paper p-4" data-consultants-panel>
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
          <HandshakeIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-extrabold leading-tight text-ink">Assigned Consultants</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted" data-consultants-subtitle>
            {marketer ? `Consultants assigned to ${marketer.name} (${marketer.assigned} total)` : "Pick a marketer to see their consultants."}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Menu
              trigger={
                <Button type="button" variant="ghost" size="sm" data-bulk-actions>
                  Bulk Actions <ChevronDownIcon size={14} aria-hidden />
                </Button>
              }
              items={bulkMenu}
            />
            <Button type="button" size="sm" onClick={onAssign} disabled={!marketer || marketer.status === "PAUSED"} data-assign-consultants>
              Assign Consultants
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <FilterBar
          compact
          query={query.q}
          onQueryChange={(q) => onChange({ q })}
          values={values}
          onFilterChange={onFilter}
          search={{ placeholder: "Search consultants by name, skill, or client...", label: "Search consultants" }}
          filters={filterDefs}
          actions={
            <Button type="button" variant="ghost" size="sm" aria-expanded={moreOpen} onClick={onMore} data-more-filters>
              <FilterIcon size={15} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
            </Button>
          }
        />
        {moreOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
            <div className="w-48">
              <Select
                aria-label="Availability"
                value={query.availability}
                onChange={(v) => onChange({ availability: v })}
                options={[{ value: "", label: "Any availability" }, ...(filters?.availabilities ?? []).map((a) => ({ value: a, label: AVAILABILITY_LABEL[a] ?? a }))]}
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-soft sm:min-h-0">
              <Check checked={query.noBackup} onChange={(on) => onChange({ noBackup: on })} label="Only consultants with no backup marketer" />
              No backup marketer
            </label>
          </div>
        )}
      </div>

      <div className="mt-3 flex-1" data-consultants-table>
        <DataTable<Row>
          label="Assigned consultants"
          what="the consultants"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.consultantId)}
          loading={state.status === "loading" || state.status === "idle"}
          error={state.status === "error" ? state.message : null}
          onRetry={onRetry}
          hasFilters={applied}
          rowActions={canManage ? rowMenu : undefined}
          sort={query.sort}
          onSort={(k) => onChange({ sort: nextSort(query.sort, k as SortKey) })}
          empty={
            <EmptyState
              variant="inline"
              mascot
              mascotPose="peek"
              title={applied ? "No consultants match" : marketer ? `${marketer.name} has no consultants yet` : "No marketer selected"}
              description={applied ? "Try a different search, or clear the filters." : canManage && marketer ? "Use Assign Consultants to give them some." : undefined}
              action={
                applied ? (
                  <Button type="button" onClick={() => onChange({ q: "", status: "", priority: "", clientId: "", availability: "", noBackup: false })}>
                    Clear filters
                  </Button>
                ) : canManage && marketer && marketer.status !== "PAUSED" ? (
                  <Button type="button" onClick={onAssign}>
                    Assign Consultants
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>

      {state.status === "ok" && total > 0 && (
        <div className="mt-3 flex flex-col gap-2 text-[13px] text-ink-soft sm:flex-row sm:items-center sm:justify-between" data-pagination>
          <p aria-live="polite" data-showing>
            {showingText(total, query.page, query.size, rows.length)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {count > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" title="Previous page" disabled={query.page <= 0} onClick={() => onChange({ page: query.page - 1 })} className="grid h-8 min-w-8 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
                  {"‹"}
                </button>
                {pageWindow(query.page, count).map((p, i) =>
                  p === "gap" ? (
                    <span key={`g${i}`} aria-hidden className="px-1 text-muted">
                      {"…"}
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      aria-label={`Page ${p + 1}`}
                      aria-current={p === query.page ? "page" : undefined}
                      onClick={() => onChange({ page: p })}
                      className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums ${p === query.page ? "bg-accent text-on-accent" : "border border-line hover:bg-paper-2"}`}
                    >
                      {p + 1}
                    </button>
                  ),
                )}
                <button type="button" aria-label="Next page" title="Next page" disabled={query.page >= count - 1} onClick={() => onChange({ page: query.page + 1 })} className="grid h-8 min-w-8 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
                  {"›"}
                </button>
              </nav>
            )}
            <div className="w-36">
              <Select aria-label="Rows per page" value={String(query.size)} onChange={(v) => onChange({ size: Number(v), page: 0 })} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
