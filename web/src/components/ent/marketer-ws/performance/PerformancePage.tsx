"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { BriefcaseIcon, CalendarIcon, CheckCircleIcon, ErrorState, FileTextIcon, SendIcon, UsersIcon } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { DEFAULT_QUERY, KPI_INFO, KPI_KEYS, KPI_TITLES, fetchPerformance, type KpiKey, type PerformanceQuery, type PerformanceView } from "@/lib/ent/marketer-ws/performance";
import { KpiTile, type MktPageProps, type TintName } from "../parts";
import { Info } from "./bits";
import { FunnelCard, ReadinessCard, TrendCard, WeeklyCard } from "./Cards";
import { ActionsCard, BeeCard, BenchmarksCard, GoalsCard } from "./Rail";
import { StreamsCard, TopCard } from "./Tables";

/**
 * Performance (Marketing workspace; design: Performance). One call draws the board; each card's period select refetches it. Every number comes from the
 * API (counted over the consultants assigned to this marketer) and every card has its own empty state, never a made-up row. E1: the page only reads,
 * apart from the marketer's own monthly targets (numbers recorded; nothing is submitted for anyone).
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName; spark: number }> = {
  assignedConsultants: { icon: UsersIcon, tint: "violet", spark: 3 },
  activeSubmissions: { icon: SendIcon, tint: "blue", spark: 1 },
  interviewRate: { icon: CalendarIcon, tint: "pink", spark: 4 },
  offerRate: { icon: FileTextIcon, tint: "blue", spark: 5 },
  placements: { icon: BriefcaseIcon, tint: "green", spark: 3 },
  followupCompletion: { icon: CheckCircleIcon, tint: "green", spark: 3 },
};
const IS_RATE: Record<KpiKey, boolean> = { assignedConsultants: false, activeSubmissions: false, interviewRate: true, offerRate: true, placements: false, followupCompletion: true };

export default function PerformancePage({ orgId, hrefs }: MktPageProps) {
  const [query, setQuery] = useState<PerformanceQuery>(DEFAULT_QUERY);
  const [view, setView] = useState<PerformanceView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [reloads, setReloads] = useState(0);
  const lastGood = useRef(false);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetchPerformance(orgId, query, ctl.signal);
      if (ctl.signal.aborted) return;
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
        setNow(Date.now());
        lastGood.current = true;
      } else setStatus(r.kind === "DENIED" ? "denied" : lastGood.current ? "ready" : "failed");
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, query, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const set = (k: keyof PerformanceQuery) => (v: string) => setQuery((q) => ({ ...q, [k]: v }));

  if (status === "denied") return <ErrorState what="Performance" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = (
    <>
      <PageHeader title="Performance" subtitle="Measure consultant marketing outcomes and track progress toward your goals." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "failed")
    return (
      <div data-performance data-status="failed">
        {header}
        <ErrorState what="Performance" description="Your numbers didn't load. Nothing has changed." onRetry={reload} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  return (
    <div data-performance data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-perf-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.35fr)]">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint, spark } = KPI_ICONS[key];
          const value = k?.value ?? null;
          const tile = (
            <KpiTile
              id={key}
              title={KPI_TITLES[key]}
              icon={icon}
              tint={tint}
              value={value === null ? null : IS_RATE[key] ? `${Math.round(value)}%` : value}
              deltaPct={k?.deltaPct ?? null}
              sparkline={k?.sparkline}
              sparkIndex={spark}
              loading={loading}
              layout={key === "followupCompletion" ? "inline" : "stacked"}
            />
          );
          return key === "followupCompletion" ? (
            <div key={key} className="relative col-span-2 sm:col-span-1">
              {tile}
              <span className="absolute right-3 top-3">
                <Info text={KPI_INFO[key]} what={KPI_TITLES[key]} />
              </span>
            </div>
          ) : (
            <div key={key}>{tile}</div>
          );
        })}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,330px)]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
            <WeeklyCard data={v?.weekly ?? null} period={query.weeks} onPeriod={set("weeks")} loading={loading} />
            <TrendCard data={v?.trend ?? null} period={query.trend} onPeriod={set("trend")} loading={loading} />
            <div className="lg:col-span-2 xl:col-span-1">
              <FunnelCard data={v?.funnel ?? null} period={query.funnel} onPeriod={set("funnel")} loading={loading} />
            </div>
          </div>
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
            <ReadinessCard data={v?.readiness ?? null} loading={loading} />
            <StreamsCard data={v?.streams ?? null} period={query.streams} onPeriod={set("streams")} loading={loading} />
          </div>
          <TopCard rows={v?.top ?? []} loading={loading} viewAll={hrefs.talent ?? null} now={now} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <BeeCard />
          <BenchmarksCard data={v?.benchmarks ?? null} period={query.benchmarks} onPeriod={set("benchmarks")} loading={loading} />
          <GoalsCard orgId={orgId} data={v?.goals ?? null} period={query.goals} onPeriod={set("goals")} loading={loading} onChanged={reload} />
          <ActionsCard actions={v?.actions ?? []} hrefs={hrefs} loading={loading} />
        </div>
      </div>
    </div>
  );
}
