"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BugIcon, CheckCircleIcon, ClipboardIcon, RefreshIcon, TrendingUpIcon, cn } from "@kiwiply/ui";
import { DataTable, Donut, FilterSelect, KebabMenu, LineChart, Pagination, SearchInput, StatusChip, type Tone } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, LegendList, PersonCell, SampleTag } from "../common";
import { BUG_STATUS_TABS } from "./constants";
import { spreadLabels } from "../email/chart-labels";
import StatusFilterLinks from "../email/StatusFilterLinks";
// eslint-disable-next-line no-restricted-imports -- sample data stays on this page until A8.2 removes it (ADMIN-E2E-PLAN 3.5)
import { CRASH_MAX, CRASH_TREND, CRASH_X, CRASH_Y, SEVERITY, TOP_ISSUES } from "./sample-data";

export interface BugReport {
  id: number;
  source?: string | null;
  userLogin?: string | null;
  email?: string | null;
  message: string;
  category: string;
  severity?: string | null;
  status: string;
  createdDate?: string | null;
}

const STATUS_TONE: Record<string, Tone> = { NEW: "blue", TRIAGED: "slate", IN_PROGRESS: "violet", RESOLVED: "green", WONTFIX: "coral" };
const SEV_TONE: Record<string, Tone> = { HIGH: "amber", MEDIUM: "lime", LOW: "green" };
const statusLabel = (s: string) => (s === "IN_PROGRESS" ? "In progress" : s === "WONTFIX" ? "Won't fix" : s.charAt(0) + s.slice(1).toLowerCase());
const sevLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Bug Reports (board 12). REAL: the report list (server paging + status filter), the per-status
 * counts (the four tiles), and triage (open a report -> BugTriageControl on the detail page).
 * Search + severity filter the currently loaded page only. SAMPLE (tagged): tile trends, severity
 * donut, crash trends, top recurring issues. Not built (no API): assignee, bulk assign/resolve, export.
 */
export default function BugReportsPage({
  rows,
  total,
  page,
  pageSize,
  status,
  counts,
  error,
}: {
  rows: BugReport[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  counts: Record<string, number>;
  error: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("All severity");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !`${r.message} ${r.userLogin ?? ""} ${r.email ?? ""} #${r.id}`.toLowerCase().includes(needle)) return false;
    if (sev !== "All severity" && (r.severity ?? "").toUpperCase() !== sev.toUpperCase()) return false;
    return true;
  });
  const filtered = needle !== "" || sev !== "All severity";

  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const countOf = (key: string) => (key === "" ? allCount : counts[key] ?? 0);
  const n = (v: number) => (error ? "n/a" : v.toLocaleString("en-US"));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + rows.length;
  const go = (p: number) => router.push(`/admin/bug-reports?${status ? `status=${status}&` : ""}page=${p - 1}`);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Bug Reports"
        subtitle="Triage and manage bug reports from users, monitoring and support channels."
        note="Squash bugs, make Kiwiply better!"
      />

      <AdminStatTiles
        stats={[
          { label: "New reports", value: n(counts.NEW ?? 0), icon: <BugIcon size={26} />, tone: "coral" },
          { label: "Open issues", value: n((counts.NEW ?? 0) + (counts.TRIAGED ?? 0)), icon: <ClipboardIcon size={26} />, tone: "amber" },
          { label: "In progress", value: n(counts.IN_PROGRESS ?? 0), icon: <RefreshIcon size={26} />, tone: "violet" },
          { label: "Resolved", value: n(counts.RESOLVED ?? 0), icon: <CheckCircleIcon size={26} />, tone: "green" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <AdminPanel title="Bug reports" description="Review, triage and manage issues reported from the web widget and the extension.">
          <StatusFilterLinks basePath="/admin/bug-reports" tabs={BUG_STATUS_TABS} active={status} count={countOf} />
          <div className="my-3 flex flex-wrap items-center gap-2.5">
            <SearchInput
              variant="grey"
              size="sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bug reports, messages or IDs..."
              wrapperClassName="min-w-[220px] flex-1 sm:max-w-[420px]"
            />
            <FilterSelect label="Severity" options={["All severity", "High", "Medium", "Low"]} value={sev} onChange={setSev} className="w-[150px]" />
            <span className="ml-auto text-[12px] text-v2-muted">
              {filtered ? `${shown.length} of ${rows.length} on this page` : `${rows.length} on this page`}
            </span>
          </div>

          {error ? (
            <div className="rounded-2xl border border-v2-line/70 p-6 text-sm text-ink-soft">Couldn&apos;t load reports.</div>
          ) : (
            <DataTable
              inCard
              minWidth={820}
              aria-label="Bug reports"
              rows={shown}
              rowKey={(r) => r.id}
              empty={filtered ? "No reports on this page match your filters." : "No reports."}
              columns={[
                {
                  key: "title",
                  header: "TITLE",
                  primary: true,
                  render: (r) => (
                    <Link href={`/admin/bug-reports/${r.id}`} className="block max-w-[320px] leading-tight hover:underline">
                      <span className="block truncate font-semibold text-ink">{r.message}</span>
                      <span className="block text-[12px] text-v2-muted">#{r.id}</span>
                    </Link>
                  ),
                },
                {
                  key: "reporter",
                  header: "REPORTER",
                  render: (r) => {
                    const who = r.userLogin || r.email || "anon";
                    return <PersonCell avatarName={who} name={who} sub={`via ${r.source === "extension" ? "Extension" : "Web"}`} size={30} />;
                  },
                },
                { key: "category", header: "TYPE", render: (r) => <span className="text-ink-soft">{r.category}</span> },
                {
                  key: "sev",
                  header: "SEVERITY",
                  render: (r) =>
                    r.severity ? <StatusChip tone={SEV_TONE[r.severity] ?? "slate"} dot>{sevLabel(r.severity)}</StatusChip> : <span className="text-v2-muted">Not set</span>,
                },
                { key: "status", header: "STATUS", render: (r) => <StatusChip tone={STATUS_TONE[r.status] ?? "slate"} dot>{statusLabel(r.status)}</StatusChip> },
                { key: "when", header: "REPORTED", className: "whitespace-nowrap", render: (r) => (r.createdDate ?? "").slice(0, 10) || "—" },
              ]}
              actions={(r) => (
                <span className="relative inline-block">
                  <KebabMenu
                    label={`Actions for report ${r.id}`}
                    items={[{ label: "Open and triage", icon: <ArrowRightIcon size={15} />, onSelect: () => router.push(`/admin/bug-reports/${r.id}`) }]}
                  />
                </span>
              )}
              footer={
                total > 0 ? (
                  <Pagination
                    tone="blue"
                    page={page + 1}
                    pages={totalPages}
                    summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} bug reports · ${pageSize} per page`}
                    onPageChange={go}
                    className="pt-3"
                  />
                ) : null
              }
            />
          )}
        </AdminPanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <AdminPanel title="Severity distribution" right={<SampleTag />}>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Donut
                legend={false}
                size={132}
                centerValue={SEVERITY.reduce((s, x) => s + x.value, 0)}
                centerLabel="Total reports"
                segments={SEVERITY.map((s) => ({ label: s.label, value: s.value, tone: s.tone, pct: s.pct }))}
              />
              <LegendList items={SEVERITY.map((s) => ({ label: s.label, tone: s.tone, value: String(s.value), pct: `${s.pct}%` }))} />
            </div>
          </AdminPanel>

          <AdminPanel title="Crash trends" right={<SampleTag />}>
            <LineChart
              height={120}
              xLabels={spreadLabels(CRASH_TREND.length, CRASH_X)}
              yLabels={CRASH_Y}
              series={[{ label: "Reports per day", tone: "coral", points: CRASH_TREND.map((v) => (v / CRASH_MAX) * 100) }]}
            />
          </AdminPanel>

          <AdminPanel title="Top recurring issues" right={<SampleTag />} className="md:col-span-2 xl:col-span-1">
            <ol className="space-y-3">
              {TOP_ISSUES.map((t, i) => {
                const bad = t.dir === "up";
                return (
                  <li key={t.title} className="flex items-center gap-3">
                    <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-full text-[12.5px] font-bold", ["bg-v2-coral-soft text-v2-coral-ink", "bg-v2-amber-soft text-v2-amber-ink", "bg-v2-lime-soft text-v2-green-ink", "bg-v2-blue-soft text-v2-blue-ink", "bg-paper-2 text-ink-soft"][i])}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink">{t.title}</span>
                      <span className="block text-[12px] text-v2-muted">{t.reports} reports</span>
                    </span>
                    <StatusChip tone={bad ? "coral" : "green"}>
                      <TrendingUpIcon size={12} className={bad ? "" : "rotate-180"} />
                      {t.change}
                    </StatusChip>
                  </li>
                );
              })}
            </ol>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
