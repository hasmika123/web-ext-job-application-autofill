import { cn } from "../primitives/cn";
import type { IconProps } from "../primitives/icons";

/**
 * Two shared visuals of the Marketing Tasks board: the KPI tiles' mini bar chart (a handful of rising/falling bars, drawn in the tile's own colour via
 * `currentColor`) and the alarm clock of the "Overdue" tile. Same contract as the other icons: 24x24, `currentColor`, size via `size`.
 */

export interface MiniBarsProps {
  /** One number per bar (the last six are drawn). Fewer than two draws nothing: one bar is not a trend. */
  values: number[];
  /** Sets the colour (a `text-*` class): the bars use `currentColor`. */
  className?: string;
  /** Spoken description; without it the chart is decorative (the tile's number carries the meaning). */
  label?: string;
}

/** Heights are relative to the tallest bar (never below a stub, so a zero is still visible); earlier bars are lighter. */
export function MiniBars({ values, className, label }: MiniBarsProps) {
  const v = values.slice(-6);
  if (v.length < 2) return null;
  const max = Math.max(...v, 1);
  return (
    <div data-mini-bars role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("flex h-12 items-end gap-1", className)}>
      {v.map((n, i) => (
        <span key={i} data-mini-bar className="block w-[7px] rounded-[3px] bg-current" style={{ height: `${Math.max(14, Math.round((Math.max(n, 0) / max) * 100))}%`, opacity: 0.35 + (0.65 * (i + 1)) / v.length }} />
      ))}
    </div>
  );
}

/** An alarm clock: a ringing clock face with two bells. */
export function AlarmClockIcon({ size = 16, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4.2l2.6 1.6" />
      <path d="M4.2 5.2 7 3M19.8 5.2 17 3" />
      <path d="M5.5 20.5 7 19M18.5 20.5 17 19" />
    </svg>
  );
}
