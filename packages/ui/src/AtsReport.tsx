import Meter from "./primitives/Meter";
import { AlertIcon, CheckIcon } from "./primitives/icons";
import { cn } from "./primitives/cn";

/**
 * AtsReport — how a resume will read to an applicant-tracking system (Phase 13.5): a 0–100 score,
 * what to fix first (the failed checks, heaviest first, each with what to aim for), and — when it
 * was scored against a job — how many of that job's key terms it covers. The passed checks fold
 * away underneath. Presentational only: the caller fetches the report.
 *
 * Used on the Resumes page (structure only) and in the board's job-fit panel (with keywords).
 */
export interface AtsCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
}

export interface AtsKeywords {
  covered: number;
  missing: number;
  coveragePercent: number;
  missingTerms: string[];
}

export interface AtsReportData {
  score: number;
  passed: number;
  total: number;
  checks: AtsCheck[];
  keywords?: AtsKeywords | null;
}

export interface AtsReportProps {
  report: AtsReportData;
  /** Leave out the missing-term chips — the surrounding UI (a job-fit report) already lists them. */
  hideMissingTerms?: boolean;
  /** The score's caption (default "ATS score") — e.g. "Score" inside a dialog already titled so. */
  heading?: string;
  className?: string;
}

const heading = "mb-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-muted";

export default function AtsReport({ report, hideMissingTerms, heading: caption = "ATS score", className }: AtsReportProps) {
  const score = Math.max(0, Math.min(100, Math.round(report.score)));
  const failed = report.checks.filter((c) => !c.passed).sort((a, b) => b.weight - a.weight);
  const passed = report.checks.filter((c) => c.passed);
  const k = report.keywords;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{caption}</span>
          <span className="font-display text-xl font-bold text-ink">
            {score}
            <span className="text-[13px] font-semibold text-muted">/100</span>
          </span>
        </div>
        <Meter value={score} label="ATS score" valueText={`${score} out of 100`} neutral className="mt-1.5 h-1.5" />
        <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
          {report.passed} of {report.total} checks passed
          {k && (
            <>
              {" "}
              · covers {k.coveragePercent}% of this job&rsquo;s key terms ({k.covered} of {k.covered + k.missing})
            </>
          )}
          .
        </p>
        {k && <p className="mt-0.5 text-[11.5px] text-muted">Structure counts for 70% of the score, keywords for 30%.</p>}
      </div>

      {k && !hideMissingTerms && k.missingTerms.length > 0 && (
        <div>
          <div className={heading}>Terms this job wants</div>
          <ul className="flex flex-wrap gap-1.5">
            {k.missingTerms.map((t) => (
              <li key={t} className="rounded-full bg-brown-soft px-2.5 py-1 text-[12px] font-medium leading-none text-brown-deep">
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-muted">Add the ones that are true for you, in your own words.</p>
        </div>
      )}

      {failed.length > 0 ? (
        <div>
          <div className={heading}>Fix first</div>
          <ul className="flex flex-col gap-2">
            {failed.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <AlertIcon className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">{c.label}</span>
                    <span className="flex-none text-[11px] font-semibold tabular-nums text-muted" title={`Worth ${c.weight} of the 100 structure points`}>
                      +{c.weight} pts
                    </span>
                  </div>
                  <p className="text-[12px] leading-snug text-ink-soft">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">Every structure check passes.</p>
      )}

      {passed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft hover:text-ink">
            {passed.length} check{passed.length === 1 ? "" : "s"} passed
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {passed.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-soft">
                <CheckIcon className="mt-[2px] h-3 w-3 flex-none text-accent-deep" aria-hidden />
                <span>
                  <span className="font-medium text-ink">{c.label}</span> — {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
