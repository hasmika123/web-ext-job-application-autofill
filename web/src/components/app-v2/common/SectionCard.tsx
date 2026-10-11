import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, cn } from "@kiwiply/ui";

/**
 * White card, 16px radius, 16px/700 title and an optional "View all →" link. `icon` / `subtitle`
 * decorate the title; `action` is a link (`href`) or a button (`onClick`); `headerExtra` is anything
 * else for the header's right side (a period select, buttons). `title` is optional so a card can
 * just be a white surface with a header row.
 */
export default function SectionCard({
  title,
  icon,
  subtitle,
  action,
  headerExtra,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const actionClass = "inline-flex flex-none items-center gap-1 text-[12.5px] font-semibold text-v2-blue-ink hover:underline";
  const hasHeader = title || subtitle || headerExtra || action;
  return (
    <section className={cn("min-w-0 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5", className)}>
      {hasHeader && (
        <div className={cn("mb-3 flex justify-between gap-3", !!headerExtra && "flex-wrap gap-y-2", subtitle ? "items-start" : "items-center")}>
          {(title || subtitle) && (
            <div className="min-w-0">
              {title && (
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">
                  {icon}
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{subtitle}</p>}
            </div>
          )}
          {headerExtra}
          {action &&
            (action.href ? (
              <Link href={action.href} className={actionClass}>
                {action.label}
                <ArrowRightIcon size={13} />
              </Link>
            ) : (
              <button type="button" onClick={action.onClick} className={actionClass}>
                {action.label}
                <ArrowRightIcon size={13} />
              </button>
            ))}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
