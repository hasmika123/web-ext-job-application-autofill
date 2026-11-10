"use client";

import type { ReactNode } from "react";
import { CalendarIcon, ClockIcon, Skeleton, UsersIcon } from "@kiwiply/ui";
import type { Counts, Tile } from "@/lib/ent/placements";

type TileKey = "active" | "startingSoon" | "endingSoon" | "pool";

interface TileDef {
  key: TileKey;
  label: string;
  icon: ReactNode;
  /** The icon tile's tone (theme-tenant.css `.ent-kpi-chip[data-tone]`). */
  tone: "blue" | "green" | "orange" | "violet";
}

const TILES: TileDef[] = [
  { key: "active", label: "Active placements", icon: <UsersIcon size={20} />, tone: "blue" },
  { key: "startingSoon", label: "Starting soon", icon: <CalendarIcon size={20} />, tone: "green" },
  { key: "endingSoon", label: "Ending soon", icon: <ClockIcon size={20} />, tone: "orange" },
  { key: "pool", label: "Redeployment pool", icon: <UsersIcon size={20} />, tone: "violet" },
];

/**
 * The four KPI tiles: active placements, starting soon, ending soon and the redeployment pool. All four name something to act on, so
 * they stay; they are plain figures from the API (no trend line, no comparison).
 */
export default function KpiTiles({ counts, loading, error }: { counts: Counts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Placement figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        return (
          <li key={t.key} data-kpi={t.key}>
            <div className="ent-card relative flex h-full flex-col px-4 pb-3 pt-3.5">
              <span aria-hidden className="ent-kpi-chip !h-10 !w-10 !rounded-[10px]" data-tone={t.tone}>
                {t.icon}
              </span>
              <span className="ent-kpi-label mt-2.5 !text-[12.5px] !font-normal leading-tight">{t.label}</span>
              <div className="mt-1">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="ent-kpi-value !text-[25px]" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
