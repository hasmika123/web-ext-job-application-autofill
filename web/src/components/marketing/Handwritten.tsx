import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Caveat handwriting for annotations ("Step by step to your next chapter."). Always decorative:
 * `aria-hidden`, never the only carrier of information. Spec sections 2.3 / 4.
 */
export default function Handwritten({
  family = "violet",
  className,
  children,
}: {
  family?: Family;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block font-[family-name:var(--font-hand)] text-[24px] leading-[1.05] lg:text-[28px]",
        FAMILY[family].headline,
        className,
      )}
    >
      {children}
    </span>
  );
}
