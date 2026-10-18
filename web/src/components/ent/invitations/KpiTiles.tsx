"use client";

import type { ComponentType } from "react";
import { BanIcon, ClockIcon, MailSolidIcon, Skeleton, Sparkline, TeamSolidIcon, deltaOf, kpiLine } from "@kiwiply/ui";
import type { KpiTone } from "@kiwiply/ui";
import { STATUSES, STATUS_LABEL, type InvitationCounts, type InviteStatus } from "@/lib/ent/invitations";

const TILE: Record<InviteStatus, { icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; tone: KpiTone; lowerIsBetter: boolean }> = {
  PENDING: { icon: MailSolidIcon, tone: "blue", lowerIsBetter: false },
  ACCEPTED: { icon: TeamSolidIcon, tone: "green", lowerIsBetter: false },
  EXPIRED: { icon: ClockIcon, tone: "orange", lowerIsBetter: true },
  REVOKED: { icon: BanIcon, tone: "pink", lowerIsBetter: true },
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
        const { icon: Icon, tone, lowerIsBetter } = TILE[s];
        const line = kpiLine(tone);
        const row = counts?.counts.find((c) => c.status === s);
        const prev = row ? row.count - (row.deltaLastMonth ?? 0) : 0;
        const d = row ? deltaOf(row.count, prev) : null;
        const dir = d?.dir ?? "flat";
        const good = dir === "flat" ? null : (dir === "up") !== lowerIsBetter;
        return (
          <li key={s} data-kpi={s} className="ent-card relative flex min-w-0 items-center gap-3.5 p-3.5 sm:px-[17px] sm:py-4">
            <span aria-hidden data-tone={tone} className="ent-kpi-chip !h-11 !w-11 !rounded-[14px] sm:!h-[52px] sm:!w-[52px]">
              <Icon size={28} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="ent-kpi-label truncate !text-[13px] sm:!text-[15px]">
                {STATUS_LABEL[s]}
                <span className="max-sm:hidden"> Invitations</span>
              </p>
              {row ? (
                <>
                  <p className="ent-kpi-value !text-[28px] !leading-tight sm:!text-[32px]">{row.count}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted sm:text-[13px]">
                    {d && (
                      <span data-delta={dir} data-good={good === null ? undefined : String(good)} className="ent-kpi-delta inline-flex items-center gap-1 font-bold">
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
              <span aria-hidden className="absolute right-4 top-4 hidden w-24 sm:block">
                <Sparkline values={trend(prev, row.count)} smooth color={line} className="h-9" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
