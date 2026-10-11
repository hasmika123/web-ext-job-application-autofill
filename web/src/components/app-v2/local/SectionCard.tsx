import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, cn } from "@kiwiply/ui";

/** White 16px-radius card with a 16px/700 title and an optional "View all →" style link. */
export default function SectionCard({
  title,
  icon,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const actionClass = "inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline";
  return (
    <section className={cn("rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:p-5", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[16px] font-bold leading-tight tracking-normal text-v2-navy">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-v2-ink-soft">{subtitle}</p>}
        </div>
        {action &&
          (action.href ? (
            <Link href={action.href} className={actionClass}>
              {action.label}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className={actionClass}>
              {action.label}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          ))}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
