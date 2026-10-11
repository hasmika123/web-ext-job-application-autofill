import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "../common";

/**
 * Tinted stat tile: icon in a white rounded square, 24px/800 value, muted label, optional
 * delta chip and second label line (the Saved Jobs "High Match (≥ 85%)" tiles).
 */
export default function StatTile({
  icon,
  value,
  label,
  sublabel,
  delta,
  tone,
  className,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  delta?: { value: string; up: boolean };
  tone: Tone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3.5", t.soft, className)}>
      <span className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white shadow-sm", t.ink)}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[24px] font-extrabold leading-none tracking-tight text-v2-navy">{value}</span>
          {delta && (
            <span className={cn("text-[11px] font-bold", delta.up ? "text-v2-green" : "text-v2-coral")}>
              {delta.up ? "↑" : "↓"} {delta.value}
            </span>
          )}
        </div>
        <div className="mt-1 text-[12.5px] leading-tight text-v2-ink-soft">{label}</div>
        {sublabel && <div className="text-[12px] leading-tight text-v2-muted">{sublabel}</div>}
      </div>
    </div>
  );
}
