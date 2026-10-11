"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarIcon, ChartIcon, FileTextIcon, TrendingUpIcon, TrophyIcon, useToast } from "@kiwiply/ui";
import {
  BarGroupChart,
  Donut,
  FilterSelect,
  Progress,
  SectionCard,
  StatTile,
  UnderlineTabs,
} from "@/components/app-v2/common";
import HeroBand from "../local-d/HeroBand";
import { AN_SKILLS, AN_TABS, type AnalyticsData } from "../sample-data.v3d";

const PERIODS = ["Last 7 days", "Last 30 days", "Last 90 days"];

/** Round the chart ceiling up to a multiple of 10 so the y ticks stay readable. */
function chartScale(groups: { values: number[] }[]) {
  const top = Math.max(0, ...groups.flatMap((g) => g.values));
  const max = Math.max(10, Math.ceil(top / 10) * 10);
  return { max, ticks: [0, max / 2, max] };
}

const num = (s: string) => Number.parseInt(s, 10) || 0;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/**
 * Analytics (APP-V3-SPEC 2.12). `data` is real when the account has submitted applications
 * (`data.real`), the board's sample otherwise (computed in `analytics/compute.ts`). The tabs filter
 * which cards show. "Skills in demand" is always sample.
 */
export default function AnalyticsPage({ data }: { data: AnalyticsData }) {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("Last 30 days");

  const { max, ticks } = chartScale(data.overTime);
  const statusTotal = data.status.reduce((s, x) => s + x.value, 0);
  const apps = num(data.stats.applications.value);
  const interviews = num(data.stats.interviews.value);
  const offers = num(data.stats.offers.value);

  const overTime = (
    <SectionCard
      title="Applications over time"
      headerExtra={
        <FilterSelect
          label="Time period"
          options={PERIODS}
          value={period}
          onChange={(v) => {
            if (v === "Last 30 days") setPeriod(v);
            else toast({ title: "Coming soon", description: "Other time ranges arrive with the next analytics update." });
          }}
          className="w-[150px]"
        />
      }
    >
      <BarGroupChart
        groups={data.overTime}
        series={[
          { label: "Applied", tone: "blue" },
          { label: "Interviews", tone: "green" },
          { label: "Offers", tone: "violet" },
        ]}
        max={max}
        yTicks={ticks}
      />
    </SectionCard>
  );

  const responseByCompany = (
    <SectionCard title="Response rate by company">
      <ul className="space-y-3.5">
        {data.responseByCompany.map((c) => (
          <li key={c.name} className="flex items-center gap-3">
            <span className="w-24 flex-none truncate text-[13.5px] font-medium text-v2-navy">{c.name}</span>
            <Progress value={c.pct} tone="blue" label={`${c.name} response rate`} className="h-2.5" />
            <span className="w-10 flex-none text-right text-[13px] font-semibold tabular-nums text-v2-navy">{c.pct}%</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  const statusBreakdown = (
    <SectionCard title="Status breakdown">
      <Donut segments={data.status} centerValue={statusTotal} centerLabel="Total" />
    </SectionCard>
  );

  const skills = (
    <SectionCard title="Skills in demand" subtitle="Across jobs like the ones you apply to">
      <ul className="space-y-3.5">
        {AN_SKILLS.map((s) => (
          <li key={s.name} className="flex items-center gap-3">
            <span className="w-24 flex-none truncate text-[13.5px] font-medium text-v2-navy">{s.name}</span>
            <Progress value={s.pct} tone="green" label={`${s.name} demand`} className="h-2.5" />
            <span className="w-10 flex-none text-right text-[13px] font-semibold tabular-nums text-v2-navy">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  const funnel = (
    <SectionCard title="Conversion funnel" subtitle="How far your applications get">
      <ul className="space-y-3.5">
        {[
          { label: "Applications", value: 100, note: `${apps}`, tone: "blue" as const },
          { label: "Interviews", value: pct(interviews, apps), note: `${interviews} (${pct(interviews, apps)}%)`, tone: "green" as const },
          { label: "Offers", value: pct(offers, apps), note: `${offers} (${pct(offers, apps)}%)`, tone: "violet" as const },
        ].map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-24 flex-none truncate text-[13.5px] font-medium text-v2-navy">{r.label}</span>
            <Progress value={r.value} tone={r.tone} label={r.label} className="h-2.5" />
            <span className="w-24 flex-none text-right text-[13px] font-semibold tabular-nums text-v2-navy">{r.note}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  const grid = (cards: ReactNode[]) => <div className="grid gap-5 lg:grid-cols-2">{cards}</div>;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand title="Your Job Search Analytics" subtitle="Track your progress and insights." mascot="mascot-apps" note="Look at that progress!" />

      <div className="rounded-2xl border border-v2-line bg-white shadow-v2-soft">
        <UnderlineTabs padded counts="pill" ariaLabel="Analytics sections" value={tab} onChange={setTab} className="border-b-0 px-2 sm:px-4" tabs={AN_TABS} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="blue" icon={<FileTextIcon className="h-5 w-5" />} value={data.stats.applications.value} label="Applications" delta={data.stats.applications.delta} />
        <StatTile tone="green" icon={<CalendarIcon className="h-5 w-5" />} value={data.stats.interviews.value} label="Interviews" delta={data.stats.interviews.delta} />
        <StatTile tone="violet" icon={<TrophyIcon className="h-5 w-5" />} value={data.stats.offers.value} label="Offers" delta={data.stats.offers.delta} />
        <StatTile tone="amber" icon={<TrendingUpIcon className="h-5 w-5" />} value={data.stats.response.value} label="Response rate" delta={data.stats.response.delta} />
      </div>

      {tab === "overview" && grid([<div key="a">{overTime}</div>, <div key="b">{responseByCompany}</div>, <div key="c">{statusBreakdown}</div>, <div key="d">{skills}</div>])}
      {tab === "applications" && grid([<div key="a">{overTime}</div>, <div key="c">{statusBreakdown}</div>])}
      {tab === "interviews" && grid([<div key="b">{responseByCompany}</div>, <div key="f">{funnel}</div>])}
      {tab === "offers" && grid([<div key="f">{funnel}</div>, <div key="c">{statusBreakdown}</div>])}

      {!data.real && (
        <p className="flex items-center gap-2 text-[12.5px] text-v2-muted">
          <ChartIcon aria-hidden className="h-4 w-4 flex-none" />
          Example numbers. Your own charts appear once you have submitted applications.
        </p>
      )}
    </div>
  );
}
