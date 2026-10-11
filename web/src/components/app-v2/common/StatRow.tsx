import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import StatTile from "./StatTile";
import type { Tone } from "./tones";

/** Row of StatTiles: 2 per row from `sm`, 4 (or 5) from `xl`. `icons` is keyed by each stat's `id`. */
export default function StatRow({
  stats,
  icons,
  cols = 4,
}: {
  stats: readonly {
    id: string;
    value: string;
    label: string;
    delta?: { value: string; up: boolean };
    tone: Tone;
    spark?: readonly number[];
  }[];
  icons: Record<string, ReactNode>;
  cols?: 4 | 5;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:gap-3.5", cols === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
      {stats.map((s) => (
        <StatTile
          key={s.id}
          icon={icons[s.id]}
          value={s.value}
          label={s.label}
          delta={s.delta}
          sparkline={s.spark ? [...s.spark] : undefined}
          tone={s.tone}
        />
      ))}
    </div>
  );
}
