import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Caveat handwriting for annotations ("Step by step to your next chapter."). Always decorative:
 * `aria-hidden`, never the only carrier of information. Spec sections 2.3 / 4.
 * `family` colours it from the accent map; `ink="navy"` is the dark blue marker the hero boards
 * use (the family prop is then ignored).
 */
export default function Handwritten({
  family = "violet",
  ink,
  className,
  children,
}: {
  family?: Family;
  ink?: "navy";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block font-[family-name:var(--font-hand)] text-[24px] leading-[1.05] lg:text-[28px]",
        ink === "navy" ? "text-[#232A86]" : FAMILY[family].headline,
        className,
      )}
    >
      {children}
    </span>
  );
}
