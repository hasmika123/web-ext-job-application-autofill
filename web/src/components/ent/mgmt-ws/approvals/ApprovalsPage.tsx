"use client";

/* eslint-disable react-hooks/set-state-in-effect -- effect starts the approvals read. */

import { useCallback, useEffect, useState } from "react";
import { Button, CheckCircleIcon, ErrorState, SideSheet, Skeleton, useNarrow, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type Approval, type ApprovalPage } from "@/lib/ent/mgmt-ws/api";
import { Empty, EmptyManager, SOFT_CARD, StatusBadge, Since, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function ApprovalsPage({ orgId }: MgmtPageProps) {
  const [tab, setTab] = useState<"PENDING" | "DECIDED">("PENDING");
  const [page, setPage] = useState<ApprovalPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<Approval | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const result = await mgmtApi.approvals(orgId, { status: tab, page: 0, size: 50 });
    if (result.kind === "OK") {
      setPage(result.data);
      setChecked(new Set());
      setState("ready");
    } else if (result.kind === "DENIED") setState("denied");
    else setState("failed");
  }, [orgId, tab]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const decide = async (approval: Approval, decision: "approve" | "reject", note = "") => {
    setBusy(true);
    await mgmtApi.decide(orgId, approval.id, decision, note);
    setBusy(false);
    setSelected(null);
    await load();
  };
  const bulkApprove = async () => {
    const rows = page?.items.filter((item) => checked.has(item.id)) ?? [];
    if (!rows.length) return;
    setBusy(true);
    await Promise.all(rows.map((item) => mgmtApi.decide(orgId, item.id, "approve", "")));
    setBusy(false);
    await load();
  };
  if (state === "denied") return <ErrorState what="approvals" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-approvals data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Approvals" subtitle="Decide the preparation steps that need a manager's eye." /><Toolbar><div className="inline-flex rounded-[10px] border border-line bg-paper p-0.5" role="tablist" aria-label="Approval status"><button type="button" role="tab" aria-selected={tab === "PENDING"} onClick={() => setTab("PENDING")} className={cn("min-h-9 rounded-[8px] px-3.5 text-[13px] font-semibold", tab === "PENDING" ? "bg-accent text-white" : "text-ink-soft")}>Pending</button><button type="button" role="tab" aria-selected={tab === "DECIDED"} onClick={() => setTab("DECIDED")} className={cn("min-h-9 rounded-[8px] px-3.5 text-[13px] font-semibold", tab === "DECIDED" ? "bg-accent text-white" : "text-ink-soft")}>Decided</button></div><div className="flex gap-2"><Button type="button" size="sm" variant="accent" disabled={busy || checked.size === 0 || tab !== "PENDING"} onClick={() => void bulkApprove()}>Approve selected ({checked.size})</Button><Button type="button" size="sm" variant="ghost" onClick={() => void load()}>Refresh</Button></div></Toolbar>{state === "failed" ? <ErrorState what="approvals" description="The approval queue didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !page ? <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" /> : page && page.items.length === 0 ? <EmptyManager title={tab === "PENDING" ? "Nothing waiting for approval" : "No decisions yet"} description={tab === "PENDING" ? "New preparation requests will appear here." : "Decided requests will remain visible here for the team record."} /> : page ? <section className={SOFT_CARD}><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-v2-green-soft text-v2-green-ink"><CheckCircleIcon size={18} /></span><h2 className="text-[16.5px] font-bold text-ink">{tab === "PENDING" ? "Pending requests" : "Decision history"} <span className="font-semibold text-ink-soft">({page.total})</span></h2></div><ul className="divide-y divide-line">{page.items.map((item) => <li key={item.id} className="flex items-center gap-3 py-3"><input type="checkbox" aria-label={`Select ${item.title}`} checked={checked.has(item.id)} disabled={tab !== "PENDING"} onChange={() => setChecked((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} /><span className="min-w-0 flex-1"><button type="button" onClick={() => setSelected(item)} className="block max-w-full truncate text-left text-[13.5px] font-semibold text-ink hover:text-accent-deep">{item.title}</button><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted"><span>{item.kind.replaceAll("_", " ")}</span><span>·</span><span>{item.requestedBy?.name ?? "Team member"}</span><span>·</span><Since value={item.requestedAt} /></span></span><StatusBadge value={item.status} /><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(item)}>View</Button></li>)}</ul></section> : null}<ApprovalSheet approval={selected} busy={busy} onClose={() => setSelected(null)} onDecision={(decision, note) => selected ? void decide(selected, decision, note) : undefined} /></div>;
}

function ApprovalSheet({ approval, busy, onClose, onDecision }: { approval: Approval | null; busy: boolean; onClose: () => void; onDecision: (decision: "approve" | "reject", note: string) => void }) {
  const narrow = useNarrow();
  const [note, setNote] = useState("");
  useEffect(() => setNote(approval?.decisionNote ?? ""), [approval]);
  return <SideSheet id="mgmt-approval-detail" side="right" mode={narrow ? "fullscreen" : "overlay"} open={approval !== null} title={approval?.title ?? "Approval"} description={approval ? `${approval.kind.replaceAll("_", " ")} · requested by ${approval.requestedBy?.name ?? "team member"}` : undefined} onClose={onClose}><div className="flex flex-col gap-5">{approval ? <><div className="rounded-xl bg-paper-2 p-3"><div className="flex items-center justify-between gap-2"><StatusBadge value={approval.status} /><Since value={approval.requestedAt} /></div>{approval.note ? <p className="mt-3 text-[13px] text-ink-soft">{approval.note}</p> : null}</div><div><label htmlFor="approval-note" className="mb-1.5 block text-[13px] font-semibold text-ink">Decision note</label><textarea id="approval-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={300} placeholder="Optional for approval; required for rejection" className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" /></div>{approval.status === "PENDING" ? <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => onDecision("reject", note)}>Reject</Button><Button type="button" variant="accent" disabled={busy} onClick={() => onDecision("approve", note)}>Approve</Button></div> : <p className="text-[12.5px] text-muted">{approval.decidedBy ? `Decided by ${approval.decidedBy.name}.` : "This request is no longer pending."}</p>}</> : <Empty>No approval selected.</Empty>}</div></SideSheet>;
}
