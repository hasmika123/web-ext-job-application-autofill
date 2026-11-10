import Link from "next/link";
import {
  AiIcon,
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChartIcon,
  BriefcaseIcon,
  DollarIcon,
  FileTextIcon,
  GearIcon,
  MessageIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import { DataTable, FilterSelect, IconTile, Progress, StatusChip, type DataColumn, type Tone } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, BarLineChart, PersonCell, SampleTag } from "../common";
// eslint-disable-next-line no-restricted-imports -- sample data stays on this page until A4.1 removes it (ADMIN-E2E-PLAN 3.5)
import {
  AI_ALERTS,
  AI_SEVERITY_TONE,
  AI_TILE_EXTRAS as X,
  AI_TREND_REQUESTS,
  AI_TREND_USERS,
  AI_TREND_X,
  DAILY_REQUEST_LIMIT,
} from "./sample-data";

export interface UserSpend {
  /** null = spend kept from deleted accounts. */
  login: string | null;
  calls: number;
  costMicros: number;
  percentOfProBudget: number;
}
export interface TaskSpend {
  task: string;
  calls: number;
  costMicros: number;
}
export interface AiUsageView {
  period: string;
  proBudgetMicros: number;
  freeParsesPerMonth: number;
  totalCostMicros: number;
  totalCalls: number;
  userCount: number;
  users: UserSpend[];
  tasks: TaskSpend[];
}

const TASK_LABELS: Record<string, string> = {
  draft: "Answer drafting",
  pick: "Option picks",
  map: "Field mapping",
  enrich: "Job enrichment",
  parse: "Resume parsing",
  match: "Resume match",
  fit: "Job fit",
  tailor: "Resume tailoring",
  jobs: "Daily job matches",
  inbox: "Inbox reading",
};
const TASK_TONES: Tone[] = ["blue", "green", "amber", "pink", "violet", "teal", "coral"];

/** Dollars from millionths of a dollar. Small amounts keep 4 decimals so a $0.0024 call isn't "$0.00". */
function usd(micros: number): string {
  const d = micros / 1_000_000;
  return `$${d.toFixed(d !== 0 && Math.abs(d) < 1 ? 4 : 2)}`;
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NAV =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-paper/90 px-3 py-1.5 text-[13px] font-semibold text-ink shadow-v2-soft hover:bg-paper";

const ALERT_ICON = { spike: <BarChartIcon size={18} />, cost: <AlertIcon size={18} />, info: <SparklesIcon size={18} /> };
const FEATURE_ICON = [
  <FileTextIcon key="a" size={16} />,
  <BriefcaseIcon key="b" size={16} />,
  <MessageIcon key="c" size={16} />,
  <SparklesIcon key="d" size={16} />,
  <ZapIcon key="e" size={16} />,
];

/**
 * AI usage (board 18). REAL (`/api/admin/ai-usage`, month picker): total calls, users with AI, estimated
 * cost, the feature breakdown (calls, share, cost), the top-users table (links to each user, share of
 * the Pro budget), the spend-vs-Pro-budget row, and a "near the cap" alert per user at 80%+. SAMPLE
 * (tagged): tokens tile, tile deltas + sparklines, the usage trend, the daily request limit and the
 * example alerts. A single user's override lives on their detail page (AiQuotaControl).
 */
export default function AiUsagePage({ data }: { data: AiUsageView | null }) {
  if (!data) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminHero title="AI Usage" subtitle="Monitor AI feature usage, costs, and performance across the platform." note="AI power helps more people find better jobs!" />
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load AI usage.</div>
      </div>
    );
  }

  const prev = shiftMonth(data.period, -1);
  const next = shiftMonth(data.period, 1);
  const totalCalls = data.totalCalls;
  const poolMicros = data.proBudgetMicros * Math.max(1, data.userCount);
  const spendPct = poolMicros > 0 ? Math.min(100, Math.round((data.totalCostMicros / poolMicros) * 100)) : 0;
  const near = data.users.filter((u) => u.login && u.percentOfProBudget >= 80);
  const topUsers = data.users.slice(0, 8);

  const userCols: DataColumn<UserSpend>[] = [
    { key: "rank", header: "#", hideOnMobile: true, className: "w-8", render: (_u, i) => <span className="text-v2-muted">{i + 1}</span> },
    {
      key: "login",
      header: "User",
      primary: true,
      render: (u) =>
        u.login ? (
          <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="hover:underline">
            <PersonCell name={u.login} avatarName={u.login} />
          </Link>
        ) : (
          <span className="italic text-ink-soft">Deleted accounts</span>
        ),
    },
    { key: "calls", header: "AI requests", className: "tabular-nums", render: (u) => u.calls.toLocaleString("en-US") },
    { key: "cost", header: "Est. cost", className: "tabular-nums", render: (u) => usd(u.costMicros) },
    {
      key: "budget",
      header: "Of Pro budget",
      render: (u) => {
        const high = u.percentOfProBudget >= 80;
        return (
          <span className={cn("tabular-nums", high ? "font-semibold text-v2-coral-ink" : "text-ink-soft")}>
            {u.percentOfProBudget}%{high && " · near the cap"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="AI Usage"
        subtitle={`Monitor AI feature usage, costs, and performance across the platform. Showing ${data.period} (UTC).`}
        note="AI power helps more people find better jobs!"
        actions={
          <>
            <Link href={`/admin/ai?period=${prev}`} className={NAV}>
              <ArrowLeftIcon size={14} /> {prev}
            </Link>
            <Link href={`/admin/ai?period=${next}`} className={NAV}>
              {next} <ArrowRightIcon size={14} />
            </Link>
          </>
        }
      />

      <AdminStatTiles
        stats={[
          { label: "Total AI requests", value: totalCalls.toLocaleString("en-US"), icon: <AiIcon size={26} />, tone: "blue" },
          { label: "Active AI users", value: data.userCount.toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "green" },
          { label: "Tokens used", value: X.tokens.value, icon: <SparklesIcon size={26} />, tone: "amber" },
          { label: "Estimated AI cost", value: usd(data.totalCostMicros), icon: <DollarIcon size={26} />, tone: "violet" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminPanel
          title="AI usage trend"
          description="Total AI requests and active users over time."
          right={
            <span className="flex items-center gap-2">
              <SampleTag />
              <FilterSelect label="Period" options={["Last 30 days", "Last 7 days", "Last 90 days"]} className="w-[138px]" />
            </span>
          }
        >
          <BarLineChart
            bars={AI_TREND_REQUESTS}
            line={AI_TREND_USERS}
            max={1600}
            xLabels={AI_TREND_X}
            yLabels={["0", "400", "800", "1.2K", "1.6K"]}
            barLabel="AI requests"
            lineLabel="Active AI users"
          />
        </AdminPanel>

        <AdminPanel title="AI feature breakdown" description={`Requests and cost by feature in ${data.period}.`}>
          {data.tasks.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-soft">No AI calls this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-v2-muted">
                    <th className="pb-2 font-semibold">Feature</th>
                    <th className="pb-2 text-right font-semibold">Requests</th>
                    <th className="w-[34%] pb-2 pl-4 font-semibold">% of total</th>
                    <th className="pb-2 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map((t, i) => {
                    const tone = TASK_TONES[i % TASK_TONES.length];
                    const pct = totalCalls > 0 ? Math.round((t.calls / totalCalls) * 100) : 0;
                    return (
                      <tr key={t.task} className="border-t border-v2-line/50">
                        <td className="py-2.5 pr-2">
                          <span className="flex items-center gap-2.5 font-medium text-ink">
                            <IconTile tone={tone} className="h-7 w-7 flex-none rounded-lg">
                              {FEATURE_ICON[i % FEATURE_ICON.length]}
                            </IconTile>
                            <span className="truncate">{TASK_LABELS[t.task] ?? t.task}</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink">{t.calls.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pl-4">
                          <span className="flex items-center gap-2">
                            <Progress value={pct} tone={tone} className="h-2" label={`${TASK_LABELS[t.task] ?? t.task} share`} />
                            <span className="w-9 flex-none text-right tabular-nums text-v2-muted">{pct}%</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink">{usd(t.costMicros)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminPanel title="Top AI users" description={`Users with the most AI spend in ${data.period}.`} link={{ label: "View all users", href: "/admin/users" }}>
          <DataTable inCard minWidth={440} actions={false} columns={userCols} rows={topUsers} rowKey={(u) => u.login ?? "__deleted"} empty="No AI usage this month." />
        </AdminPanel>

        <div className="grid content-start gap-4">
          <AdminPanel
            title="Usage limits & quota"
            description="Platform-wide AI usage and limits."
            right={
              <Link
                href="/admin/ai/providers"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-v2-line bg-paper px-3 py-1.5 text-[13px] font-semibold text-v2-blue-ink shadow-v2-soft hover:bg-paper-2 sm:min-h-0"
              >
                <GearIcon size={15} /> Providers &amp; routing <ArrowRightIcon size={14} />
              </Link>
            }
          >
            <ul className="space-y-4 text-[13px]">
              <li className="flex items-center gap-3">
                <IconTile tone="blue" className="h-9 w-9 flex-none rounded-xl">
                  <ZapIcon size={17} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium text-ink">Daily request limit</span>
                    <span className="tabular-nums text-ink-soft">
                      {totalCalls.toLocaleString("en-US")} / {DAILY_REQUEST_LIMIT.toLocaleString("en-US")} <SampleTag className="ml-1" />
                    </span>
                  </div>
                  <Progress value={(totalCalls / DAILY_REQUEST_LIMIT) * 100} tone="green" className="mt-1.5 h-2" label="Daily request limit" />
                </div>
              </li>
              <li className="flex items-center gap-3">
                <IconTile tone="amber" className="h-9 w-9 flex-none rounded-xl">
                  <DollarIcon size={17} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium text-ink">Spend vs Pro budget pool</span>
                    <span className="tabular-nums text-ink-soft">
                      {usd(data.totalCostMicros)} / {usd(poolMicros)} · {spendPct}%
                    </span>
                  </div>
                  <Progress value={spendPct} tone="blue" className="mt-1.5 h-2" label="Spend against the Pro budget pool" />
                </div>
              </li>
            </ul>
            <p className="mt-4 text-[12px] text-v2-muted">
              Pro budget {usd(data.proBudgetMicros)}/user/month · Free: {data.freeParsesPerMonth}{" "}resume parses/month. Set a single
              user&apos;s override on their user page.
            </p>
          </AdminPanel>

          <AdminPanel
            title="AI alerts"
            description="Potential issues, unusual activity, or high-cost accounts."
            link={{ label: "View all", href: "/admin/audit" }}
            right={<SampleTag />}
          >
            <ul className="space-y-3">
              {near.slice(0, 2).map((u) => (
                <li key={u.login} className="flex items-start gap-3">
                  <IconTile tone="coral" className="h-9 w-9 flex-none rounded-xl">
                    <AlertIcon size={18} />
                  </IconTile>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-semibold text-ink">Account near the Pro budget cap</span>
                    <span className="block text-[12px] text-ink-soft">
                      {u.login} has used {u.percentOfProBudget}% of the monthly budget ({usd(u.costMicros)}).
                    </span>
                  </span>
                  <StatusChip tone="coral">High</StatusChip>
                </li>
              ))}
              {AI_ALERTS.map((a) => (
                <li key={a.title} className="flex items-start gap-3">
                  <IconTile tone={AI_SEVERITY_TONE[a.severity]} className="h-9 w-9 flex-none rounded-xl">
                    {ALERT_ICON[a.icon]}
                  </IconTile>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-semibold text-ink">{a.title}</span>
                    <span className="block text-[12px] text-ink-soft">{a.detail}</span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    <StatusChip tone={AI_SEVERITY_TONE[a.severity]}>{a.severity}</StatusChip>
                    <span className="text-[11px] text-v2-muted">{a.when}</span>
                  </span>
                </li>
              ))}
            </ul>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
