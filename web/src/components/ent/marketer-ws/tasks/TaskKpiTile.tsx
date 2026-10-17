"use client";

import type { ComponentType } from "react";
import { DeltaChip, MiniBars, Skeleton, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { deltaFromPct } from "@/lib/ent/dashboard";
import { TINTS, type TintName } from "../parts";

/** The Tasks board's KPI tile: big tinted icon, title, number, the delta chip and a small bar chart of the last days. A missing delta draws no chip. */

const BARS: Record<TintName, string> = {
  blue: "text-accent",
  violet: "text-v2-violet-ink",
  green: "text-v2-green-ink",
  amber: "text-v2-amber-ink",
  pink: "text-v2-pink-ink",
  teal: "text-v2-teal-ink",
  coral: "text-v2-coral-ink",
};

export default function TaskKpiTile({
  id, title, icon: Icon, tint, value, deltaPct, bars, loading, lowerIsBetter,
}: { id: string; title: string; icon: ComponentType<IconProps>; tint: TintName; value: number | null; deltaPct: number | null; bars?: number[]; loading?: boolean; lowerIsBetter?: boolean }) {
  const delta = deltaFromPct(deltaPct);
  return (
    <section aria-label={title} data-stat-tile={id} data-tone={tint} className="flex min-h-[112px] min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:gap-3.5 sm:p-4">
      <span aria-hidden className={cn("grid h-[58px] w-[58px] flex-none place-items-center rounded-2xl", TINTS[tint])}>
        <Icon size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-semibold text-ink">{title}</h3>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-16" />
        ) : value === null ? (
          <p className="mt-1.5 text-[13.5px] font-semibold text-muted">Nothing yet</p>
        ) : (
          <>
            <p data-tile-value className="mt-1 text-[30px] font-extrabold leading-none tabular-nums text-ink">
              {value.toLocaleString("en-US")}
            </p>
            <p className="mt-2 flex min-h-5 items-center text-[12.5px]">{delta ? <DeltaChip delta={delta} lowerIsBetter={lowerIsBetter} /> : null}</p>
          </>
        )}
      </div>
      {!loading && value !== null && bars && bars.length > 1 ? <MiniBars values={bars} className={cn("flex-none", BARS[tint])} /> : null}
    </section>
  );
}
