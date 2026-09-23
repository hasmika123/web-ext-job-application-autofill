"use client";

import { useState } from "react";
import Link from "next/link";
import { Meter } from "@/components/ui";
import { JobFitReport, type JobFitData } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

/**
 * "Resume fit" in the board's detail panel (Phase 13.2, Pro): score every resume against this
 * application's job description in one click, best first, and link the winner to the application.
 *
 * Nothing runs until the user asks — the click is their consent to send the job description and
 * their resumes to the AI provider, which the caption says. The server caches the answer per
 * (posting × resumes), so asking again, or reopening the panel and asking, costs nothing.
 *
 * 13.3: each scored resume can open its job-fit report — what it covers, what it's missing, and
 * red flags — fetched on request and cached server-side the same way.
 */

type Score = { resumeId: number; label: string; score: number; why: string };
type FitResponse = {
  best?: Score | null;
  scores?: Score[];
  cached?: boolean;
  quotaExceeded?: boolean;
  resetsAt?: string;
  noResumes?: boolean;
  noJobDescription?: boolean;
  disabled?: boolean;
  error?: string;
  proRequired?: boolean;
};

/** Shorter than this the server won't score it (a page summary, not a job description). */
const MIN_JD_CHARS = 200;

export default function ResumeFit({
  appId,
  jobDescription,
  isPro,
  linkedResumeId,
  onLink,
}: {
  appId: number;
  jobDescription: string | null | undefined;
  isPro: boolean;
  linkedResumeId: number | null;
  onLink: (resumeId: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<Score[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  // 13.3 — the job-fit report per resume id: loading, the report, or a message.
  const [reports, setReports] = useState<Record<number, JobFitData | "loading" | { message: string }>>({});

  async function openReport(resumeId: number) {
    if (reports[resumeId] && reports[resumeId] !== "loading" && !("message" in (reports[resumeId] as object))) {
      setReports((r) => {
        const next = { ...r };
        delete next[resumeId]; // a second click folds it away
        return next;
      });
      return;
    }
    setReports((r) => ({ ...r, [resumeId]: "loading" }));
    try {
      const res = await fetch(`/api/applications/${appId}/job-fit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumeId }),
      });
      const data = (await res.json().catch(() => ({}))) as { fit?: JobFitData; quotaExceeded?: boolean; resetsAt?: string; error?: string };
      if (res.ok && data.fit) {
        setReports((r) => ({ ...r, [resumeId]: data.fit as JobFitData }));
      } else if (data.quotaExceeded) {
        const when = formatDate(data.resetsAt, { month: "long", day: "numeric" });
        setReports((r) => ({ ...r, [resumeId]: { message: `You've used this month's Kiwiply AI — it resets${when ? ` on ${when}` : " next month"}.` } }));
      } else {
        setReports((r) => ({ ...r, [resumeId]: { message: data.error ?? "Couldn't check the fit right now. Please try again." } }));
      }
    } catch {
      setReports((r) => ({ ...r, [resumeId]: { message: "Something went wrong. Please try again." } }));
    }
  }
  const hasJd = (jobDescription ?? "").replace(/\s+/g, " ").trim().length >= MIN_JD_CHARS;

  async function check() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/applications/${appId}/resume-fit`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as FitResponse;
      if (res.status === 402 || data.proRequired) {
        setUpsell(true);
        return;
      }
      if (!res.ok) {
        setNote(data.error ?? "Couldn't score your resumes right now. Please try again.");
        return;
      }
      if (data.scores && data.scores.length) {
        setScores(data.scores);
      } else if (data.quotaExceeded) {
        const when = formatDate(data.resetsAt, { month: "long", day: "numeric" });
        setNote(`You've used this month's Kiwiply AI — it resets${when ? ` on ${when}` : " next month"}.`);
      } else if (data.noResumes) {
        setNote("Add a resume first — there's nothing to score yet.");
      } else if (data.noJobDescription) {
        setNote("This job's description is too short to judge. Paste the full description via Edit.");
      } else if (data.disabled) {
        setNote("Resume matching is switched off right now.");
      } else {
        setNote("Couldn't score your resumes right now. Please try again.");
      }
    } catch {
      setNote("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <h3 className="font-display text-base font-semibold text-ink">Resume fit</h3>

      {!isPro || upsell ? (
        <p className="mt-2 text-[13px] text-muted">
          See which of your resumes fits this job best, with a score and the reason.{" "}
          <Link href="/pricing" className="font-semibold text-accent-deep hover:underline">
            Part of Pro →
          </Link>
        </p>
      ) : !hasJd ? (
        <p className="mt-2 text-[13px] text-muted">
          Add the full job description (via Edit) to see which of your resumes fits it best.
        </p>
      ) : scores ? (
        <ul className="mt-2 flex flex-col gap-2">
          {scores.map((s, i) => {
            const linked = linkedResumeId === s.resumeId;
            return (
              <li key={s.resumeId} className={cn("rounded-[var(--radius)] border p-3", i === 0 ? "border-accent bg-accent-soft/40" : "border-line")}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink" title={s.label}>
                    {s.label}
                  </span>
                  {i === 0 && <span className="flex-none text-[11px] font-bold uppercase tracking-wide text-accent-deep">Best match</span>}
                  <span className="flex-none text-[13px] font-bold text-ink">{s.score}%</span>
                </div>
                <Meter value={s.score} label={`${s.label} fit`} valueText={`${s.score} percent`} neutral className="mt-2 h-1.5" />
                {s.why && <p className="mt-1.5 text-[12.5px] text-muted">{s.why}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {linked ? (
                    <span className="text-[12px] font-semibold text-accent-deep">Linked to this application</span>
                  ) : (
                    <button type="button" onClick={() => onLink(s.resumeId)} className="text-[12px] font-semibold text-accent-deep hover:underline">
                      Link this resume
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void openReport(s.resumeId)}
                    disabled={reports[s.resumeId] === "loading"}
                    aria-expanded={!!reports[s.resumeId] && reports[s.resumeId] !== "loading"}
                    className="text-[12px] font-semibold text-ink-soft hover:text-ink hover:underline disabled:opacity-60"
                  >
                    {reports[s.resumeId] === "loading" ? "Checking…" : "See gaps & red flags"}
                  </button>
                </div>
                {(() => {
                  const rep = reports[s.resumeId];
                  if (!rep || rep === "loading") return null;
                  if ("message" in rep) return <p role="status" className="mt-2 text-[12.5px] font-medium text-ink-soft">{rep.message}</p>;
                  return <JobFitReport fit={rep} hideScore className="mt-3 border-t border-line pt-3" />;
                })()}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-2">
          <button type="button" onClick={() => void check()} disabled={busy} className={cn(buttonVariants("ghost", "sm"), "disabled:opacity-60")}>
            {busy ? "Scoring your resumes…" : "Check which resume fits"}
          </button>
          <p className="mt-1.5 text-[12px] text-muted">
            Sends this job description and your resumes to Google Gemini to score them — see the{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      )}

      {note && (
        <p role="status" className="mt-2 text-[12.5px] font-medium text-ink-soft">
          {note}
        </p>
      )}
    </div>
  );
}
