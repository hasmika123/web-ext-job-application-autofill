"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, FileTextIcon, TrophyIcon, UsersIcon, deltaOf } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import TalentKpi from "@/components/ent/shell/TalentKpi";
import type { Counts, Tile } from "@/lib/ent/applications";

interface TileDef {
  key: keyof Pick<Counts, "total" | "inReview" | "interviewing" | "offers">;
  label: string;
  icon: ReactNode;
  tone: KpiTone;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Applications", icon: <UsersIcon size={22} />, tone: "violet" },
  { key: "inReview", label: "In Review", icon: <FileTextIcon size={22} />, tone: "blue" },
  { key: "interviewing", label: "Interviewing", icon: <BriefcaseIcon size={22} />, tone: "orange" },
  { key: "offers", label: "Offers", icon: <TrophyIcon size={22} />, tone: "green" },
];

/**
 * The four KPI tiles. The delta ("vs last month") is drawn only when the API rebuilt a figure from thirty days ago: an organization
 * younger than a month shows the figure alone. The sparkline is the weekly series the API computed from the application history.
 */
export default function KpiTiles({ counts, loading, error }: { counts: Counts | null; loading: boolean; error: boolean; docked?: boolean }) {
  return (
    <ul aria-label="Application figures" className="grid grid-cols-2 gap-[15px] xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        return (
          <li key={t.key} className="min-w-0">
            <TalentKpi
              id={t.key}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""}
              delta={tile ? deltaOf(tile.value, tile.previous) : null}
              vs="vs last month"
              series={tile && tile.series.length > 1 ? tile.series : null}
              seriesLabel={`${t.label}, last ${tile?.series.length ?? 0} weeks`}
              loading={loading}
            />
          </li>
        );
      })}
    </ul>
  );
}
