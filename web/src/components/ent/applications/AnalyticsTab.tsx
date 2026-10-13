"use client";

import type { ReactNode } from "react";
import { BarChart, Card, DonutChart, EmptyState, chartColor } from "@kiwiply/ui";
import type { Analytics, Bucket } from "@/lib/ent/applications";

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <Card className="!p-4" data-analytics={testId}>
      <h3 className="mb-3 text-[14px] font-bold text-ink">{title}</h3>
      {children}
    </Card>
  );
}

/** Horizontal bars: the widest value fills the row. Every number is a real count; a row of zeros says so. */
function Bars({ rows, label }: { rows: Bucket[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0 || rows.every((r) => r.count === 0)) return <p className="py-3 text-[13px] text-muted">Nothing to show yet.</p>;
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[minmax(5rem,9rem)_1fr_2.5rem] items-center gap-2 text-[12.5px]">
          <span className="truncate text-ink-soft" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-paper-2">
            <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: chartColor(i % 5) }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Analytics tab: small charts of real counts (stage mix, applications per month, the funnel of how many applications ever reached each
 * stage, closing reasons, top clients, sources, marketers). Conversion percentages are computed here from those counts; nothing is typed in.
 */
export default function AnalyticsTab({ data }: { data: Analytics }) {
  if (data.total === 0) {
    return <EmptyState variant="inline" mascot={false} title="No applications to analyse yet" description="Charts appear once applications are added to the pipeline." />;
  }
  const funnel = data.reached;
  const first = funnel[0]?.count ?? 0;
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-analytics-tab>
      <Panel title="Where applications are now" testId="stages">
        <div>
          <DonutChart
            label="Applications by stage"
            total={data.total}
            totalLabel="applications"
            size={140}
            slices={data.byStage.map((b, i) => ({ key: b.key, label: b.label, value: b.count, color: chartColor(i) }))}
          />
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          {data.open} open
          {data.avgDaysOpen !== null ? `, on average ${data.avgDaysOpen} days old` : ""}.
        </p>
      </Panel>

      <Panel title="Applications per month" testId="months">
        <BarChart label="Applications per month, last six months" categories={data.perMonth.map((m) => m.label)} series={[{ key: "applications", label: "Applications", values: data.perMonth.map((m) => m.count) }]} height={170} />
      </Panel>

      <Panel title="Funnel: how far applications got" testId="funnel">
        <Bars rows={funnel} label="Applications that reached each stage" />
        {first > 0 && (
          <p className="mt-3 text-[12.5px] text-muted">
            {(() => {
              const hired = funnel.find((f) => f.key === "HIRED")?.count ?? 0;
              return `${hired} of ${first} applications ended hired (${Math.round((hired / first) * 100)}%).`;
            })()}
          </p>
        )}
      </Panel>

      <Panel title="Why applications closed" testId="reasons">
        <Bars rows={data.closedReasons} label="Closing reasons" />
      </Panel>

      <Panel title="Top clients" testId="clients">
        <Bars rows={data.topClients} label="Applications per client" />
      </Panel>

      <Panel title="Where they came from" testId="sources">
        <Bars rows={data.bySource} label="Applications per source" />
      </Panel>

      <Panel title="By marketer" testId="marketers">
        <Bars rows={data.byMarketer} label="Applications per marketer" />
      </Panel>
    </div>
  );
}
