import { cn } from "@/lib/cn";

/** Small "Beta" pill shown next to the wordmark. `tone="dark"` for charcoal surfaces. */
export default function BetaBadge({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]",
        tone === "dark" ? "bg-white/15 text-hero-ink" : "bg-accent-soft text-accent-deep",
        className,
      )}
    >
      Beta
    </span>
  );
}
