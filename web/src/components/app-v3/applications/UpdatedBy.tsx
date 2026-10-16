"use client";

import { useState } from "react";
import { ClockIcon, cn } from "@kiwiply/ui";
import { actorLine, relationTag, type AnyActor, type Viewer } from "@/lib/actors";
import { timeAgo } from "@/lib/applications";
import { BROWSER_DATE_DISPLAY, formatDate } from "@/lib/dates";

/** "Oct 15, 2026, 9:42 AM": the absolute time, in the viewer's own locale and zone. */
export function absoluteTime(iso: string | null | undefined): string {
  return formatDate(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, BROWSER_DATE_DISPLAY);
}

/** "2 hours ago", read against the clock at the moment the cell mounts (a list row is re-created whenever its page is fetched). */
export function RelTime({ iso }: { iso: string }) {
  const [now] = useState(() => Date.now());
  return <span suppressHydrationWarning>{timeAgo(iso, now)}</span>;
}

/** The small uppercase tag after a person's name (MARKETER, ADMIN, ...), the same chip the organization feed uses. */
export function RelationTag({ actor, me, className }: { actor: AnyActor; me?: Viewer | null; className?: string }) {
  const tag = relationTag(actor, me);
  if (!tag) return null;
  return (
    <span
      data-relation={tag.toLowerCase()}
      className={cn("rounded-full bg-paper-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-soft", className)}
    >
      {tag}
    </span>
  );
}

export interface UpdatedByProps {
  /** ISO time of the last change. */
  updatedAt: string | null | undefined;
  /** Who made it (`updatedBy`); null reads as "you" (a record whose writer was never recorded is the owner's own). */
  actor: AnyActor;
  me: Viewer | null | undefined;
  now: number;
  /** A phone has no hover: the line is a button that opens the Timeline, where the absolute time is printed inline. */
  phone?: boolean;
  onOpenTimeline?: () => void;
  className?: string;
}

/**
 * "Updated 2h ago by Sarah Chen MARKETER" (docs/change-audit/README.md section 3.1): one quiet meta line under the status chips. The title carries
 * the absolute time and who; on a phone the whole line is a button to the Timeline tab (the title is never the only carrier of the time).
 */
export default function UpdatedBy({ updatedAt, actor, me, now, phone = false, onOpenTimeline, className }: UpdatedByProps) {
  if (!updatedAt) return null;
  const when = timeAgo(updatedAt, now);
  const by = actorLine(actor, null, null, me);
  const abs = absoluteTime(updatedAt);
  const title = abs ? `${abs} ${by}` : by;
  const body = (
    <>
      <ClockIcon aria-hidden className="h-3.5 w-3.5 flex-none" />
      <span className="min-w-0 break-words" suppressHydrationWarning>
        Updated {when} {by}
        <RelationTag actor={actor} me={me} className="ml-1.5 align-middle" />
      </span>
    </>
  );
  const base = "flex items-start gap-1.5 text-[12px] leading-snug text-v2-muted";
  if (phone && onOpenTimeline) {
    return (
      <button type="button" aria-label="Open timeline" title={title} data-updated-by onClick={onOpenTimeline} className={cn(base, "min-h-10 w-full text-left", className)}>
        {body}
      </button>
    );
  }
  return (
    <p title={title} data-updated-by className={cn(base, className)}>
      {body}
    </p>
  );
}
