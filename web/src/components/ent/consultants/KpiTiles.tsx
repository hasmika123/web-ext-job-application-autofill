"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, Card, CheckCircleIcon, ClockIcon, DeltaChip, Skeleton, Sparkline, UsersIcon, chartColor } from "@kiwiply/ui";
import { tileDelta, type ConsultantCounts, type Tile } from "@/lib/ent/consultants";

interface TileDef {
  key: keyof Pick<ConsultantCounts, "total" | "available" | "onProject" | "needsReview">;
  label: string;
  icon: ReactNode;
  color: string;
  /** A rise in this figure is bad news (consultants needing review). */
  lowerIsBetter?: boolean;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Consultants", icon: <UsersIcon size={20} />, color: chartColor(0) },
  { key: "available", label: "Available", icon: <CheckCircleIcon size={20} />, color: chartColor(1) },
  { key: "onProject", label: "On Project", icon: <BriefcaseIcon size={20} />, color: chartColor(2) },
  { key: "needsReview", label: "Needs Review", icon: <ClockIcon size={20} />, color: chartColor(3), lowerIsBetter: true },
];

/**
 * The four KPI tiles of the Consultants board. The delta ("vs last month") is drawn only when the API gave one (an organization with nobody who
 * joined more than 30 days ago has no baseline and shows the figure alone). The sparkline is the eight weekly points the API computed from the
 * join dates of the consultants themselves: a tile with fewer than two points draws none.
 */
export default function KpiTiles({ counts, loading, error, compact = false }: { counts: ConsultantCounts | null; loading: boolean; error: boolean; compact?: boolean }) {
  return (
    <ul aria-label="Consultant figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tileDelta(tile);
        return (
          <li key={t.key} data-kpi={t.key}>
            <Card className={`flex h-full flex-col gap-1 ${compact ? "!p-3" : "!p-4"}`}>
              <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
                {t.icon}
              </span>
              <span className="mt-1 text-[14px] font-medium leading-tight text-ink-soft">{t.label}</span>
              <div className="flex items-end justify-between gap-3">
                {loading ? (
                  <Skeleton className="mt-1 h-9 w-16" />
                ) : (
                  <span className={`font-extrabold leading-none tracking-tight text-ink tabular-nums ${compact ? "text-[26px]" : "text-[32px]"}`} data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.series.length >= 2 && (
                  <div className={`flex-none ${compact ? "w-14" : "w-24"}`}>
                    <Sparkline values={tile.series} color={t.color} label={`${t.label}, last eight weeks`} className="h-9" />
                  </div>
                )}
              </div>
              {delta && (
                <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted" data-kpi-delta>
                  <DeltaChip delta={delta} lowerIsBetter={t.lowerIsBetter} />
                  vs last month
                </span>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
