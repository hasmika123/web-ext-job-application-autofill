"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, IconButton, Menu, MoreHorizontalIcon, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { formatDay, formatTime, pageCount as pagesOf, PAGE_SIZES, type InterviewRow, type SortDir, type SortKey } from "@/lib/ent/interviews";
import { ClientCell, ConsultantCell, InterviewerStack, ModeCell, StatusPill, TwoLine } from "./parts";

export interface TableProps {
  rows: InterviewRow[];
  /** The row whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: InterviewRow) => void;
  rowMenu: (row: InterviewRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (on: boolean) => void;
  /** The drawer is docked beside the table: drop the columns the drawer repeats. */
  compact?: boolean;
}

const HEAD = "whitespace-nowrap px-1.5 py-2 text-left text-[12px] font-semibold text-ink";
const CHECK = "h-4 w-4 cursor-pointer rounded border-line accent-[var(--ent-primary,var(--color-accent))]";

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: TableProps["sort"]; onSort: TableProps["onSort"]; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${HEAD} ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-accent" title={`Sort by ${label.toLowerCase()}`}>
        {label}
        {active && (sort.dir === "asc" ? <ArrowUpIcon aria-hidden size={12} /> : <ArrowDownIcon aria-hidden size={12} />)}
      </button>
    </th>
  );
}

export function Kebab({ items, name }: { items: MenuEntry[]; name: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={`Actions for ${name}`} title="Row actions" className="border border-line">
          <MoreHorizontalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
  );
}

/** "Apr 18, 2024" over "10:00 AM". */
export function WhenCell({ at }: { at: string }) {
  return <TwoLine top={formatDay(at)} sub={formatTime(at)} strong={false} />;
}

export function RoleCell({ row }: { row: InterviewRow }) {
  if (!row.jobTitle) return <TwoLine top={<span className="font-medium text-muted">Not linked to a job</span>} sub={row.code} />;
  return <TwoLine top={<span className="line-clamp-2 whitespace-normal leading-snug">{row.jobTitle}</span>} sub={row.jobCode} />;
}

/** The next step wraps in two lines like the board ("Send prep / materials"). */
export function NextStepCell({ text }: { text: string }) {
  return <span className="line-clamp-2 whitespace-normal text-[11.5px] leading-snug text-ink-soft">{text}</span>;
}

export function InterviewsTable(p: TableProps) {
  const narrow = useNarrow();
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));

  if (narrow) {
    return (
      <ul aria-label="Interviews" className="space-y-2.5" data-interview-cards>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <RoleCell row={r} />
              </button>
              <StatusPill status={r.status} />
              <Kebab items={p.rowMenu(r)} name={r.jobTitle ?? r.code} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-line/60 px-3 py-2.5 text-[13px]">
              <dt className="text-muted">Consultant</dt>
              <dd className="min-w-0"><ConsultantCell consultant={r.consultant} /></dd>
              <dt className="text-muted">Client</dt>
              <dd className="min-w-0"><ClientCell client={r.client} /></dd>
              <dt className="text-muted">When</dt>
              <dd className="text-ink">{formatDay(r.scheduledAt)}, {formatTime(r.scheduledAt)}</dd>
              <dt className="text-muted">Round</dt>
              <dd className="text-ink">{r.round ?? "—"}</dd>
              <dt className="text-muted">Mode</dt>
              <dd><ModeCell mode={r.mode} /></dd>
              <dt className="text-muted">Next step</dt>
              <dd className="text-ink">{r.nextStep || "—"}</dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--ent-table-line,var(--color-line))] bg-paper">
      <table aria-label="Interviews" className="w-full table-fixed border-collapse text-[13px]" data-interview-table>
        <thead className="border-b border-[var(--ent-table-line,var(--color-line))]">
          <tr>
            <th scope="col" className="w-[3.4%] min-w-8 py-2 pl-3 pr-1">
              <input type="checkbox" aria-label="Select all interviews on this page" className={CHECK} checked={allOn} onChange={(e) => p.onToggleAll(e.target.checked)} />
            </th>
            <SortHead label="Role" k="role" sort={p.sort} onSort={p.onSort} className={p.compact ? "w-[26%]" : "w-[12.5%]"} />
            <SortHead label="Consultant" k="consultant" sort={p.sort} onSort={p.onSort} className={p.compact ? "w-[30%]" : "w-[15%]"} />
            <SortHead label="Client" k="client" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden w-[11%] lg:table-cell"} />
            <SortHead label="Round" k="round" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden w-[9.5%] lg:table-cell"} />
            <SortHead label="Scheduled Date" k="scheduled" sort={p.sort} onSort={p.onSort} className={p.compact ? "w-[22%]" : "w-[10.5%]"} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden w-[8.5%] xl:table-cell"}`}>Interviewer</th>
            <SortHead label="Mode" k="mode" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden w-[7%] xl:table-cell"} />
            <SortHead label="Status" k="status" sort={p.sort} onSort={p.onSort} className={p.compact ? "w-[22%]" : "w-[9.5%]"} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden w-[8%] xl:table-cell"}`}>Next Step</th>
            <th scope="col" className={`${HEAD} w-[5%] min-w-12 text-center`}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ent-table-line,var(--color-line))]">
          {p.rows.map((r) => {
            const open = p.openId === r.id;
            return (
              <tr
                key={r.id}
                data-row-id={r.id}
                data-status={r.status}
                tabIndex={0}
                aria-selected={open}
                onClick={() => p.onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    p.onOpen(r);
                  }
                }}
                className={`h-[54px] cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open ? "bg-accent-soft/50" : "hover:bg-paper-2/50"}`}
              >
                <td className="py-1.5 pl-3 pr-1" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${r.jobTitle ?? r.code}`} className={CHECK} checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} />
                </td>
                <td className="px-1.5 py-1.5"><RoleCell row={r} /></td>
                <td className="px-1.5 py-1.5"><ConsultantCell consultant={r.consultant} /></td>
                <td className={`px-1.5 py-1.5 ${p.compact ? "hidden" : "hidden lg:table-cell"}`}><ClientCell client={r.client} /></td>
                <td className={`px-1.5 py-1.5 text-[11.5px] leading-snug text-ink-soft ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>{r.round ?? <span className="text-muted">{"—"}</span>}</td>
                <td className="whitespace-nowrap px-1.5 py-1.5"><WhenCell at={r.scheduledAt} /></td>
                <td className={`px-1.5 py-1.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}><InterviewerStack people={r.interviewers} /></td>
                <td className={`px-1.5 py-1.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}><ModeCell mode={r.mode} /></td>
                <td className="px-1.5 py-1.5"><StatusPill status={r.status} /></td>
                <td className={`px-1.5 py-1.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}><NextStepCell text={r.nextStep} /></td>
                <td className="px-1 text-center" onClick={(e) => e.stopPropagation()}>
                  <Kebab items={p.rowMenu(r)} name={r.jobTitle ?? r.code} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The grid layout: the same rows as cards (the board's second view toggle). */
export function InterviewsGrid(p: Pick<TableProps, "rows" | "openId" | "onOpen" | "rowMenu">) {
  return (
    <ul aria-label="Interviews" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-interview-grid>
      {p.rows.map((r) => (
        <li key={r.id} data-row-id={r.id} className={`ent-card flex flex-col gap-2.5 p-3.5 ${p.openId === r.id ? "!border-accent" : ""}`}>
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => p.onOpen(r)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <RoleCell row={r} />
            </button>
            <StatusPill status={r.status} />
            <Kebab items={p.rowMenu(r)} name={r.jobTitle ?? r.code} />
          </div>
          <ConsultantCell consultant={r.consultant} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-soft">
            <ClientCell client={r.client} />
            <ModeCell mode={r.mode} />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
            <WhenCell at={r.scheduledAt} />
            <InterviewerStack people={r.interviewers} />
          </div>
        </li>
      ))}
    </ul>
  );
}

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

const PAGE_BTN = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums";

/** The board's footer: previous, 1 2 3 4 5, next, and "10 per page", all centred; the showing text sits above the table. */
export function Pagination({ page, size, total, onPage, onSize }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const count = pagesOf(total, size);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[13px] text-ink-soft" data-pagination>
      {count > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className={`${PAGE_BTN} border border-line hover:bg-paper-2 disabled:opacity-40`}>
            <ChevronLeftIcon size={14} aria-hidden />
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
                className={`${PAGE_BTN} ${n === page ? "bg-accent text-on-accent" : "border border-line hover:bg-paper-2"}`}
              >
                {n + 1}
              </button>
            ),
          )}
          <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className={`${PAGE_BTN} border border-line hover:bg-paper-2 disabled:opacity-40`}>
            <ChevronRightIcon size={14} aria-hidden />
          </button>
        </nav>
      )}
      <div className="w-32">
        <Select aria-label="Rows per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
      </div>
    </div>
  );
}
