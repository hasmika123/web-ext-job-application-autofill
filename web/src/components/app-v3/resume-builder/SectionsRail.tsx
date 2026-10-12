"use client";

import { RESUME_DEFAULT_SECTION_TITLES, cn } from "@kiwiply/ui";
import type { ResumeSection } from "@kiwiply/ui";

/** The editable kinds in R0.5; the rest are listed (so the structure is visible) but read-only. */
export const EDITABLE_KINDS: ReadonlySet<string> = new Set(["SUMMARY", "EXPERIENCE"]);

export function sectionTitle(s: ResumeSection): string {
  return s.title?.trim() || RESUME_DEFAULT_SECTION_TITLES[s.kind];
}

/**
 * The Sections rail: a vertical list from `xl`, a horizontally scrolling chip row below it. List
 * only in R0.5 - reorder, show/hide and "add section" arrive with R1.
 */
export default function SectionsRail({
  sections,
  activeId,
  onSelect,
  className,
}: {
  sections: ResumeSection[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Resume sections" className={cn("min-w-0 rounded-2xl border border-v2-line/70 bg-paper p-2 shadow-v2-soft xl:p-3", className)}>
      <h2 className="mb-2 hidden px-2 text-[11.5px] font-extrabold uppercase tracking-wider text-ink-soft xl:block">Sections</h2>
      <ul className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] xl:flex-col xl:overflow-visible xl:pb-0">
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id} className="flex-none">
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-left text-[13.5px] transition-colors sm:min-h-9",
                  active ? "bg-v2-blue-soft font-bold text-v2-blue" : "font-medium text-ink-soft hover:bg-paper-2",
                  s.hidden && "opacity-60",
                )}
              >
                <span>{sectionTitle(s)}</span>
                {s.hidden && <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft">Hidden</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
