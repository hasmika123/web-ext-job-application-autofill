"use client";

import type { ReactNode } from "react";
import { CalendarIcon, CheckCircleIcon, ClockIcon, KpiTile, deltaOf, CalendarCheckIcon } from "@kiwiply/ui";
import type { KpiDelta, KpiTone } from "@kiwiply/ui";
import type { Counts, Tile } from "@/lib/ent/interviews";

interface TileDef {
  key: keyof Pick<Counts, "total" | "scheduledThisWeek" | "inProgress" | "completed">;
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  /** What the comparison figure is: "vs last month", or "vs last week" for the tile that counts a calendar week. */
  vs: string;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total Interviews", tone: "violet", icon: <CalendarCheckIcon size={22} />, vs: "vs last month" },
  { key: "scheduledThisWeek", label: "Scheduled This Week", tone: "green", icon: <CalendarIcon size={22} />, vs: "vs last week" },
  { key: "inProgress", label: "In Progress", tone: "orange", icon: <ClockIcon size={22} />, vs: "vs last month" },
  { key: "completed", label: "Completed", tone: "blue", icon: <CheckCircleIcon size={22} />, vs: "vs last month" },
];

/** "+18%" / "-8%": the board writes the sign; the arrow still carries the direction for assistive tech. */
export function deltaText(tile: Tile): KpiDelta | null {
  const d = deltaOf(tile.value, tile.previous);
  if (!d) return null;
  const text = d.dir === "up" ? (d.text.startsWith("+") ? d.text : `+${d.text}`) : d.dir === "down" ? `-${d.text}` : d.text;
  return { text, dir: d.dir, good: d.dir === "flat" ? null : d.dir === "up" };
}

/**
 * The four KPI tiles. The delta is drawn only when the API rebuilt a comparison figure from the history (an organization younger than a
 * month shows the figure alone); the sparkline is the weekly series the API computed. Nothing here is invented.
 */
export default function KpiTiles({ counts, loading, error }: { counts: Counts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Interview figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        const delta = tile ? deltaText(tile) : null;
        return (
          <li key={t.key}>
            <KpiTile
              className="!p-3.5 [&_.ent-kpi-chip]:!h-10 [&_.ent-kpi-chip]:!w-10 [&_.ent-kpi-label]:!mt-2 [&_[data-kpi-delta]]:!mt-1"
              id={t.key}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              loading={loading}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
              delta={delta ? { ...delta, suffix: t.vs } : null}
              series={tile && tile.series.length >= 2 ? tile.series : null}
              seriesLabel={tile ? `${t.label}, last ${tile.series.length} weeks` : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}
