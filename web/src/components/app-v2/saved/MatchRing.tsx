import { cn } from "@kiwiply/ui";

/** Circular match-score ring (conic-gradient): green from 90%, amber below. */
export default function MatchRing({ value, size = 52, className }: { value: number; size?: number; className?: string }) {
  const color = value >= 90 ? "var(--color-v2-green)" : "var(--color-v2-amber)";
  return (
    <div
      role="img"
      aria-label={`${value}% match`}
      className={cn("relative flex-none rounded-full", className)}
      style={{ width: size, height: size, background: `conic-gradient(${color} ${value}%, #E8ECF4 0)` }}
    >
      <div className="absolute inset-[4px] flex items-center justify-center rounded-full bg-white text-[13px] font-extrabold tabular-nums text-v2-navy">
        {value}%
      </div>
    </div>
  );
}
