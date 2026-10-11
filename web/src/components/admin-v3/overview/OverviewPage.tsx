import type { ReactNode } from "react";
import {
  AiIcon,
  BarChartIcon,
  BoardIcon,
  BugIcon,
  CreditCardIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MessageIcon,
  RefreshIcon,
  ShieldIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { FilterSelect, StatusChip } from "@/components/app-v2/common";
import { AdminHero, AdminLinkTile, AdminPanel, AdminStatTiles, BarLineChart, LivePill, SampleTag } from "../common";
import { GROWTH_ACTIVE, GROWTH_SIGNUPS, GROWTH_X, OVERVIEW_TILE_EXTRAS as X, PLATFORM_HEALTH } from "../sample-data";

export interface OverviewKpis {
  totalUsers: number;
  activationRatePct: number;
  signups7d: number;
  activeUsers7d: number;
}

const HEALTH_ICON: Record<string, ReactNode> = {
  Application: <GlobeIcon size={17} />,
  Database: <LayersIcon size={17} />,
  "AI services": <AiIcon size={17} />,
  "Job sources": <BarChartIcon size={17} />,
  "Email delivery": <MailIcon size={17} />,
  "Background jobs": <RefreshIcon size={17} />,
  "External integrations": <LinkIcon size={17} />,
  "Security & monitoring": <ShieldIcon size={17} />,
};

const AREAS: { href: string; title: string; desc: string; tone: "blue" | "violet" | "green" | "amber" | "coral" | "pink" | "teal"; icon: ReactNode; soon?: boolean }[] = [
  { href: "/admin/users", title: "Users", desc: "Browse accounts; activate, reset, roles, force-logout, delete.", tone: "blue", icon: <UsersIcon size={22} /> },
  { href: "/admin/customers", title: "Customers", desc: "Manage enterprise customers, plans, subscriptions.", tone: "violet", icon: <CreditCardIcon size={22} /> },
  { href: "/admin/ai", title: "AI usage", desc: "Per-user drafting usage by month. Quota overrides next.", tone: "green", icon: <AiIcon size={22} /> },
  { href: "/admin/job-sources", title: "Job sources", desc: "Job boards daily job matches read; last read, add, switch off.", tone: "amber", icon: <BoardIcon size={22} /> },
  { href: "/admin/security", title: "Security", desc: "Active refresh-token families; revoke / force logout.", tone: "blue", icon: <ShieldIcon size={22} />, soon: true },
  { href: "/admin/analytics", title: "Analytics", desc: "Signups, activation rate, active users, funnel.", tone: "pink", icon: <BarChartIcon size={22} /> },
  { href: "/admin/subscribers", title: "Email", desc: "Newsletter subscribers, consent, CSV export.", tone: "amber", icon: <MailIcon size={22} /> },
  { href: "/admin/bug-reports", title: "Bug reports", desc: "Triage queue for reports from web + extension.", tone: "coral", icon: <BugIcon size={22} /> },
  { href: "/admin/inquiries", title: "Inquiries", desc: "Manage user inquiries and support requests.", tone: "violet", icon: <MessageIcon size={22} /> },
  { href: "/admin/system", title: "System", desc: "Health, metrics, log levels, build info (read-only).", tone: "blue", icon: <GearIcon size={22} /> },
  { href: "/admin/audit", title: "Audit log", desc: "Every admin action and reason-gated PII access.", tone: "teal", icon: <FileTextIcon size={22} /> },
];

/**
 * Admin Overview (board 21). REAL: the four KPI numbers (`/api/admin/analytics`, passed in as `kpis`);
 * the section links. SAMPLE (tagged): tile deltas + sparklines, the growth chart, platform health.
 */
export default function OverviewPage({ kpis }: { kpis: OverviewKpis | null }) {
  const n = (v: number | undefined, f: (x: number) => string = String) => (v === undefined ? "n/a" : f(v));
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Admin Overview"
        subtitle="Operate Kiwiply: manage accounts, AI usage, security, comms, and the audit trail."
        note="Keep Kiwiply running smoothly!"
      />

      <AdminStatTiles
        stats={[
          { label: "Total users", value: n(kpis?.totalUsers, (v) => v.toLocaleString("en-US")), icon: <UsersIcon size={26} />, tone: "blue", delta: X.totalUsers.delta, caption: X.totalUsers.caption, sparkline: X.totalUsers.spark },
          { label: "Activation rate", value: n(kpis?.activationRatePct, (v) => `${v}%`), icon: <BarChartIcon size={26} />, tone: "green", delta: X.activation.delta, caption: X.activation.caption, sparkline: X.activation.spark },
          { label: "Signups (7d)", value: n(kpis?.signups7d), icon: <UserIcon size={26} />, tone: "amber", delta: X.signups.delta, caption: X.signups.caption, sparkline: X.signups.spark },
          { label: "Active (7d)", value: n(kpis?.activeUsers7d), icon: <TrendingUpIcon size={26} />, tone: "violet", delta: X.active.delta, caption: X.active.caption, sparkline: X.active.spark },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <AdminPanel
          className="md:col-span-2 xl:col-span-1"
          title="User growth & signups"
          description="New signups and active users over time."
          right={
            <span className="flex items-center gap-2">
              <SampleTag />
              <FilterSelect label="Period" options={["Last 30 days", "Last 7 days", "Last 90 days"]} className="w-[138px]" />
            </span>
          }
        >
          <BarLineChart
            bars={GROWTH_SIGNUPS}
            line={GROWTH_ACTIVE}
            max={200}
            xLabels={GROWTH_X}
            yLabels={["0", "50", "100", "150", "200"]}
            barLabel="New signups"
            lineLabel="Active users"
          />
        </AdminPanel>

        <AdminPanel title="Platform health" description="Key systems and services status." right={<SampleTag />}>
          <ul className="divide-y divide-v2-line/50">
            {PLATFORM_HEALTH.map((h) => (
              <li key={h.label} className="flex items-center gap-2.5 py-2 text-[13px]">
                <span className="flex-none text-ink-soft">{HEALTH_ICON[h.label] ?? <LockIcon size={17} />}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{h.label}</span>
                <StatusChip tone={h.status === "Healthy" ? "green" : "amber"} dot className="bg-transparent! px-0!">
                  {h.status}
                </StatusChip>
              </li>
            ))}
          </ul>
        </AdminPanel>

        <AdminPanel title="Quick actions" description="Common administrative tasks.">
          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2">
            <AdminLinkTile href="/admin/users" icon={<UsersIcon size={22} />} tone="blue" title="Manage users" description="View, activate, or reset user accounts." />
            <AdminLinkTile href="/admin/analytics" icon={<BarChartIcon size={22} />} tone="green" title="View analytics" description="User growth, activation and usage." />
            <AdminLinkTile href="/admin/system" icon={<ShieldIcon size={22} />} tone="violet" title="Check system health" description="View service status and logs." />
            <AdminLinkTile href="/admin/subscribers" icon={<MailIcon size={22} />} tone="amber" title="Send newsletter" description="Message subscribers." />
            <AdminLinkTile href="/admin/bug-reports" icon={<BugIcon size={22} />} tone="coral" title="Review bug reports" description="Triage and manage reports." />
            <AdminLinkTile href="/admin/subscribers" icon={<FileTextIcon size={22} />} tone="blue" title="Export data" description="CSV exports and reports." />
          </div>
        </AdminPanel>
      </div>

      <section aria-labelledby="areas-h">
        <div className="mb-3">
          <h2 id="areas-h" className="font-display text-[18px] font-bold text-ink">
            Platform areas
          </h2>
          <p className="text-[13px] text-ink-soft">Quick access to key admin functions across the platform.</p>
        </div>
        <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
          {AREAS.map((a) => (
            <AdminLinkTile key={a.title} href={a.href} icon={a.icon} tone={a.tone} title={a.title} description={a.desc} badge={<LivePill soon={a.soon} />} bordered />
          ))}
        </div>
      </section>
    </div>
  );
}
