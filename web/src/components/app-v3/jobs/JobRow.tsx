"use client";

import { ClockIcon, cn } from "@kiwiply/ui";
import { CompanyTile } from "@/components/app-v2/common";
import { JobTag, MatchBadge, SaveButton } from "@/components/app-v2/jobs/JobBits";
import type { V3Job } from "@/components/app-v3/sample-data";

/**
 * One Job Search result: company tile, title, "Company · Location · Type", tags, "Posted N days ago",
 * bookmark and match pct. A stretched button opens the right-hand detail panel; the bookmark sits above it.
 */
export default function JobRow({ job, selected, onOpen }: { job: V3Job; selected: boolean; onOpen: () => void }) {
  const meta = [job.company, job.location || null, job.type, job.mode === "Remote" && !/remote/i.test(job.location) ? "Remote" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className={cn(
        "relative rounded-2xl border bg-paper p-3.5 shadow-v2-soft transition-colors hover:bg-v2-blue-soft/30 sm:p-4",
        selected ? "border-v2-blue bg-v2-blue-soft/40 ring-1 ring-v2-blue/40" : "border-v2-line/70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${job.title} at ${job.company}`}
        aria-current={selected ? "true" : undefined}
        className="absolute inset-0 rounded-2xl"
      />
      <div className="pointer-events-none flex items-start gap-3.5">
        <CompanyTile name={job.company} size={48} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-bold leading-snug text-ink">{job.title}</div>
          <div className="mt-0.5 text-[13px] text-ink-soft">{meta}</div>
          {job.salary && <div className="mt-0.5 text-[13px] font-semibold text-ink">{job.salary}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.tags.slice(0, 4).map((t) => (
              <JobTag key={t}>{t}</JobTag>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-v2-muted">
            <MatchBadge score={job.score} />
            <span className="flex items-center gap-1.5">
              <ClockIcon size={12} />
              Posted {job.posted}
            </span>
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-2">
          <span className="pointer-events-auto relative z-10">
            <SaveButton job={job} className="-mr-1 -mt-1" />
          </span>
        </div>
      </div>
    </li>
  );
}
