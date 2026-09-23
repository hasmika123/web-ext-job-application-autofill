import Meter from "./primitives/Meter";
import { AlertIcon, CheckIcon } from "./primitives/icons";
import { cn } from "./primitives/cn";

/**
 * JobFitReport — one resume against one job (Phase 13.3), shown the same way in the extension
 * drawer and on the web board: the match score, a one-line summary, red flags first (they can
 * decide whether to apply at all), then what the resume is missing, then what it already covers.
 * Presentational only: the caller fetches the report and decides when to show it.
 *
 * One number per resume and job: where the surrounding UI already shows the resume's match score
 * (13.2's ranking), pass {@code hideScore} or the ranking's own score, so the same resume never reads
 * 84 % in one place and 71 % in another.
 */
export interface JobFitData {
  score: number;
  summary?: string;
  matched: string[];
  missing: string[];
  redFlags: string[];
}

export interface JobFitReportProps {
  fit: JobFitData;
  /** Resume name, when the surrounding UI doesn't already say which resume this is. */
  resumeLabel?: string;
  /** Leave the score out — the surrounding UI already shows this resume's match. */
  hideScore?: boolean;
  className?: string;
}

function Chips({ items, tone }: { items: string[]; tone: "have" | "missing" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li
          key={t}
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-medium leading-none",
            tone === "have" ? "bg-accent-soft text-accent-deep" : "bg-brown-soft text-brown-deep",
          )}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

const heading = "mb-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-muted";

export default function JobFitReport({ fit, resumeLabel, hideScore, className }: JobFitReportProps) {
  const score = Math.max(0, Math.min(100, Math.round(fit.score)));
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hideScore ? (
        fit.summary && <p className="text-[12.5px] leading-snug text-ink-soft">{fit.summary}</p>
      ) : (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {resumeLabel ? (
              <>
                Fit for <span className="font-bold">{resumeLabel}</span>
              </>
            ) : (
              "Match"
            )}
          </span>
          <span className="font-display text-xl font-bold text-ink">{score}%</span>
        </div>
        <Meter value={score} label="Job fit" valueText={`${score} percent`} neutral className="mt-1.5 h-1.5" />
        {fit.summary && <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">{fit.summary}</p>}
      </div>
      )}

      {fit.redFlags.length > 0 && (
        <div>
          <div className={heading}>Red flags</div>
          <ul className="flex flex-col gap-1">
            {fit.redFlags.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink">
                <AlertIcon className="mt-[1px] h-3.5 w-3.5 flex-none text-danger" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fit.missing.length > 0 && (
        <div>
          <div className={heading}>Missing from this resume</div>
          <Chips items={fit.missing} tone="missing" />
        </div>
      )}

      {fit.matched.length > 0 && (
        <div>
          <div className={cn(heading, "flex items-center gap-1")}>
            <CheckIcon className="h-3 w-3 text-accent-deep" aria-hidden /> Already covered
          </div>
          <Chips items={fit.matched} tone="have" />
        </div>
      )}

      {fit.redFlags.length === 0 && fit.missing.length === 0 && (
        <p className="text-[12.5px] text-muted">No gaps or red flags found against this posting.</p>
      )}
    </div>
  );
}
