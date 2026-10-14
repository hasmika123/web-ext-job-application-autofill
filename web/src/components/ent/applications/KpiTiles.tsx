"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, Card, DeltaChip, FileTextIcon, Skeleton, Sparkline, TrophyIcon, UsersIcon, chartColor, deltaOf } from "@kiwiply/ui";
import type { Counts, Tile } from "@/lib/ent/applications";

interface TileDef {
  key: keyof Pick<Counts, "total" | "inReview" | "interviewing" | "offers">;
  label: string;
  icon: ReactNode;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Applications", icon: <UsersIcon size={20} /> },
  { key: "inReview", label: "In Review", icon: <FileTextIcon size={20} /> },
  { key: "interviewing", label: "Interviewing", icon: <BriefcaseIcon size={20} /> },
  { key: "offers", label: "Offers", icon: <TrophyIcon size={20} /> },
];

/**
 * The four KPI tiles. The delta ("vs last month") is drawn only when the API rebuilt a figure from thirty days ago: an organization
 * younger than a month shows the figure alone. The sparkline is the weekly series the API computed from the application history.
 */
export default function KpiTiles({ counts, loading, error, docked = false }: { counts: Counts | null; loading: boolean; error: boolean; docked?: boolean }) {
  return (
    <ul aria-label="Application figures" className={`grid grid-cols-2 gap-3 ${docked ? "lg:grid-cols-4" : "xl:grid-cols-4"}`} data-kpi-tiles>
      {TILES.map((t, i) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tile ? deltaOf(tile.value, tile.previous) : null;
        return (
          <li key={t.key} data-kpi={t.key}>
            <Card className="flex h-full flex-col gap-1.5 !p-3.5">
              <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${chartColor(i)} 14%, var(--color-paper, white))`, color: chartColor(i) }}>
                {t.icon}
              </span>
              <span className="text-[13px] font-medium leading-tight text-ink-soft">{t.label}</span>
              <div className="flex items-end justify-between gap-2">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="text-[28px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.series.length > 1 && (
                  <span className={`flex-none ${docked ? "w-14" : "w-20 sm:w-24"}`}>
                    <Sparkline values={tile.series} color={chartColor(i)} label={`${t.label}, last ${tile.series.length} weeks`} />
                  </span>
                )}
              </div>
              {delta && (
                <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-kpi-delta>
                  <DeltaChip delta={delta} />
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
