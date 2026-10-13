"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, Card, DeltaChip, FileTextIcon, Skeleton, Sparkline, StarIcon, UsersIcon } from "@kiwiply/ui";
import { tileDelta, type JobSummary, type JobTile } from "@/lib/ent/jobs";

interface TileDef {
  key: keyof Pick<JobSummary, "openJobs" | "newThisWeek" | "assignedOpportunities" | "highMatchJobs">;
  label: string;
  icon: ReactNode;
  /** Soft background and ink of the icon tile, and the sparkline colour (all v2 tokens, retinted by the tenant theme). */
  tone: string;
  spark: string;
  /** How the board writes the delta: the plain difference or the percent. */
  mode: "count" | "percent";
  vs: string;
}

const TILES: TileDef[] = [
  { key: "openJobs", label: "Open Jobs", icon: <BriefcaseIcon size={20} />, tone: "bg-v2-blue-soft text-v2-blue-ink", spark: "var(--color-v2-blue)", mode: "count", vs: "vs last month" },
  { key: "newThisWeek", label: "New This Week", icon: <FileTextIcon size={20} />, tone: "bg-v2-green-soft text-v2-green-ink", spark: "var(--color-v2-green)", mode: "percent", vs: "vs last week" },
  { key: "assignedOpportunities", label: "Assigned Opportunities", icon: <UsersIcon size={20} />, tone: "bg-v2-violet-soft text-v2-violet-ink", spark: "var(--color-v2-violet)", mode: "count", vs: "vs last month" },
  { key: "highMatchJobs", label: "High Match Jobs", icon: <StarIcon size={20} />, tone: "bg-v2-amber-soft text-v2-amber-ink", spark: "var(--color-v2-amber)", mode: "count", vs: "vs last month" },
];

/**
 * The four KPI tiles of the Jobs board. The delta is drawn only when the API gave one (an organization with no job older than a month has
 * nothing to compare with), and the sparkline only when it has at least two points: nothing here is invented.
 */
export default function KpiTiles({ summary, loading, error }: { summary: JobSummary | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Job figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: JobTile | null = summary ? summary[t.key] : null;
        const delta = tileDelta(tile, t.mode);
        return (
          <li key={t.key} data-kpi={t.key}>
            <Card className="flex h-full items-stretch justify-between gap-2 !p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden className={`mb-1 inline-grid h-10 w-10 flex-none place-items-center rounded-xl ${t.tone}`}>
                  {t.icon}
                </span>
                <span className="text-[13.5px] font-medium leading-tight text-ink-soft">{t.label}</span>
                {loading ? (
                  <Skeleton className="mt-1 h-8 w-14" />
                ) : (
                  <span className="text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {delta && (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-kpi-delta>
                    <DeltaChip delta={delta} />
                    {t.vs}
                  </span>
                )}
              </div>
              {tile && tile.series.length >= 2 && (
                <div className="mt-auto w-20 flex-none self-end sm:w-24" data-kpi-spark>
                  <Sparkline values={tile.series} color={t.spark} label={`${t.label}, last ${tile.series.length} weeks`} />
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
