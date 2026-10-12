"use client";

import { BookmarkIcon, BookmarkOutlineIcon, ClockIcon, IconButton, SwipeCard, Tooltip, cn } from "@kiwiply/ui";
import { CompanyTile, KebabMenu } from "@/components/app-v2/common";
import { JobTag, MatchBadge } from "@/components/app-v2/jobs/JobBits";
import { jobMeta, jobTags, postedAgo, type JobCard } from "@/lib/jobs";

/**
 * One search result: company tile, title, "Company · Location · Type", tags, "Posted 2 days ago", a Pro match badge, a
 * bookmark (save to your board) and a menu (hide this job / this company). A stretched button opens the detail. On a
 * phone the card swipes: right saves, left hides (with Undo); the bookmark and menu do the same without a gesture.
 */
export default function JobRow({
  job,
  now,
  selected,
  onOpen,
  onSave,
  onHide,
  onHideCompany,
}: {
  job: JobCard;
  now: number;
  selected: boolean;
  onOpen: () => void;
  onSave: () => void;
  onHide: () => void;
  onHideCompany: () => void;
}) {
  const label = `${job.title} at ${job.company}`;
  return (
    <li data-job-id={job.id}>
      <SwipeCard onKeep={onSave} onSkip={onHide} aria-label={label} keepLabel="Save" skipLabel="Hide">
        <div
          className={cn(
            "relative rounded-2xl border bg-paper p-3.5 shadow-v2-soft transition-colors hover:bg-v2-blue-soft/30 sm:p-4",
            selected ? "border-v2-blue bg-v2-blue-soft/40 ring-1 ring-v2-blue/40" : "border-v2-line/70",
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${label}`}
            aria-current={selected ? "true" : undefined}
            className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="pointer-events-none flex items-start gap-3">
            <CompanyTile name={job.company} size={44} className="rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="break-words text-[15px] font-bold leading-snug text-ink">{job.title}</div>
              <div className="mt-0.5 break-words text-[13px] text-ink-soft">{jobMeta(job)}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {jobTags(job)
                  .slice(0, 3)
                  .map((t) => (
                    <JobTag key={t}>{t}</JobTag>
                  ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-v2-muted">
                {job.match && <MatchBadge score={job.match.score} />}
                <span className="flex items-center gap-1.5">
                  <ClockIcon size={12} />
                  Posted {postedAgo(job.publishedAt, now)}
                </span>
              </div>
            </div>
            <div className="pointer-events-auto relative z-10 flex flex-none items-center gap-0.5">
              <Tooltip content={job.saved ? "Saved to your board" : "Save to your board"}>
                <IconButton
                  aria-label={job.saved ? `Saved: ${label}` : `Save ${label}`}
                  aria-pressed={job.saved}
                  onClick={job.saved ? undefined : onSave}
                  className={cn("-mt-1 h-10 w-10 sm:h-8 sm:w-8", job.saved && "cursor-default text-v2-green-ink")}
                >
                  {job.saved ? <BookmarkIcon size={18} /> : <BookmarkOutlineIcon size={18} />}
                </IconButton>
              </Tooltip>
              <KebabMenu
                label={`More actions for ${label}`}
                className="-mr-1 -mt-1"
                items={[
                  { label: "Hide this job", onSelect: onHide },
                  { label: `Hide ${job.company}`, danger: true, onSelect: onHideCompany },
                ]}
              />
            </div>
          </div>
        </div>
      </SwipeCard>
    </li>
  );
}
