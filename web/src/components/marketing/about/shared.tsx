import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, PlayIcon, buttonVariants, cn } from "@kiwiply/ui";
import { DEMO_VIDEO_URL } from "@/lib/site";
import Eyebrow from "../Eyebrow";
import { FAMILY, type Family } from "../family";

/**
 * Local helpers for the /about page (spec section 13.5). Everything here is built from the shared
 * marketing pieces (`Eyebrow`, `family.ts`) and `@kiwiply/ui` icons.
 */

export type { Family };

/** "Eyebrow pill + h2" on one row (centred on desktop, stacked on mobile), as on the board. */
export function RowHeading({
  id,
  eyebrow,
  title,
  accent,
  family = "green",
  className,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  /** Coloured trailing words of the heading. */
  accent?: string;
  family?: Family;
  className?: string;
  /** Decorative extras (handwriting, mascot) placed after the heading. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-center lg:gap-5",
        className,
      )}
    >
      <Eyebrow family={family}>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-[28px] leading-[1.1] text-v2-navy md:text-4xl lg:text-[36px]">
        {title}
        {accent ? (
          <>
            {" "}
            <span className={FAMILY.green.headline}>{accent}</span>
          </>
        ) : null}
      </h2>
      {children}
    </div>
  );
}

/** Rounded icon tile in a soft family colour. Children is an `@kiwiply/ui` icon element. */
export function IconTile({
  family,
  children,
  className,
}: {
  family: Family;
  children: ReactNode;
  className?: string;
}) {
  const f = FAMILY[family];
  return (
    <span
      aria-hidden
      className={cn("grid h-12 w-12 flex-none place-items-center rounded-2xl", f.soft, f.icon, className)}
    >
      {children}
    </span>
  );
}

/** "Our Mission →" lime button (links to the `#mission` section). */
export function MissionButton({ className }: { className?: string }) {
  return (
    <Link href="#mission" className={buttonVariants("accent", "lg", cn("min-h-11 w-full sm:w-auto", className))}>
      Our Mission
      <ArrowRightIcon size={16} aria-hidden />
    </Link>
  );
}

/**
 * "Watch Our Story · 2 min": the demo video when `DEMO_VIDEO_URL` is set, otherwise the
 * `#mission` section (spec 13: video buttons are always shown).
 */
export function WatchStory({ className, withDuration = false }: { className?: string; withDuration?: boolean }) {
  const href = DEMO_VIDEO_URL ?? "#mission";
  const external = /^https?:\/\//.test(href);
  const content = (
    <>
      <span
        aria-hidden
        className="grid h-10 w-10 flex-none place-items-center rounded-full border border-v2-line bg-white text-v2-blue"
      >
        <PlayIcon size={16} />
      </span>
      <span className="text-left leading-tight">
        <span className="block text-[15px] font-semibold text-v2-navy">Watch Our Story</span>
        {withDuration ? <span className="block text-[13px] font-medium text-v2-muted">2 min</span> : null}
      </span>
    </>
  );
  const cls = cn(
    "inline-flex min-h-11 items-center gap-3 rounded-[var(--radius-button)] no-underline",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    className,
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {content}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}
