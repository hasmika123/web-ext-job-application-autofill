import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Local helpers for the /about page (spec §8). Namespaced inside `about/` on purpose: the shared
 * `Eyebrow` / `SectionHeading` / `FeatureTile` land in a different phase and a later QA pass
 * dedupes these against them.
 */

export type Family = "lime" | "green" | "violet" | "blue" | "teal" | "coral" | "amber" | "pink";

/** Static class strings (Tailwind must see them whole). `soft` = tint bg, `icon` = glyph colour. */
export const FAMILY: Record<Family, { soft: string; icon: string; dot: string }> = {
  lime: { soft: "bg-v2-lime-soft", icon: "text-accent-deep", dot: "bg-v2-lime-deep" },
  green: { soft: "bg-v2-green-soft", icon: "text-v2-green", dot: "bg-v2-green" },
  violet: { soft: "bg-v2-violet-soft", icon: "text-v2-violet", dot: "bg-v2-violet" },
  blue: { soft: "bg-v2-blue-soft", icon: "text-v2-blue", dot: "bg-v2-blue" },
  teal: { soft: "bg-v2-teal-soft", icon: "text-v2-teal", dot: "bg-v2-teal" },
  coral: { soft: "bg-v2-coral-soft", icon: "text-v2-coral", dot: "bg-v2-coral" },
  amber: { soft: "bg-v2-amber-soft", icon: "text-v2-amber", dot: "bg-v2-amber" },
  pink: { soft: "bg-v2-pink-soft", icon: "text-v2-pink", dot: "bg-v2-pink" },
};

/** Section wrapper: 20px gutters, 64px / 96px vertical rhythm, centred 1200px column. */
export function AboutSection({
  id,
  className,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24", className)}
    >
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </section>
  );
}

/** Mixed-case pill with a coloured dot. Text stays navy so contrast is AA on every tint. */
export function AboutEyebrow({ family = "green", children }: { family?: Family; children: ReactNode }) {
  const f = FAMILY[family];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink",
        f.soft,
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 rounded-full", f.dot)} />
      {children}
    </span>
  );
}

/** Eyebrow + h2 (optional coloured trailing words) + optional lede. */
export function AboutHeading({
  id,
  eyebrow,
  family = "green",
  title,
  accent,
  lede,
  align = "left",
  className,
}: {
  id: string;
  eyebrow: string;
  family?: Family;
  title: string;
  /** Coloured trailing words (deep green, AA on white). */
  accent?: string;
  lede?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      <AboutEyebrow family={family}>{eyebrow}</AboutEyebrow>
      <h2 id={id} className="mt-4 text-[28px] text-ink md:text-4xl lg:text-[40px]">
        {title}
        {accent ? (
          <>
            {" "}
            <span className="text-accent-deep">{accent}</span>
          </>
        ) : null}
      </h2>
      {lede ? (
        <p className={cn("mt-4 max-w-2xl text-base text-ink-soft md:text-lg", align === "center" && "mx-auto")}>
          {lede}
        </p>
      ) : null}
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

/** Icon tile + title + body card. */
export function AboutFeatureTile({
  icon,
  family,
  title,
  body,
  layout = "stack",
  className,
}: {
  icon: ReactNode;
  family: Family;
  title: string;
  body: string;
  /** `stack` = icon above text; `row` = icon beside text. */
  layout?: "stack" | "row";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-v2-card)] bg-white p-5 shadow-v2-card",
        layout === "row" ? "flex items-start gap-4" : "flex flex-col gap-3",
        className,
      )}
    >
      <IconTile family={family}>{icon}</IconTile>
      <div>
        <h3 className="text-[17px] font-bold leading-snug tracking-normal text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}
