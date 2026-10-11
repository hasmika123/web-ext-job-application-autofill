"use client";

import type { ReactNode } from "react";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CreditCardIcon,
  CrownIcon,
  DownloadIcon,
  PlusIcon,
  GearIcon,
  PencilIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { Donut, InitialsAvatar, Progress, StatusChip, TONE } from "@/components/app-v2/common";
import { PageHero, SectionCard, StatTile } from "../common-local2/primitives";
import { DataTable, MoreButton, OrgButton, type Column } from "../common-local2/controls";
import {
  BILLING_CONTACTS,
  INVOICES,
  PLAN_FEATURES,
  SUBSCRIPTION_DETAILS,
  UPGRADE_OPTIONS,
  USAGE,
} from "../sample-data.2";

type Invoice = (typeof INVOICES)[number];

const INVOICE_COLUMNS: Column<Invoice>[] = [
  { key: "id", header: "Invoice #", primary: true, cell: (r) => <span className="font-semibold text-v2-navy">{r.id}</span> },
  { key: "date", header: "Date", cell: (r) => <span className="whitespace-nowrap">{r.date}</span> },
  { key: "desc", header: "Description", cell: (r) => r.description },
  { key: "amt", header: "Amount", cell: (r) => <span className="font-semibold text-v2-navy">{r.amount}</span> },
  { key: "st", header: "Status", cell: () => <StatusChip tone="green">Paid</StatusChip> },
];

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
      <dt className="text-v2-ink-soft">{label}</dt>
      <dd className="text-right font-semibold text-v2-navy">{children}</dd>
    </div>
  );
}

/** Billing & Subscription body (spec 6.3). Renders inside the org shell. */
export default function BillingPage() {
  return (
    <div className="space-y-4">
      <PageHero
        title="Billing & Subscription"
        icon={<CreditCardIcon />}
        subtitle="Manage your plan, seats, usage, and invoices all in one place."
        note="Invest in your people. Build brighter futures together."
      />

      {/* stat tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<CrownIcon />} value="Enterprise" label="Current Plan" tone="blue" chip={<StatusChip tone="green">Active</StatusChip>} />
        <StatTile icon={<UsersIcon />} value="72 / 100" label="Active Seats" delta={{ value: "72% used", up: true }} tone="green" />
        <StatTile icon={<CalendarIcon />} value="2,486" label="Monthly Usage" sublabel="Total actions" delta={{ value: "18%", up: true }} tone="violet" />
        <StatTile
          icon={<ClockIcon />}
          value="Nov 15, 2026"
          label="Next Renewal"
          sublabel="⏱ 32 days remaining"
          tone="amber"
        />
      </div>

      {/* plan / seats / payment */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr]">
        <SectionCard
          title="Plan Summary"
          className="lg:col-span-2 xl:col-span-1"
          headerExtra={
            <OrgButton variant="outline" size="sm" icon={<GearIcon />}>
              Manage Plan
            </OrgButton>
          }
        >
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-v2-blue-soft text-v2-blue [&>svg]:h-7 [&>svg]:w-7">
              <CrownIcon />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[20px] font-extrabold leading-none text-v2-navy">Enterprise</span>
                <StatusChip tone="green">Active</StatusChip>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-v2-ink-soft">
                Advanced hiring tools for growing teams with customization, dedicated support, and more.
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-v2-green-soft px-3 py-1.5 text-[12.5px] font-semibold text-[#168A2E]">
                <CheckIcon className="h-3.5 w-3.5" />
                {f}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Seat Utilization" action={{ label: "View Details", href: "/org/team" }}>
          <Donut
            size={128}
            centerValue="72"
            centerLabel="of 100 seats"
            segments={[
              { label: "Active Seats", value: 72, tone: "green" },
              { label: "Available Seats", value: 28, tone: "blue" },
            ]}
          />
          <OrgButton variant="solid" className="mt-4 w-full">
            Add Seats
          </OrgButton>
        </SectionCard>

        <SectionCard title="Payment Method">
          <div className="flex items-center gap-3 rounded-xl border border-[#E6EAF3] p-3.5">
            <span className="flex h-10 w-14 flex-none items-center justify-center rounded-lg bg-[#1A1F71] text-[13px] font-black italic tracking-wide text-white">VISA</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-v2-navy">Visa ending in 4242</div>
              <div className="text-[12.5px] text-v2-muted">Expires 04/2028</div>
            </div>
            <MoreButton label="Payment method options" />
          </div>
          <StatusChip tone="green" className="mt-3">
            Default Payment Method
          </StatusChip>
          <OrgButton variant="outline" className="mt-4 w-full">
            Update Payment Method
          </OrgButton>
        </SectionCard>
      </div>

      {/* invoices + usage */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <SectionCard title="Billing History & Invoices" action={{ label: "View all", href: "/org/billing" }}>
          <DataTable
            caption="Billing history and invoices"
            columns={INVOICE_COLUMNS}
            rows={INVOICES}
            rowKey={(r) => r.id}
            minWidth={620}
            actions={(r) => (
              <button type="button" aria-label={`Download ${r.id}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft">
                <DownloadIcon className="h-4 w-4" />
                Download
              </button>
            )}
          />
        </SectionCard>

        <SectionCard title="Usage Breakdown (This Month)" action={{ label: "View all", href: "/org/analytics" }}>
          <ul className="space-y-5">
            {USAGE.map((u) => (
              <li key={u.label}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="font-bold text-v2-navy">{u.label}</span>
                  <span className={cn("font-bold", TONE[u.tone].ink)}>{u.pct}%</span>
                </div>
                <div className="mb-2 mt-0.5 text-[12.5px] text-v2-ink-soft">{u.used}</div>
                <Progress value={u.pct} tone={u.tone} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* details / upgrade / contacts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard
          title="Subscription Details"
          headerExtra={
            <OrgButton variant="outline" size="sm" icon={<PencilIcon />}>
              Edit
            </OrgButton>
          }
        >
          <dl className="divide-y divide-[#EEF1F7]">
            {SUBSCRIPTION_DETAILS.map((d) => (
              <SummaryRow key={d.label} label={d.label}>
                {d.chip ? <StatusChip tone="green">{d.value}</StatusChip> : d.value}
              </SummaryRow>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Upgrade Options" action={{ label: "View Plans", href: "/pricing" }}>
          <ul className="space-y-3">
            {UPGRADE_OPTIONS.map((o, i) => (
              <li key={o.title}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3.5 rounded-xl p-4 text-left transition hover:brightness-[.98]",
                    i === 0 ? "bg-v2-blue-soft" : "bg-v2-violet-soft",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-v2-navy">{o.title}</span>
                    <span className="block text-[12.5px] text-v2-ink-soft">{o.body}</span>
                  </span>
                  <ChevronRightIcon className={cn("h-5 w-5 flex-none", i === 0 ? "text-v2-blue" : "text-v2-violet")} />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Billing Contacts"
          className="lg:col-span-2 xl:col-span-1"
          headerExtra={
            <OrgButton variant="soft-blue" size="sm" icon={<PlusIcon />}>
              Add Contact
            </OrgButton>
          }
        >
          <ul className="divide-y divide-[#EEF1F7]">
            {BILLING_CONTACTS.map((c) => (
              <li key={c.email} className="flex items-center gap-3 py-3">
                <InitialsAvatar name={c.name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-v2-navy">{c.name}</div>
                  <div className="text-[12px] text-v2-muted">{c.role}</div>
                  <div className="truncate text-[12.5px] text-v2-ink-soft">{c.email}</div>
                </div>
                <MoreButton label={`${c.name} options`} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
