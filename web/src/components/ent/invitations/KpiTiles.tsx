"use client";

import type { ComponentType } from "react";
import { ClockIcon, DeltaChip, MailIcon, MinusCircleIcon, Skeleton, UsersIcon } from "@kiwiply/ui";
import { STATUSES, STATUS_LABEL, type InvitationCounts, type InviteStatus } from "@/lib/ent/invitations";

const TILE: Record<InviteStatus, { icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; chip: string; lowerIsBetter: boolean }> = {
  PENDING: { icon: MailIcon, chip: "bg-accent-soft text-accent-deep", lowerIsBetter: false },
  ACCEPTED: { icon: UsersIcon, chip: "bg-accent-soft text-accent-deep", lowerIsBetter: false },
  EXPIRED: { icon: ClockIcon, chip: "bg-brown-soft text-brown-deep", lowerIsBetter: true },
  REVOKED: { icon: MinusCircleIcon, chip: "bg-danger/10 text-danger-text", lowerIsBetter: true },
};

/**
 * The four counters at the top of the page. The number under each is the API's count; the chip is the API's change against the
 * month before ("12 more than last month"), shown only when the counters loaded. There is no sparkline: the API sends no series
 * and a drawn line would be invented.
 */
export default function KpiTiles({ counts, failed, onRetry }: { counts: InvitationCounts | null; failed: boolean; onRetry: () => void }) {
  return (
    <ul aria-label="Invitation totals" data-invitation-kpis className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {STATUSES.map((s) => {
        const { icon: Icon, chip, lowerIsBetter } = TILE[s];
        const row = counts?.counts.find((c) => c.status === s);
        const delta = row?.deltaLastMonth ?? 0;
        return (
          <li key={s} data-kpi={s} className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
            <span aria-hidden className={`grid h-11 w-11 flex-none place-items-center rounded-xl sm:h-12 sm:w-12 ${chip}`}>
              <Icon size={22} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink-soft sm:text-[13px]">{STATUS_LABEL[s]}<span className="max-sm:hidden"> Invitations</span></p>
              {row ? (
                <>
                  <p className="text-[26px] font-bold leading-tight tabular-nums text-ink sm:text-[30px]">{row.count}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted">
                    <DeltaChip delta={{ dir: delta === 0 ? "flat" : delta > 0 ? "up" : "down", text: String(Math.abs(delta)) }} lowerIsBetter={lowerIsBetter} />
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
          </li>
        );
      })}
    </ul>
  );
}
