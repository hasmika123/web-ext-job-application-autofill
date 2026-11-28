"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, HandshakeIcon, Menu, Select, Skeleton, useToast } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import { bulkSummary, undoRows } from "@/lib/ent/marketing-assignments";
import { mgmtApi, type AssignmentsPage as AssignmentsData, type BulkResult, type TeamPage } from "@/lib/ent/mgmt-ws/api";
import { parseAssignmentsState, writeManagerSearch, type AssignmentsState } from "@/lib/ent/mgmt-ws/state";
import { EmptyManager, Person, SOFT_CARD, StatusBadge, TABLE, TABLE_WRAP, TextInput, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

const STATUS_OPTIONS = [{ value: "", label: "All statuses" }, { value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }];
const PRIORITY_OPTIONS = [{ value: "", label: "All priorities" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }];
const AVAILABILITY_OPTIONS = [{ value: "", label: "All availability" }, { value: "AVAILABLE", label: "Available" }, { value: "UNAVAILABLE", label: "Unavailable" }];

export default function AssignmentsPage({ orgId, hrefs, initialSearch }: MgmtPageProps) {
  const toast = useToast();
  const [filters, setFilters] = useState<AssignmentsState>(() => parseAssignmentsState(initialSearch));
  const [data, setData] = useState<AssignmentsData | null>(null);
  const [team, setTeam] = useState<TeamPage | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState("");
  const [backupFor, setBackupFor] = useState<number[] | null>(null);
  const [backupTarget, setBackupTarget] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    writeManagerSearch({ q: filters.q || null, status: filters.status || null, priority: filters.priority || null, marketerId: filters.marketerId || null, availability: filters.availability || null, noBackup: filters.noBackup || null, page: filters.page, size: filters.size === 20 ? null : filters.size });
  }, [filters]);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const [rows, marketers] = await Promise.all([
      mgmtApi.assignments(orgId, { q: filters.q.length >= 2 ? filters.q : undefined, status: filters.status || undefined, priority: filters.priority || undefined, marketerId: filters.marketerId || undefined, availability: filters.availability || undefined, noBackup: filters.noBackup || undefined, page: filters.page, size: filters.size }),
      mgmtApi.team(orgId, { status: "ACTIVE", size: 100 }),
    ]);
    if (rows.kind === "DENIED" || marketers.kind === "DENIED") return setState("denied");
    if (rows.kind !== "OK") return setState("failed");
    setData(rows.data);
    if (marketers.kind === "OK") {
      setTeam(marketers.data);
      setTarget((current) => current || String(marketers.data.items[0]?.memberId ?? ""));
      setBackupTarget((current) => current || String(marketers.data.items[0]?.memberId ?? ""));
    }
    setState("ready");
  }, [filters, orgId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visibleIds = useMemo(() => new Set((data?.items ?? []).map((row) => row.consultantId)), [data]);
  const change = (patch: Partial<AssignmentsState>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 0 }));
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const undo = async (result: BulkResult) => {
    const rows = undoRows(result.results);
    if (!rows.length) return;
    const restored = await mgmtApi.assignmentAction(orgId, "restore", { rows });
    if (restored.kind === "OK") toast({ title: "Assignment change undone", variant: "success" });
    else toast({ title: "Couldn't undo the assignment change", variant: "error" });
    await load();
  };

  const showResult = async (result: Awaited<ReturnType<typeof mgmtApi.assignmentAction>>, verb: string) => {
    if (result.kind !== "OK") {
      toast({ title: `Couldn't ${verb}`, description: result.kind === "FAILED" ? result.message : "You no longer have access to this team." , variant: "error" });
      return;
    }
    const summary = bulkSummary(result.data, verb);
    const canUndo = undoRows(result.data.results).length > 0;
    toast({ ...summary, duration: canUndo ? 8000 : 4000, action: canUndo ? { label: "Undo", onClick: () => void undo(result.data) } : undefined });
    setSelected(new Set());
    await load();
  };

  const act = async (action: "assign" | "unassign") => {
    const ids = [...selected].filter((id) => visibleIds.has(id));
    if (!ids.length || (action === "assign" && !target)) return;
    setBusy(true);
    const result = await mgmtApi.assignmentAction(orgId, action, action === "assign" ? { consultantIds: ids, marketerMemberId: Number(target) } : { consultantIds: ids, reason: "Manager update" });
    setBusy(false);
    await showResult(result, action === "assign" ? "assign" : "unassign");
  };

  const update = async (ids: number[], body: Record<string, unknown>, verb: string) => {
    if (!ids.length) return;
    setBusy(true);
    const result = await mgmtApi.assignmentAction(orgId, "update", { consultantIds: ids, ...body });
    setBusy(false);
    await showResult(result, verb);
  };

  const backupIds = backupFor ?? [];
  const applyBackup = async () => {
    if (!backupIds.length || !backupTarget) return;
    setBackupFor(null);
    await update(backupIds, { backupMemberId: Number(backupTarget) }, "set a backup");
  };

  if (state === "denied") return <div data-mgmt-assignments data-status={state}><EmptyManager title="This page isn't part of your role" description="Ask an organization admin if you should see consultant assignments." /></div>;
  const options = [{ value: "", label: "Assign selected to..." }, ...(team?.items ?? []).map((member) => ({ value: String(member.memberId), label: member.name }))];

  return <div data-mgmt-assignments data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Consultant Assignments" subtitle="Keep the team's consultants with the right marketer and backup." /><Toolbar><div className="flex min-w-0 flex-1 flex-wrap gap-2"><TextInput label="Search consultants" value={filters.q} onChange={(q) => change({ q })} placeholder="Search consultants" /><div className="w-36"><Select aria-label="Assignment status" value={filters.status} onChange={(status) => change({ status })} options={STATUS_OPTIONS} /></div><div className="w-36"><Select aria-label="Assignment priority" value={filters.priority} onChange={(priority) => change({ priority })} options={PRIORITY_OPTIONS} /></div><div className="w-40"><Select aria-label="Availability" value={filters.availability} onChange={(availability) => change({ availability })} options={AVAILABILITY_OPTIONS} /></div><label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink"><input type="checkbox" checked={filters.noBackup} onChange={(event) => change({ noBackup: event.target.checked })} /> No backup</label></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{state === "failed" ? <EmptyManager title="Assignments couldn't load" description="The assignments didn't load. Nothing has changed." action={<Button type="button" variant="accent" size="sm" onClick={() => void load()}>Try again</Button>} /> : null}{state === "loading" && !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : data && data.items.length === 0 ? <EmptyManager title="No consultants found" description={filters.q ? "Try a different search or clear the filters." : "Consultants appear here when they are in the organization's marketing scope."} action={hrefs.team ? <a href={hrefs.team} className="font-semibold text-accent-deep hover:underline">Review the team</a> : null} /> : data ? <><section className={SOFT_CARD}><div className="mb-3 flex flex-wrap items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-violet-soft text-v2-violet-ink"><HandshakeIcon size={18} /></span><h2 className="mr-auto text-[16.5px] font-bold text-ink">Team consultants <span className="font-semibold text-ink-soft">({data.total})</span></h2><div className="w-52"><Select aria-label="Assign selected to" value={target} onChange={setTarget} options={options} /></div><Button type="button" size="sm" variant="accent" disabled={busy || selected.size === 0 || !target} onClick={() => void act("assign")}>Assign selected ({selected.size})</Button><Button type="button" size="sm" variant="ghost" disabled={busy || selected.size === 0} onClick={() => void act("unassign")}>Unassign</Button></div><div className={TABLE_WRAP}><table className={TABLE}><thead><tr className="bg-paper-2 text-[12px] text-ink-soft"><th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Select all consultants" checked={data.items.length > 0 && data.items.every((row) => selected.has(row.consultantId))} onChange={(event) => setSelected(event.target.checked ? new Set(data.items.map((row) => row.consultantId)) : new Set())} /></th><th className="px-3 py-2.5">Consultant</th><th className="px-3 py-2.5">Assigned marketer</th><th className="px-3 py-2.5">Backup</th><th className="px-3 py-2.5">Priority</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Applications</th><th className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map((row) => <tr key={row.consultantId} className="border-b border-line last:border-0"><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.consultantId)} onChange={() => toggle(row.consultantId)} /></td><td className="px-3 py-3"><Person name={row.name} subtitle={row.jobTitle} /></td><td className="px-3">{row.marketer ? <Person name={row.marketer.name} avatar={false} /> : <span className="text-muted">Unassigned</span>}</td><td className="px-3">{row.backup ? <Person name={row.backup.name} avatar={false} /> : <span className="text-muted">—</span>}</td><td className="px-3">{row.priority ? <StatusBadge value={row.priority} /> : "—"}</td><td className="px-3">{row.status ? <StatusBadge value={row.status} /> : "—"}</td><td className="px-3 font-semibold text-ink">{row.activeApps}</td><td className="px-3 text-right"><Menu trigger={<Button type="button" size="sm" variant="ghost" aria-label={`Actions for ${row.name}`}>Actions</Button>} items={[{ label: "Set backup marketer…", onSelect: () => setBackupFor([row.consultantId]) }, { label: "Remove backup", disabled: !row.backup, onSelect: () => void update([row.consultantId], { clearBackup: true }, "remove the backup") }, { separator: true }, { heading: "Priority" }, ...(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => ({ label: priority[0] + priority.slice(1).toLowerCase(), onSelect: () => void update([row.consultantId], { priority }, "update priority") })), { separator: true }, { label: row.status === "PAUSED" ? "Resume" : "Pause", onSelect: () => void update([row.consultantId], { status: row.status === "PAUSED" ? "ACTIVE" : "PAUSED" }, row.status === "PAUSED" ? "resume" : "pause") }, { label: "Unassign", danger: true, onSelect: () => void actFor([row.consultantId], "unassign") }]} /></td></tr>)}</tbody></table></div></section><TalentPagination page={data.page} size={data.size} total={data.total} sizes={[10, 20, 50, 100]} showing={`Showing ${data.total === 0 ? 0 : data.page * data.size + 1}-${Math.min(data.total, (data.page + 1) * data.size)} of ${data.total} consultants`} onPage={(page) => change({ page })} onSize={(size) => change({ page: 0, size })} /></> : null}<Dialog open={backupFor !== null} onClose={() => setBackupFor(null)} title="Set backup marketer" description="Choose a backup for the selected consultant(s)." footer={<><Button type="button" variant="ghost" onClick={() => setBackupFor(null)}>Cancel</Button><Button type="button" variant="accent" disabled={!backupTarget || busy} onClick={() => void applyBackup()}>Save backup</Button></>}><Select aria-label="Backup marketer" value={backupTarget} onChange={setBackupTarget} options={[{ value: "", label: "Choose a marketer" }, ...(team?.items ?? []).map((member) => ({ value: String(member.memberId), label: member.name }))]} /></Dialog></div>;

  async function actFor(ids: number[], action: "unassign") {
    setBusy(true);
    const result = await mgmtApi.assignmentAction(orgId, action, { consultantIds: ids, reason: "Manager update" });
    setBusy(false);
    await showResult(result, "unassign");
  }
}
