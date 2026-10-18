import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon, cn } from "@kiwiply/ui";
import { TONE, type Tone } from "@/components/app-v2/common";

/**
 * Link card: tinted icon tile, bold title (+ optional `badge`, e.g. <LivePill />), muted description,
 * chevron. Used for "Quick actions" / "Platform areas". `bordered` adds a hairline border (areas grid).
 */
export default function AdminLinkTile({
  href,
  icon,
  tone,
  title,
  description,
  badge,
  bordered,
  className,
}: {
  href: string;
  icon: ReactNode;
  tone: Tone;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 items-start gap-3 rounded-2xl p-3.5 transition-colors",
        bordered ? "border border-v2-line/70 bg-paper hover:border-v2-blue/40" : "bg-paper-2/70 hover:bg-paper-2",
        className,
      )}
    >
      <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-bold text-ink">{title}</span>
          {badge}
        </span>
        {description && <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{description}</span>}
      </span>
      <ChevronRightIcon size={16} className="mt-3 flex-none text-v2-blue transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
