import { cn } from "@kiwiply/ui";

const CAP = 99; // counts above this read "99+" so the pill never grows past a nav item

/**
 * AttentionBadge: the small count pill for a nav item or tab ("3" failed jobs, "12" new bug reports). It draws nothing
 * for zero, because "0" in a nav is noise; an unknown count (`null`) draws nothing either. Never a permanent dot.
 *
 *   <AttentionBadge count={attention.bugs} label="new bug reports" />
 *
 * `tone="alert"` (coral) for things that are failing, `info` (blue) for things that are waiting. The label is read by
 * screen readers ("12 new bug reports"); the visible text is only the number.
 */
export default function AttentionBadge({ count, label, tone = "info", className }: { count: number | null | undefined; label: string; tone?: "alert" | "info"; className?: string }) {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  const text = count > CAP ? `${CAP}+` : String(Math.floor(count));
  return (
    <span
      role="status"
      aria-label={`${count} ${label}`}
      className={cn(
        "inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums",
        tone === "alert" ? "bg-v2-coral-soft text-v2-coral-ink" : "bg-v2-blue-soft text-v2-blue-ink",
        className,
      )}
    >
      <span aria-hidden>{text}</span>
    </span>
  );
}
