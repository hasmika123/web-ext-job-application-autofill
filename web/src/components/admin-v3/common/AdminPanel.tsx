import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, cn } from "@kiwiply/ui";
import { SectionCard } from "@/components/app-v2/common";

/**
 * Titled white card: `title` + `description` on the left; on the right either a `link`
 * ("View all ->", blue) or any `right` node (a period select, buttons). Thin wrapper over SectionCard.
 */
export default function AdminPanel({
  title,
  description,
  icon,
  link,
  right,
  children,
  className,
  bodyClassName,
  fit,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  link?: { label: string; href: string };
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Natural height: use when the panel is a direct child of a stacked column (h-full would stretch it over its siblings). */
  fit?: boolean;
}) {
  const extra =
    right ??
    (link ? (
      <Link href={link.href} className="inline-flex flex-none items-center gap-1 text-[12.5px] font-semibold text-v2-blue-ink hover:underline">
        {link.label}
        <ArrowRightIcon size={13} />
      </Link>
    ) : undefined);
  return (
    <SectionCard title={title} subtitle={description} icon={icon} headerExtra={extra} className={cn(!fit && "h-full", className)} bodyClassName={bodyClassName}>
      {children}
    </SectionCard>
  );
}
