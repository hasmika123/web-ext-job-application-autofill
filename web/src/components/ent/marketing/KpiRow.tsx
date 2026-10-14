"use client";

import { AlertIcon, CheckCircleIcon, UserIcon, UsersIcon } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import type { ReactNode } from "react";
import BeeBanner from "@/components/ent/shell/BeeBanner";
import TalentKpi from "@/components/ent/shell/TalentKpi";
import { tileView, type KpiTile, type Kpis } from "@/lib/ent/marketing-assignments";

const TILES: { key: KpiTile["key"]; label: string; icon: ReactNode; tone: KpiTone }[] = [
  { key: "assigned", label: "Assigned Consultants", icon: <UsersIcon size={22} />, tone: "violet" },
  { key: "marketers", label: "Active Marketers", icon: <CheckCircleIcon size={22} />, tone: "green" },
  { key: "unassigned", label: "Unassigned Consultants", icon: <UserIcon size={22} />, tone: "orange" },
  { key: "overloaded", label: "Overloaded Marketers", icon: <AlertIcon size={22} />, tone: "pink" },
];

/**
 * The four KPI tiles and the bee help card. Every figure and delta comes from the API's rows ("vs last month" is rebuilt from the
 * rows' own timestamps); a tile with no history shows the figure and nothing else, and a series with fewer than two points draws no curve.
 */
export default function KpiRow({ kpis, loading, error, onRetry, orgName, supportEmail }: { kpis: Kpis | null; loading: boolean; error: boolean; onRetry: () => void; orgName: string; supportEmail?: string | null }) {
  return (
    <div className="grid items-start gap-[15px] xl:grid-cols-[minmax(0,3.43fr)_minmax(0,1fr)]" data-kpi-row>
      <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((t) => {
          const tile = kpis?.tiles.find((x) => x.key === t.key) ?? null;
          const view = tileView(tile);
          return (
            <div key={t.key} className="min-w-0">
              <TalentKpi
                id={t.key}
                tone={t.tone}
                label={t.label}
                icon={t.icon}
                loading={loading}
                value={tile ? tile.current.toLocaleString("en-US") : error ? "—" : ""}
                delta={view}
                vs="vs last month"
                series={tile && tile.series.length > 1 ? tile.series : null}
                seriesLabel={`${t.label}, last weeks`}
              />
              {error && !loading && (
                <button type="button" onClick={onRetry} className="mt-1 text-[12px] font-semibold text-accent-deep underline">
                  Try again
                </button>
              )}
            </div>
          );
        })}
      </div>
      <BeeBanner
        title="Need help with marketing assignments?"
        body="I can help you balance workloads, reassign consultants, or find the best marketer for your team."
        topic="marketing assignments"
        orgName={orgName}
        supportEmail={supportEmail}
      />
    </div>
  );
}
