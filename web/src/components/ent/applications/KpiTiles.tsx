"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, FileTextIcon, TrophyIcon, UsersIcon } from "@kiwiply/ui";
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
  { key: "total", label: "Total applications", icon: <UsersIcon size={22} />, tone: "violet" },
  { key: "inReview", label: "In review", icon: <FileTextIcon size={22} />, tone: "blue" },
  { key: "interviewing", label: "Interviewing", icon: <BriefcaseIcon size={22} />, tone: "orange" },
  { key: "offers", label: "Offers", icon: <TrophyIcon size={22} />, tone: "green" },
];

/**
 * The four KPI tiles: total, in review, interviewing and offers. Plain figures from the API (no trend line, no comparison).
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
              vs=""
              loading={loading}
            />
          </li>
        );
      })}
    </ul>
  );
}
