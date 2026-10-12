"use client";

import Link from "next/link";
import { BookmarkIcon, CheckCircleIcon, cn } from "@kiwiply/ui";
import { CompanyTile, KebabMenu } from "@/components/app-v2/common";
import { shortDay, statusLabel, timeAgo, type Application } from "@/lib/applications";

export type SavedTab = "to-apply" | "applied" | "not-interested";

const MODE: Record<string, string> = { ON_SITE: "On-site", HYBRID: "Hybrid", REMOTE: "Remote" };
const TYPE: Record<string, string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", INTERNSHIP: "Internship", TEMPORARY: "Temporary" };

/** "Remote · Full-time" style tags a card shows under the title (only what the posting actually said). */
export function savedTags(a: Pick<Application, "jobMode" | "jobType">): string[] {
  return [a.jobMode ? MODE[a.jobMode] : null, a.jobType ? TYPE[a.jobType] : null].filter((t): t is string => !!t);
}

/**
 * One saved job: who, what, where, how long ago it was saved, and the one thing to do next. "Apply" opens the posting
 * in a new tab (the extension fills it there); the menu moves it along (mark applied, remove, put back). The title
 * opens the job's page in My Applications, where its timeline and notes live.
 */
export default function SavedCard({
  job,
  tab,
  view,
  now,
  onOpen,
  onMarkApplied,
  onRemove,
  onRestore,
}: {
  job: Application;
  tab: SavedTab;
  view: "list" | "grid";
  now: number;
  onOpen(): void;
  onMarkApplied(): void;
  onRemove(): void;
  onRestore(): void;
}) {
  const label = `${job.roleTitle} at ${job.company}`;
  const tags = savedTags(job);
  const meta = [job.company, job.location, job.salary].filter(Boolean).join(" · ");
  const applyClass = "inline-flex h-10 items-center whitespace-nowrap rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95";
  return (
    <li
      data-saved-id={job.id}
      className={cn(
        "flex flex-col gap-3",
        // `cn` does not merge conflicting utilities, so each layout carries only its own.
        view === "grid" ? "rounded-2xl border border-v2-line p-4 md:justify-between" : "py-4 md:flex-row md:items-center md:gap-4",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <CompanyTile name={job.company} size={46} />
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">
            <Link href={`/applications?app=${job.id}`} className="break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {job.roleTitle}
            </Link>
          </h3>
          <p className="mt-0.5 break-words text-[13px] text-v2-ink-soft">{meta}</p>
          {tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="rounded-md bg-v2-blue-soft px-2 py-0.5 text-[12px] font-medium text-v2-blue">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-nowrap">
        <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] leading-tight text-v2-muted md:w-[136px]">
          <BookmarkIcon className="h-3.5 w-3.5 flex-none text-v2-blue" />
          {tab === "applied" ? `Applied ${shortDay(job.appliedAt ?? job.createdAt, now) || ""}` : `Saved ${timeAgo(job.createdAt, now)}`}
        </p>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {tab === "applied" ? (
            <span className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-v2-green-soft px-4 text-[13.5px] font-bold text-v2-green-ink">
              <CheckCircleIcon className="h-4 w-4" /> {statusLabel(job.status)}
            </span>
          ) : job.jobUrl ? (
            <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" className={applyClass} aria-label={`Apply to ${label}`}>
              Apply
            </a>
          ) : (
            <span className={cn(applyClass, "cursor-not-allowed opacity-50")} aria-disabled="true" title="This job has no link saved">
              Apply
            </span>
          )}
          <KebabMenu
            label={`More actions for ${label}`}
            items={[
              { label: "View details", onSelect: onOpen },
              ...(tab === "to-apply" ? [{ label: "Mark as applied", onSelect: onMarkApplied }, { separator: true as const }, { label: "Remove from saved", danger: true, onSelect: onRemove }] : []),
              ...(tab === "not-interested" ? [{ label: "Put back in To apply", onSelect: onRestore }] : []),
            ]}
          />
        </div>
      </div>
    </li>
  );
}
