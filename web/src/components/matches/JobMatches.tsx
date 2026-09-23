"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Meter, Switch, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

/**
 * Daily job matches (Phase 13.6c, Pro). The switch comes first because it IS the consent: while it's
 * on, a summary of the user's resume and a few preferences go to Google Gemini every night, and the
 * caption under it says exactly that. Then today's list, best first — each match can be opened,
 * saved to the board (the server builds the application from the stored posting) or dismissed.
 *
 * Switching on matches straight away in the background, so the page refreshes itself for a minute
 * while the first list arrives. An empty list is a real answer: nothing new fit today.
 */

export interface MatchSetting {
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastCandidates: number | null;
  lastMatched: number | null;
}

export interface Match {
  id: number;
  score: number;
  reason: string | null;
  title: string;
  company: string;
  location: string | null;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE" | null;
  employmentType: string | null;
  url: string;
  applyUrl: string | null;
  publishedAt: string;
  ats: string;
}

export interface MatchesData {
  setting: MatchSetting;
  matches: Match[];
}

const WORKPLACE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
const POSTED = { month: "short", day: "numeric" } as const;

/** What the last run means for the user, when it didn't simply produce a list. */
function statusNote(s: MatchSetting): string | null {
  switch (s.lastStatus) {
    case "NO_RESUME":
      return "Add a resume first — matching reads your latest roles and skills from your default resume.";
    case "NO_CANDIDATES":
      return "Nothing new fit you this time. We look again every morning.";
    case "BUDGET_EXHAUSTED":
      return "You've used this month's Kiwiply AI, so matching is paused until the 1st.";
    case "DISABLED":
      return "Matching is paused right now. We'll pick it up again as soon as it's back.";
    case "NOT_PRO":
      return "Matching stopped because your Pro plan ended.";
    case "ERROR":
      return "The last run didn't finish. We'll try again tomorrow morning.";
    default:
      return null;
  }
}

export default function JobMatches({ isPro, data }: { isPro: boolean; data: MatchesData | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<number | "switch" | null>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());

  const setting = data?.setting;
  const waitingForFirst = !!setting?.enabled && !setting.lastRunAt;

  // Just switched on: the first match runs in the background — refresh for about a minute.
  useEffect(() => {
    if (!waitingForFirst) return;
    let ticks = 0;
    const t = setInterval(() => {
      ticks += 1;
      router.refresh();
      if (ticks >= 15) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [waitingForFirst, router]);

  if (!isPro) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Fresh jobs that fit you, every morning</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Each night Kiwiply reads new postings straight from company job boards (Greenhouse, Lever and Ashby), keeps
          the ones posted in the last two days, and scores them against your resume and preferences — with the reason.
          Save one to your board in a click, with its description ready for resume fit and tailoring.
        </p>
        <Link href="/pricing" className={cn(buttonVariants("primary", "sm"), "mt-4 inline-flex")}>
          Part of Pro →
        </Link>
      </div>
    );
  }

  if (!data || !setting) {
    return <p className="text-sm text-ink-soft">Couldn&apos;t load your matches. Please refresh the page.</p>;
  }

  async function toggle(on: boolean) {
    setBusy("switch");
    const res = await fetch("/api/job-matches/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: on }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "error", title: body.error ?? "Couldn't change that right now." });
      return;
    }
    if (on) toast({ variant: "success", title: "Daily matches are on — finding your first ones now." });
    router.refresh();
  }

  async function act(m: Match, action: "save" | "dismiss") {
    setBusy(m.id);
    const res = await fetch(`/api/job-matches/${m.id}/${action}`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "error", title: body.error ?? "That didn't work." });
      return;
    }
    setGone((g) => new Set(g).add(m.id));
    if (action === "save") toast({ variant: "success", title: `Saved ${m.title} at ${m.company} to your board.` });
  }

  const shown = data.matches.filter((m) => !gone.has(m.id));
  const note = statusNote(setting);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <Switch
          label="Daily job matches"
          description={
            <>
              While this is on, each night a summary of your default resume, your location, work preference, relocation and
              sponsorship answers, and up to 50 new postings are sent to Google Gemini to score how well each fits you. See
              the{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </>
          }
          checked={setting.enabled}
          disabled={busy === "switch"}
          onCheckedChange={(v) => void toggle(v)}
        />
        {setting.enabled && setting.lastRunAt && (
          <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
            Last checked <LocalDate iso={setting.lastRunAt} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
            {setting.lastCandidates ? ` · ${setting.lastCandidates} new postings looked at` : ""}.
          </p>
        )}
      </div>

      {!setting.enabled ? (
        <p className="text-[13.5px] text-ink-soft">
          Switch matches on and your first list arrives in a minute or so, then fresh every morning.
        </p>
      ) : waitingForFirst ? (
        <p role="status" className="text-[13.5px] text-ink-soft">
          Finding your first matches…
        </p>
      ) : shown.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-line p-6 text-center">
          <p className="text-[14px] font-medium text-ink">No new matches right now</p>
          <p className="mt-1 text-[13px] text-muted">{note ?? "Nothing new fit you well enough to show. We look again every morning."}</p>
        </div>
      ) : (
        <>
          {note && setting.lastStatus !== "NO_CANDIDATES" && (
            <p role="status" className="text-[13px] text-ink-soft">
              {note}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {shown.map((m) => (
              <li key={m.id} className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow)]">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[15px] font-bold text-ink hover:underline"
                    >
                      {m.title}
                    </a>
                    <div className="mt-0.5 text-[13px] text-ink-soft">
                      {m.company}
                      {m.location && ` · ${m.location}`}
                      {m.workplaceType && ` · ${WORKPLACE[m.workplaceType] ?? ""}`}
                    </div>
                  </div>
                  <div className="w-20 flex-none text-right">
                    <div className="font-display text-xl font-bold leading-none text-ink">{m.score}%</div>
                    <Meter value={m.score} label={`${m.title} match`} valueText={`${m.score} percent`} neutral className="mt-1.5 h-1.5" />
                  </div>
                </div>
                {m.reason && <p className="mt-2 text-[13px] text-ink-soft">{m.reason}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    onClick={() => void act(m, "save")}
                    disabled={busy === m.id}
                    className={cn(buttonVariants("primary", "sm"), "disabled:opacity-60")}
                  >
                    Save to board
                  </button>
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-accent-deep hover:underline">
                    View posting ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => void act(m, "dismiss")}
                    disabled={busy === m.id}
                    className="text-[13px] font-semibold text-ink-soft hover:text-ink hover:underline disabled:opacity-60"
                  >
                    Not for me
                  </button>
                  <span className="ml-auto text-[12px] text-muted">
                    Posted <LocalDate iso={m.publishedAt} options={POSTED} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
