"use client";

import type { RefObject } from "react";
import { ArrowRightIcon, CheckCircleIcon, LightbulbIcon, LockIcon, SideSheet, SparklesIcon } from "@kiwiply/ui";
import type { ResumeScoreGroupId, ResumeScoreReport } from "@kiwiply/ui";
import { RIGHT_SHEET_WIDTH, type SheetMode } from "./state/ui";
import UpgradeLink from "./UpgradeLink";

const TRIM_CLASS =
  "mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-v2-green-soft px-3 text-[12.5px] font-semibold text-v2-green-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11";

/** The failing, applicable rules of a report, grouped in checklist order (heaviest rule first), optionally for one group. */
export function tipGroups(report: ResumeScoreReport, only: ResumeScoreGroupId | null = null) {
  return report.groups
    .filter((g) => only === null || g.id === only)
    .map((g) => ({
      group: g,
      tips: g.rules.filter((r) => r.applicable && !r.pass).sort((a, b) => b.weight - a.weight),
    }))
    .filter((x) => x.tips.length > 0);
}

/**
 * "View tips" (DESIGN 10.7): every failing rule of the Resume Score with its message and a "Go to" that
 * scrolls to and focuses the offending field (a rule whose fix is a missing section opens Add Section).
 * Rendered at the top level of the editor (a fixed overlay inside the rail's own sheet would be placed
 * relative to that sheet's transform); a right `SideSheet`, fullscreen on a phone.
 */
export default function TipsSheet({
  open,
  mode,
  report,
  only,
  onClose,
  onGoTo,
  trim = null,
  returnFocusTo,
}: {
  open: boolean;
  mode: SheetMode;
  report: ResumeScoreReport;
  /** Show one group only (the "N of M ATS checks" line passes `G6`). */
  only: ResumeScoreGroupId | null;
  onClose: () => void;
  /** A tip's target ref: a `data-field` id, or `add:<KIND>`. */
  onGoTo: (ref: string) => void;
  /** AI "Trim the longest bullets" on the page-count tip: `allowed` false = the Pro lock (R4.2). Null = no such button. */
  trim?: { allowed: boolean; onTrim: () => void; onLocked: () => void } | null;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const groups = tipGroups(report, only);
  const count = groups.reduce((n, g) => n + g.tips.length, 0);
  return (
    <SideSheet
      id="rb-tips-sheet"
      side="right"
      mode={mode}
      open={open}
      width={RIGHT_SHEET_WIDTH}
      title={only === "G6" ? "ATS checks" : "Tips to improve"}
      description={count === 0 ? "Nothing to fix" : `${count} ${count === 1 ? "thing" : "things"} to fix, biggest first`}
      icon={<LightbulbIcon className="h-5 w-5" />}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      {count === 0 ? (
        <div className="flex items-start gap-3 rounded-xl bg-paper-2/60 p-4 text-[14px] text-ink">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-none text-v2-green" />
          <p>Every check passes. Nice work — keep your numbers and keywords fresh as you edit.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ group, tips }) => (
            <section key={group.id} data-tip-group={group.id} aria-label={group.label}>
              <h3 className="mb-2 font-display text-[14px] font-bold text-ink">
                {group.label} <span className="text-[12px] font-semibold text-muted">· {tips.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {tips.map((tip) => (
                  <li key={tip.id} data-rule={tip.id} className="flex items-start gap-3 rounded-xl border border-v2-line/70 bg-paper p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-snug text-ink">{tip.message}</p>
                      {/* The page-count tip: AI can shorten the longest bullets (R4.2, the former R4.4); Free sees the lock. */}
                      {tip.id === "F4" && trim && trim.allowed && (
                        <button type="button" data-trim-longest onClick={trim.onTrim} className={TRIM_CLASS}>
                          <SparklesIcon className="h-3.5 w-3.5" />
                          Trim the longest bullets
                        </button>
                      )}
                      {tip.id === "F4" && trim && !trim.allowed && (
                        <UpgradeLink data-trim-longest onClick={trim.onLocked} className={TRIM_CLASS}>
                          <LockIcon className="h-3.5 w-3.5" />
                          Trim the longest bullets
                          <span className="rounded bg-v2-violet-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-v2-violet-ink">Pro</span>
                        </UpgradeLink>
                      )}
                    </div>
                    {tip.target && (
                      <button
                        type="button"
                        onClick={() => onGoTo(tip.target!.ref)}
                        className="inline-flex min-h-9 flex-none items-center gap-1 rounded-lg px-2 text-[13px] font-bold text-v2-blue hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
                      >
                        Go to <ArrowRightIcon className="h-3.5 w-3.5" />
                        <span className="sr-only"> {group.label}: {tip.message}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-5 text-[11.5px] text-muted">Rules-based score — no AI used</p>
    </SideSheet>
  );
}
