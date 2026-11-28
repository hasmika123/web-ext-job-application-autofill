"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorState, MemberAvatar, SideSheet, Skeleton, Sparkline, UsersIcon, useNarrow } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type TeamMember, type TeamPage, type TeamRow } from "@/lib/ent/mgmt-ws/api";
import { Empty, EmptyManager, LoadMeter, Person, SOFT_CARD, StatusBadge, TABLE, TABLE_WRAP, TextInput, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function TeamPage({ orgId }: MgmtPageProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [sort, setSort] = useState("load");
  const [page, setPage] = useState<TeamPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<number | null>(null);
  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const result = await mgmtApi.team(orgId, { q: query.length >= 2 ? query : undefined, status: statusFilter, sort });
    if (result.kind === "OK") {
      setPage(result.data);
      setState("ready");
    } else if (result.kind === "DENIED") setState("denied");
    else setState("failed");
  }, [orgId, query, sort, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state === "denied") return <ErrorState what="the team" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-team data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5">
    <PageHeader title="Team" subtitle="See each marketer's load, open items, and recent activity." />
    <Toolbar><div className="flex min-w-0 flex-1 flex-wrap gap-2"><TextInput label="Search team" value={query} onChange={setQuery} placeholder="Search name or title" /><label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 text-[13px] text-muted"><span className="sr-only">Status</span><select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-transparent py-2 text-ink outline-none"><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ALL">All statuses</option></select></label><label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 text-[13px] text-muted"><span className="sr-only">Sort</span><select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)} className="bg-transparent py-2 text-ink outline-none"><option value="load">Load</option><option value="name">Name</option><option value="approvals">Approvals</option><option value="escalations">Escalations</option><option value="activity">Last active</option></select></label></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>
    {state === "failed" ? <ErrorState what="the team" description="The team didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}
    {state === "loading" && !page ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : page && page.items.length === 0 ? <EmptyManager title="No marketers found" description={query ? "Try a different search or clear the filters." : "Add marketers to your organization before building the team."} /> : page ? <TeamTable rows={page.items} onSelect={setSelected} /> : null}
    <TeamMemberSheet orgId={orgId} memberId={selected} onClose={() => setSelected(null)} onSaved={() => void load()} />
  </div>;
}

function TeamTable({ rows, onSelect }: { rows: TeamRow[]; onSelect: (id: number) => void }) {
  return <section className={SOFT_CARD} aria-label="Marketing team"><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent-soft text-accent-deep"><UsersIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">Marketing team <span className="font-semibold text-ink-soft">({rows.length})</span></h2></div><div className={TABLE_WRAP}><table className={TABLE}><thead><tr className="bg-paper-2 text-[12px] text-ink-soft"><th className="px-3 py-2.5">Marketer</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Load</th><th className="px-3 py-2.5">Approvals</th><th className="px-3 py-2.5">Escalations</th><th className="px-3 py-2.5">Last active</th><th className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.memberId} className="border-b border-line last:border-0"><td className="px-3 py-3"><button type="button" onClick={() => onSelect(row.memberId)} className="text-left"><Person name={row.name} subtitle={row.title || null} /></button></td><td className="px-3"><StatusBadge value={row.status} /></td><td className="px-3"><LoadMeter assigned={row.assigned} capacity={row.capacity} percent={row.percent} overloaded={row.overloaded} label={`${row.name} workload`} /></td><td className="px-3 font-semibold text-ink">{row.openApprovals}</td><td className="px-3 font-semibold text-ink">{row.openEscalations}</td><td className="px-3 text-[12.5px] text-muted">{row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}</td><td className="px-3 text-right"><Button type="button" size="sm" variant="ghost" onClick={() => onSelect(row.memberId)}>View</Button></td></tr>)}</tbody></table></div></section>;
}

function TeamMemberSheet({ orgId, memberId, onClose, onSaved }: { orgId: number; memberId: number | null; onClose: () => void; onSaved: () => void }) {
  const narrow = useNarrow();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [detail, setDetail] = useState<TeamMember | null>(null);
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (memberId === null) return;
    void mgmtApi.teamMember(orgId, memberId).then((result) => {
      if (result.kind === "OK") {
        setDetail(result.data);
        setCapacity(String(result.data.row.capacity));
      }
    });
  }, [memberId, orgId]);
  const save = async (body: { capacity?: number; status?: string }) => {
    if (!memberId) return;
    setBusy(true);
    const result = await mgmtApi.updateTeam(orgId, memberId, body);
    setBusy(false);
    if (result.kind === "OK") {
      setDetail((current) => current ? { ...current, row: { ...current.row, ...result.data, status: result.data.status || current.row.status, capacity: result.data.capacity || current.row.capacity } } : current);
      onSaved();
    }
  };
  return <SideSheet id="mgmt-team-member" side="right" mode={narrow ? "fullscreen" : "overlay"} open={memberId !== null} title={detail?.row.name ?? "Team member"} description={detail?.row.title ?? "Marketing team member"} onClose={onClose} returnFocusTo={trigger}>
    {!detail ? <Skeleton className="h-64 w-full" /> : <div className="flex flex-col gap-5"><div className="flex items-center gap-3"><MemberAvatar name={detail.row.name} size={48} /><div><h2 className="text-lg font-bold text-ink">{detail.row.name}</h2><p className="text-[13px] text-muted">{detail.row.title || "Marketing specialist"}</p></div><StatusBadge value={detail.row.status} /></div><div className="rounded-xl bg-paper-2 p-3"><div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink"><span>Capacity</span><span>{detail.row.assigned} / {detail.row.capacity}</span></div><LoadMeter assigned={detail.row.assigned} capacity={detail.row.capacity} percent={detail.row.percent} overloaded={detail.row.overloaded} label={`${detail.row.name} capacity`} /><div className="mt-3 flex gap-2"><input aria-label="Capacity" type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} className="w-24 rounded-lg border border-line bg-paper px-2.5 py-2 text-[13px] text-ink" /><Button type="button" size="sm" variant="accent" disabled={busy || !capacity} onClick={() => void save({ capacity: Number(capacity) })}>Save capacity</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ status: detail.row.status === "PAUSED" ? "ACTIVE" : "PAUSED" })}>{detail.row.status === "PAUSED" ? "Resume" : "Pause"}</Button></div></div><section><h3 className="mb-2 text-[14px] font-bold text-ink">Eight-week activity</h3>{detail.weeks.length > 1 ? <Sparkline values={detail.weeks.map((week) => week.assigned)} color="var(--color-accent)" /> : <p className="text-[13px] text-muted">No weekly activity yet.</p>}</section><section><h3 className="mb-2 text-[14px] font-bold text-ink">Consultants ({detail.consultants.length})</h3>{detail.consultants.length === 0 ? <Empty>No consultants are assigned to this marketer.</Empty> : <ul className="divide-y divide-line">{detail.consultants.slice(0, 8).map((consultant) => <li key={consultant.consultantId} className="flex items-center justify-between gap-2 py-2 text-[13px]"><span>{consultant.name}{consultant.backup ? <span className="ml-2 text-[11px] text-muted">Backup</span> : null}</span><StatusBadge value={consultant.priority || consultant.status} /></li>)}</ul>}</section></div>}
  </SideSheet>;
}
