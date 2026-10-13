"use client";

import { FileTextIcon, cn } from "@kiwiply/ui";
import type { Interest } from "@/lib/ent/marketer-ws/opportunities";

/** Small pieces of the Opportunities board shared by the page and its dialogs. Tenant tokens only. */

/** Dot + soft pill per interest; the dot colours match the Consultant Responses donut. */
export const INTEREST_TONE: Record<Interest, { dot: string; pill: string; chart: string }> = {
  VERY_INTERESTED: { dot: "bg-v2-green", pill: "bg-v2-green-soft text-v2-green-ink", chart: "var(--color-v2-green)" },
  INTERESTED: { dot: "bg-v2-blue", pill: "bg-accent-soft text-accent-deep", chart: "var(--color-v2-blue)" },
  OPEN: { dot: "bg-v2-amber", pill: "bg-v2-amber-soft text-v2-amber-ink", chart: "var(--color-v2-amber)" },
  NOT_INTERESTED: { dot: "bg-v2-coral", pill: "bg-v2-pink-soft text-v2-pink-ink", chart: "var(--color-v2-coral)" },
  NO_RESPONSE: { dot: "bg-v2-violet", pill: "bg-v2-violet-soft text-v2-violet-ink", chart: "var(--color-v2-violet)" },
};

export function ResumeBadge({ state }: { state: "UPDATED" | "NEEDS_UPDATE" }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
      <span aria-hidden className={cn("grid h-5 w-5 place-items-center rounded", state === "UPDATED" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}>
        <FileTextIcon size={12} />
      </span>
      {state === "UPDATED" ? "Updated" : "Needs Update"}
    </span>
  );
}
