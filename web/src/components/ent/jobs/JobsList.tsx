"use client";

import { BuildingIcon, GlobeIcon, MapPinIcon } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { PAGE_SIZES, postedText, showingText, workModeLabel, type JobRow } from "@/lib/ent/jobs";
import TalentPagination from "@/components/ent/shell/TalentPagination";
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
      <ul aria-label="Jobs" className="ent-joblist">
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
              className={`ent-jobrow flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-3 px-3 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:grid lg:grid-cols-[18px_minmax(0,1fr)_62px_84px_62px_70px_28px] ${open ? "bg-[var(--ent-x-eef4fe)]" : selected.has(r.id) ? "bg-[var(--ent-x-f4f8fe)]" : "hover:bg-[var(--ent-field-bg)]"}`}
            >
              <div>
                <Check checked={selected.has(r.id)} onChange={() => onToggle(r.id)} label={`Select ${r.title} at ${r.client.name}`} />
              </div>
              <div className="min-w-0 flex-1 basis-56 space-y-1">
                <div>
                  <h3 className="truncate text-[12px] font-bold leading-tight text-[var(--ent-title)]" data-job-title>
                    {r.title}
                  </h3>
                  <p className="truncate text-[11px] text-[var(--ent-x-46527e)]">{r.client.name}</p>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--ent-soft)]">
                  {r.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon aria-hidden size={11} /> {r.location}
                    </span>
                  )}
                  {r.workMode && (
                    <span className="inline-flex items-center gap-1">
                      {r.workMode === "REMOTE" ? <GlobeIcon aria-hidden size={11} /> : <BuildingIcon aria-hidden size={11} />} {workModeLabel(r.workMode)}
                    </span>
                  )}
                </p>
                <SkillChips skills={r.skills} max={2} />
              </div>
              <div className="text-center" data-submissions>
                {r.submissions === 0 ? (
                  <p className="text-[9.5px] leading-tight text-[var(--ent-soft)]">No submissions</p>
                ) : (
                  <>
                    <p className="text-[12px] font-bold leading-tight text-[var(--ent-title)] tabular-nums">{r.submissions}</p>
                    <p className="text-[9.5px] text-[var(--ent-soft)]">{r.submissions === 1 ? "Submission" : "Submissions"}</p>
                  </>
                )}
              </div>
              <div>
                <MatchStack matches={r.matches} />
              </div>
              <div className="flex">
                <StatusPill status={r.status} />
              </div>
              <div className="text-[10px]" data-posted>
                <p className="text-[var(--ent-soft)]">Posted</p>
                <p className="whitespace-nowrap font-medium text-[var(--ent-x-1e2a5a)]">{postedText(r.postedAt)}</p>
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
  return <TalentPagination className="mt-3 px-1" page={page} size={size} total={total} showing={showingText(total, page, size, shown)} sizes={PAGE_SIZES} onPage={onPage} onSize={onSize} />;
}
