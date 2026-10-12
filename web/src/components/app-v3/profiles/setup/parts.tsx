"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { LockIcon, cn } from "@kiwiply/ui";

/**
 * The small pieces every onboarding screen shares (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5): the one `<h1>` with
 * its line under it, the sticky action area, the quiet "Skip" text button, the mascot and the lock line.
 */

/** The question of a screen: exactly one `<h1>`, focusable so the shell can move focus to it on a step change (DESIGN 14). */
export function StepHeading({ title, sub, className, id }: { title: ReactNode; sub?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={className}>
      <h1 id={id} tabIndex={-1} className="font-display text-[24px] font-extrabold leading-tight text-balance text-v2-navy sm:text-[28px]" style={{ outline: "none" }}>
        {title}
      </h1>
      {sub && <p className="mt-1.5 text-[14px] leading-snug text-v2-ink-soft">{sub}</p>}
    </div>
  );
}

/**
 * The primary action of a screen and its quiet siblings. On a phone it sticks to the bottom of the window, above the
 * home bar and so above the keyboard's top edge, so the primary button is never out of reach (DESIGN 15); from `sm` it is
 * ordinary content. Put it last in the screen.
 */
export function StepFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-testid="step-footer"
      className={cn(
        "sticky bottom-0 z-20 -mx-3.5 mt-6 bg-gradient-to-t from-app-bg from-75% to-transparent px-3.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-5",
        "sm:static sm:mx-0 sm:bg-none sm:px-0 sm:pb-0 sm:pt-2",
        className,
      )}
    >
      <div className="flex w-full flex-col items-stretch gap-0.5">{children}</div>
    </div>
  );
}

/** "Skip for now" / "Skip this one": a text button, always 44 px tall, never shamed (DESIGN 1: no guilt copy). */
export function SkipButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mx-auto min-h-11 rounded-full px-4 text-[14px] font-semibold text-v2-muted transition-colors hover:text-v2-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Native pixel sizes of the mascot artwork the onboarding screens draw (public/v2). */
const ART = {
  wave: ["/v2/mascot-wave.png", 210, 221],
  clap: ["/v2/mascot-clap.png", 221, 246],
  laptop: ["/v2/mascot-laptop.png", 210, 221],
  resume: ["/v2/app/mascot-resume.png", 154, 159],
  books: ["/v2/app/mascot-books.png", 149, 154],
} as const;

export type MascotName = keyof typeof ART;

/**
 * A mascot from `public/v2`, decorative only (`alt=""`, never the sole carrier of meaning, DESIGN 5). `className` sets the
 * displayed size (`h-24 w-auto sm:h-32`); render it only when `config.onboarding.mascot` is on (`enabled`).
 */
export function StepMascot({ name, enabled, className }: { name: MascotName; enabled: boolean; className?: string }) {
  if (!enabled) return null;
  const [src, width, height] = ART[name];
  return <Image src={src} alt="" aria-hidden width={width} height={height} className={cn("flex-none object-contain", className)} />;
}

/** The 🔒 line (DESIGN 5.3): what we take out before reading anything. Static; the expanding one is in `SourceStep`. */
export function PrivacyLine({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[12.5px] leading-snug text-v2-ink-soft", className)}>
      <LockIcon size={15} className="mt-px flex-none text-v2-muted" aria-hidden />
      <span>We remove SSN, bank and ID numbers before reading.</span>
    </p>
  );
}
