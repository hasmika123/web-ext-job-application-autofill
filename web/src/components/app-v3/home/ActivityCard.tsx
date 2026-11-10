"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorState, Skeleton } from "@kiwiply/ui";
import { BarGroupChart, FilterSelect, SectionCard } from "@/components/app-v2/common";
import { getActivity, type ActivityDay } from "@/lib/applications";
import { bucketActivity } from "./compute";

/** The periods the select offers, in days (the server caps what it answers at `tracker.activity.maxDays`). */
export const PERIODS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];
const DEFAULT_PERIOD = PERIODS[1].label;

const SERIES = [{ label: "Updates", tone: "blue" as const }];

function scale(max: number): { max: number; ticks: number[] } {
  const step = max <= 5 ? 1 : max <= 10 ? 5 : max <= 20 ? 10 : max <= 40 ? 10 : max <= 80 ? 20 : 40;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { max: top, ticks };
}

type Loaded = { kind: "error"; message: string } | { kind: "ready"; days: ActivityDay[] };

/**
 * Application Activity: how many things happened on your applications (applied, moved, noted, interviews) per day,
 * from `GET /api/applications/activity` in the browser's own time zone. The period select is real (7 / 30 / 90 days);
 * a week is one bar per day, longer periods fold into six bars. No applications yet = an honest empty state.
 */
export default function ActivityCard({ hasApplications, className }: { hasApplications: boolean; className?: string }) {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [attempt, setAttempt] = useState(0);
  const days = (PERIODS.find((p) => p.label === period) ?? PERIODS[1]).days;
  // One request per (period, attempt); the answer is kept with its key, so "loading" is simply "not answered yet".
  const key = `${days}#${attempt}`;
  const [done, setDone] = useState<{ key: string; value: Loaded } | null>(null);
  const state: { kind: "loading" } | Loaded = done?.key === key ? done.value : { kind: "loading" };

  useEffect(() => {
    let live = true;
    void getActivity(days).then((r) => {
      if (live) setDone({ key, value: r.kind === "ok" ? { kind: "ready", days: r.data } : { kind: "error", message: r.message } });
    });
    return () => {
      live = false;
    };
  }, [days, key]);

  const groups = state.kind === "ready" ? bucketActivity(state.days) : [];
  const total = groups.reduce((sum, g) => sum + g.values[0], 0);
  const { max, ticks } = scale(Math.max(1, ...groups.map((g) => g.values[0])));

  return (
    <SectionCard
      title="Application Activity"
      className={className}
      headerExtra={<FilterSelect label="Period" options={PERIODS.map((p) => p.label)} value={period} onChange={setPeriod} className="w-[150px]" />}
    >
      {state.kind === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Loading activity">
          <Skeleton className="h-[190px] rounded-xl" />
        </div>
      ) : state.kind === "error" ? (
        <ErrorState variant="inline" what="your activity" description={state.message} onRetry={() => setAttempt((a) => a + 1)} />
      ) : total === 0 ? (
        <EmptyState
          variant="inline"
          title={hasApplications ? "A quiet stretch" : "No activity yet"}
          description={hasApplications ? `Nothing changed in the last ${days} days.` : "Applications you save, send and update show up here."}
          action={
            hasApplications ? undefined : (
              <Link href="/jobs" className="text-[13px] font-bold text-v2-blue-ink hover:underline">
                Find jobs
              </Link>
            )
          }
        />
      ) : (
        <BarGroupChart groups={groups} series={SERIES} max={max} yTicks={ticks} height={190} />
      )}
    </SectionCard>
  );
}
