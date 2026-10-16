"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BarChart, Button, DonutChart, DownloadIcon, EmptyState, ErrorState, RefreshIcon, Skeleton, cn, chartColor } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  DEFAULT_RANGE,
  RANGES,
  deltaText,
  durationText,
  fetchOverview,
  isEmptyOverview,
  monthLabel,
  overviewCsv,
  tileDeltaPct,
  tileValueText,
  weekLabel,
  type Overview,
  type RangeDays,
} from "@/lib/ent/reports";

const CARD = "ent-card min-w-0 px-[14px] pb-3.5 pt-3";

/**
 * Reports (`/w/admin/reports`): a few canned reports over the organization's own rows. One call to `GET /api/orgs/{orgId}/reports/overview` draws the page;
 * every number is the API's, an empty organization sees an honest empty state, and "Download CSV" writes the same tables the page shows (no formula
 * can run when the file is opened: see `csvCell`). A 7-day delta appears only where the API could compute one.
 */
export default function ReportsPage({ orgId, orgName }: { orgId: number; orgName: string }) {
  const [range, setRange] = useState<RangeDays>(DEFAULT_RANGE);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");

  const load = useCallback(
    async (days: RangeDays, signal?: AbortSignal) => {
      setStatus((s) => (s === "ready" ? s : "loading"));
      const r = await fetchOverview(orgId, days, signal);
      if (signal?.aborted) return;
      if (r.kind === "OK" && r.overview) {
        setOverview(r.overview);
        setStatus("ready");
      } else if (r.kind === "DENIED") setStatus("denied");
      else setStatus((s) => (s === "ready" ? s : "failed")); // a failed refresh keeps what is on screen
    },
    [orgId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(range, ctrl.signal);
    return () => ctrl.abort();
  }, [load, range]);

  const download = useCallback(() => {
    if (!overview) return;
    const url = URL.createObjectURL(new Blob([overviewCsv(overview)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-last-${overview.rangeDays}-days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [overview]);

  const loading = status === "loading";
  if (status === "denied") return <ErrorState what="reports" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-reports data-status={status} className="ent-page flex flex-col gap-4 sm:gap-[17px]">
      <PageHeader title="Reports" subtitle={`How ${orgName} is doing: consultants, applications, interviews and placements.`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Date range" className="inline-flex rounded-[10px] border border-[var(--ent-control-border)] bg-paper p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              data-range={d}
              aria-pressed={range === d}
              onClick={() => setRange(d)}
              className={cn("min-h-9 rounded-[8px] px-3.5 text-[13.5px] font-semibold", range === d ? "bg-accent text-white" : "text-ink-soft hover:bg-paper-2")}
            >
              Last {d} days
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load(range)} disabled={loading} aria-label="Refresh the reports">
            <RefreshIcon size={16} /> Refresh
          </Button>
          <Button type="button" variant="accent" size="sm" data-reports-csv onClick={download} disabled={!overview || status !== "ready" || isEmptyOverview(overview)}>
            <DownloadIcon size={16} /> Download CSV
          </Button>
        </div>
      </div>

      {status === "failed" ? (
        <ErrorState what="the reports" description="The numbers didn't load. Nothing has changed." onRetry={() => void load(range)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : loading && !overview ? (
        <Skeletons />
      ) : overview && isEmptyOverview(overview) ? (
        <EmptyState icon="📊" title="Nothing to report yet" description="Reports fill in as you add consultants, applications, interviews and placements." />
      ) : overview ? (
        <Body o={overview} />
      ) : null}
    </div>
  );
}

function Skeletons() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-[12px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}

function Body({ o }: { o: Overview }) {
  const weekCats = o.funnel.weekly.map((w) => weekLabel(w.weekStart));
  const intCats = o.interviews.weekly.map((w) => weekLabel(w.weekStart));
  const monthCats = o.placements.months.map((m) => monthLabel(m.month));
  const funnelCats = useMemo(() => o.funnel.stages.map((s) => s.label), [o.funnel.stages]);
  return (
    <>
      <ul aria-label="Key numbers" data-reports-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 xl:gap-[17px]">
        {o.tiles.map((t) => {
          const pct = deltaText(tileDeltaPct(t));
          return (
            <li key={t.key} data-report-tile={t.key} className="ent-card flex min-w-0 flex-col px-3.5 pb-3 pt-3">
              <span className="text-[12.5px] leading-tight text-ink-soft">{t.label}</span>
              <span className="mt-1.5 text-[24px] font-bold leading-tight text-ink" data-report-tile-value>
                {tileValueText(t)}
              </span>
              <span className="mt-1 min-h-4 text-[12px] text-muted">{pct ? `${pct} vs the ${o.rangeDays} days before` : ""}</span>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2 xl:gap-[17px]">
        <ReportCard id="rep-funnel" title={`Applications by stage, last ${o.rangeDays} days`} empty={o.funnel.total === 0 ? "No applications in this range." : null}>
          <BarChart label="Applications by stage" categories={funnelCats} series={[{ key: "count", label: "Applications", values: o.funnel.stages.map((s) => s.count), color: chartColor(0) }]} height={150} />
          <Table
            caption="Applications by stage with the change over the last week"
            head={["Stage", "Applications", "Entered this week", "Last week", "Change"]}
            rows={o.funnel.stages.map((s) => [s.label, s.count, s.enteredThisWeek, s.enteredLastWeek, deltaText(s.deltaPct) ?? "—"])}
          />
          <p className="mt-2 text-[12.5px] text-muted" data-funnel-wow>
            New applications: {o.funnel.thisWeek} in the last 7 days, {o.funnel.lastWeek} the 7 days before{deltaText(o.funnel.deltaPct) ? ` (${deltaText(o.funnel.deltaPct)})` : ""}.
          </p>
        </ReportCard>

        <ReportCard id="rep-weekly" title="Applications per week" empty={o.funnel.total === 0 ? "No applications in this range." : null}>
          <BarChart label="Applications per week" categories={weekCats} series={[{ key: "apps", label: "Applications", values: o.funnel.weekly.map((w) => w.value), color: chartColor(1) }]} height={170} />
        </ReportCard>

        <ReportCard id="rep-interviews" title="Interviews: scheduled and completed" empty={o.interviews.scheduled === 0 && o.interviews.upcoming14Days === 0 ? "No interviews in this range." : null}>
          <BarChart
            label="Interviews per week"
            categories={intCats}
            series={[
              { key: "scheduled", label: "Scheduled", values: o.interviews.weekly.map((w) => w.value), color: chartColor(0) },
              { key: "completed", label: "Completed", values: o.interviews.weekly.map((w) => w.second), color: "var(--color-v2-green)" },
            ]}
            height={150}
          />
          <p className="mt-2 text-[12.5px] text-muted" data-interview-summary>
            {o.interviews.scheduled} scheduled, {o.interviews.completed} completed, {o.interviews.cancelled} cancelled, {o.interviews.awaitingOutcome} waiting for an outcome. {o.interviews.upcoming14Days} more in the next 14 days.
          </p>
        </ReportCard>

        <ReportCard id="rep-placements" title="Placements started and ended, last 6 months" empty={o.placements.months.every((m) => m.started === 0 && m.ended === 0) ? "No placements started or ended in these months." : null}>
          <BarChart
            label="Placements per month"
            categories={monthCats}
            series={[
              { key: "started", label: "Started", values: o.placements.months.map((m) => m.started), color: "var(--color-v2-green)" },
              { key: "ended", label: "Ended", values: o.placements.months.map((m) => m.ended), color: chartColor(1) },
            ]}
            height={150}
          />
          <p className="mt-2 text-[12.5px] text-muted">
            {o.placements.active} running now; {o.placements.startedInRange} started and {o.placements.endedInRange} ended in the last {o.rangeDays} days.
          </p>
        </ReportCard>

        <ReportCard id="rep-roster" title="Consultants" empty={o.roster.total === 0 ? "No consultants yet." : null}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[13px] font-semibold text-ink-soft">By marketing status</h3>
              <DonutChart size={120} label="Consultants by marketing status" total={o.roster.total} totalLabel="Consultants" slices={o.roster.byMarketingStatus.map((s, i) => ({ key: s.key, label: s.label, value: s.count, color: chartColor(i) }))} />
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-semibold text-ink-soft">By availability</h3>
              <DonutChart size={120} label="Consultants by availability" total={o.roster.total} totalLabel="Consultants" slices={o.roster.byAvailability.map((s, i) => ({ key: s.key, label: s.label, value: s.count, color: chartColor(i + 2) }))} />
            </div>
          </div>
        </ReportCard>

        <ReportCard id="rep-clients" title="Top clients by active placements" empty={o.topClients.length === 0 ? "No running placements yet." : null}>
          <Table caption="Top clients by active placements" head={["Client", "Active placements"]} rows={o.topClients.map((c) => [c.name, c.activePlacements])} />
        </ReportCard>

        <ReportCard id="rep-marketers" title="Marketer workload" empty={o.marketers.length === 0 ? "No marketer has consultants or open opportunities yet." : null}>
          <Table caption="Marketer workload" head={["Marketer", "Assigned consultants", "Open opportunities"]} rows={o.marketers.map((m) => [m.name, m.consultants, m.openOpportunities])} />
        </ReportCard>

        <ReportCard id="rep-first-submission" title="Time to first submission" empty={null}>
          <p className="py-2 text-[26px] font-bold text-ink" data-first-submission>
            {durationText(o.firstSubmission.medianHours)}
          </p>
          <p className="text-[12.5px] text-muted">
            {o.firstSubmission.sample > 0
              ? `The median from the day an application was created to its first submission, over ${o.firstSubmission.sample} application${o.firstSubmission.sample === 1 ? "" : "s"} in the last ${o.rangeDays} days.`
              : `No application created in the last ${o.rangeDays} days has been submitted yet.`}
          </p>
        </ReportCard>
      </div>
    </>
  );
}

function ReportCard({ id, title, empty, children }: { id: string; title: string; empty: string | null; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-report-card={id} className={CARD}>
      <h2 id={id} className="mb-2.5 text-[17px] font-bold leading-tight text-ink">
        {title}
      </h2>
      {empty ? <p className="py-6 text-center text-[13.5px] text-muted">{empty}</p> : children}
    </section>
  );
}

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-ink-soft">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("py-1.5 pr-3 font-semibold", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line/60 last:border-b-0">
              {r.map((c, ci) => (
                <td key={ci} className={cn("py-1.5 pr-3", ci === 0 ? "font-medium text-ink" : "text-right tabular-nums text-ink-soft")}>
                  {typeof c === "number" ? c.toLocaleString("en-US") : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
