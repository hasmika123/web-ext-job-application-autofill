"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, FileTextIcon, StarIcon, UsersIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import TalentKpi from "@/components/ent/shell/TalentKpi";
import { tileDelta, type JobSummary, type JobTile } from "@/lib/ent/jobs";

interface TileDef {
  key: keyof Pick<JobSummary, "openJobs" | "newThisWeek" | "assignedOpportunities" | "highMatchJobs">;
  label: string;
  icon: ReactNode;
  tone: KpiTone;
  /** How the board writes the delta: the plain difference or the percent. */
  mode: "count" | "percent";
  vs: string;
}

const TILES: TileDef[] = [
  { key: "openJobs", label: "Open Jobs", icon: <BriefcaseIcon size={22} />, tone: "blue", mode: "count", vs: "vs last month" },
  { key: "newThisWeek", label: "New This Week", icon: <FileTextIcon size={22} />, tone: "green", mode: "percent", vs: "vs last week" },
  { key: "assignedOpportunities", label: "Assigned Opportunities", icon: <UsersIcon size={22} />, tone: "violet", mode: "count", vs: "vs last month" },
  { key: "highMatchJobs", label: "High Match Jobs", icon: <StarIcon size={22} />, tone: "orange", mode: "count", vs: "vs last month" },
];

/**
 * The four KPI tiles of the Jobs board. The delta is drawn only when the API gave one (an organization with no job older than a month has
 * nothing to compare with), and the sparkline only when it has at least two points: nothing here is invented.
 */
export default function KpiTiles({ summary, loading, error }: { summary: JobSummary | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Job figures" className="grid grid-cols-2 gap-[13px] xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: JobTile | null = summary ? summary[t.key] : null;
        return (
          <li key={t.key} className="min-w-0 ent-kpi-wide">
            <TalentKpi
              id={t.key}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
              delta={tileDelta(tile, t.mode)}
              vs={t.vs}
              series={tile && tile.series.length >= 2 ? tile.series : null}
              seriesLabel={`${t.label}, last ${tile?.series.length ?? 0} weeks`}
              loading={loading}
            />
          </li>
        );
      })}
    </ul>
  );
}
