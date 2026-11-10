"use client";

import { AlertIcon, UserIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import type { ReactNode } from "react";
import TalentKpi from "@/components/ent/shell/TalentKpi";
import type { KpiTile, Kpis } from "@/lib/ent/marketing-assignments";

const TILES: { key: KpiTile["key"]; label: string; icon: ReactNode; tone: KpiTone }[] = [
  { key: "unassigned", label: "Unassigned consultants", icon: <UserIcon size={22} />, tone: "orange" },
  { key: "overloaded", label: "Overloaded marketers", icon: <AlertIcon size={22} />, tone: "pink" },
];

/**
 * The two attention tiles: consultants nobody looks after, and marketers carrying more than their capacity. The other counts are in the
 * marketers list header. Plain figures from the API (no trend line, no comparison).
 */
export default function KpiRow({ kpis, loading, error, onRetry }: { kpis: Kpis | null; loading: boolean; error: boolean; onRetry: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 xl:max-w-[58%]" data-kpi-row>
      {TILES.map((t) => {
        const tile = kpis?.tiles.find((x) => x.key === t.key) ?? null;
        return (
          <div key={t.key} className="min-w-0">
            <TalentKpi id={t.key} tone={t.tone} label={t.label} icon={t.icon} loading={loading} value={tile ? tile.current.toLocaleString("en-US") : error ? "\u2014" : ""} vs="" />
            {error && !loading && (
              <button type="button" onClick={onRetry} className="mt-1 text-[12px] font-semibold text-accent-deep underline">
                Try again
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
