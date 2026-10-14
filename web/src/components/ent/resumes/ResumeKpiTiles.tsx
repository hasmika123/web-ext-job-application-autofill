"use client";

import type { ReactNode } from "react";
import { CalendarIcon, ClockIcon, FileTextIcon, StarIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import TalentKpi from "@/components/ent/shell/TalentKpi";
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
  /** The board's fixed tile palette: the icon square and its curve share it. */
  tone: KpiTone;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Resumes", icon: <FileTextIcon size={22} />, vs: "vs last month", series: "Resumes over the last 8 weeks", tone: "violet" },
  { key: "primary", label: "Primary Resumes", icon: <StarIcon size={22} />, vs: "vs last month", series: "Primary resumes over the last 8 weeks, by when each resume was added", tone: "green" },
  { key: "needsApproval", label: "Needs Approval", icon: <ClockIcon size={22} />, vs: "vs last month", lowerIsBetter: true, series: "Resumes waiting for approval over the last 8 weeks", tone: "orange" },
  { key: "updatedThisWeek", label: "Updated This Week", icon: <CalendarIcon size={22} />, vs: "vs last week", series: "Resumes last changed in each of the last 8 weeks", tone: "blue" },
];

/**
 * The four KPI tiles of the Resumes board. The delta is drawn only when the API could rebuild the earlier figure from the rows (the primary flag is
 * not versioned, so that tile shows the figure and the trend only). The sparkline is the weekly series the API rebuilt from the same rows.
 */
export default function ResumeKpiTiles({ counts, loading, error, compact = false }: { counts: ResumeCounts | null; loading: boolean; error: boolean; compact?: boolean }) {
  return (
    <ul aria-label="Resume figures" className={`grid grid-cols-2 gap-[15px] ${compact ? "" : "xl:grid-cols-4"}`} data-kpi-tiles>
      {TILES.map((t) => {
        const tile: ResumeTile | null = counts ? counts[t.key] : null;
        return (
          <li key={t.key} className="min-w-0">
            <TalentKpi
              id={t.key}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
              delta={resumeTileDelta(tile)}
              vs={t.vs}
              lowerIsBetter={t.lowerIsBetter}
              series={tile && tile.series.length >= 2 ? tile.series : null}
              seriesLabel={t.series}
              loading={loading}
            />
          </li>
        );
      })}
    </ul>
  );
}
