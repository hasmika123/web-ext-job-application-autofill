"use client";

import Link from "next/link";
import { ArrowRightIcon, ClockIcon, SendIcon, cn } from "@kiwiply/ui";
import { CompanyTile, ProgressRing } from "@/components/app-v2/common";
import type { SampleJob } from "@/components/app-v2/sample-data";
import { JobTag, MatchBadge, SaveButton } from "./JobBits";
import { metaLine, scoreTone } from "./job-utils";

/**
 * Row of the Job Search list, list layout (board `app-job-search.webp`): logo, title, meta, tags on
 * the left; match badge + "N days ago" in the middle; bookmark and "Apply with AI" on the right.
 * A stretched button opens the split detail panel; the inner controls sit above it.
 */
export function JobRowWide({ job, onOpen }: { job: SampleJob; onOpen: () => void }) {
  return (
    <li className="relative flex flex-col gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft transition-colors hover:bg-v2-blue-soft/30 lg:flex-row lg:items-center lg:gap-4">
      <button type="button" onClick={onOpen} aria-label={`Open ${job.title} at ${job.company}`} className="absolute inset-0 rounded-2xl" />
      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-4">
        <CompanyTile name={job.company} size={56} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold leading-snug text-ink">{job.title}</div>
          <div className="mt-0.5 text-[13.5px] text-ink-soft">{metaLine(job)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.tags.map((t) => (
              <JobTag key={t}>{t}</JobTag>
            ))}
          </div>
        </div>
      </div>
      <div className="pointer-events-none flex flex-none items-center gap-3 lg:w-[150px] lg:flex-col lg:items-start lg:gap-1.5">
        <MatchBadge score={job.score} />
        <span className="flex items-center gap-1.5 text-[12.5px] text-v2-muted">
          <ClockIcon size={13} />
          {job.posted}
        </span>
      </div>
      <div className="relative z-10 flex flex-none items-center gap-2">
        <SaveButton job={job} />
        <Link
          href={`/ai-apply?job=${job.id}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-v2-lime/70 px-4 py-2.5 text-[13.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
        >
          <SendIcon size={15} />
          Apply with AI
        </Link>
      </div>
    </li>
  );
}

/** Row of the split layout (board `app-job-search-split.webp`): compact, with a match ring. */
export function JobRowCompact({ job, selected, onOpen }: { job: SampleJob; selected: boolean; onOpen: () => void }) {
  return (
    <li
      className={cn(
        "relative rounded-2xl border bg-paper p-3.5 shadow-v2-soft transition-colors hover:bg-v2-blue-soft/30",
        selected ? "border-v2-green bg-v2-lime-soft/40 ring-1 ring-v2-green/40" : "border-v2-line/70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${job.title} at ${job.company}`}
        aria-current={selected ? "true" : undefined}
        className="absolute inset-0 rounded-2xl"
      />
      <div className="pointer-events-none flex items-start gap-3">
        <CompanyTile name={job.company} size={48} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-bold leading-snug text-ink">{job.title}</div>
          <div className="mt-0.5 text-[13px] text-ink-soft">{metaLine(job)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.tags.map((t) => (
              <JobTag key={t}>{t}</JobTag>
            ))}
          </div>
          <div className="mt-2 text-[12px] text-v2-muted">Posted {job.posted}</div>
        </div>
        <div className="flex flex-none flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <ProgressRing value={job.score} tone={scoreTone(job.score)} size={26} thickness={4} label={`${job.score} percent match`} />
            <span className="text-[12.5px] font-bold text-ink">{job.score}% Match</span>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-2.5 flex items-center justify-end gap-2">
        <SaveButton job={job} />
        <Link
          href={`/ai-apply?job=${job.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-v2-lime px-3.5 py-2 text-[13px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
        >
          Apply with AI
          <ArrowRightIcon size={13} />
        </Link>
      </div>
    </li>
  );
}
