import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Rounded 20px banner at the top of an app page: a soft gradient wash (lime tints for the
 * individual app, blue for the org app) with pastel blobs, a 32px navy 800 title, a lede, an
 * optional handwritten note and art anchored bottom-right. `art` is hidden below `md` so the
 * copy always gets the full width on phones.
 */
export default function PageHero({
  title,
  icon,
  subtitle,
  note,
  art,
  tone = "lime",
  actions,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  subtitle: ReactNode;
  /** Handwritten (Caveat) annotation. Decorative: never the only carrier of information. */
  note?: ReactNode;
  art?: ReactNode;
  tone?: "lime" | "blue";
  actions?: ReactNode;
  className?: string;
}) {
  const wash =
    tone === "blue"
      ? "bg-[linear-gradient(110deg,#EEF4FF_0%,#E3EEFF_55%,#EAF3FF_100%)]"
      : "bg-[linear-gradient(110deg,#F1FBE4_0%,#E6F6EE_55%,#E4F1FF_100%)]";
  const blobA = tone === "blue" ? "bg-v2-blue/15" : "bg-v2-lime/30";
  const blobB = tone === "blue" ? "bg-v2-violet/10" : "bg-v2-blue/15";
  return (
    <section className={cn("relative overflow-hidden rounded-[20px] border border-white/70", wash, className)}>
      <span aria-hidden className={cn("pointer-events-none absolute -left-10 -top-14 h-48 w-48 rounded-full blur-2xl", blobA)} />
      <span aria-hidden className={cn("pointer-events-none absolute -bottom-16 right-1/4 h-52 w-52 rounded-full blur-3xl", blobB)} />
      <div className="relative flex min-h-[148px] items-stretch justify-between gap-4 px-5 py-6 md:px-8 md:py-7">
        <div className="flex min-w-0 max-w-[620px] flex-col justify-center">
          <h1 className="flex items-center gap-3 font-display text-[26px] font-extrabold leading-[1.05] text-ink md:text-[32px]">
            {icon && (
              <span
                className={cn(
                  "grid h-9 w-9 flex-none place-items-center rounded-xl",
                  tone === "blue" ? "bg-v2-blue-soft text-v2-blue" : "bg-v2-lime-soft text-v2-green-ink",
                )}
              >
                {icon}
              </span>
            )}
            <span>{title}</span>
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft md:text-[15px]">{subtitle}</p>
          {note && (
            <p
              aria-hidden
              className={cn(
                "mt-3 font-[family-name:var(--font-hand)] text-[22px] leading-none",
                tone === "blue" ? "text-ink" : "text-v2-green-ink",
              )}
            >
              {note}
            </p>
          )}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {art && <div className="relative hidden flex-none items-end md:flex">{art}</div>}
      </div>
    </section>
  );
}
