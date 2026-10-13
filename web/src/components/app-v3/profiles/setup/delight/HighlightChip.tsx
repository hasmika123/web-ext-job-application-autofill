"use client";

import { SparklesIcon, cn } from "@kiwiply/ui";

/**
 * The honest highlight on a review card (R1.16, ONBOARDING-DELIGHT-DESIGN 6): a small chip after ONE bullet naming something
 * that is literally in its text ("Numbers stand out to recruiters"). Real text, not decoration: it is useful to a screen-reader
 * user too, so it is NOT `aria-hidden` and is read right after the bullet. It pops in (150 ms) when the card appears, and is
 * static under reduced motion. It wraps as a unit (`inline-flex`, the label never breaks) and never exceeds its line.
 */
export default function HighlightChip({ label, rule, className }: { label: string; rule: string; className?: string }) {
  return (
    <span
      data-highlight={rule}
      className={cn(
        "ob-chip-pop ml-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft/70 px-2 py-[1px] align-baseline text-[11.5px] font-semibold text-accent-deep",
        className,
      )}
    >
      <SparklesIcon size={12} className="flex-none" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
