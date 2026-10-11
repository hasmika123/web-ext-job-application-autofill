"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BuildingIcon,
  DownloadIcon,
  FileTextIcon,
  MailIcon,
  SendIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  UserIcon,
  UsersIcon,
  XCircleIcon,
  ZapIcon,
  Button,
  cn,
  useToast,
} from "@kiwiply/ui";
import { DataTable, FilterSelect, IconTile, KebabMenu, LineChart, Pagination, StatusChip, type Tone } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, AdminTabs, SampleTag, StatusDot } from "../common";
import { SUBSCRIBER_STATUS_TABS } from "./constants";
import { spreadLabels } from "./chart-labels";
import StatusFilterLinks from "./StatusFilterLinks";
import {
  AUTOMATIONS,
  CLICK_RATE,
  EMAIL_TILE_EXTRAS as X,
  KIND_TONE,
  OPEN_RATE,
  PERF_MAX,
  PERF_X,
  PERF_Y,
  RECENT_CAMPAIGNS,
  SEGMENTS,
  TEMPLATES,
} from "./sample-data";

export interface Subscriber {
  id: number;
  email: string;
  status: string;
  consentSource?: string | null;
  consentAt?: string | null;
  confirmedAt?: string | null;
  createdDate?: string | null;
}

const SEG_ICON: Record<string, ReactNode> = {
  users: <UsersIcon size={24} />,
  sprout: <SparklesIcon size={24} />,
  star: <StarIcon size={24} />,
  building: <BuildingIcon size={24} />,
  user: <UserIcon size={24} />,
};

const TABS = [
  { id: "campaigns", label: "Campaigns", icon: <MailIcon /> },
  { id: "templates", label: "Templates", icon: <FileTextIcon /> },
  { id: "subscribers", label: "Subscribers", icon: <UsersIcon /> },
  { id: "automations", label: "Automations", icon: <ZapIcon /> },
];

const scale = (v: number[]) => v.map((n) => (n / PERF_MAX) * 100);

/**
 * Email (board 15), served at /admin/subscribers. REAL: the subscriber list (status filter + paging
 * are server-side), status counts (-> "Total subscribers" tile and the All-subscribers segment) and
 * the CSV export. SAMPLE (tagged): open/click/bounce tiles, performance chart, recent campaigns,
 * other segments, templates, automations. "Send Campaign" is inert (there is no campaign backend).
 */
export default function EmailPage({
  rows,
  total,
  page,
  pageSize,
  status,
  counts,
  error,
  initialTab,
}: {
  rows: Subscriber[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  counts: Record<string, number>;
  error: boolean;
  initialTab: "campaigns" | "subscribers";
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<string>(initialTab);
  const soon = (what: string) => toast({ title: `${what}: coming soon`, description: "Campaign sending isn't built yet." });

  const allCount = (counts.CONFIRMED ?? 0) + (counts.PENDING ?? 0) + (counts.UNSUBSCRIBED ?? 0);
  const countOf = (key: string) => (key === "" ? allCount : counts[key] ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + rows.length;
  const go = (p: number) => router.push(`/admin/subscribers?${status ? `status=${status}&` : ""}page=${p - 1}`);
  const csvHref = `/api/admin/subscribers/export${status ? `?status=${status}` : ""}`;
  const confirmed = counts.CONFIRMED ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Email"
        subtitle="Reach, engage, and grow the Kiwiply community with beautiful emails."
        note="Great emails make happier users!"
      />

      <AdminStatTiles
        stats={[
          { label: "Total subscribers", value: error ? "n/a" : allCount.toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "blue", delta: X.subscribers.delta, caption: "vs last 30 days", sparkline: X.subscribers.spark },
          { label: "Average open rate", value: X.open.value, icon: <MailIcon size={26} />, tone: "green", delta: X.open.delta, caption: "sample data", sparkline: X.open.spark },
          { label: "Average click rate", value: X.click.value, icon: <TargetIcon size={26} />, tone: "amber", delta: X.click.delta, caption: "sample data", sparkline: X.click.spark },
          { label: "Bounce rate", value: X.bounce.value, icon: <XCircleIcon size={26} />, tone: "violet", delta: { ...X.bounce.delta, good: true }, caption: "sample data", sparkline: X.bounce.spark },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <AdminTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Email sections" className="min-w-0 sm:flex-1" />
        <Button onClick={() => soon("Send campaign")} className="w-full flex-none gap-2 sm:w-auto" title="Coming soon">
          <SendIcon size={18} />
          Send Campaign
        </Button>
      </div>

      {tab === "campaigns" && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <AdminPanel
              title="Email performance"
              description="Open and click rates over time for sent campaigns."
              right={
                <span className="flex items-center gap-2">
                  <SampleTag />
                  <FilterSelect label="Period" options={["Last 30 days", "Last 7 days", "Last 90 days"]} className="w-[140px]" />
                </span>
              }
            >
              <LineChart
                height={200}
                xLabels={spreadLabels(OPEN_RATE.length, PERF_X)}
                yLabels={PERF_Y}
                series={[
                  { label: "Open rate", tone: "blue", points: scale(OPEN_RATE) },
                  { label: "Click rate", tone: "green", points: scale(CLICK_RATE) },
                ]}
              />
            </AdminPanel>

            <AdminPanel
              title="Recent campaigns"
              description="Your latest sent campaigns and their performance."
              right={<SampleTag />}
            >
              <DataTable
                inCard
                minWidth={600}
                aria-label="Recent campaigns"
                rows={RECENT_CAMPAIGNS}
                rowKey={(c) => c.subject}
                columns={[
                  {
                    key: "subject",
                    header: "SUBJECT",
                    primary: true,
                    render: (c) => (
                      <span className="flex items-center gap-2.5">
                        <IconTile tone={KIND_TONE[c.kind]} className="h-9 w-9">
                          <MailIcon size={16} />
                        </IconTile>
                        <span className="min-w-0 leading-tight">
                          <span className="block font-semibold text-ink">{c.subject}</span>
                          <span className="block text-[12px] text-v2-muted">{c.blurb}</span>
                        </span>
                      </span>
                    ),
                  },
                  { key: "type", header: "TYPE", render: (c) => <StatusChip tone={KIND_TONE[c.kind]}>{c.kind}</StatusChip> },
                  { key: "rec", header: "RECIPIENTS", render: (c) => c.recipients.toLocaleString("en-US") },
                  { key: "status", header: "STATUS", render: () => <StatusDot status="Sent" tone="green" /> },
                  { key: "sent", header: "SEND DATE", className: "whitespace-nowrap", render: (c) => c.sent },
                ]}
                actions={(c) => (
                  <span className="relative inline-block">
                    <KebabMenu
                      label={`Actions for ${c.subject}`}
                      items={[{ label: "View report", icon: <TargetIcon size={15} />, onSelect: () => soon("Campaign report") }]}
                    />
                  </span>
                )}
              />
            </AdminPanel>
          </div>

          <AdminPanel title="Subscriber segments" description="Target the right audience with segmented campaigns." right={<SampleTag />}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {SEGMENTS.map((s, i) => (
                <li key={s.label} className="flex items-center gap-3 rounded-2xl border border-v2-line/70 p-3.5">
                  <IconTile tone={s.tone} className="h-12 w-12">
                    {SEG_ICON[s.icon]}
                  </IconTile>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[13px] font-semibold text-ink">{s.label}</span>
                    <span className="block font-display text-[22px] font-extrabold text-ink">
                      {(i === 0 && !error ? confirmed : s.value).toLocaleString("en-US")}
                    </span>
                    <span className="block text-[12px] text-v2-muted">{s.caption}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-v2-muted">All subscribers shows the real confirmed count; the other segments are sample numbers.</p>
          </AdminPanel>
        </>
      )}

      {tab === "templates" && (
        <AdminPanel title="Templates" description="Reusable email layouts for campaigns." right={<SampleTag />}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.map((t) => (
              <li key={t.name} className="rounded-2xl border border-v2-line/70 p-4">
                <IconTile tone={KIND_TONE[t.kind]}>
                  <FileTextIcon size={18} />
                </IconTile>
                <p className="mt-3 font-semibold text-ink">{t.name}</p>
                <p className="mt-1 text-[13px] text-ink-soft">{t.desc}</p>
                <div className="mt-3 flex items-center justify-between">
                  <StatusChip tone={KIND_TONE[t.kind]}>{t.kind}</StatusChip>
                  <span className="text-[12px] text-v2-muted">Updated {t.updated}</span>
                </div>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      {tab === "automations" && (
        <AdminPanel title="Automations" description="Emails that send themselves when something happens." right={<SampleTag />}>
          <ul className="divide-y divide-v2-line/70">
            {AUTOMATIONS.map((a) => (
              <li key={a.name} className="flex flex-wrap items-center gap-3 py-3">
                <IconTile tone="violet">
                  <ZapIcon size={18} />
                </IconTile>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-semibold text-ink">{a.name}</span>
                  <span className="block text-[12.5px] text-v2-muted">{a.trigger}</span>
                </span>
                <span className="text-[12.5px] text-ink-soft">{a.sent.toLocaleString("en-US")} sent</span>
                <StatusDot status={a.status} />
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      {tab === "subscribers" && (
        <AdminPanel
          title="Subscribers"
          description="Double opt-in newsletter list: the source of truth for marketing consent."
          right={
            <a
              href={csvHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border border-v2-line px-3.5 py-2 text-[13px] font-semibold text-v2-blue-ink hover:bg-paper-2",
              )}
            >
              <DownloadIcon size={16} />
              Download CSV
            </a>
          }
        >
          <StatusFilterLinks basePath="/admin/subscribers" tabs={SUBSCRIBER_STATUS_TABS} active={status} count={countOf} />
          <div className="mt-3">
            {error ? (
              <div className="rounded-2xl border border-v2-line/70 p-6 text-sm text-ink-soft">Couldn&apos;t load subscribers.</div>
            ) : (
              <DataTable
                inCard
                minWidth={560}
                aria-label="Subscribers"
                rows={rows}
                rowKey={(r) => r.id}
                actions={false}
                empty="No subscribers."
                columns={[
                  { key: "email", header: "EMAIL", primary: true, render: (r) => <span className="break-all font-medium text-ink">{r.email}</span> },
                  { key: "status", header: "STATUS", render: (r) => <SubscriberStatus status={r.status} /> },
                  { key: "source", header: "SOURCE", render: (r) => <span className="text-ink-soft">{r.consentSource || "—"}</span> },
                  {
                    key: "when",
                    header: "SUBSCRIBED",
                    className: "whitespace-nowrap",
                    render: (r) => (r.confirmedAt || r.consentAt || r.createdDate || "").slice(0, 10) || "—",
                  },
                ]}
                footer={
                  total > 0 ? (
                    <Pagination
                      tone="blue"
                      page={page + 1}
                      pages={totalPages}
                      summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} subscribers · ${pageSize} per page`}
                      onPageChange={go}
                      className="pt-3"
                    />
                  ) : null
                }
              />
            )}
          </div>
        </AdminPanel>
      )}
    </div>
  );
}

function SubscriberStatus({ status }: { status: string }) {
  const tone: Tone = status === "CONFIRMED" ? "green" : status === "UNSUBSCRIBED" ? "coral" : "amber";
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <StatusChip tone={tone}>{label}</StatusChip>;
}
