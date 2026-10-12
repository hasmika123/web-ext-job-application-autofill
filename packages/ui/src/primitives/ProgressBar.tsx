import { cn } from "./cn";

/**
 * ProgressBar - one thin bar for "how far through a short flow" (the onboarding shell). It is a task finishing,
 * so it carries `role="progressbar"` (a level or a quota is `Meter`). 4 px tall, the accent fills it, and a 1 px
 * line sits under the track so the unfilled part still shows in high-contrast mode. The width eases over 300 ms
 * and jumps under `prefers-reduced-motion`.
 *
 *   <ProgressBar value={0.4} label="Profile setup" valueText="Step 3 of 7, about 1 minute left" />
 */
export interface ProgressBarProps {
  /** 0 to 1 (clamped). */
  value: number;
  /** Accessible name: what is progressing. */
  label: string;
  /** Screen-reader text for the position, e.g. "Step 3 of 7, about 1 minute left". Defaults to "{n} percent". */
  valueText?: string;
  className?: string;
}

export default function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const share = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
  const percent = Math.round(share * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${percent} percent`}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-paper-2 shadow-[0_1px_0_var(--color-line)]", className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${share * 100}%` }} />
    </div>
  );
}
