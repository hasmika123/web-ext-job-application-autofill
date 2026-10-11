"use client";

import { cn } from "@kiwiply/ui";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

/**
 * Pill tabs with counts ("All Applications (124)"): the active one is a blue-soft pill with a blue
 * outline. Local because `app-v2/common` only ships UnderlineTabs; QA can fold this in.
 */
export function PillTabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              on
                ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue"
                : "border-transparent text-v2-ink-soft hover:bg-[#F1F4FA]",
            )}
          >
            {t.count !== undefined ? `${t.label} (${t.count})` : t.label}
          </button>
        );
      })}
    </div>
  );
}
