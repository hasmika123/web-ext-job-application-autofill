"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loaders: each effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ent/shell/ShellContext";
import { AllowanceMeter, EmptyState, ErrorState, Meter, PersonCell, Select, Tab, TabList, TabPanel, TableSkeleton, Tabs } from "@kiwiply/ui";
import { billingApi, day, lastMonths, monthName, type History, type Usage } from "@/lib/ent/billing";

const HEAD = "px-3 py-2.5 text-left text-[12px] font-semibold text-ink-soft";
const NUM = "px-3 py-2.5 text-right tabular-nums";

/**
 * Feature Usage at `/w/admin/usage` (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, 28 §5): what each licensed consultant really used in a month,
 * by consultant, by feature, and month by month. The AI budget is a percent and never dollars, and only for the current month. Read-only.
 */
export default function UsagePage({ orgId, now = new Date() }: { orgId: number; now?: Date }) {
  const [months] = useState(() => lastMonths(now, 12));
  const [period, setPeriod] = useState(months[0]);
  const [tab, setTab] = useState("consultants");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    setUsage(null);
    const r = await billingApi.usage(orgId, period);
    if (r.ok) setUsage(r.data);
    else setFailed(r.message);
  }, [orgId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "history" || history) return;
    void billingApi.history(orgId, 6).then((r) => {
      if (r.ok) setHistory(r.data);
    });
  }, [tab, history, orgId]);

  return (
    <>
      <PageHeader title="Feature Usage" subtitle="What your consultants used, month by month." />
      <div className="space-y-4" data-usage-page>
        <Select aria-label="Month" value={period} onChange={setPeriod} options={months.map((m) => ({ value: m, label: monthName(m) }))} className="w-[200px]" />
        {failed ? (
          <ErrorState what="the usage" description={failed} onRetry={() => void load()} />
        ) : usage == null ? (
          <TableSkeleton columns={5} label="Loading usage" />
        ) : (
          <Tabs value={tab} onValueChange={setTab} variant="underline">
            <TabList aria-label="Usage">
              <Tab value="consultants">By consultant</Tab>
              <Tab value="features">By feature</Tab>
              <Tab value="history">History</Tab>
            </TabList>
            <TabPanel value="consultants" className="pt-4">
              <ByConsultant u={usage} />
            </TabPanel>
            <TabPanel value="features" className="pt-4">
              <ByFeature u={usage} />
            </TabPanel>
            <TabPanel value="history" className="pt-4">
              {history ? <HistoryTable h={history} /> : <TableSkeleton columns={4} label="Loading history" />}
            </TabPanel>
          </Tabs>
        )}
      </div>
    </>
  );
}

function ByConsultant({ u }: { u: Usage }) {
  if (u.consultants.length === 0) return <EmptyState variant="inline" title="No licensed consultants" description="Usage shows here for consultants who hold a licence." />;
  return (
    <div className="space-y-2">
      {u.current ? <p className="text-[12.5px] text-muted">AI budgets reset on {day(u.resetsOn)}.</p> : <p className="text-[12.5px] text-muted">AI budget use is shown for the current month only.</p>}
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
        <table aria-label="Usage by consultant" className="w-full border-collapse text-[12.5px]" data-usage-consultants>
          <thead className="border-b border-line bg-paper-2/60">
            <tr>
              <th scope="col" className={HEAD}>Consultant</th>
              <th scope="col" className={HEAD}>AI budget</th>
              <th scope="col" className={`${HEAD} text-right`}>Job matches viewed</th>
              <th scope="col" className={`${HEAD} text-right`}>Interview prep</th>
              <th scope="col" className={`${HEAD} text-right`}>Applications</th>
            </tr>
          </thead>
          <tbody>
            {u.consultants.map((c) => (
              <tr key={c.consultantId} className="border-b border-line align-top last:border-0" data-usage-row={c.consultantId}>
                <td className="px-3 py-2.5">
                  <PersonCell name={c.name} avatarName={c.name} />
                  {c.counters.length ? (
                    <div className="mt-2 space-y-2">
                      {c.counters.map((k) =>
                        k.allowance != null ? (
                          <AllowanceMeter key={k.featureKey} used={k.used} limit={k.allowance} label={k.label} />
                        ) : (
                          <p key={k.featureKey} className="text-[12px] text-ink-soft">
                            {k.label}: {k.used}
                          </p>
                        ),
                      )}
                    </div>
                  ) : null}
                </td>
                <td className="min-w-[140px] px-3 py-2.5">
                  {c.aiBudgetPercent == null ? (
                    <span className="text-muted">{u.current ? "No AI on this licence" : "-"}</span>
                  ) : (
                    <div className="space-y-1">
                      <Meter value={c.aiBudgetPercent} max={100} label={`${c.name}'s AI budget`} valueText={`${c.aiBudgetPercent} percent of the AI budget`} />
                      <span className="text-[12px] tabular-nums text-muted">{c.aiBudgetPercent}% used</span>
                    </div>
                  )}
                </td>
                <td className={NUM}>{c.matchViews}</td>
                <td className={NUM}>{c.prepSessions}</td>
                <td className={NUM}>{c.applications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ByFeature({ u }: { u: Usage }) {
  const max = Math.max(1, ...u.features.map((f) => f.used));
  return (
    <ul className="space-y-3" aria-label="Usage by feature" data-usage-features>
      {u.features.map((f) => (
        <li key={f.key} className="rounded-[var(--radius)] border border-line bg-paper p-3">
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="font-semibold text-ink">{f.label}</span>
            <span className="tabular-nums text-ink-soft">
              {f.used}
              {f.allowance != null ? ` of ${f.allowance}` : ""} · {f.consultants} {f.consultants === 1 ? "consultant" : "consultants"}
            </span>
          </div>
          <div className="mt-2">
            <Meter value={f.used} max={f.allowance ?? max} label={f.label} neutral={f.allowance == null} valueText={`${f.used}${f.allowance != null ? ` of ${f.allowance}` : ""}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function HistoryTable({ h }: { h: History }) {
  const any = h.months.some((m) => m.matchViews + m.prepSessions + m.applications + m.counted > 0);
  if (!any) return <EmptyState variant="inline" title="Nothing used yet" description="Usage appears here as your consultants work." />;
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
      <table aria-label="Usage by month" className="w-full border-collapse text-[12.5px]" data-usage-history>
        <thead className="border-b border-line bg-paper-2/60">
          <tr>
            <th scope="col" className={HEAD}>Month</th>
            <th scope="col" className={`${HEAD} text-right`}>Job matches viewed</th>
            <th scope="col" className={`${HEAD} text-right`}>Interview prep</th>
            <th scope="col" className={`${HEAD} text-right`}>Applications</th>
          </tr>
        </thead>
        <tbody>
          {[...h.months].reverse().map((m) => (
            <tr key={m.period} className="border-b border-line last:border-0">
              <td className="px-3 py-2.5 text-ink">{monthName(m.period)}</td>
              <td className={NUM}>{m.matchViews}</td>
              <td className={NUM}>{m.prepSessions}</td>
              <td className={NUM}>{m.applications}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
