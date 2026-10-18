import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "@/components/app-v2/common";

export interface LegendItem {
  label: string;
  tone: Tone;
  /** Right-aligned figure (count). */
  value?: ReactNode;
  /** Muted figure after it (e.g. "81%"). */
  pct?: ReactNode;
}

/** `dot label ... value pct` rows, for beside-a-Donut legends. Pair with `<Donut legend={false} />`. */
export default function LegendList({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("min-w-0 flex-1 space-y-2.5 text-[13px]", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[i.tone].solid)} />
          <span className="min-w-0 flex-1 truncate text-ink-soft">{i.label}</span>
          {i.value !== undefined && <span className="flex-none font-semibold tabular-nums text-ink">{i.value}</span>}
          {i.pct !== undefined && <span className="w-10 flex-none text-right tabular-nums text-v2-muted">{i.pct}</span>}
        </li>
      ))}
    </ul>
  );
}
