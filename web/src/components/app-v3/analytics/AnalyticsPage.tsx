"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarIcon, EmptyState, ErrorState, FileTextIcon, MailIcon, Skeleton, TrendingUpIcon, TrophyIcon } from "@kiwiply/ui";
import { BarGroupChart, Donut, FilterSelect, HeroBand, Progress, SectionCard, StatTile, UnderlineTabs } from "@/components/app-v2/common";
import { ANALYTICS_RANGES, getAnalytics, type Analytics } from "@/lib/job-analytics";
import { appliedDelta, barGroups, chartScale, companyPct, funnelRows, isQuiet, responseNote, statusSegments } from "./compute";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "applications", label: "Applications" },
  { id: "interviews", label: "Interviews" },
  { id: "offers", label: "Offers" },
];
const DEFAULT_PERIOD = ANALYTICS_RANGES[0].label;
const SERIES = [
  { label: "Applied", tone: "blue" as const },
  { label: "Interviews", tone: "green" as const },
  { label: "Offers", tone: "violet" as const },
];

type Loaded = { kind: "error"; message: string } | { kind: "ready"; data: Analytics };

const hero = <HeroBand title="Your Job Search Analytics" subtitle="Track your progress and insights." mascot="mascot-apps" note="Look at that progress!" />;

/**
 * Analytics (APP-E2E U12.1) on the account's own history: every number comes from `GET /api/analytics`, which counts
 * each application once, at the first time it reached a stage. The period select is real (30 days / 90 days / a year)
 * and refetches in the browser's time zone. An account that has never applied sees an honest empty state; one that has,
 * but not in this period, sees zeros and a quiet-period note, never a made-up chart.
 */
export default function AnalyticsPage() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [attempt, setAttempt] = useState(0);
  const days = (ANALYTICS_RANGES.find((r) => r.label === period) ?? ANALYTICS_RANGES[0]).days;
  // One request per (period, attempt); the answer is kept with its key, so "loading" is simply "not answered yet".
  const key = `${days}#${attempt}`;
  const [done, setDone] = useState<{ key: string; value: Loaded } | null>(null);
  const [last, setLast] = useState<Analytics | null>(null);
  const state: { kind: "loading" } | Loaded = done?.key === key ? done.value : { kind: "loading" };

  useEffect(() => {
    let live = true;
    void getAnalytics(days).then((r) => {
      if (!live) return;
      if (r.kind === "ok") setLast(r.data);
      setDone({ key, value: r.kind === "ok" ? { kind: "ready", data: r.data } : { kind: "error", message: r.message } });
    });
    return () => {
      live = false;
    };
  }, [days, key]);

  if (state.kind === "error") {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        {hero}
        <ErrorState what="your analytics" description={state.message} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }

  // While a new period loads, keep the previous numbers on screen (no flash); only the very first load is a skeleton.
  const data = state.kind === "ready" ? state.data : last;
  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        {hero}
        <div role="status" aria-busy="true" aria-label="Loading analytics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data.real) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        {hero}
        <EmptyState
          mascot
          title="No analytics yet"
          description="Charts appear once you have applied to a job. Save one, apply, and we count it here."
          action={
            <Link href="/jobs" className="inline-flex h-11 items-center rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95">
              Find jobs
            </Link>
          }
        />
      </div>
    );
  }

  const groups = barGroups(data.overTime, data.granularity);
  const { max, ticks } = chartScale(groups);
  const periodWord = days === 365 ? "year" : `${days} days`; // config-literal-ok: wording for the select's "Last year" option
  const stale = state.kind === "loading";

  const overTime = (
    <SectionCard title="Applications over time" subtitle={data.granularity === "month" ? "By month" : "By week"}>
      {isQuiet(data.overTime) ? (
        <EmptyState variant="inline" title="A quiet stretch" description={`Nothing moved in the last ${periodWord}.`} />
      ) : (
        <BarGroupChart groups={groups} series={SERIES} max={max} yTicks={ticks} />
      )}
    </SectionCard>
  );

  const responseByCompany = (
    <SectionCard title="Response rate by company">
      {!data.inboxSeen ? (
        <EmptyState
          variant="inline"
          title="Connect your inbox"
          description="Replies are spotted in your own Gmail, so we can show which companies write back."
          action={
            <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-v2-blue-ink hover:underline">
              <MailIcon aria-hidden className="h-4 w-4" />
              Set up inbox
            </Link>
          }
        />
      ) : data.responseByCompany.length === 0 ? (
        <EmptyState variant="inline" title="Nothing to compare" description={`No applications sent in the last ${periodWord}.`} />
      ) : (
        <ul className="space-y-3.5">
          {data.responseByCompany.map((c) => (
            <li key={c.company} className="flex items-center gap-3">
              <span className="w-24 flex-none truncate text-[13.5px] font-medium text-v2-navy sm:w-28">{c.company}</span>
              <Progress value={companyPct(c.applied, c.replied)} tone="blue" label={`${c.company} response rate`} className="h-2.5" />
              <span className="w-12 flex-none text-right text-[13px] font-semibold tabular-nums text-v2-navy">
                {c.replied}/{c.applied}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  const statusBreakdown = (
    <SectionCard title="Status breakdown" subtitle={`Applications you touched in the last ${periodWord}`}>
      {data.byStatus.length === 0 ? (
        <EmptyState variant="inline" title="Nothing to show" description={`No application changed in the last ${periodWord}.`} />
      ) : (
        <Donut segments={statusSegments(data.byStatus)} centerValue={data.byStatus.reduce((s, x) => s + x.count, 0)} centerLabel="Total" />
      )}
    </SectionCard>
  );

  const funnel = (
    <SectionCard title="Conversion funnel" subtitle="How far this period's applications get">
      <ul className="space-y-3.5">
        {funnelRows(data.stats).map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-24 flex-none truncate text-[13.5px] font-medium text-v2-navy">{r.label}</span>
            <Progress value={r.value} tone={r.tone} label={r.label} className="h-2.5" />
            <span className="w-24 flex-none text-right text-[13px] font-semibold tabular-nums text-v2-navy">{r.note}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  const grid = (cards: ReactNode[]) => <div className="grid gap-5 md:grid-cols-2 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div>*]:flex-1">{cards}</div>;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      {hero}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-soft sm:flex-1">
          <UnderlineTabs padded counts="pill" ariaLabel="Analytics sections" value={tab} onChange={setTab} className="border-b-0 px-2 sm:px-4" tabs={TABS} />
        </div>
        <FilterSelect label="Time period" options={ANALYTICS_RANGES.map((r) => r.label)} value={period} onChange={setPeriod} className="w-full sm:w-[160px]" />
      </div>

      <div className={stale ? "grid grid-cols-2 gap-2.5 opacity-70 transition-opacity sm:gap-3.5 lg:grid-cols-4" : "grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4"} aria-busy={stale}>
        <StatTile tone="blue" icon={<FileTextIcon className="h-5 w-5" />} value={data.stats.applied} label="Applications" delta={appliedDelta(data.stats)} />
        <StatTile tone="amber" icon={<TrendingUpIcon className="h-5 w-5" />} value={data.stats.replies} label="Replies" sublabel={responseNote(data.stats)} />
        <StatTile tone="green" icon={<CalendarIcon className="h-5 w-5" />} value={data.stats.interviews} label="Interviews" />
        <StatTile tone="violet" icon={<TrophyIcon className="h-5 w-5" />} value={data.stats.offers} label="Offers" />
      </div>

      {tab === "overview" && grid([<div key="a">{overTime}</div>, <div key="b">{responseByCompany}</div>, <div key="c">{statusBreakdown}</div>, <div key="f">{funnel}</div>])}
      {tab === "applications" && grid([<div key="a">{overTime}</div>, <div key="c">{statusBreakdown}</div>])}
      {tab === "interviews" && grid([<div key="b">{responseByCompany}</div>, <div key="f">{funnel}</div>])}
      {tab === "offers" && grid([<div key="f">{funnel}</div>, <div key="c">{statusBreakdown}</div>])}
    </div>
  );
}
