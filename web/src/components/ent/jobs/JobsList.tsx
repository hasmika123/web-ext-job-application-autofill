"use client";

import { BuildingIcon, GlobeIcon, MapPinIcon, Select } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { pageCount as pagesOf, PAGE_SIZES, postedText, showingText, workModeLabel, type JobRow } from "@/lib/ent/jobs";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";
import { Check, Kebab, MatchStack, SkillChips, StatusPill } from "./parts";

export interface JobsListProps {
  rows: JobRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The job whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: JobRow) => void;
  rowMenu: (row: JobRow) => MenuEntry[];
  /** The drawer is docked beside the list: drop the columns it repeats. */
  compact?: boolean;
}

/**
 * The jobs as a list of cards (a row on a desktop, the same card stacked on a phone): checkbox, title with client, location and work mode,
 * skill chips, submissions, the best matches, status, posted date and the row menu. The whole row opens the drawer (Enter or Space too).
 */
export function JobsList({ rows, selected, onToggle, onTogglePage, openId, onOpen, rowMenu }: JobsListProps) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = !allOn && rows.some((r) => selected.has(r.id));
  return (
    <div data-jobs-list>
      <div className="sr-only focus-within:not-sr-only focus-within:mb-1.5 focus-within:flex focus-within:items-center focus-within:gap-2 focus-within:px-3.5 focus-within:text-[12.5px] focus-within:text-ink-soft">
        <Check checked={allOn} indeterminate={someOn} onChange={onTogglePage} label="Select all jobs on this page" />
        <span aria-hidden>Select page</span>
      </div>
      <ul aria-label="Jobs" className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-paper shadow-[var(--shadow)]">
        {rows.map((r) => {
          const open = openId === r.id;
          return (
            <li
              key={r.id}
              data-row-id={r.id}
              tabIndex={0}
              aria-current={open ? "true" : undefined}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
              className={`flex cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-3 px-4 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:grid lg:grid-cols-[22px_minmax(0,1fr)_60px_112px_84px_88px_36px] ${open || selected.has(r.id) ? "bg-accent-soft/60" : "hover:bg-paper-2/50"}`}
            >
              <div>
                <Check checked={selected.has(r.id)} onChange={() => onToggle(r.id)} label={`Select ${r.title} at ${r.client.name}`} />
              </div>
              <div className="min-w-0 flex-1 basis-56 space-y-1.5">
                <div>
                  <h3 className="truncate text-[15px] font-bold leading-tight text-ink" data-job-title>
                    {r.title}
                  </h3>
                  <p className="truncate text-[13.5px] text-ink-soft">{r.client.name}</p>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                  {r.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon aria-hidden size={13} /> {r.location}
                    </span>
                  )}
                  {r.workMode && (
                    <span className="inline-flex items-center gap-1">
                      {r.workMode === "REMOTE" ? <GlobeIcon aria-hidden size={13} /> : <BuildingIcon aria-hidden size={13} />} {workModeLabel(r.workMode)}
                    </span>
                  )}
                </p>
                <SkillChips skills={r.skills} max={3} />
              </div>
              <div className="text-center" data-submissions>
                <p className="text-[18px] font-bold leading-tight text-ink tabular-nums">{r.submissions}</p>
                <p className="text-[11.5px] text-muted">{r.submissions === 1 ? "Submission" : "Submissions"}</p>
              </div>
              <div>
                <MatchStack matches={r.matches} />
              </div>
              <div className="flex">
                <StatusPill status={r.status} />
              </div>
              <div className="text-[12.5px]" data-posted>
                <p className="text-muted">Posted</p>
                <p className="whitespace-nowrap font-medium text-ink">{postedText(r.postedAt)}</p>
              </div>
              <div onClick={(e) => e.stopPropagation()} className="justify-self-end">
                <Kebab items={rowMenu(r)} label={`Actions for ${r.title}`} />
              </div>
            </li>
          );
        })}
      </ul>
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
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className="grid h-10 min-w-10 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
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
                  className={`grid h-10 min-w-10 place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums ${p === page ? "bg-accent text-on-accent" : "border border-line hover:bg-paper-2"}`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className="grid h-10 min-w-10 place-items-center rounded-lg border border-line px-2 hover:bg-paper-2 disabled:opacity-40">
              {"›"}
            </button>
          </nav>
        )}
        <div className="w-36">
          <Select aria-label="Jobs per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
        </div>
      </div>
    </div>
  );
}
