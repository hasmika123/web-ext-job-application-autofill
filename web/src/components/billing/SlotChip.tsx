"use client";

import { Pill } from "@/components/ui";

/**
 * "3 of 3 active slots · 9 read-only": the resume list after a fallback to Free (docs/subscriptions/11-plan-retirement.md section 7.2, over-cap data).
 * All the counts are the API's; nothing was archived or deleted, the extra resumes are only read-only. Renders nothing when none are read-only.
 */
export default function SlotChip({ active, cap, readOnly }: { active: number; cap: number; readOnly: number }) {
  if (readOnly <= 0) return null;
  return (
    <Pill data-testid="slot-chip" title="Nothing was deleted. Pick a plan to use them all again.">
      {active} of {cap} active slots · {readOnly} read-only
    </Pill>
  );
}
