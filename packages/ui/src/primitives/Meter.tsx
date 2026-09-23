import { cn } from "./cn";

/**
 * Meter — how much of something is used: a thin bar with role="meter" (not a progress bar — this
 * is a level, not a task finishing). The fill turns amber at {@code warnAt} and red when full, so
 * "nearly out" reads at a glance. Used for the monthly AI meter on the web and in the extension.
 * Pass {@code neutral} when a full bar is good news rather than a limit (a 95 % resume fit).
 *
 *   <Meter value={32} max={100} label="Kiwiply AI used this month" />
 */
export interface MeterProps {
  value: number;
  max?: number;
  /** Accessible name — what is being measured. */
  label: string;
  /** Where the fill turns to the warning colour, as a share of max (default 0.8). */
  warnAt?: number;
  /** Screen-reader text for the value, e.g. "32 percent". Defaults to "value of max". */
  valueText?: string;
  /** Always the accent colour — for a score, where more is better, not a limit being used up. */
  neutral?: boolean;
  className?: string;
}

export default function Meter({ value, max = 100, label, warnAt = 0.8, valueText, neutral, className }: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const v = Math.min(Math.max(value, 0), safeMax);
  const share = v / safeMax;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={v}
      aria-valuetext={valueText ?? `${v} of ${safeMax}`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-paper-2", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          neutral ? "bg-accent" : share >= 1 ? "bg-danger" : share >= warnAt ? "bg-warn" : "bg-accent",
        )}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}
