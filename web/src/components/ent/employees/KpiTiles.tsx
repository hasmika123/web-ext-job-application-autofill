"use client";

import type { ReactNode } from "react";
import { Card, CheckCircleIcon, ClockIcon, DeltaChip, LayersIcon, MinusCircleIcon, NetworkIcon, Skeleton, UsersIcon } from "@kiwiply/ui";
import { tileDelta, type MemberCounts, type Tile } from "@/lib/ent/members";

interface TileDef {
  key: keyof Pick<MemberCounts, "total" | "active" | "invited" | "suspended" | "departments" | "teams">;
  label: string;
  icon: ReactNode;
  /** A rise in this figure is bad news (suspensions). */
  lowerIsBetter?: boolean;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Employees", icon: <UsersIcon size={18} /> },
  { key: "active", label: "Active Employees", icon: <CheckCircleIcon size={18} /> },
  { key: "invited", label: "Invited (Pending)", icon: <ClockIcon size={18} /> },
  { key: "suspended", label: "Suspended", icon: <MinusCircleIcon size={18} />, lowerIsBetter: true },
  { key: "departments", label: "Departments", icon: <NetworkIcon size={18} /> },
  { key: "teams", label: "Teams", icon: <LayersIcon size={18} /> },
];

/**
 * The six KPI tiles of the Employees board. The delta ("vs last month") is drawn only when the API gave one: a tile with no history
 * (an organization younger than a month) shows the figure and nothing else, and there is no sparkline because there is no series.
 */
export default function KpiTiles({ counts, loading, error }: { counts: MemberCounts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Employee figures" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tileDelta(tile);
        return (
          <li key={t.key} data-kpi={t.key}>
            <Card className="flex h-full flex-col gap-1 !p-3.5">
              <span aria-hidden className="mb-1 inline-grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent-deep">
                {t.icon}
              </span>
              <span className="text-[13px] font-medium text-ink-soft">{t.label}</span>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-14" />
              ) : (
                <span className="text-[26px] font-extrabold leading-tight tracking-tight text-ink tabular-nums" data-kpi-value>
                  {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                </span>
              )}
              {delta && (
                <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-kpi-delta>
                  <DeltaChip delta={delta} lowerIsBetter={t.lowerIsBetter} />
                  vs last month
                </span>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
