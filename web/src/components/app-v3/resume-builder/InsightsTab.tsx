"use client";

import { useEffect, useState } from "react";
import type { ReactNode, Ref } from "react";
import { ArrowRightIcon, CheckCircleIcon, ChartIcon, MascotCheer, Meter, cn } from "@kiwiply/ui";
import type { ResumeScoreGroup, ResumeScoreReport } from "@kiwiply/ui";
import RailCard from "./RailCard";

/** The screen-reader announcement of the score follows edits after this long (DESIGN 10.11: "Score 82%", debounced 2 s). */
// config-literal-ok: accessibility announcement debounce (DESIGN 10.11), not a builder timing
const ANNOUNCE_MS = 2000;

/** Applicable ATS (G6) rules that fail: "N of M ATS checks need attention". */
export function atsCheckCounts(report: ResumeScoreReport): { failing: number; total: number } | null {
  const g = report.groups.find((x) => x.id === "G6");
  if (!g) return null;
  const rules = g.rules.filter((r) => r.applicable);
  return { failing: rules.filter((r) => !r.pass).length, total: rules.length };
}

function ChecklistLine({ group, trailing }: { group: ResumeScoreGroup; trailing?: ReactNode }) {
  return (
    <li data-group={group.id} data-pass={group.pass} className="flex items-center gap-2.5 text-[13.5px] text-ink">
      {group.pass ? (
        <CheckCircleIcon className="h-[18px] w-[18px] flex-none text-v2-green" />
      ) : (
        <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line" />
      )}
      <span className="sr-only">{group.pass ? "Done: " : "To do: "}</span>
      <span className="min-w-0 flex-1">{group.line}</span>
      {trailing}
    </li>
  );
}

/**
 * The Insights tab (DESIGN 10.7): the Resume Score card — the ring, the band title and body from the
 * settings, the mascot, one checklist line per group (a sixth, "ATS-ready formatting", on ATS templates)
 * and "View tips ->" — plus the "N of M ATS checks need attention" line when an ATS template has
 * failures. A pure view of a `ScoreReport`; the editor computes it live (`useScoreReport`).
 */
export default function InsightsTab({
  report,
  good,
  onViewTips,
  viewTipsRef,
}: {
  report: ResumeScoreReport;
  /** The score is at or above the pass threshold: the band title is drawn in green. */
  good: boolean;
  /** Opens the tips sheet, optionally filtered to a group (the ATS line passes `G6`). */
  onViewTips: (group?: "G6") => void;
  /** The "View tips" button, so the sheet can return focus to it. */
  viewTipsRef?: Ref<HTMLButtonElement>;
}) {
  const [announced, setAnnounced] = useState(report.score);
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(report.score), ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [report.score]);

  const ats = atsCheckCounts(report);
  const last = report.groups.length - 1;

  return (
    <div className="flex flex-col gap-3" data-insights>
      <RailCard title={<><ChartIcon className="h-4 w-4 text-v2-green" />Resume Score</>}>
        <div className="relative">
          <div className="flex items-center gap-3 pr-20 max-[420px]:pr-0">
            <Meter variant="ring" size={64} value={report.score} label="Resume score" valueText={`${report.score} percent`} />
            <div className="min-w-0">
              <p data-band className={cn("font-display text-[16px] font-bold leading-tight", good ? "text-v2-green-ink" : "text-ink")}>
                {report.band.title}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{report.band.body}</p>
            </div>
          </div>
          <MascotCheer className="pointer-events-none absolute right-0 top-[-6px] h-[72px] w-[72px] max-[420px]:hidden" />
        </div>

        <ul aria-label="Resume checklist" className="mt-4 flex flex-col gap-2.5">
          {report.groups.map((g, i) => (
            <ChecklistLine
              key={g.id}
              group={g}
              trailing={
                i === last ? (
                  <button
                    ref={viewTipsRef}
                    type="button"
                    onClick={() => onViewTips()}
                    className="inline-flex min-h-9 flex-none items-center gap-1 rounded-xl border border-v2-line/70 bg-paper px-3 text-[13px] font-bold text-v2-blue hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
                  >
                    View tips <ArrowRightIcon className="h-3.5 w-3.5" />
                  </button>
                ) : undefined
              }
            />
          ))}
        </ul>

        <p className="mt-3 text-[11.5px] text-muted">Rules-based score — no AI used</p>
        <p role="status" className="sr-only">
          Score {announced}%
        </p>
      </RailCard>

      {ats && ats.failing > 0 && (
        <button
          type="button"
          data-ats-line
          onClick={() => onViewTips("G6")}
          className="flex min-h-11 items-center gap-2 rounded-2xl border border-v2-line/70 bg-paper px-4 py-2 text-left text-[13px] text-ink shadow-v2-soft hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0 flex-1">
            <b className="font-bold">
              {ats.failing} of {ats.total}
            </b>{" "}
            ATS checks need attention
          </span>
          <ArrowRightIcon className="h-3.5 w-3.5 flex-none text-v2-blue" />
        </button>
      )}
    </div>
  );
}
