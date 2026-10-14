"use client";

import type { ComponentType } from "react";
import { ClockIcon, MailIcon, MinusCircleIcon, Skeleton, Sparkline, UsersIcon, cn, deltaOf } from "@kiwiply/ui";
import { STATUSES, STATUS_LABEL, type InvitationCounts, type InviteStatus } from "@/lib/ent/invitations";

const TILE: Record<InviteStatus, { icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; chip: string; line: string; lowerIsBetter: boolean }> = {
  PENDING: { icon: MailIcon, chip: "bg-accent-soft text-accent", line: "var(--color-accent)", lowerIsBetter: false },
  ACCEPTED: { icon: UsersIcon, chip: "bg-v2-green-soft text-v2-green", line: "var(--color-v2-green)", lowerIsBetter: false },
  EXPIRED: { icon: ClockIcon, chip: "bg-v2-amber-soft text-v2-amber", line: "var(--color-v2-amber)", lowerIsBetter: true },
  REVOKED: { icon: MinusCircleIcon, chip: "bg-v2-coral-soft text-v2-coral", line: "var(--color-v2-coral)", lowerIsBetter: true },
};

/** Last month -> now as a soft S-curve (smoothstep): both ends are the API's real numbers, nothing between them is invented data. */
function trend(prev: number, now: number): number[] {
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return prev + (now - prev) * (t * t * (3 - 2 * t));
  });
}

/**
 * The four counters at the top of the page. The number is the API's count; the change is the API's difference against the
 * month before, shown as a percent of last month's count. The little curve runs from last month's count to this month's (the API
 * sends no finer series, so it carries no wiggle of its own).
 */
export default function KpiTiles({ counts, failed, onRetry }: { counts: InvitationCounts | null; failed: boolean; onRetry: () => void }) {
  return (
    <ul aria-label="Invitation totals" data-invitation-kpis className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      {STATUSES.map((s) => {
        const { icon: Icon, chip, line, lowerIsBetter } = TILE[s];
        const row = counts?.counts.find((c) => c.status === s);
        const prev = row ? row.count - (row.deltaLastMonth ?? 0) : 0;
        const d = row ? deltaOf(row.count, prev) : null;
        const dir = d?.dir ?? "flat";
        const good = dir === "flat" ? null : (dir === "up") !== lowerIsBetter;
        return (
          <li key={s} data-kpi={s} className="relative flex min-w-0 items-center gap-3.5 rounded-[var(--radius-lg)] border border-line/50 bg-paper p-3.5 shadow-[0_2px_14px_rgba(30,64,120,0.06)] sm:p-4">
            <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[14px] sm:h-[52px] sm:w-[52px]", chip)}>
              <Icon size={26} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-soft sm:text-[15px]">
                {STATUS_LABEL[s]}
                <span className="max-sm:hidden"> Invitations</span>
              </p>
              {row ? (
                <>
                  <p className="text-[28px] font-extrabold leading-tight tabular-nums text-ink sm:text-[32px]">{row.count}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted sm:text-[13px]">
                    {d && (
                      <span data-delta={dir} className={cn("inline-flex items-center gap-1 font-bold", good === null ? "text-ink-soft" : good ? "text-v2-green-ink" : "text-v2-coral-ink")}>
                        <span aria-hidden className="text-[9px]">
                          {dir === "up" ? "▲" : dir === "down" ? "▼" : "▶"}
                        </span>
                        <span className="sr-only">{dir === "up" ? "Up " : dir === "down" ? "Down " : "No change "}</span>
                        {dir === "up" ? "+" : dir === "down" ? "-" : ""}
                        {d.text.replace(/^\+/, "")}
                      </span>
                    )}
                    <span>vs last month</span>
                  </p>
                </>
              ) : failed ? (
                <button type="button" onClick={onRetry} className="mt-1 text-[12.5px] font-semibold text-accent-deep underline">
                  Couldn&apos;t load. Retry
                </button>
              ) : (
                <Skeleton className="mt-1.5 h-9 w-20" />
              )}
            </div>
            {row && prev !== row.count && (
              <span aria-hidden className="absolute bottom-4 right-4 hidden w-24 sm:block">
                <Sparkline values={trend(prev, row.count)} color={line} className="h-9" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
