"use client";

/* eslint-disable react-hooks/set-state-in-effect -- effects start the escalation read and hydrate the detail sheet. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertIcon, Button, ErrorState, Input, Select, SideSheet, Skeleton, useNarrow, useToast, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import { mgmtApi, type Escalation, type EscalationPage, type TeamPage } from "@/lib/ent/mgmt-ws/api";
import { parseEscalationState, writeManagerSearch, type EscalationState } from "@/lib/ent/mgmt-ws/state";
import { Empty, EmptyManager, Person, SeverityBadge, Since, SOFT_CARD, TextInput, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

const SEVERITY_OPTIONS = [{ value: "", label: "All severities" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }];
const KIND_OPTIONS = [{ value: "", label: "All kinds" }, { value: "STALLED_OPPORTUNITY", label: "Stalled opportunity" }, { value: "OVERDUE_FOLLOWUP", label: "Overdue follow-up" }, { value: "UNANSWERED_QUESTION", label: "Unanswered question" }, { value: "OVERLOADED_MARKETER", label: "Overloaded marketer" }, { value: "MANUAL", label: "Manual" }, { value: "APPROVAL_AGING", label: "Aging approval" }];

export default function EscalationsPage({ orgId, initialSearch }: MgmtPageProps) {
  const [filters, setFilters] = useState<EscalationState>(() => parseEscalationState(initialSearch));
  const [page, setPage] = useState<EscalationPage | null>(null);
  const [team, setTeam] = useState<TeamPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<Escalation | null>(null);

  useEffect(() => {
    writeManagerSearch({ tab: filters.tab === "OPEN" ? null : filters.tab, severity: filters.severity || null, kind: filters.kind || null, marketer: filters.marketer || null, consultant: filters.consultant || null, q: filters.q || null, page: filters.page, size: filters.size === 20 ? null : filters.size });
  }, [filters]);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const [rows, marketers] = await Promise.all([
      mgmtApi.escalations(orgId, { status: filters.tab, severity: filters.severity || undefined, kind: filters.kind || undefined, marketer: filters.marketer || undefined, consultant: filters.consultant || undefined, q: filters.q.length >= 2 ? filters.q : undefined, page: filters.page, size: filters.size }),
      mgmtApi.team(orgId, { status: "ACTIVE", size: 100 }),
    ]);
    if (rows.kind === "DENIED" || marketers.kind === "DENIED") return setState("denied");
    if (rows.kind !== "OK") return setState("failed");
    setPage(rows.data);
    if (marketers.kind === "OK") setTeam(marketers.data);
    setState("ready");
  }, [filters, orgId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const change = (patch: Partial<EscalationState>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 0 }));
  const consultantOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    for (const item of page?.items ?? []) {
      if (item.consultant) options.set(String(item.consultant.id), { value: String(item.consultant.id), label: item.consultant.name });
    }
    return [{ value: "", label: "All consultants" }, ...options.values()];
  }, [page]);
  if (state === "denied") return <ErrorState what="escalations" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-escalations data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Escalations" subtitle="Resolve stalled work and keep the team moving." /><Toolbar><div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-[10px] border border-line bg-paper p-0.5" role="tablist" aria-label="Escalation status">{(["OPEN", "SNOOZED", "RESOLVED"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={filters.tab === key} onClick={() => change({ tab: key })} className={cn("min-h-9 rounded-[8px] px-3.5 text-[13px] font-semibold", filters.tab === key ? "bg-accent text-white" : "text-ink-soft")}>{key[0] + key.slice(1).toLowerCase()}</button>)}</div><div className="w-36"><Select aria-label="Escalation severity" value={filters.severity} onChange={(severity) => change({ severity })} options={SEVERITY_OPTIONS} /></div><div className="w-48"><Select aria-label="Escalation kind" value={filters.kind} onChange={(kind) => change({ kind })} options={KIND_OPTIONS} /></div><div className="w-44"><Select aria-label="Escalation marketer" value={filters.marketer} onChange={(marketer) => change({ marketer })} options={[{ value: "", label: "All marketers" }, ...(team?.items ?? []).map((member) => ({ value: String(member.memberId), label: member.name }))]} /></div><div className="w-44"><Select aria-label="Escalation consultant" value={filters.consultant} onChange={(consultant) => change({ consultant })} options={consultantOptions} /></div><TextInput label="Search escalations" value={filters.q} onChange={(q) => change({ q })} placeholder="Search title" /></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{state === "failed" ? <ErrorState what="escalations" description="The escalation queue didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !page ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : page && page.items.length === 0 ? <EmptyManager title={filters.tab === "OPEN" ? "No open escalations" : `No ${filters.tab.toLowerCase()} escalations`} description={filters.tab === "OPEN" ? "The team has no outstanding escalations right now." : "Escalations will appear here when their state changes."} /> : page ? <><section className={SOFT_CARD}><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-pink-soft text-v2-pink-ink"><AlertIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">{filters.tab === "OPEN" ? "Open escalations" : `${filters.tab[0] + filters.tab.slice(1).toLowerCase()} escalations`} <span className="font-semibold text-ink-soft">({page.total})</span></h2></div><ul className="divide-y divide-line">{page.items.map((item) => <li key={item.id} className="flex items-center gap-3 py-3"><SeverityBadge value={item.severity} /><span className="min-w-0 flex-1"><button type="button" onClick={() => setSelected(item)} className="block max-w-full truncate text-left text-[13.5px] font-semibold text-ink hover:text-accent-deep">{item.title}</button><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted"><span>{item.consultant?.name ?? "Consultant"}</span><span>·</span><span>{item.marketer?.name ?? "Unassigned"}</span><span>·</span><Since value={item.raisedAt} /></span></span><span className="hidden text-[12px] text-muted sm:block">{item.ageHours}h old</span><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(item)}>View</Button></li>)}</ul></section><TalentPagination page={page.page} size={page.size} total={page.total} sizes={[10, 20, 50, 100]} showing={`Showing ${page.total === 0 ? 0 : page.page * page.size + 1}-${Math.min(page.total, (page.page + 1) * page.size)} of ${page.total} escalations`} onPage={(next) => change({ page: next })} onSize={(size) => change({ page: 0, size })} /></> : null}<EscalationSheet orgId={orgId} escalation={selected} team={team} onClose={() => setSelected(null)} onChanged={() => void load()} /></div>;
}

function EscalationSheet({ orgId, escalation, team, onClose, onChanged }: { orgId: number; escalation: Escalation | null; team: TeamPage | null; onClose: () => void; onChanged: () => void }) {
  const narrow = useNarrow();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [snooze, setSnooze] = useState("1d");
  const [customDate, setCustomDate] = useState("");
  useEffect(() => { setNote(""); setAssignTo(""); setSnooze("1d"); setCustomDate(""); }, [escalation?.id]);
  const action = async (kind: "acknowledge" | "assign" | "snooze" | "resolve" | "dismiss" | "reopen" | "comment") => {
    if (!escalation) return;
    const escalationId = escalation.id;
    if (kind === "assign" && !assignTo) return;
    setBusy(true);
    const until = customDate ? new Date(`${customDate}T17:00:00`).toISOString() : new Date(Date.now() + ({ "1d": 1, "3d": 3, "1w": 7 }[snooze] ?? 1) * 24 * 60 * 60 * 1000).toISOString();
    const body = kind === "assign" ? { memberId: Number(assignTo) } : kind === "snooze" ? { until } : kind === "resolve" ? { resolution: note } : kind === "dismiss" || kind === "comment" ? { note } : {};
    const result = await mgmtApi.escalationAction(orgId, escalationId, kind, body);
    setBusy(false);
    if (result.kind === "OK") {
      if (kind === "resolve" || kind === "dismiss") toast({ title: kind === "resolve" ? "Escalation resolved" : "Escalation dismissed", duration: 8000, action: { label: "Undo", onClick: () => void reopen() } });
      if (kind !== "comment") onClose();
      onChanged();
    } else toast({ title: "Couldn't update escalation", description: result.kind === "FAILED" ? result.message : "The escalation is no longer available.", variant: "error" });
    async function reopen() {
      const undone = await mgmtApi.escalationAction(orgId, escalationId, "reopen");
      if (undone.kind === "OK") onChanged();
    }
  };
  const open = escalation?.status === "OPEN" || escalation?.status === "ACKNOWLEDGED";
  return <SideSheet id="mgmt-escalation-detail" side="right" mode={narrow ? "fullscreen" : "overlay"} open={escalation !== null} title={escalation?.title ?? "Escalation"} description={escalation?.detail ?? undefined} onClose={onClose}><div className="flex flex-col gap-5">{escalation ? <><div className="flex items-center justify-between gap-2"><SeverityBadge value={escalation.severity} /><span className="text-[12px] text-muted">{escalation.status.toLowerCase()}</span></div><div className="grid gap-2 text-[13px]"><Person name={escalation.consultant?.name ?? "Consultant"} subtitle={escalation.marketer ? `Marketer: ${escalation.marketer.name}` : "No marketer assigned"} /><p className="text-[12.5px] text-muted">Raised {new Date(escalation.raisedAt).toLocaleString("en-US")} · {escalation.ageHours} hours old</p></div><section><h3 className="mb-2 text-[14px] font-bold text-ink">Trail</h3>{escalation.events.length === 0 ? <Empty>No trail entries yet.</Empty> : <ol className="divide-y divide-line">{escalation.events.map((event) => <li key={event.id} className="py-2 text-[12.5px]"><span className="font-semibold text-ink">{event.kind.toLowerCase()}</span><span className="ml-2 text-muted">{event.actor?.name ?? "System"} · {new Date(event.at).toLocaleString("en-US")}</span>{event.note ? <p className="mt-1 text-ink-soft">{event.note}</p> : null}</li>)}</ol>}</section>{open ? <><div className="grid gap-2"><Select aria-label="Assign escalation to" value={assignTo} onChange={setAssignTo} options={[{ value: "", label: "Assign to…" }, ...(team?.items ?? []).map((member) => ({ value: String(member.memberId), label: member.name }))]} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy || !assignTo} onClick={() => void action("assign")}>Assign to…</Button><Select aria-label="Snooze duration" value={snooze} onChange={setSnooze} options={[{ value: "1d", label: "Snooze 1 day" }, { value: "3d", label: "Snooze 3 days" }, { value: "1w", label: "Snooze 1 week" }, { value: "custom", label: "Choose a date" }]} />{snooze === "custom" ? <Input aria-label="Snooze until" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} /> : null}<Button type="button" size="sm" variant="ghost" disabled={busy || (snooze === "custom" && !customDate)} onClick={() => void action("snooze")}>Snooze</Button></div></div><textarea aria-label="Escalation note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Add a note when resolving, dismissing, or commenting" className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" /><div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void action("acknowledge")}>Acknowledge</Button><Button type="button" size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={() => void action("dismiss")}>Dismiss</Button><Button type="button" size="sm" variant="accent" disabled={busy || !note.trim()} onClick={() => void action("resolve")}>Resolve</Button><Button type="button" size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={() => void action("comment")}>Comment</Button></div></> : <Button type="button" size="sm" variant="accent" disabled={busy} onClick={() => void action("reopen")}>Reopen</Button>}</> : <Empty>No escalation selected.</Empty>}</div></SideSheet>;
}
