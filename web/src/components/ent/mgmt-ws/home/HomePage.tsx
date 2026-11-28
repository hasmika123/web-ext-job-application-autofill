"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertIcon, BarChart, BriefcaseIcon, ChartIcon, CheckCircleIcon, ClipboardCheckIcon, ClockIcon, ErrorState, PauseCircleSolidIcon, RouteIcon, Skeleton, UsersIcon, chartColor, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type HomeView } from "@/lib/ent/mgmt-ws/api";
import { CARD, Empty, EmptyManager, Head, KpiTile, LoadMeter, Person, Since, SOFT_CARD, statusTone } from "../parts";
import type { MgmtPageProps } from "../parts";

const KPI = [
  ["active", "Active marketers", UsersIcon, "blue"],
  ["paused", "Paused marketers", PauseCircleSolidIcon, "amber"],
  ["consultants", "Consultants covered", BriefcaseIcon, "violet"],
  ["opportunities", "Open opportunities", RouteIcon, "teal"],
  ["approvals", "Approvals waiting", ClipboardCheckIcon, "pink"],
  ["escalations", "Open escalations", AlertIcon, "coral"],
] as const;

export default function HomePage({ orgId, hrefs }: MgmtPageProps) {
  const [view, setView] = useState<HomeView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const load = useCallback(async () => {
    const result = await mgmtApi.home(orgId);
    if (result.kind === "OK") {
      setView(result.data);
      setStatus("ready");
    } else if (result.kind === "DENIED") setStatus("denied");
    else setStatus((current) => (current === "ready" ? current : "failed"));
  }, [orgId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (status === "denied") return <ErrorState what="the Marketing Manager home" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const loading = status === "loading";
  return (
    <div data-mgmt-home data-status={status} className="ent-page flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Home" subtitle="Here is what your team needs next." />
      {status === "failed" ? <ErrorState what="the Marketing Manager home" description="Your team's numbers didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}
      <section aria-label="Team numbers" data-mgmt-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {KPI.map(([id, title, Icon, tint]) => {
          const value = view ? ({ active: view.tiles.marketersActive, paused: view.tiles.marketersPaused, consultants: view.tiles.consultantsCovered, opportunities: view.tiles.openOpportunities, approvals: view.tiles.approvalsWaiting, escalations: view.tiles.escalations.open }[id]) : null;
          return <KpiTile key={id} id={id} title={title} icon={Icon} tint={tint} value={loading ? null : value} loading={loading} lowerIsBetter={id === "paused" || id === "escalations"} />;
        })}
      </section>

      {loading ? <LoadingBody /> : view?.empty ? <EmptyManager title="Build your team" description="Add marketers to your team to start seeing workload, pipeline movement, approvals, and escalations here." action={hrefs.team ? <Link href={hrefs.team} className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-white">Open Team</Link> : null} /> : view ? <Body view={view} hrefs={hrefs} /> : null}
    </div>
  );
}

function LoadingBody() {
  return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
}

function Body({ view, hrefs }: { view: HomeView; hrefs: MgmtPageProps["hrefs"] }) {
  const pipelineCategories = ["Assigned", "Interested", "Submitted", "Interviews"];
  const current = [view.pipeline.assigned.thisWeek, view.pipeline.interested.thisWeek, view.pipeline.submitted.thisWeek, view.pipeline.interviews.thisWeek];
  const previous = [view.pipeline.assigned.lastWeek, view.pipeline.interested.lastWeek, view.pipeline.submitted.lastWeek, view.pipeline.interviews.lastWeek];
  return <>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={CARD} data-mgmt-card="needs-you">
        <Head icon={AlertIcon} tint="pink" title="Needs you" count={view.needsYou.length} />
        {view.needsYou.length === 0 ? <Empty>Nothing needs your attention right now.</Empty> : <ul className="divide-y divide-line">{view.needsYou.map((item) => <li key={`${item.type}-${item.id}`} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"><span className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", statusTone(item.severity ?? item.type))}><AlertIcon size={16} /></span><span className="min-w-0 flex-1"><Link href={item.link} className="block truncate text-[13.5px] font-semibold text-ink hover:text-accent-deep">{item.title}</Link><span className="block truncate text-[12px] text-muted">{item.type.toLowerCase()} {item.who ? `· ${item.who}` : ""} · <Since value={item.since} /></span></span><span className="text-[11px] font-bold uppercase text-muted">{item.type}</span></li>)}</ul>}
      </section>

      <section className={CARD} data-mgmt-card="activity">
        <Head icon={ClockIcon} tint="blue" title="Team activity" viewAll={hrefs.team} />
        {view.activity.length === 0 ? <Empty>No team activity yet.</Empty> : <ul className="divide-y divide-line">{view.activity.slice(0, 5).map((item) => <li key={item.id} className="flex items-start gap-2.5 py-3 first:pt-1 last:pb-1"><Person name={item.actor} subtitle={item.consultant} /><span className="min-w-0 flex-1 text-[13px] text-ink-soft">{item.text}</span><Since value={item.at} /></li>)}</ul>}
      </section>
    </div>

    <section className={SOFT_CARD} data-mgmt-card="pipeline">
      <Head icon={ChartIcon} tint="violet" title="Pipeline this week" viewAll={hrefs.pipeline} />
      <BarChart label="Team pipeline this week compared with last week" categories={pipelineCategories} series={[{ key: "this-week", label: "This week", values: current, color: chartColor(0) }, { key: "last-week", label: "Last week", values: previous, color: chartColor(1) }]} height={170} variant="board" />
    </section>

    <section className={SOFT_CARD} data-mgmt-card="workload">
      <Head icon={UsersIcon} tint="teal" title="Workload" viewAll={hrefs.workload} />
      {view.workload.length === 0 ? <Empty>No marketer workload yet.</Empty> : <div className="grid gap-4 sm:grid-cols-3">{view.workload.map((row) => <div key={row.memberId} className="rounded-xl bg-paper-2 p-3"><div className="mb-2 flex items-center justify-between gap-2"><Person name={row.name} avatar={false} /><span className={cn("rounded-full px-2 py-1 text-[11px] font-bold", row.overloaded ? "bg-v2-pink-soft text-v2-pink-ink" : "bg-accent-soft text-accent-deep")}>{row.percent}%</span></div><LoadMeter assigned={row.assigned} capacity={row.capacity} percent={row.percent} overloaded={row.overloaded} label={`${row.name} workload`} /></div>)}</div>}
    </section>

    <section className={SOFT_CARD} data-mgmt-card="escalations"><div className="flex items-center gap-2 text-[13px] text-muted"><CheckCircleIcon size={16} className="text-v2-green-ink" />{view.tiles.escalations.open === 0 ? "The team's escalations are clear." : `${view.tiles.escalations.open} open escalations · ${view.tiles.escalations.high} high severity`}{hrefs.escalations ? <Link href={hrefs.escalations} className="ml-auto font-semibold text-accent-deep hover:underline">Review escalations</Link> : null}</div></section>
  </>;
}
