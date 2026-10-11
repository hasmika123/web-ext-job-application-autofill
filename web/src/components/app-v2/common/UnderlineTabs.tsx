import { cn } from "@kiwiply/ui";

export interface UnderlineTab {
  id: string;
  label: string;
  /** Rendered as "Label (n)". */
  count?: number;
}

/**
 * Underline tabs with optional counts ("Recommended for You (124)"). Controlled: pass `value` and
 * `onChange` from a client parent. `scrollable` lets a long row scroll sideways inside itself on
 * phones instead of stretching the page.
 */
export default function UnderlineTabs({
  tabs,
  value,
  onChange,
  tone = "green",
  className,
  "aria-label": ariaLabel = "Sections",
}: {
  tabs: UnderlineTab[];
  value: string;
  onChange: (id: string) => void;
  tone?: "green" | "blue";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-5 overflow-x-auto border-b border-v2-line/70 [scrollbar-width:none]", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex-none whitespace-nowrap border-b-2 px-0.5 pb-3 pt-2 text-[14px] transition-colors",
              active
                ? cn("font-bold", tone === "blue" ? "border-v2-blue text-v2-blue" : "border-v2-green text-v2-green-ink")
                : "border-transparent font-medium text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
