import type { ReactNode } from "react";
import { DeltaChip, cn, deltaOf } from "@kiwiply/ui";
import { TONE } from "@/components/app-v2/common";
import type { Tone } from "@/components/app-v2/common";

/**
 * A tile's comparison with the previous window (E2E-A15.0; ADMIN-E2E-PLAN D-8). The chip is COMPUTED from `value` and
 * `previous`; when `previous` is not a number there is nothing real to compare and no chip is drawn. Nobody types a
 * percentage in.
 */
export interface StatDelta {
  /** The tile's number, as a number. */
  value: number;
  /** The same metric over the previous window. null / undefined: the API has none yet, so no chip. */
  previous?: number | null;
  /** `relative` (default) shows a percent change; `points` the plain difference, for values that are already percentages. */
  mode?: "relative" | "points";
  /** True for failed logins, error rate, churn: down is good. */
  lowerIsBetter?: boolean;
  /** Text after the chip, shown only when the chip is: "vs previous 30 days". */
  label?: string;
}

export interface AdminStat {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: Tone;
  delta?: StatDelta;
  /** Always-on small line under the number ("of 12 sources", "last read failed"). Never a trend: that is `delta`. */
  caption?: string;
}

/**
 * Row of KPI tiles (4 -> 2 -> 1 columns): tinted wash, coloured icon tile, uppercase label, big number, an optional
 * real delta chip and an optional caption. Server-component safe (no hooks).
 *
 *   <AdminStatTiles stats={[{ label: "Total users", value: n(total), icon: <UsersIcon size={26} />, tone: "blue",
 *                             delta: { value: total, previous: summary.previous?.total, label: "vs previous 30 days" } }]} />
 */
export default function AdminStatTiles({ stats, className }: { stats: AdminStat[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4", className)}>
      {stats.map((s) => {
        const t = TONE[s.tone];
        const d = s.delta ? deltaOf(s.delta.value, s.delta.previous, { mode: s.delta.mode }) : null;
        return (
          <div
            key={s.label}
            className={cn("flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-white/70 p-3 shadow-v2-soft sm:flex-row sm:items-center sm:gap-3.5 sm:p-4", t.soft)}
          >
            <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl sm:h-[52px] sm:w-[52px] sm:rounded-2xl bg-paper/80", t.ink)}>{s.icon}</span>
            <div className="w-full min-w-0 flex-1">
              <div className="text-[11px] leading-tight sm:truncate sm:text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">{s.label}</div>
              <div className="mt-0.5 min-w-0">
                <div className="font-display text-[24px] font-extrabold leading-none sm:text-[28px] tracking-tight text-ink">{s.value}</div>
                {(d || s.caption) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {d && <DeltaChip delta={d} lowerIsBetter={s.delta?.lowerIsBetter} />}
                    {d && s.delta?.label && <span className="text-[11.5px] text-ink-soft">{s.delta.label}</span>}
                    {s.caption && <span className="text-[11.5px] text-ink-soft">{s.caption}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
