import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, cn } from "@kiwiply/ui";

/** White card, 16px radius, 16px/700 title and an optional "View all →" link. */
export default function SectionCard({
  title,
  action,
  headerExtra,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  action?: { label: string; href: string };
  /** Anything else for the header's right side (a period select, a toggle). */
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">{title}</h2>
        {headerExtra}
        {action && (
          <Link
            href={action.href}
            className="inline-flex flex-none items-center gap-1 text-[12.5px] font-semibold text-v2-blue-ink hover:underline"
          >
            {action.label}
            <ArrowRightIcon size={13} />
          </Link>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
