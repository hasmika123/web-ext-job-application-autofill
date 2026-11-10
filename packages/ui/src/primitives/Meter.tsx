import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Meter — how much of something is used: a thin bar with role="meter" (not a progress bar — this
 * is a level, not a task finishing). The fill turns amber at {@code warnAt} and red when full, so
 * "nearly out" reads at a glance. Used for the monthly AI meter on the web and in the extension.
 * Pass {@code neutral} when a full bar is good news rather than a limit (a 95 % resume fit).
 *
 *   <Meter value={32} max={100} label="Kiwiply AI used this month" />
 *
 * {@code variant="ring"} draws a circular score gauge instead (the Resume Builder's Insights card):
 * always the accent colour, the percentage in the middle (or {@code children}), {@code size} px square.
 *
 *   <Meter variant="ring" value={82} label="Resume score" valueText="82 percent" />
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
  /** "bar" (default) or "ring" (a circular gauge, always the accent colour). */
  variant?: "bar" | "ring";
  /** Ring only: the square size in px (default 64). */
  size?: number;
  /** Ring only: replaces the centred percentage. */
  children?: ReactNode;
  className?: string;
}

const RING_STROKE = 7;

export default function Meter({
  value,
  max = 100,
  label,
  warnAt = 0.8,
  valueText,
  neutral,
  variant = "bar",
  size = 64,
  children,
  className,
}: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const v = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax);
  const share = v / safeMax;
  const aria = {
    role: "meter",
    "aria-label": label,
    "aria-valuemin": 0,
    "aria-valuemax": safeMax,
    "aria-valuenow": v,
    "aria-valuetext": valueText ?? `${v} of ${safeMax}`,
  } as const;

  if (variant === "ring") {
    const r = (size - RING_STROKE) / 2;
    const c = 2 * Math.PI * r;
    return (
      <div {...aria} className={cn("relative inline-grid flex-none place-items-center", className)} style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden focusable="false" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={RING_STROKE} className="text-line/50" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            className="text-accent transition-[stroke-dasharray] duration-300 motion-reduce:transition-none"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-[17px] font-bold tabular-nums text-ink">
          {children ?? `${Math.round(share * 100)}%`}
        </span>
      </div>
    );
  }

  return (
    <div {...aria} className={cn("h-2 w-full overflow-hidden rounded-full bg-paper-2", className)}>
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
