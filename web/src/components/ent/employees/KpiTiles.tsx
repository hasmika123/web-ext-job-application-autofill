"use client";

import type { ReactNode } from "react";
import { ClockIcon, PauseCircleSolidIcon, Skeleton, TeamSolidIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import type { MemberCounts } from "@/lib/ent/members";

interface TileDef {
  key: keyof Pick<MemberCounts, "active" | "invited" | "suspended">;
  label: string;
  icon: ReactNode;
  /** The tile's palette (icon square): the boards' fixed tones, never the tenant's brand. */
  tone: KpiTone;
}

const TILES: TileDef[] = [
  { key: "active", label: "Active", icon: <TeamSolidIcon size={24} />, tone: "green" },
  { key: "invited", label: "Invited", icon: <ClockIcon size={24} strokeWidth={2.2} />, tone: "orange" },
  { key: "suspended", label: "Suspended", icon: <PauseCircleSolidIcon size={24} />, tone: "pink" },
];

/**
 * The three figures of the Employees list: how many are active, invited and suspended. Plain numbers (no trend line, no comparison):
 * the total is the list's own count and the departments and teams have their own page.
 */
export default function KpiTiles({ counts, loading, error }: { counts: MemberCounts | null; loading: boolean; error: boolean }) {
  return (
    <ul aria-label="Employee figures" className="grid grid-cols-3 gap-3.5" data-kpi-tiles>
      {TILES.map((t) => {
        const tile = counts ? counts[t.key] : null;
        return (
          <li key={t.key} data-kpi={t.key}>
            <div className="ent-card flex h-full flex-col px-4 pb-3.5 pt-3.5">
              <span aria-hidden className="ent-kpi-chip" data-tone={t.tone}>
                {t.icon}
              </span>
              <span className="ent-kpi-label mt-3 leading-tight">{t.label}</span>
              <div className="mt-1.5">
                {loading ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  <span className="ent-kpi-value" data-kpi-value>
                    {tile ? tile.value.toLocaleString("en-US") : error ? "—" : ""}
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
