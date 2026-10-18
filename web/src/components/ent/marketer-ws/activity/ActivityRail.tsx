"use client";

import { BarChartIcon, CalendarCheckIcon, Select, cn } from "@kiwiply/ui";
import { SUMMARY_RANGE_LABEL, pctText, upcomingWhen, type ActivitySummary, type Choice, type SummaryRange, type UpcomingRow } from "@/lib/ent/marketer-ws/activity";
import { CARD, CardSkeleton, Empty, Head, HelpBannerCard, TINTS, VIEW_ALL } from "../parts";
import { groupIcon, keyIcon } from "./bits";

/** The right column of the Activities board: the bee help card, "Activity Summary by Type" (with its own range select) and "Upcoming Activities". */

const BAR: Record<string, string> = {
  RESUME: "bg-v2-teal", SUBMISSION: "bg-v2-blue", FOLLOWUP: "bg-v2-amber", INTERVIEW: "bg-v2-violet", APPLICATION: "bg-v2-blue", OFFER: "bg-v2-pink", PLACEMENT: "bg-v2-teal", OPPORTUNITY: "bg-v2-violet",
};
const ICON_TEXT: Record<string, string> = {
  RESUME: "text-v2-green-ink", SUBMISSION: "text-v2-pink-ink", FOLLOWUP: "text-v2-amber-ink", INTERVIEW: "text-v2-violet-ink", APPLICATION: "text-v2-green-ink", OFFER: "text-v2-pink-ink",
  PLACEMENT: "text-v2-green-ink", OPPORTUNITY: "text-v2-violet-ink",
};
const WHEN_TONE = { today: "text-v2-amber-ink", tomorrow: "text-v2-green-ink", later: "text-muted" } as const;

export default function ActivityRail({
  summary, ranges, onRange, upcoming, upcomingTotal, expanded, onExpand, loading, refreshing,
}: {
  summary: ActivitySummary | null;
  ranges: Choice[];
  onRange: (r: SummaryRange) => void;
  upcoming: UpcomingRow[];
  upcomingTotal: number;
  expanded: boolean;
  onExpand: () => void;
  loading: boolean;
  refreshing: boolean;
}) {
  const now = new Date();
  const rangeOptions = (ranges.length > 0 ? ranges : Object.entries(SUMMARY_RANGE_LABEL).map(([key, label]) => ({ key, label }))).map((r) => ({ value: r.key, label: r.label }));
  const shown = expanded ? upcoming : upcoming.slice(0, 5);
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <HelpBannerCard
        title="Keep your marketing momentum going"
        body="Track every action, from resume updates to client follow-ups, and see how your consultants move closer to opportunity. Log activities, set next steps, and never miss a moment."
      />

      <section data-activity-card="summary" className={CARD}>
        <Head icon={BarChartIcon} title="Activity Summary by Type">
          <Select variant="pill" aria-label="Summary range" value={summary?.range ?? "THIS_MONTH"} onChange={(v) => onRange(v as SummaryRange)} options={rangeOptions} className="!min-h-0 !py-1 text-[12px]" />
        </Head>
        {loading ? (
          <CardSkeleton rows={7} />
        ) : !summary || summary.total === 0 ? (
          <Empty>No activity yet</Empty>
        ) : (
          <ul className={cn("flex flex-col gap-3", refreshing && "opacity-60")}>
            {summary.rows.map((r) => {
              const spec = groupIcon(r.key);
              const Icon = spec.icon;
              const pct = Math.min(Math.max(r.pct, 0), 100);
              return (
                <li key={r.key} data-summary-row={r.key} className="flex items-center gap-2.5">
                  <Icon size={18} className={cn("flex-none", ICON_TEXT[r.key] ?? "text-accent-deep")} aria-hidden />
                  <span className="w-[116px] flex-none truncate text-[13px] text-ink-soft">{r.label}</span>
                  <span role="meter" aria-label={r.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
                    <span className={cn("block h-full rounded-full", BAR[r.key] ?? "bg-accent")} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-7 flex-none text-right text-[13px] font-bold tabular-nums text-ink">{r.count}</span>
                  <span className="w-9 flex-none text-right text-[12px] tabular-nums text-muted">{pctText(r.pct)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-activity-card="upcoming" className={CARD}>
        <Head icon={CalendarCheckIcon} title="Upcoming Activities">
          <button type="button" className={cn(VIEW_ALL, "disabled:cursor-default disabled:opacity-60")} disabled={upcoming.length <= 5} aria-expanded={expanded} onClick={onExpand}>
            {expanded ? "Show less" : "View all"}
          </button>
        </Head>
        {loading ? (
          <CardSkeleton rows={4} />
        ) : upcoming.length === 0 ? (
          <Empty>Nothing scheduled in the next two weeks.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((u) => {
              const spec = keyIcon(u.icon);
              const Icon = spec.icon;
              const when = upcomingWhen(u.at, now);
              return (
                <li key={u.id} data-upcoming-row={u.id} className="flex items-center gap-2.5">
                  <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-[9px]", TINTS[spec.tint])}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{u.title}</span>
                    <span className="block truncate text-[12px] text-muted">{u.consultantName}</span>
                  </span>
                  <span className={cn("flex-none whitespace-nowrap text-[12px] font-semibold", WHEN_TONE[when.tone])}>{when.text}</span>
                </li>
              );
            })}
            {upcomingTotal > upcoming.length ? <li className="text-[12px] text-muted">{upcomingTotal - upcoming.length} more not shown</li> : null}
          </ul>
        )}
      </section>
    </div>
  );
}
