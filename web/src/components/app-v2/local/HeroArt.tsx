import { SparkBurst, StarDoodle, cn } from "@kiwiply/ui";
import AppArt, { type AppArtName } from "./AppArt";

/**
 * The hero's right-hand art: a handwritten sticky note tilted over a mascot, with doodle stars.
 * Pure CSS/PNG (no inline svg). `note` lines render in Caveat on the sticky background.
 */
export default function HeroArt({
  mascot,
  note,
  mascotHeight = 120,
  className,
}: {
  mascot: AppArtName;
  note?: string;
  mascotHeight?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative flex items-end gap-1 pl-4", className)}>
      {note && (
        <p className="relative z-10 mb-9 hidden w-[148px] md:block -rotate-6 bg-v2-sticky px-3 py-2 font-[family-name:var(--font-hand)] text-[19px] leading-[1.1] text-v2-sticky-ink shadow-[0_8px_18px_rgba(27,31,94,.14)]">
          {note}
        </p>
      )}
      <StarDoodle aria-hidden className="absolute right-2 top-3 h-6 w-6 text-v2-amber" />
      <SparkBurst aria-hidden className="absolute left-2 top-4 h-5 w-5 text-v2-lime-deep" />
      <AppArt name={mascot} height={mascotHeight} className="relative -ml-5 flex-none" />
    </div>
  );
}
