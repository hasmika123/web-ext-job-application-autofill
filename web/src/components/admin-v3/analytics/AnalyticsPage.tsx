import type { ReactNode } from "react";
import {
  AiIcon,
  BarChartIcon,
  BoardIcon,
  FileTextIcon,
  LinkIcon,
  LinkedInIcon,
  MailIcon,
  RocketIcon,
  SearchIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
  cn,
} from "@kiwiply/ui";
import { DataTable, FilterSelect, TONE, type DataColumn } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, BarLineChart, HBarList, SampleTag } from "../common";
import AnalyticsFilters from "./AnalyticsFilters";
import {
  ACTIVE_USERS_SERIES,
  ANALYTICS_TILE_EXTRAS as X,
  CHANNELS,
  COHORTS,
  COHORT_WEEKS,
  COUNTRIES,
  ENGAGEMENT,
  GROWTH_X,
  TOTAL_USERS_SERIES,
} from "./sample-data";

export interface Funnel {
  signedUp: number;
  activated: number;
  withProfile: number;
  startedApplying: number;
  applied: number;
}
export interface Billing {
  activePro: number;
  monthlyCount: number;
  threeMonthCount: number;
  mrr: number;
  newThisMonth: number;
  churnedThisMonth: number;
  pastDue: number;
}
/** One ATS family over the last 30 days (Phase 10.1). Counts only; see FillTelemetryService. */
export interface FillQuality {
  ats: string;
  fills: number;
  fillRatePct: number;
  gapRatePct: number;
  correctionRatePct: number;
  genericPct: number;
  fieldsFailed: number;
}
export interface Analytics {
  totalUsers: number;
  activatedUsers: number;
  activationRatePct: number;
  signups7d: number;
  signups30d: number;
  activeUsers7d: number;
  activeUsers30d: number;
  totalResumes: number;
  totalApplications: number;
  funnel: Funnel;
  applicationsByStatus: Record<string, number>;
  billing: Billing;
  fillQuality: FillQuality[];
}

const ATS_NAMES: Record<string, string> = {
  workday: "Workday",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  icims: "iCIMS",
  taleo: "Taleo",
  smartrecruiters: "SmartRecruiters",
  bamboohr: "BambooHR",
  jobvite: "Jobvite",
  indeed: "Indeed",
  successfactors: "SuccessFactors",
  oracle: "Oracle",
  linkedin: "LinkedIn",
  other: "Other sites",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const ENGAGEMENT_ICON: Record<string, ReactNode> = {
  ai: <AiIcon size={16} />,
  board: <BoardIcon size={16} />,
  chart: <BarChartIcon size={16} />,
  file: <FileTextIcon size={16} />,
  mail: <MailIcon size={16} />,
  link: <LinkIcon size={16} />,
  users: <UsersIcon size={16} />,
};
const CHANNEL_ICON: Record<string, ReactNode> = {
  search: <SearchIcon size={15} />,
  link: <LinkIcon size={15} />,
  rocket: <RocketIcon size={15} />,
  linkedin: <LinkedInIcon size={15} />,
  x: <XIcon size={15} />,
  mail: <MailIcon size={15} />,
  users: <UsersIcon size={15} />,
};

const STAGE_TONES = ["blue", "blue", "green", "amber", "violet"] as const;

function Mini({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-v2-line/60 bg-paper-2/50 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-[22px] font-extrabold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-soft">{sub}</div>}
    </div>
  );
}

/**
 * Analytics (board 14). REAL (`/api/admin/analytics`): the four KPI tiles (total users, active 7d,
 * signups 30d, Pro churn this month), the activation funnel, applications by status, the revenue
 * block and the fill-quality-by-ATS table. SAMPLE (tagged): tile deltas + sparklines, user growth
 * series, engagement by feature, cohort retention, users by country, acquisition channels. The filter
 * row is inert (the endpoint takes no filters): each select says "coming soon".
 */
export default function AnalyticsPage({ a }: { a: Analytics | null }) {
  if (!a) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminHero title="Analytics" subtitle="Insights into user growth, engagement, and platform performance." note="Data drives a brighter tomorrow!" />
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load analytics.</div>
      </div>
    );
  }

  const f = a.funnel;
  const stages = [
    { label: "Signed up", value: f.signedUp },
    { label: "Activated", value: f.activated },
    { label: "Built a profile", value: f.withProfile },
    { label: "Started applying", value: f.startedApplying },
    { label: "Applied", value: f.applied },
  ];
  const funnelMax = Math.max(1, f.signedUp);
  const b = a.billing;
  // Anything Pro that isn't on one of the two configured prices. Shown rather than swallowed:
  // it means MRR is understated, and the cause is config, not the data.
  const unpriced = b.activePro - b.monthlyCount - b.threeMonthCount;
  const churnBase = b.activePro + b.churnedThisMonth;
  const churnPct = churnBase > 0 ? Math.round((b.churnedThisMonth / churnBase) * 1000) / 10 : 0;
  const statusEntries = Object.entries(a.applicationsByStatus);
  const statusMax = Math.max(1, ...statusEntries.map(([, c]) => c));

  const channelCols: DataColumn<(typeof CHANNELS)[number]>[] = [
    {
      key: "channel",
      header: "Channel",
      primary: true,
      render: (c) => (
        <span className="flex items-center gap-2 font-medium text-ink">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-paper-2 text-ink-soft">{CHANNEL_ICON[c.icon]}</span>
          {c.channel}
        </span>
      ),
    },
    { key: "users", header: "Users", className: "tabular-nums" },
    { key: "active", header: "Active users", className: "tabular-nums" },
    { key: "conversion", header: "Conversion", className: "tabular-nums" },
    { key: "churn", header: "Churn rate", className: "tabular-nums" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero title="Analytics" subtitle="Insights into user growth, engagement, and platform performance." note="Data drives a brighter tomorrow!" />

      <AnalyticsFilters />

      <AdminStatTiles
        stats={[
          { label: "Total users", value: a.totalUsers.toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "blue", delta: X.total.delta, caption: "vs last 30 days", sparkline: X.total.spark },
          { label: "Active users (7d)", value: a.activeUsers7d.toLocaleString("en-US"), icon: <BarChartIcon size={26} />, tone: "green", delta: X.active.delta, caption: "vs last 30 days", sparkline: X.active.spark },
          { label: "New users (30d)", value: a.signups30d.toLocaleString("en-US"), icon: <UserIcon size={26} />, tone: "amber", delta: X.signups.delta, caption: "vs last 30 days", sparkline: X.signups.spark },
          { label: "Pro churn (month)", value: `${churnPct}%`, icon: <TrendingUpIcon size={26} />, tone: "violet", delta: X.churn.delta, caption: "vs last 30 days", sparkline: X.churn.spark },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <AdminPanel
          className="md:col-span-2 xl:col-span-1"
          title="User growth"
          description="Total and active users over time."
          right={
            <span className="flex items-center gap-2">
              <SampleTag />
              <FilterSelect label="Period" options={["Last 30 days", "Last 7 days", "Last 90 days"]} className="w-[138px]" />
            </span>
          }
        >
          <BarLineChart
            bars={TOTAL_USERS_SERIES}
            line={ACTIVE_USERS_SERIES}
            max={200}
            xLabels={GROWTH_X}
            yLabels={["0", "50", "100", "150", "200"]}
            barLabel="Total users"
            lineLabel="Active users"
          />
        </AdminPanel>

        <AdminPanel title="Activation funnel" description="From sign up to first application.">
          <ul className="space-y-4">
            {stages.map((s, i) => {
              const pct = f.signedUp ? Math.round((s.value / f.signedUp) * 100) : 0;
              const tone = STAGE_TONES[i];
              return (
                <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13px]">
                  <span className="text-ink">
                    <span className="text-v2-muted">{i + 1}.</span> {s.label}
                  </span>
                  <span className="flex items-baseline gap-3 tabular-nums">
                    <span className="font-semibold text-ink">{s.value.toLocaleString("en-US")}</span>
                    <span className="w-10 text-right text-v2-muted">{pct}%</span>
                  </span>
                  <span className="col-span-2 h-2.5 overflow-hidden rounded-full bg-paper-2">
                    <span className={cn("block h-full rounded-full opacity-90", TONE[tone].solid)} style={{ width: `${Math.max(2, (s.value / funnelMax) * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </AdminPanel>

        <AdminPanel title="Engagement by feature" description="Unique users using each feature." right={<SampleTag />}>
          <HBarList
            className="space-y-3"
            items={ENGAGEMENT.map((e) => ({ label: e.label, icon: ENGAGEMENT_ICON[e.icon], value: e.value, tone: e.tone }))}
          />
        </AdminPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminPanel
          title="Revenue"
          description={`${b.monthlyCount} monthly · ${b.threeMonthCount} on 3-month${unpriced > 0 ? ` · ${unpriced} on an unrecognised price` : ""}`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Mini label="MRR" value={usd.format(b.mrr)} sub="3-month plans counted per month" />
            <Mini label="Active Pro" value={b.activePro} />
            <Mini label="New / churned (mo)" value={`${b.newThisMonth} / ${b.churnedThisMonth}`} sub="this calendar month" />
            <Mini label="Past due" value={b.pastDue} sub={b.pastDue > 0 ? "still Pro while Stripe retries" : "no failed payments"} />
          </div>
        </AdminPanel>

        <AdminPanel title="Applications by status" description={`${a.totalApplications.toLocaleString("en-US")} applications · ${a.totalResumes.toLocaleString("en-US")} resumes`}>
          <ul className="space-y-3">
            {statusEntries.map(([status, count]) => (
              <li key={status} className="flex items-center gap-3 text-[13px]">
                <span className="w-[84px] flex-none text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">{status}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <span className="block h-full rounded-full bg-v2-blue" style={{ width: `${Math.max(2, Math.round((count / statusMax) * 100))}%` }} />
                </span>
                <span className="w-12 flex-none text-right font-semibold tabular-nums text-ink">{count.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </AdminPanel>

        <AdminPanel
          className="md:col-span-2"
          title="Fill quality by ATS"
          description="Last 30 days, worst first. Counts only, never field values."
        >
          {(a.fillQuality ?? []).length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-soft">No fills recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
                    <th className="pb-2 pr-3 font-semibold">ATS</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Fills</th>
                    <th className="pb-2 pr-3 text-right font-semibold" title="Fills that left at least one required field empty">Gaps</th>
                    <th className="pb-2 pr-3 text-right font-semibold" title="Of the fields found, how many were filled">Filled</th>
                    <th className="pb-2 pr-3 text-right font-semibold" title="Of the fields filled, how many the user changed afterwards">Fixed</th>
                    <th className="pb-2 text-right font-semibold" title="Fills handled by the generic scanner (no dedicated adapter)">Generic</th>
                  </tr>
                </thead>
                <tbody>
                  {a.fillQuality.map((q) => (
                    <tr key={q.ats} className="border-t border-v2-line/50">
                      <td className="py-2 pr-3 font-medium text-ink">{ATS_NAMES[q.ats] ?? q.ats}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.fills}</td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", q.gapRatePct >= 50 ? "font-semibold text-v2-coral-ink" : "text-ink")}>{q.gapRatePct}%</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.fillRatePct}%</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.correctionRatePct}%</td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">{q.genericPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <AdminPanel title="Cohort retention" description="Percentage of users returning by week since signup." right={<SampleTag />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-separate border-spacing-[3px] text-center text-[12px]">
              <thead>
                <tr className="text-v2-muted">
                  <th className="px-1 pb-1 text-left font-semibold">Cohort</th>
                  {COHORT_WEEKS.map((w) => (
                    <th key={w} className="pb-1 font-semibold">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COHORTS.map((c) => (
                  <tr key={c.label}>
                    <td className="whitespace-nowrap px-1 py-1.5 text-left text-ink-soft">{c.label}</td>
                    {c.weeks.concat(Array(COHORT_WEEKS.length - c.weeks.length).fill(null)).map((v, i) => (
                      <td
                        key={i}
                        className="rounded-md py-1.5 font-medium tabular-nums text-ink"
                        style={v === null ? undefined : { background: `color-mix(in srgb, var(--color-v2-blue) ${Math.round(14 + v * 0.46)}%, white)` }}
                      >
                        {v === null ? <span className="text-v2-muted">--</span> : `${v}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>

        <AdminPanel
          title="Users by country"
          description="Top countries by total users."
          right={
            <span className="flex items-center gap-2">
              <SampleTag />
            </span>
          }
        >
          <HBarList className="space-y-3" items={COUNTRIES.map((c) => ({ label: c.label, value: c.value, tone: c.tone, pct: `${c.pct}%` }))} />
        </AdminPanel>

        <AdminPanel className="md:col-span-2 2xl:col-span-1" title="Acquisition channels" description="Performance by acquisition channel." right={<SampleTag />}>
          <DataTable inCard minWidth={420} actions={false} columns={channelCols} rows={CHANNELS} rowKey={(c) => c.channel} />
        </AdminPanel>
      </div>
    </div>
  );
}
