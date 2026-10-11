import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@kiwiply/ui";
import AppArt, { type AppArtName } from "./AppArt";

/**
 * The soft hero band every app v3 page opens with (APP-V3-SPEC section 0): pale lime-to-blue wash,
 * rounded 20px, 120-150px tall. Left: `title` (ReactNode, so a page can add a doodle), one-line
 * `subtitle`, optional `actions` and a free `children` slot (a search box, chips). Right: an optional
 * `aside` card, then the mascot (`art`: a board art name or a /public path) with a handwritten `note`
 * tilted beside it. Art, note and aside appear from `sm` / `lg`; below that the copy owns the width.
 */
export default function HeroBand({
  title,
  subtitle,
  art,
  artHeight = 120,
  note,
  actions,
  children,
  aside,
  decor,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  art?: AppArtName | (string & {});
  artHeight?: number;
  /** Handwritten (Caveat) annotation beside the art. Decorative: never the only carrier of information. */
  note?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** A card on the right (e.g. "Let AI find better matches for you"). Shown from `xl`. */
  aside?: ReactNode;
  decor?: ReactNode;
  className?: string;
}) {
  const image =
    art &&
    (art.includes("/") ? (
      <Image src={art} alt="" aria-hidden unoptimized width={artHeight} height={artHeight} className="h-auto w-auto object-contain" style={{ maxHeight: artHeight }} />
    ) : (
      <AppArt name={art as AppArtName} height={artHeight} />
    ));
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(105deg,#F1FBE4_0%,#E6F6EE_50%,#E1EEFF_100%)]",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-14 h-48 w-48 rounded-full bg-v2-lime/30 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-1/4 h-52 w-52 rounded-full bg-v2-blue/15 blur-3xl" />
      {decor}
      <div className="relative z-[1] flex min-h-[124px] items-stretch justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-5 sm:px-7 sm:py-6">
          <h1 className="flex flex-wrap items-center gap-x-2.5 font-display text-[26px] font-extrabold leading-[1.08] text-ink sm:text-[32px]">
            {title}
          </h1>
          {subtitle && <p className="mt-2 max-w-[38rem] text-[14.5px] leading-relaxed text-ink-soft">{subtitle}</p>}
          {children && <div className="mt-4">{children}</div>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {aside && <div className="hidden flex-none items-center self-center py-4 xl:flex">{aside}</div>}
        {(image || note) && (
          <div className="relative hidden flex-none items-end justify-end self-stretch pr-4 sm:flex">
            {note && (
              <p
                aria-hidden
                className="absolute -left-[138px] top-4 z-[2] hidden w-[140px] -rotate-6 font-[family-name:var(--font-hand)] text-[21px] leading-[1.05] text-v2-green-ink md:block"
              >
                {note}
              </p>
            )}
            {image}
          </div>
        )}
      </div>
    </section>
  );
}
