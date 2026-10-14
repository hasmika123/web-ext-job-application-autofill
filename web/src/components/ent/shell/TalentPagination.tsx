"use client";

import { ChevronLeftIcon, ChevronRightIcon, Select } from "@kiwiply/ui";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";

/**
 * The foot of a talent board's table: "1-10 of 247 resumes" on the left; numbered square buttons (the current one filled) and the
 * "10 per page" select on the right. Shared by Resumes, Marketing Assignments, Jobs and Applications.
 */
export default function TalentPagination({
  page,
  size,
  total,
  showing,
  sizes,
  onPage,
  onSize,
  className = "",
}: {
  page: number;
  size: number;
  total: number;
  /** The "1-10 of 24 jobs" sentence (each page words its own). */
  showing: string;
  sizes: readonly number[];
  onPage: (p: number) => void;
  onSize: (s: number) => void;
  className?: string;
}) {
  const count = Math.max(1, Math.ceil(total / Math.max(1, size)));
  return (
    <div className={`ent-pager flex flex-col gap-2 text-[11.5px] text-[var(--ent-soft)] sm:flex-row sm:items-center sm:justify-between ${className}`} data-pagination>
      <p aria-live="polite" data-showing>
        {showing}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {count > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className="ent-sq">
              <ChevronLeftIcon size={14} aria-hidden />
            </button>
            {pageWindow(page, count).map((n, i) =>
              n === "gap" ? (
                <span key={`g${i}`} aria-hidden className="px-0.5 text-[var(--ent-soft)]">
                  {"…"}
                </span>
              ) : (
                <button key={n} type="button" aria-label={`Page ${n + 1}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)} className="ent-sq tabular-nums" data-active={n === page ? "true" : undefined}>
                  {n + 1}
                </button>
              ),
            )}
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className="ent-sq">
              <ChevronRightIcon size={14} aria-hidden />
            </button>
          </nav>
        )}
        <div className="ent-perpage w-[100px]">
          <Select aria-label="Rows per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={sizes.map((n) => ({ value: String(n), label: `${n} per page` }))} />
        </div>
      </div>
    </div>
  );
}
