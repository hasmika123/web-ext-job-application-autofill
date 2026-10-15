"use client";

import { useState, type ReactNode } from "react";
import {
  BookmarkIcon,
  Button,
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
import { actorLine, type Viewer } from "@/lib/actors";
import { getApplicationEvents, statusLabel, timeAgo, type FieldChange, type TimelineEvent } from "@/lib/applications";
import { RelationTag, absoluteTime } from "./UpdatedBy";

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

/** The channel's small icon (who did it is the actor line; this is only the picture next to it). */
const SOURCE_ICON: Record<string, ReactNode> = {
  EXTENSION: <ZapIcon className="h-3 w-3" />,
  WEB: <GlobeIcon className="h-3 w-3" />,
  INBOX: <MailIcon className="h-3 w-3" />,
  SYSTEM: <ClockIcon className="h-3 w-3" />,
  ASSISTANT: <SparklesIcon className="h-3 w-3" />,
};

/**
 * Mirrors the server's default `tracker.detail.eventsMax`: when the detail brought this many rows there may be more, so "Show all history" is
 * offered. A hint, not a limit: the full list comes from the paged history endpoint and its `total`.
 */
const DETAIL_EVENTS_HINT = 50;

/** The line an event reads as: its own summary, else what the kind means. */
export function eventText(e: Pick<TimelineEvent, "kind" | "summary" | "toStatus">): string {
  if (e.summary) return e.summary;
  if (e.kind === "STATUS" && e.toStatus) return `Moved to ${statusLabel(e.toStatus)}`;
  if (e.kind === "CREATED") return "Added to your tracker";
  return e.kind.charAt(0) + e.kind.slice(1).toLowerCase();
}

/** Field names as words; a field the server names that is not here reads as its own name. */
const FIELD_WORDS: Record<string, string> = {
  status: "status",
  nextAction: "next step",
  nextActionAt: "next step date",
  starred: "star",
  archived: "archived",
  resumeId: "resume",
  outcome: "offer outcome",
  body: "text",
  pinned: "pinned",
  startsAt: "start",
  endsAt: "end",
  kind: "type",
  tz: "time zone",
  location: "place",
  interviewer: "interviewer",
  notes: "notes",
  attachment: "file",
  jobType: "job type",
  jobMode: "work mode",
  jobUrl: "link",
  roleTitle: "title",
  salary: "pay",
  email: "email",
  company: "company",
  jobDescription: "description",
  submissionConfirmed: "submission",
  appliedAt: "applied date",
};

const fieldWord = (f: string): string => FIELD_WORDS[f] ?? f;

/** A code or ISO instant as the person reads it ("INTERVIEW" is "Interview", "2026-10-17T09:00:00Z" a date). */
function valueWord(f: string, v: string): string {
  if (f === "status") return statusLabel(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return absoluteTime(v) || v;
  if (v === "true") return "yes";
  if (v === "false") return "no";
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "status Applied → Interview", "next step" (a free-text field names itself and nothing else). */
export function changeChip(c: FieldChange): string {
  const name = fieldWord(c.f);
  if (c.from == null && c.to == null) return name;
  const from = c.from == null ? "none" : valueWord(c.f, c.from);
  const to = c.to == null ? "none" : valueWord(c.f, c.to);
  return `${name} ${from} → ${to}`;
}

/**
 * The history of one application, newest first: what happened, who did it, how it got there, and when
 * (docs/change-audit/README.md section 3.3). The actor line comes from the event's own actor and kind, never from its channel.
 */
export default function TimelineTab({
  events: initial,
  now,
  me,
  applicationId,
  phone = false,
}: {
  events: TimelineEvent[];
  now: number;
  me?: Viewer | null;
  /** Enables "Show all history" (the paged endpoint). */
  applicationId?: number;
  phone?: boolean;
}) {
  const [all, setAll] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const events = all ?? initial;
  const mayHaveMore = all === null && applicationId !== undefined && initial.length >= DETAIL_EVENTS_HINT;

  async function showAll() {
    if (applicationId === undefined) return;
    setLoading(true);
    setFailed(false);
    const out: TimelineEvent[] = [];
    let page = 0;
    for (;;) {
      const r = await getApplicationEvents(applicationId, page);
      if (r.kind !== "ok") {
        setFailed(true);
        setLoading(false);
        return;
      }
      out.push(...r.data.items);
      if (r.data.items.length === 0 || out.length >= r.data.total) break;
      page += 1;
    }
    setAll(out);
    setLoading(false);
  }

  if (events.length === 0) {
    return <EmptyState variant="inline" title="Nothing has happened yet" description="Changes, notes and interviews show up here as they happen." />;
  }
  return (
    <>
      <ol aria-label="Timeline" className="relative ml-1 flex flex-col gap-3.5 border-l border-v2-line pl-5">
        {events.map((e, i) => {
          const abs = absoluteTime(e.createdAt);
          const details = e.kind === "CREATED" ? [] : (e.changes ?? []);
          return (
            <li key={e.id} className="relative" data-event-kind={e.kind} data-actor-kind={e.actorKind ?? undefined}>
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
                <span aria-hidden>{SOURCE_ICON[e.source]}</span>
                <span>{actorLine(e.actor, e.actorKind, e.source, me)}</span>
                <RelationTag actor={e.actor} me={me} />
                <span aria-hidden>·</span>
                <time dateTime={e.createdAt} title={abs} suppressHydrationWarning>
                  {timeAgo(e.createdAt, now)}
                </time>
                {phone && abs && (
                  <>
                    <span aria-hidden>·</span>
                    <span data-absolute-time>{abs}</span>
                  </>
                )}
              </p>
              {details.length > 1 && (
                <details className="mt-1 text-[12px] text-v2-muted">
                  <summary className="cursor-pointer select-none">Details</summary>
                  <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="What changed">
                    {details.map((c) => (
                      <li key={c.f} className="rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft">
                        {changeChip(c)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      {mayHaveMore && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => void showAll()} disabled={loading} className="min-h-10">
            {loading ? "Loading history…" : failed ? "Couldn't load it. Try again" : "Show all history"}
          </Button>
        </div>
      )}
    </>
  );
}
