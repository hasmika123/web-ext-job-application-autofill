import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/** Soft panel tints for banded landing sections (the board's rounded containers). */
export type SectionTone = "lime" | "blue" | "sky" | "lavender" | "white";

const TONE: Record<SectionTone, string> = {
  lime: "bg-gradient-to-br from-v2-lime-soft via-[#F4FCEA] to-white",
  blue: "bg-gradient-to-br from-[#EEF4FF] via-white to-[#F3F8FF]",
  sky: "bg-gradient-to-br from-v2-blue-soft via-[#F1F6FF] to-v2-violet-soft/60",
  lavender: "bg-gradient-to-r from-v2-violet-soft via-[#F6F2FF] to-v2-amber-soft/70",
  white: "bg-white shadow-v2-card",
};

/**
 * Landing-section wrapper (spec sections 7 and 10): 20px gutters on mobile, 64px / 96px vertical
 * rhythm, centred 1200px column. `overflow-x-clip` keeps decorative bleed (mascots, doodles) from
 * ever creating a horizontal page scroll. `id` is the in-page anchor target for `nav.ts`.
 *
 * `tone` turns the inner column into one of the board's rounded, softly tinted bands (and tightens
 * the section's own vertical padding so bands stack with a small gap, as on the board). The band
 * is `relative overflow-hidden`, so a cutout can sit flush on its bottom edge.
 */
export default function Section({
  id,
  labelledBy,
  tone,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  labelledBy?: string;
  tone?: SectionTone;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "relative scroll-mt-20 overflow-x-clip px-5 lg:px-8",
        tone ? "py-3 lg:py-4" : "py-16 lg:py-24",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[1200px]",
          tone && "relative overflow-hidden rounded-[28px] px-6 py-10 sm:px-10 lg:rounded-[32px] lg:px-14 lg:py-14",
          tone && TONE[tone],
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
