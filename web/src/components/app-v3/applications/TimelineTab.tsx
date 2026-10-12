"use client";

import type { ReactNode } from "react";
import {
  BookmarkIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  EmptyState,
  FileTextIcon,
  GlobeIcon,
  LinkIcon,
  MailIcon,
  PencilIcon,
  SparklesIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import { statusLabel, timeAgo, type TimelineEvent } from "@/lib/applications";

const KIND_ICON: Record<string, ReactNode> = {
  CREATED: <BookmarkIcon className="h-4 w-4" />,
  STATUS: <CheckCircleIcon className="h-4 w-4" />,
  NOTE: <PencilIcon className="h-4 w-4" />,
  INTERVIEW: <CalendarIcon className="h-4 w-4" />,
  MAIL: <MailIcon className="h-4 w-4" />,
  RESUME: <FileTextIcon className="h-4 w-4" />,
  ATTACHMENT: <LinkIcon className="h-4 w-4" />,
  FIELD: <PencilIcon className="h-4 w-4" />,
};

/** Where a change came from, in words and with a small icon (the source of truth for "who did this"). */
const SOURCE: Record<string, { label: string; icon: ReactNode }> = {
  EXTENSION: { label: "via the extension", icon: <ZapIcon className="h-3 w-3" /> },
  WEB: { label: "by you", icon: <GlobeIcon className="h-3 w-3" /> },
  INBOX: { label: "from an email", icon: <MailIcon className="h-3 w-3" /> },
  SYSTEM: { label: "", icon: <ClockIcon className="h-3 w-3" /> },
  ASSISTANT: { label: "by Kiwiply AI", icon: <SparklesIcon className="h-3 w-3" /> },
};

/** The line an event reads as: its own summary, else what the kind means. */
export function eventText(e: Pick<TimelineEvent, "kind" | "summary" | "toStatus">): string {
  if (e.summary) return e.summary;
  if (e.kind === "STATUS" && e.toStatus) return `Moved to ${statusLabel(e.toStatus)}`;
  if (e.kind === "CREATED") return "Added to your tracker";
  return e.kind.charAt(0) + e.kind.slice(1).toLowerCase();
}

/** The history of one application, newest first: what happened, where it came from, and when. */
export default function TimelineTab({ events, now }: { events: TimelineEvent[]; now: number }) {
  if (events.length === 0) {
    return <EmptyState variant="inline" title="Nothing has happened yet" description="Changes, notes and interviews show up here as they happen." />;
  }
  return (
    <ol aria-label="Timeline" className="relative ml-1 flex flex-col gap-3.5 border-l border-v2-line pl-5">
      {events.map((e, i) => {
        const src = SOURCE[e.source];
        return (
          <li key={e.id} className="relative" data-event-kind={e.kind}>
            <span
              aria-hidden
              className={cn(
                "absolute -left-[33px] grid h-6 w-6 place-items-center rounded-full border-2 border-paper",
                i === 0 ? "bg-v2-green text-white" : "bg-paper-2 text-ink-soft",
              )}
            >
              {KIND_ICON[e.kind] ?? <ClockIcon className="h-4 w-4" />}
            </span>
            <p className="text-[13.5px] font-semibold leading-snug text-ink">{eventText(e)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-v2-muted">
              {src && <span aria-hidden>{src.icon}</span>}
              {src?.label && <span>{src.label}</span>}
              {src?.label && <span aria-hidden>·</span>}
              <time dateTime={e.createdAt}>{timeAgo(e.createdAt, now)}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
