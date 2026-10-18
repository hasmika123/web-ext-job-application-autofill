"use client";

import type { ReactNode } from "react";
import { ClockIcon, NetworkIcon, PauseCircleSolidIcon, Skeleton, Sparkline, TeamSolidIcon, UsersSolidIcon, kpiLine } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import { tileDelta, type MemberCounts, type Tile } from "@/lib/ent/members";

interface TileDef {
  key: keyof Pick<MemberCounts, "total" | "active" | "invited" | "suspended" | "departments" | "teams">;
  label: string;
  icon: ReactNode;
  /** The tile's palette (icon square + curve): the boards' fixed tones, never the tenant's brand. */
  tone: KpiTone;
  /** A rise in this figure is bad news (suspensions). */
  lowerIsBetter?: boolean;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Employees", icon: <UsersSolidIcon size={24} />, tone: "violet" },
  { key: "active", label: "Active Employees", icon: <TeamSolidIcon size={24} />, tone: "green" },
  { key: "invited", label: "Invited (Pending)", icon: <ClockIcon size={24} strokeWidth={2.2} />, tone: "orange" },
  { key: "suspended", label: "Suspended", icon: <PauseCircleSolidIcon size={24} />, tone: "pink", lowerIsBetter: true },
  { key: "departments", label: "Departments", icon: <NetworkIcon size={24} strokeWidth={2.1} />, tone: "indigo" },
  { key: "teams", label: "Teams", icon: <UsersSolidIcon size={22} />, tone: "blue" },
];

/**
 * The six KPI tiles of the Employees board: a tinted icon square, the label, the figure with a small trend line beside it and the delta
 * ("vs last month") below. The delta and the trend line are drawn only when the API gave a comparison: a tile with no history (an
 * organization younger than a month) shows the figure and nothing else. The trend line joins last month's figure to this month's, the
 * only two points the API holds. `action` (the Add Employee button) sits in the top-right corner of the last tile, as on the board.
 */
export default function KpiTiles({ counts, loading, error, action }: { counts: MemberCounts | null; loading: boolean; error: boolean; compact?: boolean; action?: ReactNode }) {
  return (
    <ul aria-label="Employee figures" className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.35fr)]" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tileDelta(tile);
        const good = delta ? (delta.dir === "flat" ? null : (delta.dir === "up") !== !!t.lowerIsBetter) : null;
        return (
          <li key={t.key} data-kpi={t.key} className="relative">
            <div className="ent-card flex h-full flex-col px-4 pb-3.5 pt-3.5 xl:min-h-[167px]">
              <span aria-hidden className="ent-kpi-chip" data-tone={t.tone}>
                {t.icon}
              </span>
              <span className="ent-kpi-label mt-3 leading-tight">{t.label}</span>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="ent-kpi-value" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.previous !== null && !loading && <Sparkline values={[tile.previous, tile.value]} smooth color={kpiLine(t.tone)} className="mb-0.5 !h-9 !w-[88px] flex-none" />}
              </div>
              {delta && (
                <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2 text-[13.5px] text-ink-soft" data-kpi-delta data-delta={delta.dir} data-good={good === null ? undefined : String(good)}>
                  <span className="ent-kpi-delta inline-flex items-center gap-1 font-bold" data-good={good === null ? undefined : String(good)}>
                    <span aria-hidden>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "▬"}</span>
                    <span className="sr-only">{delta.dir === "up" ? "Up " : delta.dir === "down" ? "Down " : "No change "}</span>
                    {delta.text}
                  </span>
                  vs last month
                </span>
              )}
            </div>
            {t.key === "teams" && action && <div className="absolute right-3 top-3">{action}</div>}
          </li>
        );
      })}
    </ul>
  );
}
