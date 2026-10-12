"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, ChatIcon, CheckCircleIcon, ClockIcon, MailIcon } from "@kiwiply/ui";
import { Donut, FilterSelect, LineChart, Pagination, SearchInput, StatusChip, toneFor, type Tone } from "@/components/app-v2/common";
import InquiryFollowUp from "@/components/admin/InquiryFollowUp";
import { isTopic, TOPIC_LABELS } from "@/lib/catalog";
import { AdminHero, AdminPanel, AdminStatTiles, LegendList, PersonCell, SampleTag } from "../common";
import { INQUIRY_STATUS_TABS } from "./constants";
import { spreadLabels } from "../email/chart-labels";
import StatusFilterLinks from "../email/StatusFilterLinks";
// eslint-disable-next-line no-restricted-imports -- sample data stays on this page until A8.4 removes it (ADMIN-E2E-PLAN 3.5)
import { CATEGORY_MIX, ESCALATIONS, SLA_HEADLINE, SLA_HOURS, SLA_MAX, SLA_X, SLA_Y } from "./sample-data";

export interface Inquiry {
  id: number;
  topic: string;
  name: string;
  email: string;
  company?: string | null;
  teamSize?: string | null;
  message?: string | null;
  userLogin?: string | null;
  status: string;
  adminNotes?: string | null;
  createdDate?: string | null;
}

const STATUS_TONE: Record<string, Tone> = { NEW: "amber", CONTACTED: "violet", WON: "green", LOST: "slate" };
const topicLabel = (t: string) => (isTopic(t) ? TOPIC_LABELS[t] : t);

/**
 * Inquiries (board 13). REAL: the "Contact us" list (server paging + status filter), per-status
 * counts (tiles) and follow-up (InquiryFollowUp: status + note per inquiry, unchanged). Search and
 * category filter the loaded page only. SAMPLE (tagged): tile trends, SLA chart, category mix,
 * recent escalations. Not built (no API): priority, assignee, bulk actions, export.
 */
export default function InquiriesPage({
  rows,
  total,
  page,
  pageSize,
  status,
  counts,
  error,
}: {
  rows: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  counts: Record<string, number>;
  error: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All categories");
  const needle = q.trim().toLowerCase();
  const catOptions = ["All categories", ...Array.from(new Set(rows.map((r) => topicLabel(r.topic))))];
  const shown = rows.filter((r) => {
    if (needle && !`${r.name} ${r.email} ${r.company ?? ""} ${r.message ?? ""} ${topicLabel(r.topic)}`.toLowerCase().includes(needle)) return false;
    if (cat !== "All categories" && topicLabel(r.topic) !== cat) return false;
    return true;
  });
  const filtered = needle !== "" || cat !== "All categories";

  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const countOf = (key: string) => (key === "" ? allCount : counts[key] ?? 0);
  const n = (v: number) => (error ? "n/a" : v.toLocaleString("en-US"));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + rows.length;
  const go = (p: number) => router.push(`/admin/inquiries?${status ? `status=${status}&` : ""}page=${p - 1}`);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Inquiries"
        subtitle="Manage customer inquiries and support requests. Keep users happy with fast, helpful responses."
        note="Happy users make a brighter Kiwiply!"
      />

      <AdminStatTiles
        stats={[
          { label: "All inquiries", value: n(allCount), icon: <ChatIcon size={26} />, tone: "blue" },
          { label: "Open (new)", value: n(counts.NEW ?? 0), icon: <ClockIcon size={26} />, tone: "amber" },
          { label: "Contacted", value: n(counts.CONTACTED ?? 0), icon: <MailIcon size={26} />, tone: "violet" },
          { label: "Resolved (won + lost)", value: n((counts.WON ?? 0) + (counts.LOST ?? 0)), icon: <CheckCircleIcon size={26} />, tone: "green" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <AdminPanel title="Response time (SLA)" description="Average first response time for inquiries." right={<SampleTag />}>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <span className="font-display text-[26px] font-extrabold text-ink">{SLA_HEADLINE.value}</span>
            <StatusChip tone="green">{SLA_HEADLINE.delta} faster</StatusChip>
            <span className="text-[12px] text-v2-muted">{SLA_HEADLINE.caption}</span>
          </div>
          <LineChart
            height={150}
            xLabels={spreadLabels(SLA_HOURS.length, SLA_X)}
            yLabels={SLA_Y}
            series={[{ label: "Avg first response (hours)", tone: "blue", points: SLA_HOURS.map((v) => (v / SLA_MAX) * 100) }]}
          />
        </AdminPanel>

        <AdminPanel title="Inquiry category mix" description="Distribution of inquiries by category." right={<SampleTag />}>
          <div className="flex flex-col items-center gap-4">
            <Donut
              legend={false}
              size={132}
              centerValue={CATEGORY_MIX.reduce((s, x) => s + x.value, 0)}
              centerLabel="Total"
              segments={CATEGORY_MIX.map((s) => ({ label: s.label, value: s.value, tone: s.tone, pct: s.pct }))}
            />
            <LegendList items={CATEGORY_MIX.map((s) => ({ label: s.label, tone: s.tone, pct: `${s.pct}%` }))} />
          </div>
        </AdminPanel>

        <AdminPanel className="md:col-span-2 xl:col-span-1" title="Recent escalations" description="Inquiries escalated in the last 7 days." right={<SampleTag />}>
          <ul className="space-y-2.5">
            {ESCALATIONS.map((e) => (
              <li key={e.title} className="flex items-center gap-2.5 border-b border-v2-line/60 pb-2.5 last:border-0 last:pb-0">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-v2-coral-soft text-v2-coral-ink">
                  <AlertIcon size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{e.title}</span>
                <span className="flex-none text-[11.5px] text-v2-muted">{e.when}</span>
              </li>
            ))}
          </ul>
        </AdminPanel>
      </div>

      <AdminPanel title="Inquiries" description="Contact-us requests for Autopilot, organizations, consultancies and services. Reply by email, then set a status.">
        <StatusFilterLinks basePath="/admin/inquiries" tabs={INQUIRY_STATUS_TABS} active={status} count={countOf} />
        <div className="my-3 flex flex-wrap items-center gap-2.5">
          <SearchInput
            variant="grey"
            size="sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search inquiries..."
            wrapperClassName="min-w-[220px] flex-1 sm:max-w-[420px]"
          />
          <FilterSelect label="Category" options={catOptions} value={cat} onChange={setCat} className="w-[200px]" />
          <span className="ml-auto text-[12px] text-v2-muted">
            {filtered ? `${shown.length} of ${rows.length} on this page` : `${rows.length} on this page`}
          </span>
        </div>

        {error ? (
          <div className="rounded-2xl border border-v2-line/70 p-6 text-sm text-ink-soft">Couldn&apos;t load inquiries.</div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-v2-line/70 p-8 text-center text-sm text-ink-soft">
            {filtered ? "No inquiries on this page match your filters." : "No inquiries."}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_100px] gap-4 border-b border-v2-line px-3 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-v2-muted md:grid">
              <span>Requester</span>
              <span>Category</span>
              <span>Status</span>
              <span>Received</span>
            </div>
            <ul className="divide-y divide-v2-line/70">
              {shown.map((r) => (
                <li key={r.id} className="px-3 py-3.5">
                  <div className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_100px] md:items-center">
                    <PersonCell
                      avatarName={r.name}
                      name={r.name}
                      sub={
                        <a href={`mailto:${r.email}`} className="break-all text-v2-blue-ink hover:underline">
                          {r.email}
                        </a>
                      }
                      size={34}
                    />
                    <span className="min-w-0 leading-tight">
                      <StatusChip tone={toneFor(r.topic)} className="max-w-full">
                        <span className="truncate">{topicLabel(r.topic)}</span>
                      </StatusChip>
                      {(r.company || r.teamSize || r.userLogin) && (
                        <span className="mt-1 block truncate text-[12px] text-v2-muted">
                          {[r.company, r.teamSize ? `${r.teamSize} people` : null, r.userLogin ? `account ${r.userLogin}` : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span>
                      <StatusChip tone={STATUS_TONE[r.status] ?? "slate"} dot>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </StatusChip>
                    </span>
                    <span className="text-[12.5px] text-ink-soft">{(r.createdDate ?? "").slice(0, 10) || "—"}</span>
                  </div>
                  {r.message && <p className="mt-2 whitespace-pre-wrap text-[13.5px] text-ink">{r.message}</p>}
                  <InquiryFollowUp id={r.id} status={r.status} adminNotes={r.adminNotes ?? null} />
                </li>
              ))}
            </ul>
          </>
        )}

        {!error && total > 0 && (
          <Pagination
            tone="blue"
            page={page + 1}
            pages={totalPages}
            summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} inquiries · ${pageSize} per page`}
            onPageChange={go}
            className="pt-3"
          />
        )}
      </AdminPanel>
    </div>
  );
}
