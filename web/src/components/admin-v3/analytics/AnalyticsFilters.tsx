"use client";

import type { ReactNode } from "react";
import { BarChartIcon, CalendarIcon, CrownIcon, MapPinIcon, ShareNodesIcon, cn, useToast } from "@kiwiply/ui";
import { FilterSelect, IconTile } from "@/components/app-v2/common";
import { FILTERS } from "./sample-data";

const ICON: Record<string, ReactNode> = {
  "Date range": <CalendarIcon size={20} />,
  "Acquisition channel": <ShareNodesIcon size={20} />,
  Plan: <CrownIcon size={20} />,
  Geography: <MapPinIcon size={20} />,
};

/**
 * The board's filter row. The analytics endpoint takes no filters yet, so every select keeps its
 * default and a change just says "coming soon" (nothing pretends to re-slice the numbers).
 */
export default function AnalyticsFilters({ className }: { className?: string }) {
  const toast = useToast();
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4", className)}>
      {FILTERS.map((f) => (
        <div key={f.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-v2-line/60 bg-paper p-2.5 shadow-v2-soft sm:p-3">
          <span className="hidden sm:block"><IconTile tone={f.tone} className="h-11 w-11 flex-none rounded-xl">
            {ICON[f.label] ?? <BarChartIcon size={20} />}
          </IconTile></span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12px] text-ink-soft">
              {f.label}
            </div>
            <FilterSelect
              label={f.label}
              options={f.options}
              value={f.options[0]}
              onChange={() => toast({ title: `Filtering by ${f.label.toLowerCase()}: coming soon.` })}
              className="w-full"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
