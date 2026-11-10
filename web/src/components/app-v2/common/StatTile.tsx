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
 * Tinted KPI tile: icon in a white rounded square, 26px/800 value, label, optional second label
 * line (`sublabel`), an inline `chip` beside the value, a delta chip (green up / coral down) and an
 * optional sparkline in the tone colour.
 *
 * `compact` is the narrow variant (5-up rows, quick-stat cards): smaller icon and value, and the
 * sparkline moves under the value beside the delta chip instead of sitting at the tile's right.
 */
export default function StatTile({
  icon,
  value,
  label,
  sublabel,
  delta,
  chip,
  sparkline,
  tone = "blue",
  compact,
  className,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  delta?: StatDelta;
  /** Inline chip beside the value (e.g. a StatusChip "Active"). */
  chip?: ReactNode;
  sparkline?: number[];
  tone?: Tone;
  compact?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const spark = sparkline && sparkline.length > 1 ? sparkline : undefined;
  const valueSize = compact ? "text-[24px]" : "text-[22px] sm:text-[26px]";
  return (
    <div className={cn("flex min-w-0 items-center rounded-2xl", compact ? "gap-3 p-3.5" : "gap-2.5 p-3 sm:gap-3 sm:p-4", t.soft, className)}>
      <span
        className={cn(
          "grid flex-none place-items-center rounded-xl bg-paper shadow-v2-soft",
          compact ? "h-10 w-10" : "h-9 w-9 sm:h-11 sm:w-11",
          t.ink,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {chip ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("font-display font-extrabold leading-none tracking-tight text-ink", valueSize)}>{value}</span>
            {chip}
          </div>
        ) : (
          <div className={cn("font-display font-extrabold leading-none tracking-tight text-ink", valueSize)}>{value}</div>
        )}
        <div className={cn("mt-1 text-ink-soft", compact ? "text-[12.5px] leading-tight" : "text-[13px] font-medium")}>{label}</div>
        {sublabel && <div className="text-[12px] leading-tight text-v2-muted">{sublabel}</div>}
        {compact && spark ? (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {delta && <DeltaChip delta={delta} />}
            <Sparkline points={spark} tone={tone} width={64} height={24} />
          </div>
        ) : (
          delta && <DeltaChip delta={delta} className="mt-1.5" />
        )}
      </div>
      {!compact && spark && <Sparkline points={spark} tone={tone} className="hidden sm:block" />}
    </div>
  );
}

function DeltaChip({ delta, className }: { delta: StatDelta; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold leading-none",
        delta.up ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-coral-soft text-v2-coral-ink",
        className,
      )}
    >
      <span aria-hidden>{delta.up ? "↑" : "↓"}</span>
      {delta.value}
    </span>
  );
}
