"use client";

import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/** Full-width tab bar in a white card; the active tab is a blue-soft pill. Controlled (value + onChange). */
export default function AdminTabs({
  tabs,
  value,
  onChange,
  ariaLabel = "Sections",
  className,
}: {
  tabs: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-1 overflow-x-auto rounded-2xl border border-v2-line/70 bg-paper p-1.5 shadow-v2-soft [scrollbar-width:none]", className)}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex min-w-fit flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-[13.5px] sm:px-4 sm:text-[14px] font-semibold transition-colors",
              on ? "bg-v2-blue-soft text-v2-blue" : "text-ink-soft hover:bg-paper-2",
            )}
          >
            {t.icon && <span className="flex [&>svg]:h-[18px] [&>svg]:w-[18px]">{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
