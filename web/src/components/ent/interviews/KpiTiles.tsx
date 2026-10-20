"use client";

import type { ReactNode } from "react";
import { CalendarIcon, CheckCircleIcon, ClockIcon, KpiTile, CalendarCheckIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import type { Counts, Tile } from "@/lib/ent/interviews";

interface TileDef {
  key: keyof Pick<Counts, "total" | "scheduledThisWeek" | "inProgress" | "completed">;
  label: string;
  tone: KpiTone;
  icon: ReactNode;
}

const TILES: TileDef[] = [
  { key: "total", label: "Total interviews", tone: "violet", icon: <CalendarCheckIcon size={22} /> },
  { key: "scheduledThisWeek", label: "Scheduled this week", tone: "green", icon: <CalendarIcon size={22} /> },
  { key: "inProgress", label: "In progress", tone: "orange", icon: <ClockIcon size={22} /> },
  { key: "completed", label: "Completed", tone: "blue", icon: <CheckCircleIcon size={22} /> },
];

/**
 * The four KPI tiles: total, scheduled this week, in progress and completed. Plain figures from the API (no trend line, no comparison).
 */
export default function KpiTiles({ counts, loading, error }: { counts: Counts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Interview figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpi-tiles>
      {TILES.map((t) => {
        const tile: Tile | null = counts ? counts[t.key] : null;
        return (
          <li key={t.key}>
            <KpiTile
              className="!p-3.5 [&_.ent-kpi-chip]:!h-10 [&_.ent-kpi-chip]:!w-10 [&_.ent-kpi-label]:!mt-2"
              id={t.key}
              tone={t.tone}
              label={t.label}
              icon={t.icon}
              loading={loading}
              value={tile ? tile.value.toLocaleString("en-US") : error ? "\u2014" : ""}
            />
          </li>
        );
      })}
    </ul>
  );
}
