"use client";

import { Button, ChevronDownIcon, DataTable, EmptyState, FilterIcon, HandshakeIcon, MemberAvatar, Menu, Select, useNarrow } from "@kiwiply/ui";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import type { DataTableColumn, MenuEntry } from "@kiwiply/ui";
import { AssignmentStatusPill, Check, CompactFilters, PersonChip, PriorityPill } from "./parts";
import {
  AVAILABILITY_LABEL,
  filtersApplied,
  formatDay,
  nextSort,
  PAGE_SIZES,
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
      className: "w-[34px]",
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
          <MemberAvatar name={r.name} size={32} />
          <span className="min-w-0 max-w-[104px]" title={r.jobTitle ? `${r.name}, ${r.jobTitle}` : r.name}>
            <span className="block truncate text-[11px] font-bold text-[var(--ent-title)]">{r.name}</span>
            <span className="block truncate text-[9.5px] font-normal text-[var(--ent-soft)]">{r.jobTitle ?? (r.availability ? AVAILABILITY_LABEL[r.availability] : "")}</span>
          </span>
        </span>
      ),
    },
    { key: "marketer", header: "Assigned Marketer", render: (r) => <PersonChip person={r.marketer} /> },
    { key: "backup", header: "Backup Marketer", render: (r) => <PersonChip person={r.backup} none="No backup" /> },
    { key: "status", header: "Status", sortable: true, render: (r) => <AssignmentStatusPill status={r.status} /> },
    { key: "priority", header: "Priority", sortable: true, render: (r) => <PriorityPill priority={r.priority} /> },
    { key: "activeApps", header: <span className="inline-block text-center leading-tight">Active Apps</span>, headerLabel: "Active Apps", sortable: true, className: "text-center tabular-nums", render: (r) => <span className="tabular-nums">{r.activeApps}</span> },
    { key: "lastActivity", header: "Last Activity", sortable: true, render: (r) => <span className="whitespace-nowrap text-[11px] text-[var(--ent-soft)]">{formatDay(r.lastActivityAt) || "—"}</span> },
  ];

  const filterDefs = [
    { name: "status", label: "Status", allLabel: "All Statuses", options: (filters?.statuses ?? ["ACTIVE", "PAUSED"]).map((s) => ({ value: s, label: s === "ACTIVE" ? "Active" : "Paused" })) },
    { name: "priority", label: "Priority", allLabel: "All Priorities", options: (filters?.priorities ?? ["HIGH", "MEDIUM", "LOW"]).map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() })) },
    ...(clients.length > 0 ? [{ name: "client", label: "Client", allLabel: "All Clients", options: clients.map((c) => ({ value: String(c.id), label: c.name })) }] : []),
  ];
  const values = { status: query.status, priority: query.priority, client: query.clientId };
  const onFilter = (name: string, v: string) => onChange(name === "client" ? { clientId: v } : ({ [name]: v } as Partial<BoardQuery>));

  return (
    <section aria-label="Assigned consultants" className="ent-card flex min-w-0 flex-col !p-[14px]" data-consultants-panel>
      <div className="flex flex-wrap items-start gap-2.5">
        <span aria-hidden className="inline-grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-[#2b72f0]">
          <HandshakeIcon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-extrabold leading-tight text-[var(--ent-title)]">Assigned Consultants</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--ent-soft)]" data-consultants-subtitle>
            {marketer ? `Consultants assigned to ${marketer.name} (${marketer.assigned} total)` : "Pick a marketer to see their consultants."}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Menu
              trigger={
                <Button type="button" variant="ghost" size="sm" className="ent-ctl-btn !min-w-[124px] justify-between" data-bulk-actions>
                  Bulk Actions <ChevronDownIcon size={14} aria-hidden />
                </Button>
              }
              items={bulkMenu}
            />
            <Button type="button" size="sm" className="ent-btn !h-[32px]" onClick={onAssign} disabled={!marketer || marketer.status === "PAUSED"} data-assign-consultants>
              Assign Consultants
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <CompactFilters
          query={query.q}
          onQuery={(q) => onChange({ q })}
          placeholder="Search consultants by name, skill, or client..."
          label="Search consultants"
          filters={filterDefs}
          values={values}
          onFilter={onFilter}
          active={applied}
          onClear={() => onChange({ q: "", status: "", priority: "", clientId: "", availability: "", noBackup: false })}
          actions={
            <Button type="button" variant="ghost" size="sm" className="ent-ctl-btn flex-none" aria-expanded={moreOpen} onClick={onMore} data-more-filters>
              <FilterIcon size={14} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
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

      <div className="ent-dt mt-3 flex-1" data-consultants-table>
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
          dense
          variant="board"
          actionsIcon="horizontal"
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
        <TalentPagination
          className="mt-3"
          page={query.page}
          size={query.size}
          total={total}
          showing={showingText(total, query.page, query.size, rows.length)}
          sizes={PAGE_SIZES}
          onPage={(page) => onChange({ page })}
          onSize={(size) => onChange({ size, page: 0 })}
        />
      )}
    </section>
  );
}
