"use client";

import { cn } from "@kiwiply/ui";

export interface UnderlineTab {
  value: string;
  label: string;
  count?: number;
}

/**
 * Underline tab strip with optional count pills. Active = green underline + green label (the
 * boards' look). Scrolls horizontally inside its own box on narrow screens (the page never does).
 */
export default function UnderlineTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: UnderlineTab[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-1 overflow-x-auto border-b border-v2-line [scrollbar-width:none]", className)}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "-mb-px flex flex-none items-center gap-2 whitespace-nowrap border-b-[3px] px-3.5 py-3 text-[14px] font-semibold transition-colors sm:px-4",
              active ? "border-v2-green text-v2-green" : "border-transparent text-v2-ink-soft hover:text-v2-navy",
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums",
                  active ? "bg-v2-green-soft text-v2-green" : "bg-[#EEF1F6] text-v2-ink-soft",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
