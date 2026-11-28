"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChartIcon, Button, ErrorState, Skeleton, Sparkline, UsersIcon } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type WorkloadPage as WorkloadData } from "@/lib/ent/mgmt-ws/api";
import { EmptyManager, LoadMeter, Person, SOFT_CARD, StatusBadge, TABLE, TABLE_WRAP, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function WorkloadPage({ orgId, hrefs }: MgmtPageProps) {
  const [data, setData] = useState<WorkloadData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const load = useCallback(async () => {
    const result = await mgmtApi.workload(orgId);
    if (result.kind === "OK") {
      setData(result.data);
      setState("ready");
    } else if (result.kind === "DENIED") setState("denied");
    else setState("failed");
  }, [orgId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (state === "denied") return <ErrorState what="workload" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-workload data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Workload" subtitle="Balance capacity across the team before the next consultant needs help." /><Toolbar><div className="flex items-center gap-2 text-[13px] text-muted"><BarChartIcon size={17} className="text-accent-deep" />{data ? `${data.summary.totalAssigned} assigned consultants across ${data.summary.marketers} marketers` : "Team capacity"}</div><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button>{hrefs.assignments ? <Link href={hrefs.assignments} className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-white">Open assignments</Link> : null}</div></Toolbar>{state === "failed" ? <ErrorState what="workload" description="The workload didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : data && data.items.length === 0 ? <EmptyManager title="No workload yet" description="Add marketers and assign consultants to see the team's capacity here." /> : data ? <section className={SOFT_CARD}><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-teal-soft text-v2-teal-ink"><UsersIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">Team workload</h2></div><div className={TABLE_WRAP}><table className={TABLE}><thead><tr className="bg-paper-2 text-[12px] text-ink-soft"><th className="px-3 py-2.5">Marketer</th><th className="px-3 py-2.5">Load</th><th className="px-3 py-2.5">Eight-week trend</th><th className="px-3 py-2.5">Health</th><th className="px-3 py-2.5">Open work</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.marketer.memberId} className="border-b border-line last:border-0"><td className="px-3 py-3"><Person name={item.marketer.name} subtitle={item.marketer.title} /></td><td className="px-3"><LoadMeter assigned={item.marketer.assigned} capacity={item.marketer.capacity} percent={item.marketer.percent} overloaded={item.marketer.overloaded} label={`${item.marketer.name} workload`} /></td><td className="w-44 px-3">{item.series.length > 1 ? <Sparkline values={item.series} color="var(--color-accent)" /> : <span className="text-[12px] text-muted">No history yet</span>}</td><td className="px-3"><div className="flex flex-wrap gap-1.5">{item.marketer.overloaded ? <StatusBadge value="OVERLOADED" /> : <StatusBadge value="HEALTHY" />}{item.marketer.withoutBackup > 0 ? <span className="rounded-full bg-v2-amber-soft px-2 py-1 text-[10.5px] font-semibold text-v2-amber-ink">{item.marketer.withoutBackup} no backup</span> : null}</div></td><td className="px-3 text-[12.5px] text-ink-soft">{item.marketer.highPriority} high priority<br />{item.marketer.activeApps} active applications</td></tr>)}</tbody></table></div><p className="mt-3 text-[12.5px] text-muted">Move consultants from the Assignments page. Capacity rules and audit history remain enforced by the API.</p></section> : null}</div>;
}
