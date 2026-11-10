"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, FileTextIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import TalentKpi from "@/components/ent/shell/TalentKpi";
import type { JobSummary, JobTile } from "@/lib/ent/jobs";

interface TileDef {
  key: keyof Pick<JobSummary, "openJobs" | "newThisWeek">;
  label: string;
  icon: ReactNode;
  tone: KpiTone;
}

const TILES: TileDef[] = [
  { key: "openJobs", label: "Open", icon: <BriefcaseIcon size={22} />, tone: "blue" },
  { key: "newThisWeek", label: "New this week", icon: <FileTextIcon size={22} />, tone: "green" },
];

/**
 * The two KPI tiles of the Jobs page: how many openings are open and how many arrived this week. Plain figures from the API (no trend
 * line, no comparison).
 */
export default function KpiTiles({ summary, loading, error }: { summary: JobSummary | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Job figures" className="grid grid-cols-2 gap-[13px] xl:max-w-[50%]" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: JobTile | null = summary ? summary[t.key] : null;
        return (
          <li key={t.key} className="min-w-0 ent-kpi-wide">
            <TalentKpi id={t.key} tone={t.tone} label={t.label} icon={t.icon} value={tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""} vs="" loading={loading} />
          </li>
        );
      })}
    </ul>
  );
}
