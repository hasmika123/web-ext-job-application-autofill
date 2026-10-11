"use client";

import { cn } from "@kiwiply/ui";
import { tabKey, type TabDef } from "./tabs-shared";

export type UnderlineTab = TabDef;

/**
 * Underline tabs with optional counts and icons. Controlled: pass `value` and `onChange` from a
 * client parent. The row scrolls sideways inside itself on phones instead of stretching the page.
 *
 *  - `tone`: green (individual app) or blue (org admin) active underline.
 *  - `counts`: "paren" -> "Recommended for You (124)"; "pill" -> a count pill after the label.
 *  - `padded`: the boards' roomier tabs (14px padding, 3px underline) used inside page cards.
 */
export default function UnderlineTabs({
  tabs,
  value,
  onChange,
  tone = "green",
  counts = "paren",
  padded,
  className,
  ariaLabel = "Sections",
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  tone?: "green" | "blue";
  counts?: "paren" | "pill";
  padded?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const blue = tone === "blue";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex overflow-x-auto border-b border-v2-line/70 [scrollbar-width:none]",
        padded ? "gap-1" : "gap-4 xl:gap-5",
        className,
      )}
    >
      {tabs.map((t) => {
        const id = tabKey(t);
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "relative -mb-px flex flex-none items-center whitespace-nowrap transition-colors",
              padded
                ? "gap-2 border-b-[3px] px-3.5 py-3 text-[14px] font-semibold sm:px-4"
                : "border-b-2 px-0.5 pb-3 pt-2 text-[14px]",
              active
                ? cn(padded ? "" : "font-bold", blue ? "border-v2-blue text-v2-blue" : "border-v2-green text-v2-green-ink")
                : cn("border-transparent text-ink-soft hover:text-ink", !padded && "font-medium"),
            )}
          >
            {t.icon && <span className="mr-2 flex [&>svg]:h-4 [&>svg]:w-4">{t.icon}</span>}
            {t.label}
            {t.count !== undefined && counts === "paren" && <span className={cn("ml-1", padded && "text-v2-muted")}>({t.count})</span>}
            {t.count !== undefined && counts === "pill" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums",
                  active ? (blue ? "bg-v2-blue-soft text-v2-blue" : "bg-v2-green-soft text-v2-green-ink") : "bg-paper-2 text-ink-soft",
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
