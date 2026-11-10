import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@kiwiply/ui";

/**
 * Admin page hero: sky-to-meadow wash with soft clouds and leafy foliage drawn in CSS (no new art),
 * "PLATFORM ADMIN" style eyebrow, big title, subtitle, and the laptop mascot at the right with a
 * tilted handwritten `note`. Copy sits above the foliage; the mascot sits above everything (nothing
 * covers it). Art + note appear from `sm` / `md`; below that the copy owns the width.
 */
export default function AdminHero({
  eyebrow = "PLATFORM ADMIN",
  title,
  subtitle,
  note,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Handwritten annotation beside the mascot (decorative, aria-hidden). */
  note?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(100deg,#D7EAFF_0%,#E3F1FB_45%,#DDF3E4_100%)]",
        className,
      )}
    >
      {/* Clouds */}
      <span aria-hidden className="pointer-events-none absolute -top-10 left-[30%] h-28 w-64 rounded-full bg-white/60 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -top-8 left-[58%] h-24 w-56 rounded-full bg-white/50 blur-2xl" />
      {/* Foliage: overlapping leaf shapes in greens, anchored bottom-right */}
      <span aria-hidden className="pointer-events-none absolute -bottom-10 right-[22%] hidden h-32 w-72 rounded-[60%_40%_0_0] bg-[linear-gradient(120deg,#8FD38F,#4FB86B)] opacity-70 sm:block" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 right-[8%] hidden h-36 w-56 -rotate-6 rounded-[70%_30%_0_0] bg-[linear-gradient(120deg,#6CC77F,#2FA35A)] opacity-80 sm:block" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 right-[34%] hidden h-24 w-52 rotate-6 rounded-[40%_60%_0_0] bg-[linear-gradient(120deg,#A9E08A,#63C36F)] opacity-70 md:block" />
      <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-6 hidden h-32 w-44 rotate-12 rounded-[50%_50%_0_0] bg-[linear-gradient(120deg,#7ED08A,#3DAE5E)] opacity-80 sm:block" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-56 rounded-[60%_40%_0_0] bg-[linear-gradient(120deg,#CDEFB4,#9ADB8E)] opacity-60" />

      <div className="relative z-[1] flex min-h-[124px] items-stretch justify-between gap-3 lg:min-h-[136px]">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-5 sm:px-7">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-soft">{eyebrow}</p>
          <h1 className="mt-1 font-display text-[28px] font-extrabold leading-[1.08] text-ink sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-[40rem] text-[14px] leading-relaxed text-ink sm:text-[14.5px]">{subtitle}</p>}
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        <div className="relative hidden w-[150px] flex-none items-end justify-end self-stretch pr-5 sm:flex md:w-[330px]">
          {note && (
            <p
              aria-hidden
              className="absolute right-[150px] top-3 z-[2] hidden w-[150px] -rotate-6 font-[family-name:var(--font-hand)] text-[22px] leading-[1.05] text-ink md:block"
            >
              {note}
            </p>
          )}
          <Image
            src="/v2/app/mascot-wave-laptop.png"
            alt=""
            aria-hidden
            unoptimized
            width={145}
            height={142}
            className="relative z-[3] h-auto w-auto object-contain"
            style={{ maxHeight: 128 }}
          />
        </div>
      </div>
    </section>
  );
}
