"use client";

import type { ReactNode } from "react";
import { BriefcaseIcon, CheckCircleIcon, ClockIcon, KpiTile, UsersIcon, type KpiTone } from "@kiwiply/ui";
import { tileDelta, type ConsultantCounts, type Tile } from "@/lib/ent/consultants";

interface TileDef {
  key: keyof Pick<ConsultantCounts, "total" | "available" | "onProject" | "needsReview">;
  label: string;
  icon: ReactNode;
  tone: KpiTone;
  /** A rise in this figure is bad news (consultants needing review). */
  lowerIsBetter?: boolean;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Consultants", icon: <UsersIcon size={20} />, tone: "violet" },
  { key: "available", label: "Available", icon: <CheckCircleIcon size={20} />, tone: "green" },
  { key: "onProject", label: "On Project", icon: <BriefcaseIcon size={20} />, tone: "blue" },
  { key: "needsReview", label: "Needs Review", icon: <ClockIcon size={20} />, tone: "orange", lowerIsBetter: true },
];

/**
 * The four KPI tiles of the Consultants board (shared `KpiTile`). The delta ("vs last month") is drawn only when the API gave one (an
 * organization with nobody who joined more than 30 days ago has no baseline and shows the figure alone). The curve is the eight weekly
 * points the API computed from the consultants' own join dates; fewer than two points draws none.
 */
export default function KpiTiles({ counts, loading, error }: { counts: ConsultantCounts | null; loading: boolean; error: boolean; compact?: boolean }) {
  return (
    <ul aria-label="Consultant figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4 xl:gap-[14px]" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const d = tileDelta(tile);
        const good = d && d.dir !== "flat" ? (d.dir === "up") !== !!t.lowerIsBetter : null;
        return (
          <li key={t.key} data-kpi={t.key}>
            <KpiTile
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              loading={loading}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
              delta={d ? { text: `${d.dir === "up" ? "+" : d.dir === "down" ? "-" : ""}${d.text.replace(/^[+-]/, "")}`, dir: d.dir, good } : null}
              series={tile && tile.series.length >= 2 ? tile.series : null}
              seriesLabel={`${t.label}, last eight weeks`}
            />
          </li>
        );
      })}
    </ul>
  );
}
