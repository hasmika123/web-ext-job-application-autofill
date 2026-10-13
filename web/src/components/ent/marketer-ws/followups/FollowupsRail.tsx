"use client";

import type { ComponentType, ReactNode } from "react";
import { BarChartIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, HourglassIcon, LayoutGridIcon, PencilIcon, PhoneIcon, Select, SendIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { WINDOW_LABEL, responseTimeText, type FollowupInsights, type InsightWindow } from "@/lib/ent/marketer-ws/followups";
import { CARD, Head, HelpBannerCard, TINTS } from "../parts";
import type { DialogKind } from "./ActionDialog";

/** The right column of the Follow-ups board: the bee help card, Quick Actions and Follow-up Insights. */

function QuickRow({ icon: Icon, tint, title, hint, onClick }: { icon: ComponentType<IconProps>; tint: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-left hover:bg-accent-soft/50">
      <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-lg", tint)}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-muted">{hint}</span>
      </span>
      <ChevronRightIcon size={16} className="flex-none text-accent-deep" />
    </button>
  );
}

function InsightRow({ icon: Icon, iconTint, label, value, share, bar, valueTone }: { icon: ComponentType<IconProps>; iconTint: string; label: string; value: ReactNode; share: number; bar: string; valueTone: string }) {
  const pct = Math.round(Math.min(Math.max(Number.isFinite(share) ? share : 0, 0), 1) * 100);
  return (
    <li className="flex items-center gap-2.5" data-insight={label}>
      <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center", iconTint)}>
        <Icon size={18} />
      </span>
      <span className="w-[112px] flex-none text-[13px] text-ink-soft">{label}</span>
      <span role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
        <span className={cn("block h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn("w-[58px] flex-none text-right text-[13px] font-bold tabular-nums", valueTone)}>{value}</span>
    </li>
  );
}

export default function FollowupsRail({
  insights, window, onWindow, onQuick, loading,
}: { insights: FollowupInsights | null; window: InsightWindow; onWindow: (w: InsightWindow) => void; onQuick: (kind: DialogKind) => void; loading: boolean }) {
  const i = insights;
  const total = i ? i.completed + i.waiting : 0;
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <HelpBannerCard title="Keep your follow-ups on track" body="Timely follow-ups build stronger relationships and move opportunities forward. I can help you find overdue items, draft reminders, or suggest next steps." />

      <section data-followups-card="quick-actions" className={CARD}>
        <Head icon={LayoutGridIcon} title="Quick Actions" />
        <div className="flex flex-col gap-2.5">
          <QuickRow icon={SendIcon} tint={TINTS.blue} title="Send Reminder" hint="Request a reminder (nothing is emailed)" onClick={() => onQuick("reminder")} />
          <QuickRow icon={PhoneIcon} tint={TINTS.green} title="Log Call" hint="Record call notes and outcomes" onClick={() => onQuick("call")} />
          <QuickRow icon={PencilIcon} tint={TINTS.blue} title="Update Status" hint="Mark follow-up as complete or update" onClick={() => onQuick("status")} />
        </div>
      </section>

      <section data-followups-card="insights" aria-busy={loading} className={cn(CARD, loading && "opacity-70")}>
        <Head icon={BarChartIcon} title="Follow-up Insights">
          <Select
            variant="pill"
            aria-label="Insights window"
            value={window}
            onChange={(v) => onWindow(v as InsightWindow)}
            options={(Object.keys(WINDOW_LABEL) as InsightWindow[]).map((w) => ({ value: w, label: WINDOW_LABEL[w] }))}
          />
        </Head>
        {!i || (total === 0 && i.avgResponseHours === null) ? (
          <p className="py-4 text-center text-[13.5px] text-muted">No follow-up activity in this window yet.</p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            <InsightRow icon={ClockIcon} iconTint="text-v2-green-ink" label="Response Rate" value={i.responseRatePct === null ? "—" : `${Math.round(i.responseRatePct)}%`} share={(i.responseRatePct ?? 0) / 100} bar="bg-v2-green" valueTone="text-v2-green-ink" />
            <InsightRow icon={ClockIcon} iconTint="text-v2-violet-ink" label="Avg. Response Time" value={responseTimeText(i.avgResponseHours)} share={i.avgResponseHours === null ? 0 : i.avgResponseHours / 72} bar="bg-accent" valueTone="text-accent-deep" />
            <InsightRow icon={CheckCircleIcon} iconTint="text-v2-green-ink" label="Follow-up Completed" value={i.completed} share={total === 0 ? 0 : i.completed / total} bar="bg-v2-green" valueTone="text-v2-green-ink" />
            <InsightRow icon={HourglassIcon} iconTint="text-v2-amber-ink" label="Still Waiting" value={i.waiting} share={total === 0 ? 0 : i.waiting / total} bar="bg-v2-amber" valueTone="text-v2-amber-ink" />
          </ul>
        )}
      </section>
    </div>
  );
}
