"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChartIcon, Button, Dialog, ErrorState, Select, Skeleton, Sparkline, UsersIcon, useToast } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { bulkSummary, undoRows } from "@/lib/ent/marketing-assignments";
import { mgmtApi, type AssignmentRow, type BulkResult, type WorkloadPage as WorkloadData } from "@/lib/ent/mgmt-ws/api";
import { parseWorkloadState, writeManagerSearch, type WorkloadState } from "@/lib/ent/mgmt-ws/state";
import { EmptyManager, LoadMeter, Person, SOFT_CARD, StatusBadge, TABLE, TABLE_WRAP, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function WorkloadPage({ orgId, hrefs, initialSearch }: MgmtPageProps) {
  const toast = useToast();
  const [data, setData] = useState<WorkloadData | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [filters, setFilters] = useState<WorkloadState>(() => parseWorkloadState(initialSearch));
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [moveOpen, setMoveOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("Manager workload rebalance");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    writeManagerSearch({ view: filters.view === "ALL" ? null : filters.view, capacity: filters.capacity || null });
  }, [filters]);

  const load = useCallback(async () => {
    const [workload, rows] = await Promise.all([mgmtApi.workload(orgId), mgmtApi.assignments(orgId, { page: 0, size: 100 })]);
    if (workload.kind === "DENIED" || rows.kind === "DENIED") return setState("denied");
    if (workload.kind !== "OK") return setState("failed");
    setData(workload.data);
    if (rows.kind === "OK") setAssignments(rows.data.items);
    setState("ready");
  }, [orgId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const rows = useMemo(() => (data?.items ?? []).filter((item) => (filters.view === "ALL" || (filters.view === "OVERLOADED" ? item.marketer.overloaded : item.marketer.withoutBackup > 0)) && (!filters.capacity || item.marketer.capacity <= Number(filters.capacity))), [data, filters]);
  const marketers = useMemo(() => data?.items ?? [], [data]);
  const sourceOptions = [{ value: "", label: "Choose a consultant" }, ...assignments.filter((row) => row.marketer).map((row) => ({ value: String(row.consultantId), label: `${row.name} · ${row.marketer?.name ?? ""}` }))];
  const targetOptions = [{ value: "", label: "Choose a marketer" }, ...marketers.map((row) => ({ value: String(row.marketer.memberId), label: row.marketer.name }))];
  const suggestions = useMemo(() => {
    const overloaded = marketers.filter((row) => row.marketer.overloaded).sort((a, b) => b.marketer.percent - a.marketer.percent);
    const lightest = [...marketers].sort((a, b) => a.marketer.percent - b.marketer.percent).find((row) => !row.marketer.overloaded);
    if (!lightest) return [] as { consultantId: number; name: string; from: string; to: string; toId: number }[];
    return overloaded.flatMap((row) => assignments.filter((assignment) => assignment.marketer?.id === row.marketer.memberId).slice(0, 2).map((assignment) => ({ consultantId: assignment.consultantId, name: assignment.name, from: row.marketer.name, to: lightest.marketer.name, toId: lightest.marketer.memberId })));
  }, [assignments, marketers]);

  const undo = async (result: BulkResult) => {
    const rowsToRestore = undoRows(result.results);
    if (!rowsToRestore.length) return;
    const restored = await mgmtApi.assignmentAction(orgId, "restore", { rows: rowsToRestore });
    toast(restored.kind === "OK" ? { title: "Workload change undone", variant: "success" } : { title: "Couldn't undo the workload change", variant: "error" });
    await load();
  };
  const applyMoves = async (moves: { consultantId: number; toMarketerMemberId: number }[]) => {
    if (!moves.length) return;
    setBusy(true);
    const result = await mgmtApi.rebalance(orgId, { moves, reason: reason.trim() || undefined });
    setBusy(false);
    if (result.kind !== "OK") {
      toast({ title: "Couldn't rebalance workload", description: result.kind === "FAILED" ? result.message : "You no longer have access to these assignments.", variant: "error" });
      return;
    }
    const summary = bulkSummary(result.data, "reassign");
    const canUndo = undoRows(result.data.results).length > 0;
    toast({ ...summary, duration: canUndo ? 8000 : 4000, action: canUndo ? { label: "Undo", onClick: () => void undo(result.data) } : undefined });
    setMoveOpen(false);
    setSuggestOpen(false);
    await load();
  };

  if (state === "denied") return <ErrorState what="workload" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-workload data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Workload" subtitle="Balance capacity across the team before the next consultant needs help." /><Toolbar><div className="flex flex-wrap items-center gap-2 text-[13px] text-muted"><BarChartIcon size={17} className="text-accent-deep" />{data ? `${data.summary.totalAssigned} assigned consultants across ${data.summary.marketers} marketers` : "Team capacity"}<div className="w-40"><Select aria-label="Capacity view" value={filters.view} onChange={(value) => setFilters((current) => ({ ...current, view: value as WorkloadState["view"] }))} options={[{ value: "ALL", label: "All capacity" }, { value: "OVERLOADED", label: "Over capacity" }, { value: "NO_BACKUP", label: "Needs backup" }]} /></div><div className="w-36"><Select aria-label="Capacity cap" value={filters.capacity} onChange={(capacity) => setFilters((current) => ({ ...current, capacity }))} options={[{ value: "", label: "Any cap" }, ...[5, 10, 20, 50, 100, 200].map((value) => ({ value: String(value), label: `Up to ${value}` }))]} /></div></div><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button><Button type="button" variant="ghost" size="sm" disabled={suggestions.length === 0} onClick={() => setSuggestOpen(true)}>Auto-suggest</Button><Button type="button" variant="accent" size="sm" onClick={() => setMoveOpen(true)}>Reassign consultant</Button>{hrefs.assignments ? <Link href={hrefs.assignments} className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-white">Open assignments</Link> : null}</div></Toolbar>{state === "failed" ? <ErrorState what="workload" description="The workload didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : data && rows.length === 0 ? <EmptyManager title="No workload matches this view" description="Add marketers and assign consultants to see the team's capacity here." /> : data ? <section className={SOFT_CARD}><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-teal-soft text-v2-teal-ink"><UsersIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">Team workload</h2></div><div className={TABLE_WRAP}><table className={TABLE}><thead><tr className="bg-paper-2 text-[12px] text-ink-soft"><th className="px-3 py-2.5">Marketer</th><th className="px-3 py-2.5">Load</th><th className="px-3 py-2.5">Eight-week trend</th><th className="px-3 py-2.5">Health</th><th className="px-3 py-2.5">Open work</th><th className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((item) => <tr key={item.marketer.memberId} className="border-b border-line last:border-0"><td className="px-3 py-3"><Person name={item.marketer.name} subtitle={item.marketer.title} /></td><td className="px-3"><LoadMeter assigned={item.marketer.assigned} capacity={item.marketer.capacity} percent={item.marketer.percent} overloaded={item.marketer.overloaded} label={`${item.marketer.name} workload`} /></td><td className="w-44 px-3">{item.series.length > 1 ? <Sparkline values={item.series} color="var(--color-accent)" /> : <span className="text-[12px] text-muted">No history yet</span>}</td><td className="px-3"><div className="flex flex-wrap gap-1.5">{item.marketer.overloaded ? <StatusBadge value="OVERLOADED" /> : <StatusBadge value="HEALTHY" />}{item.marketer.withoutBackup > 0 ? <span className="rounded-full bg-v2-amber-soft px-2 py-1 text-[10.5px] font-semibold text-v2-amber-ink">{item.marketer.withoutBackup} no backup</span> : null}</div></td><td className="px-3 text-[12.5px] text-ink-soft">{item.marketer.highPriority} high priority<br />{item.marketer.activeApps} active applications</td><td className="px-3 text-right"><Button type="button" size="sm" variant="ghost" onClick={() => { const first = assignments.find((assignment) => assignment.marketer?.id === item.marketer.memberId); setSource(first ? String(first.consultantId) : ""); setMoveOpen(true); }}>Move</Button></td></tr>)}</tbody></table></div><p className="mt-3 text-[12.5px] text-muted">Capacity rules and audit history remain enforced by the API. Auto-suggest only prepares a proposal; nothing moves until you apply it.</p></section> : null}<Dialog open={moveOpen} onClose={() => setMoveOpen(false)} title="Reassign consultant" description="Move one consultant to another active marketer." footer={<><Button type="button" variant="ghost" onClick={() => setMoveOpen(false)}>Cancel</Button><Button type="button" variant="accent" disabled={busy || !source || !target} onClick={() => void applyMoves([{ consultantId: Number(source), toMarketerMemberId: Number(target) }])}>Apply move</Button></>}><div className="flex flex-col gap-3"><Select aria-label="Consultant to move" value={source} onChange={setSource} options={sourceOptions} /><Select aria-label="Move consultant to" value={target} onChange={setTarget} options={targetOptions} /><label className="grid gap-1 text-[13px] font-semibold text-ink" htmlFor="rebalance-reason">Reason<textarea id="rebalance-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} rows={3} className="mt-1 w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 font-normal outline-none focus:border-accent" /></label></div></Dialog><Dialog open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Auto-suggested moves" description="Review the least-loaded target before applying any proposal." footer={<><Button type="button" variant="ghost" onClick={() => setSuggestOpen(false)}>Cancel</Button><Button type="button" variant="accent" disabled={busy || suggestions.length === 0} onClick={() => void applyMoves(suggestions.map((suggestion) => ({ consultantId: suggestion.consultantId, toMarketerMemberId: suggestion.toId })))}>Apply suggestions</Button></>}><ul className="divide-y divide-line">{suggestions.length === 0 ? <li className="py-2 text-[13px] text-muted">No safe move is available.</li> : suggestions.map((suggestion) => <li key={suggestion.consultantId} className="py-2 text-[13px]"><b>{suggestion.name}</b><span className="text-muted"> · {suggestion.from} → {suggestion.to}</span></li>)}</ul></Dialog></div>;
}
