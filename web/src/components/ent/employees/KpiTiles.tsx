"use client";

import type { ReactNode } from "react";
import { Card, CheckCircleIcon, ClockIcon, LayersIcon, MinusCircleIcon, NetworkIcon, Skeleton, Sparkline, UsersIcon } from "@kiwiply/ui";
import { tileDelta, type MemberCounts, type Tile } from "@/lib/ent/members";

interface TileDef {
  key: keyof Pick<MemberCounts, "total" | "active" | "invited" | "suspended" | "departments" | "teams">;
  label: string;
  icon: ReactNode;
  /** The tile's own colour: the icon square, the sparkline. A tone, not a brand colour (the board shows violet, green, amber, red, violet, blue). */
  chip: string;
  line: string;
  /** A rise in this figure is bad news (suspensions). */
  lowerIsBetter?: boolean;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Employees", icon: <UsersIcon size={22} />, chip: "bg-v2-violet-soft text-v2-violet", line: "var(--color-v2-green)" },
  { key: "active", label: "Active Employees", icon: <CheckCircleIcon size={22} />, chip: "bg-v2-green-soft text-v2-green-ink", line: "var(--color-v2-green)" },
  { key: "invited", label: "Invited (Pending)", icon: <ClockIcon size={22} />, chip: "bg-v2-amber-soft text-v2-amber", line: "var(--color-v2-coral)" },
  { key: "suspended", label: "Suspended", icon: <MinusCircleIcon size={22} />, chip: "bg-v2-coral-soft text-v2-coral", line: "var(--color-v2-coral)", lowerIsBetter: true },
  { key: "departments", label: "Departments", icon: <NetworkIcon size={22} />, chip: "bg-v2-violet-soft text-v2-violet", line: "var(--color-v2-violet)" },
  { key: "teams", label: "Teams", icon: <LayersIcon size={22} />, chip: "bg-accent-soft text-accent", line: "var(--color-accent)" },
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
        const tone = good === null ? "text-ink-soft" : good ? "text-v2-green-ink" : "text-v2-coral-ink";
        return (
          <li key={t.key} data-kpi={t.key} className="relative">
            <Card className="flex h-full flex-col !p-4 !shadow-[0_1px_3px_rgba(16,24,64,.06)] xl:min-h-[168px]">
              <span aria-hidden className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${t.chip}`}>
                {t.icon}
              </span>
              <span className="mt-3 text-[14px] font-medium leading-tight text-ink-soft">{t.label}</span>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
                  </span>
                )}
                {tile && tile.previous !== null && !loading && <Sparkline values={[tile.previous, tile.value]} color={t.line} className="mb-0.5 !h-9 !w-[88px] flex-none" />}
              </div>
              {delta && (
                <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-soft" data-kpi-delta data-delta={delta.dir} data-good={good === null ? undefined : String(good)}>
                  <span className={`inline-flex items-center gap-1 font-bold ${tone}`}>
                    <span aria-hidden>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "▬"}</span>
                    <span className="sr-only">{delta.dir === "up" ? "Up " : delta.dir === "down" ? "Down " : "No change "}</span>
                    {delta.text}
                  </span>
                  vs last month
                </span>
              )}
            </Card>
            {t.key === "teams" && action && <div className="absolute right-3 top-3">{action}</div>}
          </li>
        );
      })}
    </ul>
  );
}
