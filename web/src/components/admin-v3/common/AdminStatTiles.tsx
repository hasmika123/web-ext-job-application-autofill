import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { Sparkline, TONE, type Tone } from "@/components/app-v2/common";

export interface AdminStat {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: Tone;
  /** `dir` is the arrow; `good` (default: dir === "up") picks green vs coral (failed logins down = good). */
  delta?: { value: string; dir: "up" | "down"; good?: boolean };
  /** Text after the chip, e.g. "vs last 30 days". */
  caption?: string;
  sparkline?: number[];
}

/**
 * Row of KPI tiles (4 -> 2 -> 1 columns): tinted wash, coloured icon tile, uppercase label, big
 * number, delta chip + caption and a sparkline at the right.
 */
export default function AdminStatTiles({ stats, className }: { stats: AdminStat[]; className?: string }) {
  return (
    <div className={cn("grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {stats.map((s) => {
        const t = TONE[s.tone];
        const good = s.delta ? (s.delta.good ?? s.delta.dir === "up") : true;
        return (
          <div
            key={s.label}
            className={cn("flex min-w-0 items-center gap-3.5 rounded-2xl border border-white/70 p-4 shadow-v2-soft", t.soft)}
          >
            <span className={cn("grid h-[52px] w-[52px] flex-none place-items-center rounded-2xl bg-paper/80", t.ink)}>{s.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">{s.label}</div>
              <div className="mt-0.5 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-[28px] font-extrabold leading-none tracking-tight text-ink">{s.value}</div>
                  {s.delta && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold leading-none",
                          good ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-coral-soft text-v2-coral-ink",
                        )}
                      >
                        <span aria-hidden>{s.delta.dir === "up" ? "↑" : "↓"}</span>
                        {s.delta.value}
                      </span>
                      {s.caption && <span className="text-[11.5px] text-ink-soft">{s.caption}</span>}
                    </div>
                  )}
                </div>
                {s.sparkline && s.sparkline.length > 1 && (
                  <Sparkline points={s.sparkline} tone={s.tone} width={72} height={34} className="hidden sm:block" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
