import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Rounded 20px banner with a soft lime/blue wash and pastel blobs: optional eyebrow chip,
 * title (a ReactNode so a word can be coloured), subtitle, actions on the left, art bottom-right
 * (hidden under `sm` so the copy keeps the whole width on phones). `tone` picks the wash.
 */
export default function PageHero({
  title,
  icon,
  eyebrow,
  subtitle,
  art,
  tone = "lime",
  actions,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  eyebrow?: ReactNode;
  subtitle: ReactNode;
  art?: ReactNode;
  tone?: "lime" | "blue";
  actions?: ReactNode;
  className?: string;
}) {
  const wash =
    tone === "blue"
      ? "bg-[linear-gradient(105deg,#EEF4FF_0%,#E6F0FF_55%,#F3F0FF_100%)]"
      : "bg-[linear-gradient(105deg,#F1FBE5_0%,#E9F7EE_45%,#E8F1FF_100%)]";
  return (
    <div className={cn("relative overflow-hidden rounded-[20px] border border-v2-line", wash, className)}>
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-v2-lime/20 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 left-1/3 h-44 w-44 rounded-full bg-v2-blue/10 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full bg-v2-green/15 blur-2xl" />
      <div className="relative flex min-h-[150px] items-stretch">
        <div className="min-w-0 flex-1 px-5 py-6 sm:px-7 sm:py-7">
          {eyebrow && <div className="mb-2">{eyebrow}</div>}
          <h1 className="flex items-center gap-2.5 text-[28px] font-extrabold leading-[1.05] tracking-[-0.025em] text-v2-navy sm:text-[32px]">
            {icon}
            {title}
          </h1>
          <p className="mt-2.5 max-w-[34rem] text-[14.5px] leading-relaxed text-v2-ink-soft">{subtitle}</p>
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {art && <div className="relative hidden flex-none items-end justify-end self-stretch pr-3 sm:flex">{art}</div>}
      </div>
    </div>
  );
}
