"use client";

import { ChevronDownIcon, cn } from "@kiwiply/ui";
import { tabKey, type TabDef } from "./tabs-shared";

/**
 * Pill tabs with counts ("All Applications (124)"): the active one is a blue-soft pill with a hairline
 * blue outline. Controlled: pass `value` and `onChange` from a client parent.
 */
export default function PillTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {tabs.map((t) => {
        const id = tabKey(t);
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              on ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue" : "border-transparent text-ink-soft hover:bg-[#F1F4FA]",
            )}
          >
            {t.label}
            {t.count !== undefined && <span> ({t.count})</span>}
            {t.menu && <ChevronDownIcon className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
