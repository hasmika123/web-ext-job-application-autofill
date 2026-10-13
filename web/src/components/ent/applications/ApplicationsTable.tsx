"use client";

import { ArrowDownIcon, ArrowUpIcon, IconButton, Menu, MoreHorizontalIcon, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { formatDay, formatShort, nextActionText, pageCount as pagesOf, PAGE_SIZES, showingText, type ApplicationRow, type SortDir, type SortKey } from "@/lib/ent/applications";
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

function Kebab({ items, name }: { items: MenuEntry[]; name: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={`Actions for ${name}`} title="Row actions">
          <MoreHorizontalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
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

  if (narrow) {
    return (
      <ul aria-label="Applications" className="space-y-2.5" data-application-cards>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
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
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
      <table aria-label="Applications" className="w-full border-collapse text-[13.5px]" data-application-table>
        <thead className="border-b border-line bg-paper-2/60">
          <tr>
            <SortHead label="Job Title" k="job" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Consultant" k="consultant" sort={p.sort} onSort={p.onSort} />
            <SortHead label="Client / Company" k="client" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden lg:table-cell"} />
            <SortHead label="Applied Date" k="applied" sort={p.sort} onSort={p.onSort} className="hidden md:table-cell" />
            <SortHead label="Stage" k="stage" sort={p.sort} onSort={p.onSort} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>Marketer</th>
            <SortHead label="Next Action" k="nextAction" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden xl:table-cell"} />
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
                className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open ? "bg-accent-soft/60" : "hover:bg-paper-2/50"}`}
              >
                <td className="min-w-[10rem] px-2.5 py-2.5">
                  <TwoLine top={r.jobTitle} sub={r.code} />
                </td>
                <td className="min-w-[10rem] px-2.5 py-2.5">
                  <ConsultantCell consultant={r.consultant} />
                </td>
                <td className={`min-w-[10rem] px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>
                  <ClientCell client={r.client} orgName={p.orgName} />
                </td>
                <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-ink-soft md:table-cell">{formatDay(r.appliedOn)}</td>
                <td className="px-2.5 py-2.5">
                  <StagePill stage={r.stage} reason={r.closedReason} />
                </td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>
                  <MarketerCell marketer={r.marketer} />
                </td>
                <td className={`min-w-[9rem] px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>
                  <NextAction row={r} />
                </td>
                <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
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
