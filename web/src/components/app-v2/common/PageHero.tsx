import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Rounded 20px banner at the top of an app page: a soft gradient wash (lime tints for the
 * individual app, blue for the org app) with pastel blobs, a navy 800 title, a lede, an optional
 * handwritten note and art anchored bottom-right.
 *
 * Variants (all optional):
 *  - `eyebrow`: a chip above the title (org: "Acme Corp [Enterprise]").
 *  - `icon` + `iconPlacement`: a tile before the title (default) or a bare blue glyph after it.
 *  - `note` + `notePlacement`: handwritten annotation under the subtitle (default) or tilted to
 *    the right of the art (`"aside"`, the org banner).
 *  - `decor`: an extra absolutely-positioned layer (doodles).
 *  - `size="lg"`: the org hero (40px title, art + note from `lg`).
 *  - `artFrom`: the breakpoint the art appears at (default `sm`, `lg` for size `lg`; below it the
 *    copy keeps the whole width).
 */
export default function PageHero({
  title,
  icon,
  iconPlacement = "before",
  subtitle,
  eyebrow,
  note,
  notePlacement = "below",
  art,
  artFrom,
  decor,
  tone = "lime",
  size = "md",
  actions,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  iconPlacement?: "before" | "after";
  subtitle: ReactNode;
  eyebrow?: ReactNode;
  /** Handwritten (Caveat) annotation. Decorative: never the only carrier of information. */
  note?: ReactNode;
  notePlacement?: "below" | "aside";
  art?: ReactNode;
  artFrom?: "sm" | "md" | "lg";
  decor?: ReactNode;
  tone?: "lime" | "blue";
  size?: "md" | "lg";
  actions?: ReactNode;
  className?: string;
}) {
  const blue = tone === "blue";
  const lg = size === "lg";
  const wash = blue
    ? "bg-[linear-gradient(110deg,#EEF4FF_0%,#E3EEFF_55%,#EAF3FF_100%)]"
    : "bg-[linear-gradient(110deg,#F1FBE4_0%,#E6F6EE_55%,#E4F1FF_100%)]";
  const blobA = blue ? "bg-v2-blue/15" : "bg-v2-lime/30";
  const blobB = blue ? "bg-v2-violet/10" : "bg-v2-blue/15";
  const from = artFrom ?? (lg ? "lg" : "sm");
  const artShow = { sm: "sm:flex", md: "md:flex", lg: "lg:flex" }[from];
  const iconTile = (
    <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-xl", blue ? "bg-v2-blue-soft text-v2-blue" : "bg-v2-lime-soft text-v2-green-ink")}>
      {icon}
    </span>
  );
  return (
    <section className={cn("relative overflow-hidden rounded-[20px] border border-white/70", wash, className)}>
      <span aria-hidden className={cn("pointer-events-none absolute -left-10 -top-14 h-48 w-48 rounded-full blur-2xl", blobA)} />
      <span aria-hidden className={cn("pointer-events-none absolute -bottom-16 right-1/4 h-52 w-52 rounded-full blur-3xl", blobB)} />
      {decor}
      <div
        className={cn(
          "relative z-[1] flex min-h-[148px] justify-between",
          lg ? "items-end gap-6 px-5 pb-5 pt-5 md:px-8 md:pb-6 md:pt-6" : "items-stretch",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col justify-center",
            lg ? "max-w-[640px] self-center" : "flex-1 px-5 py-6 sm:px-7 sm:py-7",
          )}
        >
          {eyebrow && <div className={lg ? "mb-3" : "mb-2"}>{eyebrow}</div>}
          <h1
            className={cn(
              "flex items-center font-display font-extrabold text-ink",
              lg ? "gap-3 text-[32px] leading-tight md:text-[40px]" : "gap-2.5 text-[28px] leading-[1.05] sm:text-[32px]",
            )}
          >
            {icon && iconPlacement === "before" && iconTile}
            <span>{title}</span>
            {icon && iconPlacement === "after" && <span className="flex-none text-v2-blue [&>svg]:h-8 [&>svg]:w-8">{icon}</span>}
          </h1>
          <p
            className={cn(
              "mt-2.5 text-ink-soft",
              lg ? "max-w-[560px] text-[14.5px] leading-snug md:text-[15.5px]" : "max-w-[34rem] text-[14.5px] leading-relaxed",
            )}
          >
            {subtitle}
          </p>
          {note && notePlacement === "below" && (
            <p aria-hidden className={cn("mt-3 font-[family-name:var(--font-hand)] text-[22px] leading-none", blue ? "text-ink" : "text-v2-green-ink")}>
              {note}
            </p>
          )}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {(art || (note && notePlacement === "aside")) && (
          <div className={cn("relative hidden flex-none items-end self-stretch", lg ? "" : "justify-end pr-3", artShow)}>
            {art}
            {note && notePlacement === "aside" && (
              <div aria-hidden className="mb-auto ml-2 mr-4 mt-2 w-[150px] -rotate-6 self-start xl:w-[170px]">
                {note}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
