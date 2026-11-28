"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ErrorState, HandshakeIcon, Skeleton } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type AssignmentsPage as AssignmentsData, type TeamPage } from "@/lib/ent/mgmt-ws/api";
import { EmptyManager, Person, SOFT_CARD, StatusBadge, TABLE, TABLE_WRAP, TextInput, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function AssignmentsPage({ orgId, hrefs }: MgmtPageProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<AssignmentsData | null>(null);
  const [team, setTeam] = useState<TeamPage | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const [rows, marketers] = await Promise.all([mgmtApi.assignments(orgId, { q: query.length >= 2 ? query : undefined, status: status || undefined, page: 0, size: 50 }), mgmtApi.team(orgId, { status: "ACTIVE", size: 100 })]);
    if (rows.kind === "DENIED" || marketers.kind === "DENIED") {
      setState("denied");
      return;
    }
    if (rows.kind !== "OK") {
      setState("failed");
      return;
    }
    setData(rows.data);
    if (marketers.kind === "OK") {
      setTeam(marketers.data);
      setTarget((current) => current || String(marketers.data.items[0]?.memberId ?? ""));
    }
    setState("ready");
  }, [orgId, query, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visibleIds = useMemo(() => new Set((data?.items ?? []).map((row) => row.consultantId)), [data]);
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const act = async (action: "assign" | "unassign") => {
    const ids = [...selected].filter((id) => visibleIds.has(id));
    if (!ids.length || (action === "assign" && !target)) return;
    setBusy(true);
    await mgmtApi.assignmentAction(orgId, action, action === "assign" ? { consultantIds: ids, marketerMemberId: Number(target) } : { consultantIds: ids });
    setSelected(new Set());
    setBusy(false);
    await load();
  };

  if (state === "denied") return <ErrorState what="consultant assignments" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-assignments data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Consultant Assignments" subtitle="Keep the team's consultants with the right marketer and backup." /><Toolbar><div className="flex min-w-0 flex-1 flex-wrap gap-2"><TextInput label="Search consultants" value={query} onChange={setQuery} placeholder="Search consultants" /><label className="flex items-center rounded-lg border border-line bg-paper px-3 text-[13px] text-muted"><span className="sr-only">Assignment status</span><select aria-label="Assignment status" value={status} onChange={(event) => setStatus(event.target.value)} className="bg-transparent py-2 text-ink outline-none"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></label></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{state === "failed" ? <ErrorState what="consultant assignments" description="The assignments didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : data && data.items.length === 0 ? <EmptyManager title="No consultants found" description={query ? "Try a different search or clear the filters." : "Consultants appear here when they are in the organization's marketing scope."} action={hrefs.team ? <a href={hrefs.team} className="font-semibold text-accent-deep hover:underline">Review the team</a> : null} /> : data ? <section className={SOFT_CARD}><div className="mb-3 flex flex-wrap items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-violet-soft text-v2-violet-ink"><HandshakeIcon size={18} /></span><h2 className="mr-auto text-[16.5px] font-bold text-ink">Team consultants <span className="font-semibold text-ink-soft">({data.total})</span></h2><label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 text-[13px] text-muted"><span className="sr-only">Assign selected to</span><select aria-label="Assign selected to" value={target} onChange={(event) => setTarget(event.target.value)} className="bg-transparent py-2 text-ink outline-none"><option value="">Assign selected to...</option>{team?.items.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}</select></label><Button type="button" size="sm" variant="accent" disabled={busy || selected.size === 0 || !target} onClick={() => void act("assign")}>Assign selected ({selected.size})</Button><Button type="button" size="sm" variant="ghost" disabled={busy || selected.size === 0} onClick={() => void act("unassign")}>Unassign</Button></div><div className={TABLE_WRAP}><table className={TABLE}><thead><tr className="bg-paper-2 text-[12px] text-ink-soft"><th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Select all consultants" checked={data.items.length > 0 && data.items.every((row) => selected.has(row.consultantId))} onChange={(event) => setSelected(event.target.checked ? new Set(data.items.map((row) => row.consultantId)) : new Set())} /></th><th className="px-3 py-2.5">Consultant</th><th className="px-3 py-2.5">Assigned marketer</th><th className="px-3 py-2.5">Priority</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Applications</th><th className="px-3 py-2.5">Last activity</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.consultantId} className="border-b border-line last:border-0"><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.consultantId)} onChange={() => toggle(row.consultantId)} /></td><td className="px-3 py-3"><Person name={row.name} subtitle={row.jobTitle} /></td><td className="px-3">{row.marketer ? <Person name={row.marketer.name} avatar={false} /> : <span className="text-muted">Unassigned</span>}</td><td className="px-3">{row.priority ? <StatusBadge value={row.priority} /> : "—"}</td><td className="px-3">{row.status ? <StatusBadge value={row.status} /> : "—"}</td><td className="px-3 font-semibold text-ink">{row.activeApps}</td><td className="px-3 text-[12px] text-muted">{row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No activity"}</td></tr>)}</tbody></table></div></section> : null}</div>;
}
