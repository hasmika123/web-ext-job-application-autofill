"use client";

import { buttonVariants, cn, ExternalLinkIcon, type ButtonSize, type ButtonVariant } from "@kiwiply/ui";
import { NO_LINK_TOOLTIP, QUICK_INFO_LABEL, openLinkLabel, type JobSource } from "@/lib/ent/consultant-ws/jobSource";
import { Pill, SampleMark } from "./parts";

/**
 * "Open job link": opens the marketer's source link in a new tab (the consultant applies there with the Kiwiply extension). With no usable
 * https link it is a disabled control with an honest tooltip. Never navigates this tab; `noopener noreferrer` always.
 */
export default function JobLinkButton({
  title,
  source,
  variant = "accent",
  size = "sm",
  className,
}: {
  title: string;
  source: Pick<JobSource, "sourceUrl" | "sourceName">;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  if (source.sourceUrl) {
    return (
      <a
        href={source.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-job-link
        aria-label={openLinkLabel(title, source)}
        className={buttonVariants(variant, size, cn("min-h-9", className))}
      >
        Open job link
        <ExternalLinkIcon size={14} />
      </a>
    );
  }
  return (
    <span title={NO_LINK_TOOLTIP} data-job-link-missing className={cn("inline-flex", className)}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`Open job link for ${title}: ${NO_LINK_TOOLTIP}`}
        className={buttonVariants(variant, size, "min-h-9")}
      >
        Open job link
        <ExternalLinkIcon size={14} />
      </button>
    </span>
  );
}

/**
 * The marketer's quick info for a job, led by the label, with the source site name and the Sample mark for demo stand-in rows. Renders nothing
 * when the marketer has entered neither a note nor a source name.
 */
export function QuickInfo({ source, clamp = false, className }: { source: JobSource; clamp?: boolean; className?: string }) {
  if (!source.quickInfo && !source.sourceName) return null;
  return (
    <div data-quick-info className={cn("min-w-0 text-[13px] text-ink-soft", className)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-semibold text-muted">{QUICK_INFO_LABEL}</span>
        {source.sourceName ? <Pill tone="slate">{source.sourceName}</Pill> : null}
        {source.sourceSample ? <SampleMark /> : null}
      </p>
      {source.quickInfo ? <p className={cn("mt-1 whitespace-pre-line leading-relaxed", clamp && "line-clamp-2")}>{source.quickInfo}</p> : null}
    </div>
  );
}
