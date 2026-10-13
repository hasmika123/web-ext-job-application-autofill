"use client";

import { useEffect, useRef } from "react";
import { ArrowDownIcon, ArrowUpIcon, IconButton, Menu, MoreVerticalIcon, PersonCell, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { formatDate, pageCount as pagesOf, PAGE_SIZES, relativeTime, showingText, type MemberRow, type SortDir, type SortKey } from "@/lib/ent/members";
import { ManagerCell, MemberStatusPill, RoleChips } from "./parts";

export interface TableProps {
  rows: MemberRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The row whose detail sheet is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: MemberRow) => void;
  rowMenu: (row: MemberRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** The detail sheet is docked beside the table: drop the columns the sheet repeats. */
  compact?: boolean;
}

const HEAD = "px-2.5 py-2.5 text-left text-[12px] font-semibold text-ink-soft";

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: TableProps["sort"]; onSort: TableProps["onSort"]; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${HEAD} ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent" title={`Sort by ${label.toLowerCase()}`}>
        {label}
        {active && (sort.dir === "asc" ? <ArrowUpIcon aria-hidden size={12} /> : <ArrowDownIcon aria-hidden size={12} />)}
      </button>
    </th>
  );
}

function Check({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))]"
    />
  );
}

function Kebab({ items }: { items: MenuEntry[] }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label="Row actions" title="Row actions">
          <MoreVerticalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
  );
}

/** The sub line of a person: the work email, or the job title when the caller only reaches a summary of them. */
const subOf = (r: MemberRow) => r.workEmail ?? r.title ?? "";

export function EmployeesTable(p: TableProps) {
  const narrow = useNarrow();
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someOn = !allOn && p.rows.some((r) => p.selected.has(r.id));

  if (narrow) {
    return (
      <ul aria-label="Employees" className="space-y-2.5" data-employee-cards>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
              <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.name}`} />
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <PersonCell name={r.name} avatarName={r.name} src={r.avatarUrl} sub={subOf(r)} />
              </button>
              <MemberStatusPill status={r.status} />
              <Kebab items={p.rowMenu(r)} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line/60 px-2.5 py-2.5 text-[13px]">
              <dt className="text-muted">Role</dt>
              <dd className="min-w-0"><RoleChips roles={r.roles} max={2} /></dd>
              <dt className="text-muted">Department</dt>
              <dd className="truncate text-ink">{r.department?.name ?? "—"}</dd>
              <dt className="text-muted">Team</dt>
              <dd className="truncate text-ink">{r.team?.name ?? "—"}</dd>
              <dt className="text-muted">Manager</dt>
              <dd className="min-w-0"><ManagerCell manager={r.manager} /></dd>
              <dt className="text-muted">Joined</dt>
              <dd className="text-ink">{formatDate(r.joinedAt) || "—"}</dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
      <table aria-label="Employees" className="w-full border-collapse text-[13.5px]" data-employee-table>
        <thead className="border-b border-line bg-paper-2/60">
          <tr>
            <th scope="col" className="w-10 px-2.5 py-2.5">
              <Check checked={allOn} indeterminate={someOn} onChange={p.onTogglePage} label="Select all employees on this page" />
            </th>
            <SortHead label="Employee" k="name" sort={p.sort} onSort={p.onSort} />
            <th scope="col" className={HEAD}>Role</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>Department</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>Team</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>Manager</th>
            <SortHead label="Status" k="status" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Joined" k="joined" sort={p.sort} onSort={p.onSort} className="hidden md:table-cell" />
            <SortHead label="Last active" k="lastActive" sort={p.sort} onSort={p.onSort} className="hidden 2xl:table-cell" />
            <th scope="col" className="w-10 px-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {p.rows.map((r) => {
            const open = p.openId === r.id;
            return (
              <tr
                key={r.id}
                data-row-id={r.id}
                tabIndex={0}
                aria-selected={open}
                onClick={() => p.onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    p.onOpen(r);
                  }
                }}
                className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open ? "bg-accent-soft/60" : p.selected.has(r.id) ? "bg-accent-soft/30" : "hover:bg-paper-2/50"}`}
              >
                <td className="w-10 px-2.5 py-2.5">
                  <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.name}`} />
                </td>
                <td className="min-w-[11rem] px-2.5 py-2.5">
                  <PersonCell name={r.name} avatarName={r.name} src={r.avatarUrl} sub={subOf(r)} />
                </td>
                <td className="max-w-[14rem] px-2.5 py-2.5">
                  <RoleChips roles={r.roles} max={1} />
                </td>
                <td className={`max-w-[10rem] truncate px-2.5 py-2.5 text-ink-soft ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>{r.department?.name ?? "—"}</td>
                <td className={`max-w-[10rem] truncate px-2.5 py-2.5 text-ink-soft ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>{r.team?.name ?? "—"}</td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>
                  <ManagerCell manager={r.manager} />
                </td>
                <td className="px-2.5 py-2.5">
                  <MemberStatusPill status={r.status} />
                </td>
                <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-ink-soft md:table-cell">{formatDate(r.joinedAt) || "—"}</td>
                <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-ink-soft 2xl:table-cell">{r.lastActiveAt ? relativeTime(r.lastActiveAt) : "—"}</td>
                <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Kebab items={p.rowMenu(r)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 1 2 3 … 19 with the current page and its neighbours; the ends always show. Pure, for the tests. */
export function pageWindow(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const out: (number | "gap")[] = [0];
  const from = Math.max(1, Math.min(page - 1, count - 5));
  const to = Math.min(count - 2, Math.max(page + 1, 4));
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < count - 2) out.push("gap");
  out.push(count - 1);
  return out;
}

export function Pagination({ page, size, total, shown, onPage, onSize }: { page: number; size: number; total: number; shown: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const count = pagesOf(total, size);
  return (
    <div className="mt-3 flex flex-col gap-2 text-[13px] text-ink-soft sm:flex-row sm:items-center sm:justify-between" data-pagination>
      <p aria-live="polite" data-showing>{showingText(total, page, size, shown)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {count > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className="grid h-8 min-w-8 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
              {"‹"}
            </button>
            {pageWindow(page, count).map((p, i) =>
              p === "gap" ? (
                <span key={`g${i}`} aria-hidden className="px-1 text-muted">
                  {"…"}
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-label={`Page ${p + 1}`}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => onPage(p)}
                  className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums ${p === page ? "bg-accent text-on-accent" : "border border-line hover:bg-paper-2"}`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className="grid h-8 min-w-8 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
              {"›"}
            </button>
          </nav>
        )}
        <div className="w-36">
          <Select aria-label="Rows per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
        </div>
      </div>
    </div>
  );
}

