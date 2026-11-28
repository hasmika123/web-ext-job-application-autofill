"use client";

/* eslint-disable react-hooks/set-state-in-effect -- effects start the escalation read and hydrate the detail sheet. */

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, Button, ErrorState, SideSheet, Skeleton, useNarrow, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type Escalation, type EscalationPage } from "@/lib/ent/mgmt-ws/api";
import { Empty, EmptyManager, Person, SeverityBadge, Since, SOFT_CARD, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

type Tab = "OPEN" | "SNOOZED" | "RESOLVED";

export default function EscalationsPage({ orgId }: MgmtPageProps) {
  const [tab, setTab] = useState<Tab>("OPEN");
  const [page, setPage] = useState<EscalationPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<Escalation | null>(null);
  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const result = await mgmtApi.escalations(orgId, { status: tab, page: 0, size: 50 });
    if (result.kind === "OK") {
      setPage(result.data);
      setState("ready");
    } else if (result.kind === "DENIED") setState("denied");
    else setState("failed");
  }, [orgId, tab]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (state === "denied") return <ErrorState what="escalations" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-escalations data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Escalations" subtitle="Resolve stalled work and keep the team moving." /><Toolbar><div className="inline-flex rounded-[10px] border border-line bg-paper p-0.5" role="tablist" aria-label="Escalation status">{(["OPEN", "SNOOZED", "RESOLVED"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("min-h-9 rounded-[8px] px-3.5 text-[13px] font-semibold", tab === key ? "bg-accent text-white" : "text-ink-soft")}>{key[0] + key.slice(1).toLowerCase()}</button>)}</div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{state === "failed" ? <ErrorState what="escalations" description="The escalation queue didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !page ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : page && page.items.length === 0 ? <EmptyManager title={tab === "OPEN" ? "No open escalations" : `No ${tab.toLowerCase()} escalations`} description={tab === "OPEN" ? "The team has no outstanding escalations right now." : "Escalations will appear here when their state changes."} /> : page ? <section className={SOFT_CARD}><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-pink-soft text-v2-pink-ink"><AlertIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">{tab === "OPEN" ? "Open escalations" : `${tab[0] + tab.slice(1).toLowerCase()} escalations`} <span className="font-semibold text-ink-soft">({page.total})</span></h2></div><ul className="divide-y divide-line">{page.items.map((item) => <li key={item.id} className="flex items-center gap-3 py-3"><SeverityBadge value={item.severity} /><span className="min-w-0 flex-1"><button type="button" onClick={() => setSelected(item)} className="block max-w-full truncate text-left text-[13.5px] font-semibold text-ink hover:text-accent-deep">{item.title}</button><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted"><span>{item.consultant?.name ?? "Consultant"}</span><span>·</span><span>{item.marketer?.name ?? "Unassigned"}</span><span>·</span><Since value={item.raisedAt} /></span></span><span className="hidden text-[12px] text-muted sm:block">{item.ageHours}h old</span><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(item)}>View</Button></li>)}</ul></section> : null}<EscalationSheet orgId={orgId} escalation={selected} onClose={() => setSelected(null)} onChanged={() => void load()} /></div>;
}

function EscalationSheet({ orgId, escalation, onClose, onChanged }: { orgId: number; escalation: Escalation | null; onClose: () => void; onChanged: () => void }) {
  const narrow = useNarrow();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(""), [escalation?.id]);
  const action = async (kind: "acknowledge" | "snooze" | "resolve" | "dismiss" | "reopen" | "comment") => {
    if (!escalation) return;
    setBusy(true);
    const body = kind === "snooze" ? { until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } : kind === "resolve" ? { resolution: note } : kind === "dismiss" || kind === "comment" ? { note } : {};
    await mgmtApi.escalationAction(orgId, escalation.id, kind, body);
    setBusy(false);
    if (kind !== "comment") onClose();
    onChanged();
  };
  const open = escalation?.status === "OPEN" || escalation?.status === "ACKNOWLEDGED";
  return <SideSheet id="mgmt-escalation-detail" side="right" mode={narrow ? "fullscreen" : "overlay"} open={escalation !== null} title={escalation?.title ?? "Escalation"} description={escalation?.detail ?? undefined} onClose={onClose}><div className="flex flex-col gap-5">{escalation ? <><div className="flex items-center justify-between gap-2"><SeverityBadge value={escalation.severity} /><span className="text-[12px] text-muted">{escalation.status.toLowerCase()}</span></div><div className="grid gap-2 text-[13px]"><Person name={escalation.consultant?.name ?? "Consultant"} subtitle={escalation.marketer ? `Marketer: ${escalation.marketer.name}` : "No marketer assigned"} /><p className="text-[12.5px] text-muted">Raised {new Date(escalation.raisedAt).toLocaleString("en-US")} · {escalation.ageHours} hours old</p></div><section><h3 className="mb-2 text-[14px] font-bold text-ink">Trail</h3>{escalation.events.length === 0 ? <Empty>No trail entries yet.</Empty> : <ol className="divide-y divide-line">{escalation.events.map((event) => <li key={event.id} className="py-2 text-[12.5px]"><span className="font-semibold text-ink">{event.kind.toLowerCase()}</span><span className="ml-2 text-muted">{event.actor?.name ?? "System"} · {new Date(event.at).toLocaleString("en-US")}</span>{event.note ? <p className="mt-1 text-ink-soft">{event.note}</p> : null}</li>)}</ol>}</section>{open ? <><textarea aria-label="Escalation note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Add a note when resolving, dismissing, or commenting" className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" /><div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void action("acknowledge")}>Acknowledge</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void action("snooze")}>Snooze 1 day</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void action("dismiss")}>Dismiss</Button><Button type="button" size="sm" variant="accent" disabled={busy || !note.trim()} onClick={() => void action("resolve")}>Resolve</Button><Button type="button" size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={() => void action("comment")}>Comment</Button></div></> : <Button type="button" size="sm" variant="accent" disabled={busy} onClick={() => void action("reopen")}>Reopen</Button>}</> : <Empty>No escalation selected.</Empty>}</div></SideSheet>;
}
