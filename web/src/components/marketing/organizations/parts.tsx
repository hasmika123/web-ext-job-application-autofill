import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Small building blocks local to the /organizations page (the eyebrow, handwriting and section
 * heading live in the shared marketing components). All server components.
 */

/** Page-width container: same gutters as the header and footer. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-5 lg:px-8", className)}>{children}</div>;
}

/** Initials tile standing in for the board's face photos (we ship no portraits). */
export function Avatar({
  initials,
  family = "blue",
  className,
}: {
  initials: string;
  family?: Family;
  className?: string;
}) {
  const f = FAMILY[family];
  return (
    <span
      aria-hidden
      className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold", f.soft, f.text, className)}
    >
      {initials}
    </span>
  );
}

/** "Sarah Kim" -> "SK". */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
