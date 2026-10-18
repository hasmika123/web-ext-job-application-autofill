"use client";

import { useEffect, useRef } from "react";
import { ArrowDownIcon, ArrowUpIcon, IconButton, Menu, MoreHorizontalIcon, useNarrow } from "@kiwiply/ui";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import type { MenuEntry } from "@kiwiply/ui";
import { formatDay, formatShort, nextActionText, PAGE_SIZES, showingText, type ApplicationRow, type SortDir, type SortKey } from "@/lib/ent/applications";
import { rowActorLine } from "@/lib/actors";
import { RelationTag, RelTime } from "@/components/app-v3/applications/UpdatedBy";
import { seatViewer } from "./changeAudit";
import { ClientCell, ConsultantCell, MarketerCell, StagePill, TwoLine } from "./parts";

export interface TableProps {
  rows: ApplicationRow[];
  orgName: string;
  /** The row whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: ApplicationRow) => void;
  rowMenu: (row: ApplicationRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** The drawer is docked beside the table: drop the columns the drawer repeats. */
  compact?: boolean;
  /** The ticked rows (the bulk bar above the table acts on them). */
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The viewer's own seat: a row the viewer changed does not read "by you" (D2); another person, the extension or the platform always does. */
  selfMemberId?: number | null;
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
      className="h-[14px] w-[14px] cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))]"
    />
  );
}

const HEAD = "text-left";

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

function Kebab({ items, name }: { items: MenuEntry[]; name: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={`Actions for ${name}`} title="Row actions" className="ent-kebab ent-kebab-bare">
          <MoreHorizontalIcon size={15} />
        </IconButton>
      }
      items={items}
    />
  );
}

/** "2h ago" and, on a second line, who - only when it is not the viewer (change audit). */
function Updated({ row, me }: { row: ApplicationRow; me: ReturnType<typeof seatViewer> }) {
  if (!row.updatedAt) return <span className="text-muted">{"\u2014"}</span>;
  const by = rowActorLine(row.updatedBy, me);
  return (
    <span data-updated-cell className="flex flex-col leading-tight">
      <span className="text-[var(--ent-soft)]">
        <RelTime iso={row.updatedAt} />
      </span>
      {by && (
        <span className="text-[11.5px] text-muted">
          {by} <RelationTag actor={row.updatedBy} me={me} />
        </span>
      )}
    </span>
  );
}

function NextAction({ row }: { row: ApplicationRow }) {
  const text = nextActionText(row);
  if (!text) return <span className="text-muted">{"—"}</span>;
  const due = row.stage !== "CLOSED" && row.nextActionDue ? `${formatShort(row.nextActionDue)}, ${row.nextActionDue.slice(0, 4)}` : "";
  return (
    <TwoLine
      top={<span className={row.stage === "CLOSED" ? "font-normal text-muted" : "font-medium"}>{text}</span>}
      sub={due ? <span className={row.overdue ? "font-semibold text-danger" : undefined}>{due}{row.overdue ? " (overdue)" : ""}</span> : undefined}
    />
  );
}

export function ApplicationsTable(p: TableProps) {
  const narrow = useNarrow();
  const me = seatViewer(p.selfMemberId);

  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someOn = !allOn && p.rows.some((r) => p.selected.has(r.id));

  if (narrow) {
    return (
      <ul aria-label="Applications" className="space-y-2.5" data-application-cards>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
              <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.code}`} />
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <TwoLine top={r.jobTitle} sub={r.code} />
              </button>
              <StagePill stage={r.stage} reason={r.closedReason} />
              <Kebab items={p.rowMenu(r)} name={r.jobTitle} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-line/60 px-3 py-2.5 text-[13px]">
              <dt className="text-muted">Consultant</dt>
              <dd className="min-w-0"><ConsultantCell consultant={r.consultant} /></dd>
              <dt className="text-muted">Client</dt>
              <dd className="min-w-0"><ClientCell client={r.client} orgName={p.orgName} /></dd>
              <dt className="text-muted">Applied</dt>
              <dd className="text-ink">{formatDay(r.appliedOn)}</dd>
              <dt className="text-muted">Updated</dt>
              <dd className="min-w-0 text-ink"><Updated row={r} me={me} /></dd>
              <dt className="text-muted">Marketer</dt>
              <dd className="min-w-0"><MarketerCell marketer={r.marketer} withName /></dd>
              <dt className="text-muted">Next action</dt>
              <dd className="min-w-0"><NextAction row={r} /></dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table aria-label="Applications" className="ent-table w-full" data-application-table>
        <thead>
          <tr>
            <th scope="col" className="w-[34px]">
              <Check checked={allOn} indeterminate={someOn} onChange={p.onTogglePage} label="Select all applications on this page" />
            </th>
            <SortHead label="Job Title" k="job" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Consultant" k="consultant" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Client / Company" k="client" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden xl:table-cell" : "hidden lg:table-cell"} />
            <SortHead label="Applied Date" k="applied" sort={p.sort} onSort={p.onSort} className="hidden md:table-cell" />
            <SortHead label="Stage" k="stage" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Updated" k="updated" sort={p.sort} onSort={p.onSort} className="hidden lg:table-cell" />
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Marketer</th>
            <SortHead label="Next Action" k="nextAction" sort={p.sort} onSort={p.onSort} className="hidden xl:table-cell" />
            <th scope="col" className="w-[40px]">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => {
            const open = p.openId === r.id;
            return (
              <tr
                key={r.id}
                data-row-id={r.id}
                data-stage={r.stage}
                tabIndex={0}
                aria-selected={open}
                onClick={() => p.onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    p.onOpen(r);
                  }
                }}
                className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open ? "bg-[var(--ent-x-eef4fe)]" : p.selected.has(r.id) ? "bg-[var(--ent-x-f4f8fe)]" : "hover:bg-[var(--ent-field-bg)]"}`}
              >
                <td className="w-[34px]" onClick={(e) => e.stopPropagation()}>
                  <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.code}`} />
                </td>
                <td className="min-w-[110px] max-w-[130px]">
                  <TwoLine top={r.jobTitle} sub={r.code} />
                </td>
                <td className="min-w-[120px] max-w-[135px]">
                  <ConsultantCell consultant={r.consultant} />
                </td>
                <td className={`min-w-[110px] max-w-[130px] ${p.compact ? "hidden xl:table-cell" : "hidden lg:table-cell"}`}>
                  <ClientCell client={r.client} orgName={orgNameOf(p)} />
                </td>
                <td className="hidden whitespace-nowrap text-[var(--ent-soft)] md:table-cell">{formatDay(r.appliedOn)}</td>
                <td>
                  <StagePill stage={r.stage} reason={r.closedReason} />
                </td>
                <td className="hidden min-w-[96px] lg:table-cell">
                  <Updated row={r} me={me} />
                </td>
                <td className="hidden xl:table-cell">
                  <MarketerCell marketer={r.marketer} />
                </td>
                <td className="hidden min-w-[88px] xl:table-cell">
                  <NextAction row={r} />
                </td>
                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Kebab items={p.rowMenu(r)} name={r.jobTitle} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const orgNameOf = (p: TableProps) => p.orgName;

/** 1 2 3 … 33 with the current page and its neighbours; the ends always show. Pure, for the tests. */
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
  return <TalentPagination className="mt-3 px-1.5" page={page} size={size} total={total} showing={showingText(total, page, size, shown)} sizes={PAGE_SIZES} onPage={onPage} onSize={onSize} />;
}
