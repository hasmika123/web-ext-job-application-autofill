import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

export interface QuickAction {
  id: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  href?: string;
}

/** "Quick Actions" tiles. `compact` = the icon-over-label tiles; otherwise icon-left with a subtitle. */
export default function QuickActionTiles({
  items,
  compact,
  cols,
  className,
}: {
  items: readonly QuickAction[];
  compact?: boolean;
  /** Replaces the default grid-column classes. */
  cols?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        cols ?? (compact ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"),
        className,
      )}
    >
      {items.map((a) => {
        const inner = compact ? (
          <>
            <span className="text-v2-blue">{a.icon}</span>
            <span className="text-[12.5px] font-semibold leading-tight text-ink">{a.label}</span>
          </>
        ) : (
          <>
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">{a.icon}</span>
            <span className="min-w-0 text-left">
              <span className="block text-[13.5px] font-bold leading-tight text-ink">{a.label}</span>
              {a.sub && <span className="mt-0.5 block text-[12px] leading-snug text-v2-muted">{a.sub}</span>}
            </span>
          </>
        );
        const cls = cn(
          "rounded-xl bg-[#F1F6FF] transition-colors hover:bg-[#E6EFFF]",
          compact ? "flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center" : "flex items-center gap-3 p-3",
        );
        return a.href ? (
          <Link key={a.id} href={a.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={a.id} type="button" className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
