"use client";

import { Tooltip, cn } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { railIcon, visibleRailTabs } from "./RightRail";
import type { RailTab } from "./state/ui";

/**
 * The right rail collapsed to a 56 px icon strip (rail collapse, DECISIONS #28, DESIGN 10.1): shown
 * while the left sheet is open and pushing. Each icon closes the left sheet and opens the rail on
 * that tab (`onExpand`). Hit areas are 44 px; tooltips (drawn in a portal, so the rail's scroll box never clips them) + aria-labels carry the names.
 */
export default function RailStrip({
  config,
  suggestionCount = 0,
  activeTab,
  onExpand,
}: {
  config: ResumeBuilderConfig;
  suggestionCount?: number;
  activeTab: RailTab;
  onExpand: (tab: RailTab) => void;
}) {
  const showCount = config.aiAllowed && suggestionCount > 0;
  return (
    <nav
      aria-label="Resume insights (collapsed)"
      data-rail-strip
      className="flex h-fit flex-col items-center gap-1 rounded-2xl border border-v2-line/70 bg-paper py-2 shadow-v2-soft"
    >
      {visibleRailTabs(config.features).map((t) => {
        // The tooltip and the accessible name say the same thing, count included ("AI Suggestions (4)").
        const name = t.value === "ai" && showCount ? `${t.label} (${suggestionCount})` : t.label;
        return (
          <Tooltip key={t.value} content={name} side="left">
            <button
              type="button"
              aria-label={name}
              onClick={() => onExpand(t.value)}
              className={cn(
                "relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                activeTab === t.value ? "text-v2-green-ink" : "text-ink-soft",
              )}
            >
              {railIcon(t.value, "h-5 w-5")}
              {t.value === "ai" && showCount && (
                <span
                  aria-hidden
                  className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-v2-blue px-1 text-[10px] font-bold leading-4 text-white"
                >
                  {suggestionCount}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
