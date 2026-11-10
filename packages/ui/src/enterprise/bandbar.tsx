import { cn } from "../primitives/cn";

/**
 * BandBar - a thin percentage bar whose fill is coloured by band (green from `goodAt`, amber from `okAt`, red below), as in the
 * Resumes board's "Profile Completeness" column. It is a level, so `role="meter"` (a task finishing is `ProgressBar`; usage against a
 * limit is `Meter`). The number is drawn by the caller next to it.
 *
 *   <BandBar value={92} label="Profile completeness" />
 */
export interface BandBarProps {
  /** 0 to 100 (clamped). */
  value: number;
  /** Accessible name: what is measured. */
  label: string;
  /** Percent at or above which the fill is green (default 80). */
  goodAt?: number;
  /** Percent at or above which the fill is amber (default 60); below it is red. */
  okAt?: number;
  className?: string;
}

export default function BandBar({ value, label, goodAt = 80, okAt = 60, className }: BandBarProps) {
  const pct = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
  const tone = pct >= goodAt ? "bg-green-500" : pct >= okAt ? "bg-amber-400" : "bg-red-500";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${Math.round(pct)} percent`} data-band={tone} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-paper-2", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
