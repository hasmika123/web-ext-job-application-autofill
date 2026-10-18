"use client";

import type { ReactNode } from "react";
import { CalendarIcon, ClockIcon, Skeleton, Sparkline, UsersIcon, deltaOf } from "@kiwiply/ui";
import type { Counts, Tile } from "@/lib/ent/placements";

type TileKey = "active" | "startingSoon" | "endingSoon" | "pool";

interface TileDef {
  key: TileKey;
  label: string;
  icon: ReactNode;
  /** The icon tile's tone (theme-tenant.css `.ent-kpi-chip[data-tone]`) and the curve's stroke (the board draws each curve in the tile's own colour). */
  tone: "blue" | "green" | "orange" | "violet";
  line: string;
}

const TILES: TileDef[] = [
  { key: "active", label: "Active Placements", icon: <UsersIcon size={20} />, tone: "blue", line: "var(--ent-kpi-blue-fg)" },
  { key: "startingSoon", label: "Starting Soon", icon: <CalendarIcon size={20} />, tone: "green", line: "var(--ent-kpi-green-line)" },
  { key: "endingSoon", label: "Ending Soon", icon: <ClockIcon size={20} />, tone: "orange", line: "var(--ent-kpi-orange-line)" },
  { key: "pool", label: "Redeployment Pool", icon: <UsersIcon size={20} />, tone: "violet", line: "var(--ent-kpi-violet-fg)" },
];

/**
 * The four KPI tiles. The delta ("vs last month") is drawn only when the API rebuilt a figure from thirty days ago: an organization younger than
 * a month shows the figure alone. The curve is the weekly series the API computed. As on the board the colour follows the arrow (green up, red down),
 * not the meaning of the metric.
 */
export default function KpiTiles({ counts, loading, error }: { counts: Counts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Placement figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tile ? deltaOf(tile.value, tile.previous) : null;
        const up = delta?.dir === "up";
        const down = delta?.dir === "down";
        return (
          <li key={t.key} data-kpi={t.key}>
            <div className="ent-card relative flex h-full flex-col px-4 pb-3 pt-3.5">
              <span aria-hidden className="ent-kpi-chip !h-10 !w-10 !rounded-[10px]" data-tone={t.tone}>
                {t.icon}
              </span>
              <span className="ent-kpi-label mt-2.5 !text-[12.5px] !font-normal leading-tight">{t.label}</span>
              <div className="mt-1 flex items-end justify-between gap-2">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="ent-kpi-value !text-[25px]" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.series.length > 1 && (
                  <Sparkline values={tile.series} color={t.line} label={`${t.label}, last ${tile.series.length} weeks`} className="mb-0.5 !h-8 !w-[82px] flex-none" />
                )}
              </div>
              {delta && !loading && (
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[color:var(--pl-soft)]" data-kpi-delta data-delta={delta.dir}>
                  <span className="ent-kpi-delta inline-flex items-center gap-1 font-bold" data-good={up ? "true" : down ? "false" : undefined}>
                    <span aria-hidden>{up ? "▲" : down ? "▼" : "▬"}</span>
                    <span className="sr-only">{up ? "Up " : down ? "Down " : "No change "}</span>
                    {up && !delta.text.startsWith("+") ? "+" : down ? "-" : ""}
                    {delta.text}
                  </span>
                  vs last month
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
