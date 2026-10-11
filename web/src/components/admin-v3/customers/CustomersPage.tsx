import type { ReactNode } from "react";
import { AlertIcon, CalendarIcon, ClockIcon, DollarIcon, UsersIcon } from "@kiwiply/ui";
import { Donut, InitialsAvatar } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, LegendList } from "../common";
import CustomersTable, { type CustomerTab } from "./CustomersTable";
import { CUSTOMER_TILE_EXTRAS as X } from "./sample-data";
import { day, STATUS_LABEL, type Customer } from "@/lib/customers";

function PanelList({ items, empty }: { items: { key: string; name: string; sub?: string; right: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-[13px] text-v2-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2.5">
          <InitialsAvatar name={i.name} size={28} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-ink">{i.name}</span>
            {i.sub && <span className="block truncate text-[11.5px] text-v2-muted">{i.sub}</span>}
          </span>
          <span className="flex-none text-right text-[12px] font-medium text-ink-soft">{i.right}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Customers (board 20, "Customer Management"). REAL: status counts (tiles + mix donut), the paged
 * customer table, and the Renewals / Recent onboarding / Churn risk panels (derived from the
 * newest 100 customers the API returns: `recent`). SAMPLE (tagged): tile trends and the monthly
 * recurring revenue tile. The board's company/seat/plan-mix columns do not exist: customers here
 * are individual subscribers, so the mix is by subscription status.
 */
export default function CustomersPage({
  rows,
  total,
  page,
  pageSize,
  filter,
  tabs,
  counts,
  recent,
  error,
  now = new Date(),
}: {
  rows: Customer[];
  total: number;
  page: number;
  pageSize: number;
  filter: string;
  tabs: CustomerTab[];
  counts: Record<string, number>;
  recent: Customer[];
  error: boolean;
  now?: Date;
}) {
  const n = (k: string) => counts[k] ?? 0;
  const ym = now.toISOString().slice(0, 7);
  const cutoff = now.getTime() - 30 * 86400000;
  const renewals = recent
    .filter((c) => c.statusGroup === "ACTIVE" && c.currentPeriodEnd?.slice(0, 7) === ym)
    .sort((a, b) => (a.currentPeriodEnd ?? "").localeCompare(b.currentPeriodEnd ?? ""));
  const onboarding = recent.filter((c) => c.since && new Date(c.since).getTime() >= cutoff).sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""));
  const risk = recent.filter((c) => c.statusGroup === "PAST_DUE" || c.statusGroup === "CANCELLING");
  const mix = [
    { label: "Active", key: "ACTIVE", tone: "green" as const },
    { label: "Payment failed", key: "PAST_DUE", tone: "coral" as const },
    { label: "Cancelling", key: "CANCELLING", tone: "amber" as const },
    { label: "Lapsed", key: "LAPSED", tone: "slate" as const },
  ].map((m) => ({ ...m, value: n(m.key) }));
  const mixTotal = mix.reduce((s, m) => s + m.value, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        eyebrow="CUSTOMERS"
        title="Customer Management"
        subtitle="Manage customer accounts, subscriptions, renewals, and customer success."
        note="Happy customers build brighter futures!"
      />

      <AdminStatTiles
        stats={[
          { label: "Active customers", value: n("ACTIVE").toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "blue", delta: X.active.delta, caption: "vs last 30 days", sparkline: X.active.spark },
          { label: "Payment failed", value: n("PAST_DUE").toLocaleString("en-US"), icon: <AlertIcon size={26} />, tone: "coral", delta: X.pastDue.delta, caption: "vs last 30 days", sparkline: X.pastDue.spark },
          { label: "Cancelling", value: n("CANCELLING").toLocaleString("en-US"), icon: <ClockIcon size={26} />, tone: "amber", delta: X.cancelling.delta, caption: "vs last 30 days", sparkline: X.cancelling.spark },
          { label: "Monthly recurring revenue", value: X.mrr.value, icon: <DollarIcon size={26} />, tone: "green", delta: X.mrr.delta, caption: "sample data", sparkline: X.mrr.spark },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminPanel title="Customer status mix" description="Distribution of customers by subscription status.">
          <div className="flex flex-col items-center gap-4">
            <Donut
              legend={false}
              size={132}
              centerValue={mixTotal.toLocaleString("en-US")}
              centerLabel="customers"
              segments={mix.map((m) => ({ label: m.label, value: m.value, tone: m.tone }))}
            />
            <LegendList
              items={mix.map((m) => ({ label: m.label, tone: m.tone, value: m.value.toLocaleString("en-US"), pct: `${mixTotal ? Math.round((m.value / mixTotal) * 100) : 0}%` }))}
            />
          </div>
        </AdminPanel>

        <AdminPanel icon={<CalendarIcon size={18} />} title="Renewals this month" description={`${renewals.length} active renewal${renewals.length === 1 ? "" : "s"}`} link={{ label: "View all", href: "/admin/customers?filter=ACTIVE" }}>
          <PanelList
            empty="No renewals left this month."
            items={renewals.slice(0, 5).map((c) => ({ key: c.login, name: c.name || c.login, sub: c.email ?? undefined, right: day(c.currentPeriodEnd) }))}
          />
        </AdminPanel>

        <AdminPanel icon={<UsersIcon size={18} />} title="Recent onboarding" description="New customers in the last 30 days." link={{ label: "View all", href: "/admin/customers?filter=NEW" }}>
          <PanelList
            empty="No new customers in the last 30 days."
            items={onboarding.slice(0, 5).map((c) => ({ key: c.login, name: c.name || c.login, sub: c.email ?? undefined, right: day(c.since) }))}
          />
        </AdminPanel>

        <AdminPanel icon={<AlertIcon size={18} />} title="Churn risk" description="Failed payments and pending cancellations." link={{ label: "View all", href: "/admin/customers?filter=PAST_DUE" }}>
          <PanelList
            empty="No customers at risk right now."
            items={risk.slice(0, 5).map((c) => ({ key: c.login, name: c.name || c.login, sub: c.email ?? undefined, right: STATUS_LABEL[c.statusGroup] }))}
          />
        </AdminPanel>
      </div>

      {error ? (
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load customers.</div>
      ) : (
        <CustomersTable rows={rows} total={total} page={page} pageSize={pageSize} filter={filter} tabs={tabs} />
      )}
    </div>
  );
}
