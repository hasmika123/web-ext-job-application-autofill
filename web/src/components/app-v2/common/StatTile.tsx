import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";
import Sparkline from "./Sparkline";

export interface StatDelta {
  /** Already formatted, e.g. "32%" (the arrow is added). */
  value: string;
  up: boolean;
}

/**
 * Tinted KPI tile: icon in a white rounded square, 26px/800 value, label, optional delta chip
 * (green up / coral down) and an optional sparkline in the tone colour.
 */
export default function StatTile({
  icon,
  value,
  label,
  delta,
  sparkline,
  tone = "blue",
  className,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  delta?: StatDelta;
  sparkline?: number[];
  tone?: Tone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-2xl p-4", t.soft, className)}>
      <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl bg-paper shadow-v2-soft", t.ink)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[26px] font-extrabold leading-none tracking-tight text-ink">{value}</div>
        <div className="mt-1 text-[13px] font-medium text-ink-soft">{label}</div>
        {delta && (
          <span
            className={cn(
              "mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold leading-none",
              delta.up ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-coral-soft text-v2-coral-ink",
            )}
          >
            <span aria-hidden>{delta.up ? "↑" : "↓"}</span>
            {delta.value}
          </span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} tone={tone} className="hidden sm:block" />}
    </div>
  );
}
