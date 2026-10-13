"use client";

import { useEffect, useRef } from "react";
import { ArrowDownIcon, ArrowUpIcon, IconButton, Menu, MoreVerticalIcon, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";
import { formatDate, pageCount as pagesOf, PAGE_SIZES, showingText, versionText, type ResumeRow, type SortDir, type SortKey } from "@/lib/ent/resumes";
import { ApprovalPill, ConsultantCell, OwnerAvatar, PrimaryCell, VisibilityPill } from "./parts";

export interface TableProps {
  rows: ResumeRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The row whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: ResumeRow) => void;
  rowMenu: (row: ResumeRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** The drawer is docked beside the table: drop the columns the drawer repeats. */
  compact?: boolean;
  view: "list" | "grid";
}

const HEAD = "px-2.5 py-2.5 text-left text-[12px] font-semibold text-ink-soft";

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: TableProps["sort"]; onSort: TableProps["onSort"]; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${HEAD} ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink focus-visible:outline-2 focus-visible:outline-accent" title={`Sort by ${label.toLowerCase()}`}>
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

/** The resume's name with its plain file name underneath. */
function NameCell({ row }: { row: ResumeRow }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-[13px] font-semibold text-ink">{row.name}</span>
      {row.fileName && <span className="block truncate text-[12px] text-muted">{row.fileName}</span>}
    </span>
  );
}

export function ResumesTable(p: TableProps) {
  const narrow = useNarrow();
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someOn = !allOn && p.rows.some((r) => p.selected.has(r.id));

  if (narrow || p.view === "grid") {
    return (
      <ul aria-label="Resumes" className={`grid gap-2.5 ${narrow ? "" : p.compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`} data-resume-cards={p.view === "grid" ? "grid" : "list"}>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
              <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.name}`} />
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <ConsultantCell row={r} />
              </button>
              <Kebab items={p.rowMenu(r)} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t border-line/60 px-3 py-2.5 text-[13px]">
              <dt className="text-muted">Resume</dt>
              <dd className="min-w-0"><NameCell row={r} /></dd>
              <dt className="text-muted">Target role</dt>
              <dd className="truncate text-ink">{r.targetRole ?? "—"}</dd>
              <dt className="text-muted">Version</dt>
              <dd className="flex flex-wrap items-center gap-1.5 text-ink">{versionText(r.version)} <PrimaryCell primary={r.primary} /></dd>
              <dt className="text-muted">Visibility</dt>
              <dd><VisibilityPill visibility={r.visibility} /></dd>
              <dt className="text-muted">Status</dt>
              <dd><ApprovalPill status={r.approvalStatus} /></dd>
              <dt className="text-muted">Modified</dt>
              <dd className="text-ink">{formatDate(r.updatedAt) || "—"}</dd>
              <dt className="text-muted">Owner</dt>
              <dd><OwnerAvatar owner={r.owner} size={24} showName /></dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
      <table aria-label="Resumes" className="w-full border-collapse text-[13.5px]" data-resume-table>
        <thead className="border-b border-line bg-paper-2/60">
          <tr>
            <th scope="col" className="w-10 px-2.5 py-2.5">
              <Check checked={allOn} indeterminate={someOn} onChange={p.onTogglePage} label="Select all resumes on this page" />
            </th>
            <SortHead label="Consultant" k="consultant" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Resume Name" k="name" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Target Role" k="role" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden lg:table-cell"} />
            <SortHead label="Version" k="version" sort={p.sort} onSort={p.onSort} />
            <th scope="col" className={HEAD}>Primary</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden md:table-cell"}`}>Visibility</th>
            <SortHead label="Status" k="status" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Last Modified" k="modified" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden md:table-cell"} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>Owner</th>
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
                <td className="w-10 px-2.5 py-2">
                  <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.name}`} />
                </td>
                <td className="min-w-[11rem] max-w-[15rem] px-2.5 py-2">
                  <ConsultantCell row={r} />
                </td>
                <td className="min-w-[10rem] max-w-[14rem] px-2.5 py-2">
                  <NameCell row={r} />
                </td>
                <td className={`max-w-[9rem] px-2.5 py-2 text-ink-soft ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>{r.targetRole ?? "—"}</td>
                <td className="whitespace-nowrap px-2.5 py-2 text-ink-soft">{versionText(r.version)}</td>
                <td className="px-2.5 py-2">
                  <PrimaryCell primary={r.primary} />
                </td>
                <td className={`px-2.5 py-2 ${p.compact ? "hidden" : "hidden md:table-cell"}`}>
                  <VisibilityPill visibility={r.visibility} />
                </td>
                <td className="px-2.5 py-2">
                  <ApprovalPill status={r.approvalStatus} />
                </td>
                <td className={`whitespace-nowrap px-2.5 py-2 text-ink-soft ${p.compact ? "hidden" : "hidden md:table-cell"}`}>{formatDate(r.updatedAt) || "—"}</td>
                <td className={`px-2.5 py-2 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>
                  <OwnerAvatar owner={r.owner} />
                </td>
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

export function Pagination({ page, size, total, shown, onPage, onSize }: { page: number; size: number; total: number; shown: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const count = pagesOf(total, size);
  return (
    <div className="mt-3 flex flex-col gap-2 text-[13px] text-ink-soft sm:flex-row sm:items-center sm:justify-between" data-pagination>
      <p aria-live="polite" data-showing>
        {showingText(total, page, size, shown)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {count > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className="grid h-8 min-w-8 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
              {"‹"}
            </button>
            {pageWindow(page, count).map((n, i) =>
              n === "gap" ? (
                <span key={`g${i}`} aria-hidden className="px-1 text-muted">
                  {"…"}
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-label={`Page ${n + 1}`}
                  aria-current={n === page ? "page" : undefined}
                  onClick={() => onPage(n)}
                  className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums ${n === page ? "bg-accent text-on-accent" : "border border-line hover:bg-paper-2"}`}
                >
                  {n + 1}
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
