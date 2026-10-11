import { cn } from "@kiwiply/ui";

/** The small "DEMO" pill next to the name in the account menus (phase demo). */
export default function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-v2-amber-soft px-1.5 py-0.5 align-middle text-[9.5px] font-extrabold uppercase tracking-wide text-v2-amber",
        className,
      )}
    >
      Demo
    </span>
  );
}
