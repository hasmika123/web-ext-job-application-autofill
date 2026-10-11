"use client";

import { useState } from "react";
import { BarGroupChart, FilterSelect, SectionCard } from "@/components/app-v2/common";

const SERIES = [
  { label: "Applied", tone: "blue" },
  { label: "Interviews", tone: "green" },
  { label: "Offers", tone: "violet" },
] as const;

function scale(max: number): { max: number; ticks: number[] } {
  const step = max <= 10 ? 5 : max <= 20 ? 10 : max <= 40 ? 10 : max <= 80 ? 20 : 40;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { max: top, ticks };
}

/** Application Activity: grouped bars with a period select (Last 7 / 30 / 90 days). */
export default function ActivityCard({
  periods,
  className,
}: {
  periods: Record<string, { label: string; values: number[] }[]>;
  className?: string;
}) {
  const [period, setPeriod] = useState("Last 30 days");
  const groups = periods[period] ?? [];
  const peak = Math.max(1, ...groups.flatMap((g) => g.values));
  const { max, ticks } = scale(peak);
  return (
    <SectionCard
      title="Application Activity"
      className={className}
      headerExtra={
        <FilterSelect label="Period" options={Object.keys(periods)} value={period} onChange={setPeriod} className="w-[150px]" />
      }
    >
      <BarGroupChart groups={groups} series={[...SERIES]} max={max} yTicks={ticks} height={190} />
    </SectionCard>
  );
}
