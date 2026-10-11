"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Select,
  BarChartIcon,
  DownloadIcon,
  CalendarIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  FileTextIcon,
  TrophyIcon,
  UsersIcon,
  TrendingUpIcon,
  TargetIcon,
  ClockIcon,
  cn,
} from "@kiwiply/ui";
import { BarGroupChart, StatusChip, TONE, type Tone } from "@/components/app-v2/common";
import { Funnel, LineChart, PageHero, SectionCard, StatTile } from "../common-local2/primitives";
import { DataTable, FilterSelect, OrgButton, type Column } from "../common-local2/controls";
import {
  ANALYTICS_FILTERS,
  ANALYTICS_STATS,
  APPLICATION_TREND,
  DEPARTMENT_PERFORMANCE,
  FUNNEL_SERIES,
  PLACEMENT_FUNNEL,
  RESPONSE_RATE,
  ROI_TILES,
  SUPPORT_OWNER_PERFORMANCE,
} from "../sample-data.2";

const STAT_ICONS = [
  <FileTextIcon key="a" />,
  <CalendarIcon key="b" />,
  <BriefcaseIcon key="c" />,
  <TrophyIcon key="d" />,
  <TargetIcon key="e" />,
];

const ROI_ICONS = [<UsersIcon key="a" />, <ClockIcon key="b" />, <TrendingUpIcon key="c" />, <CheckCircleIcon key="d" />];

/** The "Last 30 days ▾" selector on every chart card header. */
function PeriodSelect() {
  const [v, setV] = useState("Last 30 days");
  return (
    <Select
      variant="pill"
      aria-label="Period"
      value={v}
      onChange={setV}
      options={ANALYTICS_FILTERS.dateRange.map((o) => ({ value: o, label: o }))}
      className="rounded-[10px]! border-[#DCE2EE]! py-1.5! text-[12.5px]! text-v2-navy!"
    />
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[12px] font-semibold text-v2-ink-soft">{label}</div>
      {children}
    </div>
  );
}

/** 2x2 tile inside the ROI card: stacked (icon over value) so it fits a third-width card. */
function ImpactTile({ icon, value, label, delta, tone }: { icon: ReactNode; value: string; label: string; delta: { value: string; up: boolean }; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div className={cn("min-w-0 rounded-xl p-3.5", t.soft)}>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-[10px] bg-white [&>svg]:h-[18px] [&>svg]:w-[18px]", t.ink)}>{icon}</span>
      <div className="mt-2.5 text-[24px] font-extrabold leading-none text-v2-navy">{value}</div>
      <div className="mt-1 text-[12.5px] font-medium leading-snug text-v2-ink-soft">{label}</div>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11.5px] font-bold",
          delta.up ? "text-[#168A2E]" : "text-[#D13A3A]",
        )}
      >
        <span aria-hidden>{delta.up ? "↑" : "↓"}</span>
        {delta.value}
      </span>
    </div>
  );
}

type OwnerRow = (typeof SUPPORT_OWNER_PERFORMANCE)[number];
const OWNER_COLUMNS: Column<OwnerRow>[] = [
  { key: "owner", header: "Support Owner", primary: true, cell: (r) => <span className="font-semibold text-v2-navy">{r.name}</span> },
  { key: "apps", header: "Applications", cell: (r) => r.applications },
  { key: "int", header: "Interviews", cell: (r) => r.interviews },
  { key: "off", header: "Offers", cell: (r) => r.offers },
  { key: "pl", header: "Placements", cell: (r) => r.placements },
  { key: "rate", header: "Success Rate", cell: (r) => <StatusChip tone="green">{r.rate}</StatusChip> },
];

/** Analytics & Reports body (spec 6.6). Renders inside the org shell. */
export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState(ANALYTICS_FILTERS.dateRange[0]);
  const [department, setDepartment] = useState(ANALYTICS_FILTERS.department[0]);
  const [roleCategory, setRoleCategory] = useState(ANALYTICS_FILTERS.roleCategory[0]);
  const [owner, setOwner] = useState(ANALYTICS_FILTERS.supportOwner[0]);

  return (
    <div className="space-y-4">
      <PageHero
        title="Analytics & Reports"
        icon={<BarChartIcon />}
        subtitle="Measure your team's placement performance and track the impact of Kiwiply."
        note="Data today. Brighter opportunities tomorrow."
      />

      {/* five stat tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ANALYTICS_STATS.map((s, i) => (
          <StatTile key={s.label} compact icon={STAT_ICONS[i]} value={s.value} label={s.label} delta={s.delta} sparkline={s.spark} tone={s.tone} />
        ))}
      </div>

      {/* filter bar */}
      <section className="rounded-2xl bg-white p-4 shadow-v2-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Date Range">
              <FilterSelect label="Date Range" value={dateRange} onChange={setDateRange} options={ANALYTICS_FILTERS.dateRange} leadingIcon={<CalendarIcon className="h-4 w-4" />} />
            </FilterField>
            <FilterField label="Department">
              <FilterSelect label="Department" value={department} onChange={setDepartment} options={ANALYTICS_FILTERS.department} />
            </FilterField>
            <FilterField label="Role Category">
              <FilterSelect label="Role Category" value={roleCategory} onChange={setRoleCategory} options={ANALYTICS_FILTERS.roleCategory} />
            </FilterField>
            <FilterField label="Support Owner">
              <FilterSelect label="Support Owner" value={owner} onChange={setOwner} options={ANALYTICS_FILTERS.supportOwner} />
            </FilterField>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrgButton variant="outline" icon={<DownloadIcon />}>
              Export Report
            </OrgButton>
            <OrgButton variant="solid" icon={<CalendarIcon />}>
              Schedule Report
            </OrgButton>
          </div>
        </div>
      </section>

      {/* row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1.25fr]">
        <SectionCard title="Application Trend" headerExtra={<PeriodSelect />} className="lg:col-span-2 xl:col-span-1">
          <BarGroupChart groups={APPLICATION_TREND} series={FUNNEL_SERIES} max={40} yTicks={[0, 10, 20, 30, 40]} />
        </SectionCard>

        <SectionCard title="Placement Funnel" headerExtra={<PeriodSelect />}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            <div className="w-[190px] flex-none">
              <Funnel stages={PLACEMENT_FUNNEL} />
            </div>
            <ul className="min-w-[140px] flex-1 space-y-2.5 text-[12.5px]">
              {PLACEMENT_FUNNEL.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
                  <span className="flex-1 text-v2-ink-soft">{s.label}</span>
                  <span className="font-semibold text-v2-navy">
                    {s.value} <span className="font-normal text-v2-muted">({s.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Response Rate Trend" headerExtra={<PeriodSelect />}>
          <LineChart
            series={RESPONSE_RATE.series}
            xLabels={RESPONSE_RATE.xLabels}
            yLabels={RESPONSE_RATE.yLabels}
            endLabels={RESPONSE_RATE.endLabels}
          />
        </SectionCard>
      </div>

      {/* row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1.25fr_1.2fr_1fr]">
        <SectionCard title="Department Performance" headerExtra={<PeriodSelect />}>
          <BarGroupChart groups={DEPARTMENT_PERFORMANCE} series={FUNNEL_SERIES} max={40} yTicks={[0, 10, 20, 30, 40]} />
        </SectionCard>

        <SectionCard title="Support Owner Performance" action={{ label: "View all", href: "/org/team" }}>
          <DataTable caption="Support owner performance" columns={OWNER_COLUMNS} rows={SUPPORT_OWNER_PERFORMANCE} rowKey={(r) => r.name} actions={false} minWidth={420} />
        </SectionCard>

        <SectionCard title="Kiwiply Impact & ROI" headerExtra={<PeriodSelect />} className="lg:col-span-2 xl:col-span-1">
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {ROI_TILES.map((t, i) => (
              <ImpactTile key={t.label} icon={ROI_ICONS[i]} value={t.value} label={t.label} delta={t.delta} tone={t.tone} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
