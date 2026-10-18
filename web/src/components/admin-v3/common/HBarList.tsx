import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "@/components/app-v2/common";

export interface HBarItem {
  label: string;
  icon?: ReactNode;
  /** Bar length = value / `max` (default: largest value). */
  value: number;
  tone: Tone;
  /** Printed count (defaults to `value`). */
  display?: ReactNode;
  /** Muted figure at the end (e.g. "4%"). */
  pct?: ReactNode;
}

/** Horizontal bars: `icon label | bar | count pct`. */
export default function HBarList({ items, max, className }: { items: HBarItem[]; max?: number; className?: string }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("space-y-3.5", className)}>
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(84px,auto)_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[104px_1fr_auto]">
          <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
            {i.icon && <span className={cn("flex-none", TONE[i.tone].ink)}>{i.icon}</span>}
            <span className="truncate">{i.label}</span>
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-paper-2">
            <span className={cn("block h-full rounded-full", TONE[i.tone].solid)} style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} />
          </span>
          <span className="flex items-baseline gap-3 tabular-nums">
            <span className="w-9 text-right font-semibold text-ink">{i.display ?? i.value}</span>
            {i.pct !== undefined && <span className="w-9 text-right text-v2-muted">{i.pct}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
