"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, CheckCircleIcon, ClockIcon, KpiTile, type KpiTone } from "@kiwiply/ui";
import type { ConsultantCounts } from "@/lib/ent/consultants";

interface TileDef {
  key: keyof Pick<ConsultantCounts, "available" | "onProject" | "needsReview">;
  label: string;
  icon: ReactNode;
  tone: KpiTone;
}

const TILES: TileDef[] = [
  { key: "available", label: "Available", icon: <CheckCircleIcon size={20} />, tone: "green" },
  { key: "onProject", label: "On project", icon: <BriefcaseIcon size={20} />, tone: "blue" },
  { key: "needsReview", label: "Needs review", icon: <ClockIcon size={20} />, tone: "orange" },
];

/**
 * The three KPI tiles of the Consultants page (shared `KpiTile`): who is available, who is on a project and who needs a look. Plain
 * numbers: no trend line and no comparison (the total is the list's own count).
 */
export default function KpiTiles({ counts, loading, error }: { counts: ConsultantCounts | null; loading: boolean; error: boolean; compact?: boolean }) {
  return (
    <ul aria-label="Consultant figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:gap-[14px]" data-kpi-tiles>
      {TILES.map((t) => {
        const tile = counts ? counts[t.key] : null;
        return (
          <li key={t.key} data-kpi={t.key}>
            <KpiTile tone={t.tone} label={t.label} icon={t.icon} loading={loading} value={tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""} />
          </li>
        );
      })}
    </ul>
  );
}
