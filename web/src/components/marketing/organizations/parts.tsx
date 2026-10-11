import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import { contactHref } from "@/lib/catalog";
import { FAMILY, type Family } from "./family";

/**
 * Small building blocks local to the /organizations page (a later QA phase dedupes these
 * against the shared marketing ones). All server components.
 */

/** Page-width container: same gutters as the header and footer. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-5 lg:px-8", className)}>{children}</div>;
}

/** Mixed-case pill that labels a section. */
export function Eyebrow({ family = "blue", children }: { family?: Family; children: ReactNode }) {
  const f = FAMILY[family];
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold", f.soft, f.text)}>
      {children}
    </span>
  );
}

/** Handwritten annotation. Decorative only, so always aria-hidden. */
export function Handwritten({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn("font-[family-name:var(--font-hand)] text-2xl leading-tight text-v2-blue", className)}>
      {children}
    </span>
  );
}

/** Eyebrow + h2 (the accent words take the green) + lede. */
export function SectionHeading({
  id,
  eyebrow,
  family = "blue",
  before,
  accent,
  after,
  lede,
  align = "center",
}: {
  id?: string;
  eyebrow: string;
  family?: Family;
  /** Heading text before the coloured words. */
  before?: string;
  /** Coloured words. */
  accent: string;
  /** Heading text after the coloured words. */
  after?: string;
  lede?: string;
  align?: "left" | "center";
}) {
  const centered = align === "center";
  return (
    <div className={cn("flex flex-col gap-4", centered ? "items-center text-center" : "items-start text-left")}>
      <Eyebrow family={family}>{eyebrow}</Eyebrow>
      <h2 id={id} className="max-w-3xl text-[28px] leading-[1.1] text-v2-navy md:text-[36px] md:leading-[1.1]">
        {before ? `${before} ` : null}
        <span className="text-accent-deep">{accent}</span>
        {after ? ` ${after}` : null}
      </h2>
      {lede ? <p className="max-w-2xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">{lede}</p> : null}
    </div>
  );
}

/** Tiny "Example" tag carried by every mock, so no sample number is mistaken for a result. */
export function ExampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-v2-line bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-v2-muted",
        className,
      )}
    >
      Example
    </span>
  );
}

/** "Available now" / "Coming" chip on feature cards. */
export function StatusChip({ status }: { status: "now" | "coming" }) {
  const now = status === "now";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none",
        now ? "bg-v2-lime-soft text-v2-navy" : "bg-v2-amber-soft text-v2-sticky-ink",
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", now ? "bg-v2-lime-deep" : "bg-v2-amber")} />
      {now ? "Available now" : "Coming"}
    </span>
  );
}

/** The page's two calls to action. Talk to us is primary; View pricing is secondary. */
export function OrgCtas({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <Link href={contactHref("organization")} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
        Talk to us <ArrowRightIcon size={16} />
      </Link>
      <Link href="/#pricing" className={buttonVariants("ghost", "lg", "min-h-11 w-full bg-white sm:w-auto")}>
        View pricing
      </Link>
    </div>
  );
}
