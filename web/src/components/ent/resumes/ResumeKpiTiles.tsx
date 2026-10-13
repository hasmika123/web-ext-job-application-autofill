"use client";

import type { ReactNode } from "react";
import { Card, CalendarIcon, ClockIcon, DeltaChip, FileTextIcon, Skeleton, Sparkline, StarIcon } from "@kiwiply/ui";
import { resumeTileDelta, type ResumeCounts, type ResumeTile, type TileKey } from "@/lib/ent/resumes";

interface TileDef {
  key: TileKey;
  label: string;
  icon: ReactNode;
  /** The comparison the delta makes ("vs last month"). */
  vs: string;
  /** A rise in this figure is bad news (resumes waiting for approval). */
  lowerIsBetter?: boolean;
  /** What the sparkline shows, for assistive tech. */
  series: string;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Resumes", icon: <FileTextIcon size={20} />, vs: "vs last month", series: "Resumes over the last 8 weeks" },
  { key: "primary", label: "Primary Resumes", icon: <StarIcon size={20} />, vs: "vs last month", series: "Primary resumes over the last 8 weeks, by when each resume was added" },
  { key: "needsApproval", label: "Needs Approval", icon: <ClockIcon size={20} />, vs: "vs last month", lowerIsBetter: true, series: "Resumes waiting for approval over the last 8 weeks" },
  { key: "updatedThisWeek", label: "Updated This Week", icon: <CalendarIcon size={20} />, vs: "vs last week", series: "Resumes last changed in each of the last 8 weeks" },
];

/**
 * The four KPI tiles of the Resumes board. The delta is drawn only when the API could rebuild the earlier figure from the rows (the primary flag is
 * not versioned, so that tile shows the figure and the trend only). The sparkline is the weekly series the API rebuilt from the same rows.
 */
export default function ResumeKpiTiles({ counts, loading, error, compact = false }: { counts: ResumeCounts | null; loading: boolean; error: boolean; compact?: boolean }) {
  return (
    <ul aria-label="Resume figures" className={`grid grid-cols-2 gap-3 ${compact ? "" : "xl:grid-cols-4"}`} data-kpi-tiles>
      {TILES.map((t) => {
        const tile: ResumeTile | null = counts ? counts[t.key] : null;
        const delta = resumeTileDelta(tile);
        return (
          <li key={t.key} data-kpi={t.key}>
            <Card className="flex h-full flex-col gap-2 !p-4">
              <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
                {t.icon}
              </span>
              <span className="text-[13px] font-medium leading-tight text-ink-soft">{t.label}</span>
              <div className="flex items-end justify-between gap-3">
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.series.length >= 2 && <Sparkline values={tile.series} label={t.series} className="h-9 w-24 flex-none" />}
              </div>
              {delta && (
                <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-kpi-delta>
                  <DeltaChip delta={delta} lowerIsBetter={t.lowerIsBetter} />
                  {t.vs}
                </span>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
