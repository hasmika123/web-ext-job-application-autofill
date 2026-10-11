import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Landing-section wrapper (spec sections 7 and 10): 20px gutters on mobile, 64px / 96px vertical
 * rhythm, centred 1200px column. `overflow-x-clip` keeps decorative bleed (mascots, doodles) from
 * ever creating a horizontal page scroll. `id` is the in-page anchor target for `nav.ts`.
 */
export default function Section({
  id,
  labelledBy,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("relative scroll-mt-20 overflow-x-clip px-5 py-16 lg:px-8 lg:py-24", className)}
    >
      <div className={cn("mx-auto max-w-[1200px]", innerClassName)}>{children}</div>
    </section>
  );
}
