import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, HEADLINE_GREEN, type Family } from "./family";

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
  before?: ReactNode;
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
        {before}
        {before ? " " : null}
        <span className={HEADLINE_GREEN}>{accent}</span>
        {after ? ` ${after}` : null}
      </h2>
      {lede ? <p className="max-w-2xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">{lede}</p> : null}
    </div>
  );
}

/** Initials tile standing in for the board's face photos (we ship no portraits). */
export function Avatar({
  initials,
  family = "blue",
  className,
}: {
  initials: string;
  family?: Family;
  className?: string;
}) {
  const f = FAMILY[family];
  return (
    <span
      aria-hidden
      className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold", f.soft, f.text, className)}
    >
      {initials}
    </span>
  );
}

/** "Sarah Kim" -> "SK". */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
