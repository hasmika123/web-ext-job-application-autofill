"use client";

import { BarChartIcon, DonutChart, FUNNEL_COLORS, FunnelChart, FunnelIcon, LineChart, SendIcon, UsersIcon, WeekBarChart, chartColor } from "@kiwiply/ui";
import { MONTH_PERIODS, WEEK_PERIODS, monthLabels, weekLines, type Funnel, type Readiness, type Trend, type WeeklyChart } from "@/lib/ent/marketer-ws/performance";
import { CARD, CardSkeleton, Empty } from "../parts";
import { CardHead, INFO, PeriodSelect } from "./bits";

/** The chart row and the readiness donut of the Performance board. Every card draws only what the API sent, with its own empty state. */

export const NO_NUMBERS = "Numbers appear after your first week.";

export function WeeklyCard({ data, period, onPeriod, loading }: { data: WeeklyChart | null; period: string; onPeriod: (p: string) => void; loading: boolean }) {
  const empty = !data || data.weeks.every((w) => w.submissions === 0 && w.interviews === 0 && w.offers === 0);
  return (
    <section data-perf-card="weekly" className={CARD}>
      <CardHead icon={BarChartIcon} title="Submissions by Week" info={INFO.weekly}>
        <PeriodSelect value={period} onChange={onPeriod} options={WEEK_PERIODS} label="Weeks period" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : empty ? (
        <Empty>{NO_NUMBERS}</Empty>
      ) : (
        <WeekBarChart
          label="Submissions by week"
          height={170}
          categories={data.weeks.map((w) => [...weekLines(w)])}
          series={[
            { key: "submissions", label: "Total Submissions", values: data.weeks.map((w) => w.submissions), color: chartColor(1) },
            { key: "interviews", label: "Interviews", values: data.weeks.map((w) => w.interviews), color: chartColor(4) },
            { key: "offers", label: "Offers", values: data.weeks.map((w) => w.offers), color: chartColor(3) },
          ]}
        />
      )}
    </section>
  );
}

export function TrendCard({ data, period, onPeriod, loading }: { data: Trend | null; period: string; onPeriod: (p: string) => void; loading: boolean }) {
  const empty = !data || data.points.length === 0 || data.points[data.points.length - 1].submissions === 0;
  return (
    <section data-perf-card="trend" className={CARD}>
      <CardHead icon={SendIcon} title="Interviews vs Offers" info={INFO.trend}>
        <PeriodSelect value={period} onChange={onPeriod} options={MONTH_PERIODS} label="Trend period" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : empty ? (
        <Empty>{NO_NUMBERS}</Empty>
      ) : (
        <LineChart
          label="Interviews vs offers"
          height={170}
          xLabels={monthLabels(data.points)}
          series={[
            { key: "submissions", label: "Submissions", values: data.points.map((p) => p.submissions), color: chartColor(1) },
            { key: "interviews", label: "Interviews", values: data.points.map((p) => p.interviews), color: chartColor(4) },
            { key: "offers", label: "Offers", values: data.points.map((p) => p.offers), color: chartColor(3) },
          ]}
        />
      )}
    </section>
  );
}

export function FunnelCard({ data, period, onPeriod, loading }: { data: Funnel | null; period: string; onPeriod: (p: string) => void; loading: boolean }) {
  return (
    <section data-perf-card="funnel" className={CARD}>
      <CardHead icon={FunnelIcon} title="Placement Funnel" info={INFO.funnel}>
        <PeriodSelect value={period} onChange={onPeriod} options={MONTH_PERIODS} label="Funnel period" width="w-[138px]" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : !data || data.total === 0 ? (
        <Empty>{NO_NUMBERS}</Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <FunnelChart label="Placement funnel" stages={data.stages.map((s) => ({ key: s.key, label: s.label, count: s.count }))} />
          <ul className="flex flex-col gap-3 text-[12.5px]">
            {data.stages.map((s, i) => (
              <li key={s.key} data-funnel-row={s.key} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                <span className="leading-tight">
                  <span className="block text-ink-soft">{s.label}</span>
                  <span className="block text-muted">{s.pct}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const READINESS_COLOR: Record<string, string> = { ready: chartColor(3), progress: chartColor(1), attention: chartColor(2), inactive: chartColor(5) };

export function ReadinessCard({ data, loading }: { data: Readiness | null; loading: boolean }) {
  return (
    <section data-perf-card="readiness" className={CARD}>
      <CardHead icon={UsersIcon} title="Consultant Readiness" info={INFO.readiness} />
      {loading ? (
        <CardSkeleton />
      ) : !data || data.total === 0 ? (
        <Empty>No consultants are assigned to you yet.</Empty>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <DonutChart
            label="Consultant readiness"
            size={150}
            total={data.total}
            totalLabel="Consultants"
            slices={data.buckets.map((b) => ({ key: b.key, label: b.label, value: b.count, color: READINESS_COLOR[b.key] }))}
            className="[&_ul]:hidden"
          />
          <ul className="flex min-w-[11rem] flex-1 flex-col gap-3 text-[13px]">
            {data.buckets.map((b) => (
              <li key={b.key} data-readiness-row={b.key} className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: READINESS_COLOR[b.key] }} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{b.label}</span>
                <b className="tabular-nums text-ink">{b.count}</b>
                <span className="w-12 text-right tabular-nums text-muted">({b.pct}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
