import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, CheckIcon, SparklesIcon, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Eyebrow from "../Eyebrow";

/** Small building blocks shared by the landing-v3 sections. Server components. */

/** Lime pill with a sparkle: the phone board's "Let AI do the busy work" / "For Individuals" chips. */
export function V3Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Eyebrow family="lime" icon={SparklesIcon} className={cn("px-3 py-1.5 text-[12px]", className)}>
      {children}
    </Eyebrow>
  );
}

/** Lime pill CTA, full width on phones. */
export function V3Cta({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={buttonVariants(
        "accent",
        "lg",
        cn("min-h-12 w-full shadow-[0_8px_20px_rgba(95,191,31,.28)] sm:w-auto sm:px-8", className),
      )}
    >
      {children} <ArrowRightIcon size={16} />
    </Link>
  );
}

/** Green-circle check row used by the Apply and Organizations cards. */
export function V3CheckRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[14.5px] font-medium text-v2-ink-soft">
      <CheckCircleIcon aria-hidden className="h-6 w-6 flex-none text-v2-green" />
      {children}
    </li>
  );
}

/** Outlined-square check row used by the For Individuals list. */
export function V3SquareCheck({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[14.5px] font-medium text-v2-ink-soft">
      <span aria-hidden className="grid h-5 w-5 flex-none place-items-center rounded-md border-2 border-v2-green text-v2-green">
        <CheckIcon className="h-3 w-3" strokeWidth={3.2} />
      </span>
      {children}
    </li>
  );
}
