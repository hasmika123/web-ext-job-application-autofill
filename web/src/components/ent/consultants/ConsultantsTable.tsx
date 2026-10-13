"use client";

import { useEffect, useRef } from "react";
import { ArrowDownIcon, ArrowUpIcon, IconButton, Menu, MoreVerticalIcon, PersonCell, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import {
  experienceText,
  formatDate,
  formatTime,
  locationText,
  pageCount as pagesOf,
  PAGE_SIZES,
  showingText,
  type ConsultantRow,
  type SortDir,
  type SortKey,
} from "@/lib/ent/consultants";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";
import { AvailabilityPill, LicensePill, MarketerCell, ProfileRing, SkillChips } from "./parts";

export interface TableProps {
  rows: ConsultantRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The row whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: ConsultantRow) => void;
  rowMenu: (row: ConsultantRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** The drawer is docked beside the table: drop the columns it repeats. */
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

function Kebab({ items, name }: { items: MenuEntry[]; name: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={`Actions for ${name}`} title="Row actions">
          <MoreVerticalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
  );
}

/** "Apr 22, 2024" over "10:00 AM"; a dash when nothing is scheduled (never a made-up slot). */
function NextInterviewCell({ row }: { row: ConsultantRow }) {
  if (!row.nextInterview) return <span className="text-muted">{"—"}</span>;
  return (
    <span className="block whitespace-nowrap text-[12.5px] leading-snug text-ink" data-next-interview>
      {formatDate(row.nextInterview.scheduledAt)}
      <span className="block text-muted">{formatTime(row.nextInterview.scheduledAt)}</span>
    </span>
  );
}

export function ConsultantsTable(p: TableProps) {
  const narrow = useNarrow();
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someOn = !allOn && p.rows.some((r) => p.selected.has(r.id));

  if (narrow) {
    return (
      <ul aria-label="Consultants" className="space-y-2.5" data-consultant-cards>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[var(--radius)] border bg-paper ${p.openId === r.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-2 p-3">
              <Check checked={p.selected.has(r.id)} onChange={() => p.onToggle(r.id)} label={`Select ${r.name}`} />
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <PersonCell name={r.name} avatarName={r.name} sub={r.email} />
              </button>
              <Kebab items={p.rowMenu(r)} name={r.name} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
              <AvailabilityPill value={r.availability} />
              <LicensePill value={r.license} />
              <SkillChips skills={r.primarySkills} extra={Math.max(0, r.skillCount - r.primarySkills.length)} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line/60 px-3 py-2.5 text-[13px]">
              <dt className="text-muted">Experience</dt>
              <dd className="text-ink">{experienceText(r.yearsExperience)}</dd>
              <dt className="text-muted">Location</dt>
              <dd className="truncate text-ink">{locationText(r.location, r.workMode)}</dd>
              <dt className="text-muted">Marketer</dt>
              <dd className="min-w-0">
                <MarketerCell marketer={r.marketer} />
              </dd>
              <dt className="text-muted">Profile</dt>
              <dd>
                <ProfileRing value={r.profileCompleteness} size={32} />
              </dd>
              <dt className="text-muted">Applications</dt>
              <dd className="text-ink">{r.activeApplications}</dd>
              <dt className="text-muted">Next interview</dt>
              <dd>
                <NextInterviewCell row={r} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
      <table aria-label="Consultants" className="w-full border-collapse text-[13px]" data-consultant-table>
        <thead className="border-b border-line bg-paper-2/60">
          <tr>
            <th scope="col" className="w-10 px-2.5 py-2.5">
              <Check checked={allOn} indeterminate={someOn} onChange={p.onTogglePage} label="Select all consultants on this page" />
            </th>
            <SortHead label="Consultant" k="name" sort={p.sort} onSort={p.onSort} />
            <th scope="col" className={HEAD}>Primary Skills</th>
            <SortHead label="Experience" k="experience" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden xl:table-cell"} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>Location</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>Marketer</th>
            <SortHead label="Availability" k="availability" sort={p.sort} onSort={p.onSort} />
            <SortHead label="License" k="license" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : ""} />
            <SortHead label="Profile" k="profile" sort={p.sort} onSort={p.onSort} className={p.compact ? "hidden" : "hidden md:table-cell"} />
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>Apps</th>
            <th scope="col" className={`${HEAD} ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>Next Interview</th>
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
                  <PersonCell name={r.name} avatarName={r.name} sub={r.email} />
                </td>
                <td className="px-2.5 py-2.5">
                  <SkillChips skills={r.primarySkills} extra={Math.max(0, r.skillCount - r.primarySkills.length)} />
                </td>
                <td className={`whitespace-nowrap px-2.5 py-2.5 text-ink-soft ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>{experienceText(r.yearsExperience)}</td>
                <td className={`max-w-[10rem] px-2.5 py-2.5 text-[12.5px] leading-snug text-ink-soft ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>{locationText(r.location, r.workMode)}</td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>
                  <MarketerCell marketer={r.marketer} />
                </td>
                <td className="px-2.5 py-2.5">
                  <AvailabilityPill value={r.availability} />
                </td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : ""}`}>
                  <LicensePill value={r.license} />
                </td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden md:table-cell"}`}>
                  <ProfileRing value={r.profileCompleteness} />
                </td>
                <td className={`px-2.5 py-2.5 tabular-nums text-ink ${p.compact ? "hidden" : "hidden lg:table-cell"}`}>{r.activeApplications}</td>
                <td className={`px-2.5 py-2.5 ${p.compact ? "hidden" : "hidden xl:table-cell"}`}>
                  <NextInterviewCell row={r} />
                </td>
                <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Kebab items={p.rowMenu(r)} name={r.name} />
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
