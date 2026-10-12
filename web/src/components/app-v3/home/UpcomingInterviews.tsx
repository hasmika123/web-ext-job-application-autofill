"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, EmptyState, ErrorState, Skeleton, cn } from "@kiwiply/ui";
import { CompanyTile, SectionCard } from "@/components/app-v2/common";
import { dayAndTime } from "@/lib/applications";
import {
  INTERVIEW_OUTCOMES,
  interviewTitle,
  listInterviews,
  needsOutcome,
  setInterviewOutcome,
  type Interview,
  type InterviewOutcome,
} from "@/lib/interviews";

/** How far back the card looks for an interview that still has no result, and how far ahead for the next ones. */
export const LOOK_BACK_DAYS = 14;
export const LOOK_AHEAD_DAYS = 30;
/** At most this many rows (the full list is on the Applications page). */
export const MAX_SHOWN = 4;

const DAY_MS = 86_400_000; // config-literal-ok: milliseconds in a day, a unit conversion
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Splits a feed into "how did it go?" (over, no result) and upcoming (soonest first); pure given `now`. */
export function splitInterviews(rows: Interview[], now: Date): { ask: Interview[]; upcoming: Interview[] } {
  const t = now.getTime();
  const ask = rows.filter((i) => needsOutcome(i, now)).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const upcoming = rows.filter((i) => new Date(i.startsAt).getTime() >= t).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return { ask, upcoming };
}

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; rows: Interview[]; at: number };

/**
 * Upcoming Interviews card: what is coming up (from `GET /api/interviews`), and above it any interview that has
 * happened and still has no result ("How did it go?", one tap). Quiet and honest when there is nothing: an empty
 * state that points at where interviews are added, never an invented row.
 */
export default function UpcomingInterviews() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;
    const now = Date.now();
    void listInterviews({ from: ymd(now - LOOK_BACK_DAYS * DAY_MS), to: ymd(now + LOOK_AHEAD_DAYS * DAY_MS) }).then((r) => {
      if (!live) return;
      setState(r.kind === "ok" ? { kind: "ready", rows: r.data, at: Date.now() } : { kind: "error", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  async function answer(i: Interview, outcome: InterviewOutcome) {
    setState((s) => (s.kind === "ready" ? { ...s, rows: s.rows.map((x) => (x.id === i.id ? { ...x, outcome } : x)) } : s));
    const r = await setInterviewOutcome(i.applicationId, i.id, outcome);
    if (r.kind === "error") load();
  }

  return (
    <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/applications?status=INTERVIEW" }}>
      {state.kind === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Loading interviews" className="space-y-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : state.kind === "error" ? (
        <ErrorState variant="inline" what="your interviews" description={state.message} onRetry={load} />
      ) : (
        <Ready rows={state.rows} now={state.at} onAnswer={answer} />
      )}
    </SectionCard>
  );
}

function Ready({ rows, now, onAnswer }: { rows: Interview[]; now: number; onAnswer(i: Interview, o: InterviewOutcome): void }) {
  const { ask, upcoming } = splitInterviews(rows, new Date(now));
  if (ask.length === 0 && upcoming.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title="No interviews coming up"
        description="When a recruiter gives you a date, add it to the application and it shows up here."
        action={
          <Link href="/applications" className="text-[13px] font-bold text-v2-blue-ink hover:underline">
            Open your applications
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {ask.slice(0, MAX_SHOWN).map((i) => (
        <div key={i.id} data-interview-ask={i.id} className="rounded-xl border border-v2-green/30 bg-v2-green-soft/50 p-3">
          <p className="text-[13.5px] font-bold text-ink">How did it go with {i.company ?? "them"}?</p>
          <p className="text-[12.5px] text-v2-muted">{interviewTitle(i)}</p>
          <div role="group" aria-label={`Outcome of ${interviewTitle(i)}`} className="mt-2 flex flex-wrap gap-1.5">
            {INTERVIEW_OUTCOMES.filter((o) => o.value !== "PENDING").map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onAnswer(i, o.value)}
                className={cn("inline-flex min-h-9 items-center rounded-full border border-v2-line bg-paper px-3 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 motion-safe:active:scale-95")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {upcoming.length > 0 && (
        <ul className="divide-y divide-v2-line/60">
          {upcoming.slice(0, MAX_SHOWN).map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <CompanyTile name={i.company ?? "?"} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-ink">{i.company ?? "Interview"}</span>
                <span className="block truncate text-[12.5px] text-v2-muted">
                  {interviewTitle({ kind: i.kind, company: null, roleTitle: i.roleTitle })} · {dayAndTime(i.startsAt)}
                </span>
              </span>
              <Link href="/interview-prep" className="inline-flex flex-none items-center gap-1 text-[12.5px] font-bold text-v2-blue-ink hover:underline">
                Prep
                <ArrowRightIcon size={13} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
