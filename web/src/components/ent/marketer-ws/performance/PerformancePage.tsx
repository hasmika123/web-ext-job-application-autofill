"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { BriefcaseIcon, CalendarIcon, ErrorState, FileTextIcon, SendIcon } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { DEFAULT_QUERY, KPI_KEYS, KPI_TITLES, fetchPerformance, type KpiKey, type PerformanceQuery, type PerformanceView } from "@/lib/ent/marketer-ws/performance";
import { KpiTile, type MktPageProps, type TintName } from "../parts";
import { FunnelCard, TrendCard, WeeklyCard } from "./Cards";
import { StreamsCard, TopCard } from "./Tables";

/**
 * Performance (Marketing workspace). One call draws the board; each card's period select refetches it. Every number comes from the
 * API (counted over the consultants assigned to this marketer) and every card has its own empty state, never a made-up row. E1: the page only reads.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName; spark: number }> = {
  activeSubmissions: { icon: SendIcon, tint: "blue", spark: 1 },
  interviewRate: { icon: CalendarIcon, tint: "pink", spark: 4 },
  offerRate: { icon: FileTextIcon, tint: "blue", spark: 5 },
  placements: { icon: BriefcaseIcon, tint: "green", spark: 3 },
};
const IS_RATE: Record<KpiKey, boolean> = { activeSubmissions: false, interviewRate: true, offerRate: true, placements: false };

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
  const header = <PageHeader title="Performance" subtitle="How your pipeline is converting." />;
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

      <section aria-label="Key numbers" data-perf-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint, spark } = KPI_ICONS[key];
          const value = k?.value ?? null;
          return (
            <KpiTile
              key={key}
              id={key}
              title={KPI_TITLES[key]}
              icon={icon}
              tint={tint}
              value={value === null ? null : IS_RATE[key] ? `${Math.round(value)}%` : value}
              deltaPct={k?.deltaPct ?? null}
              plainDelta
              sparkline={k?.sparkline}
              sparkIndex={spark}
              loading={loading}
            />
          );
        })}
      </section>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <WeeklyCard data={v?.weekly ?? null} period={query.weeks} onPeriod={set("weeks")} loading={loading} />
        <TrendCard data={v?.trend ?? null} period={query.trend} onPeriod={set("trend")} loading={loading} />
        <div className="lg:col-span-2 xl:col-span-1">
          <FunnelCard data={v?.funnel ?? null} period={query.funnel} onPeriod={set("funnel")} loading={loading} />
        </div>
      </div>
      <StreamsCard data={v?.streams ?? null} period={query.streams} onPeriod={set("streams")} loading={loading} />
      <TopCard rows={v?.top ?? []} loading={loading} viewAll={hrefs.talent ?? null} now={now} />
    </div>
  );
}
