"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, ErrorState, FilterIcon, Input, Select, SideSheet, Skeleton, useNarrow } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import { mgmtApi, type PipelineBoard, type PipelineCard, type PipelineSummary, type TeamPage } from "@/lib/ent/mgmt-ws/api";
import { parsePipelineState, writeManagerSearch, type PipelineState } from "@/lib/ent/mgmt-ws/state";
import { Empty, EmptyManager, StatusBadge, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

const RANGE_OPTIONS = [{ value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }];

export default function PipelineBoardPage({ orgId, initialSearch }: MgmtPageProps) {
  const [filters, setFilters] = useState<PipelineState>(() => parsePipelineState(initialSearch));
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [team, setTeam] = useState<TeamPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<PipelineCard | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);

  useEffect(() => {
    writeManagerSearch({ range: filters.range === 30 ? null : filters.range, stale: filters.stale || null, marketer: filters.marketer || null, consultant: filters.consultant || null, client: filters.client || null, page: filters.page, size: filters.size === 50 ? null : filters.size });
  }, [filters]);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const [b, s, marketers] = await Promise.all([
      mgmtApi.pipeline(orgId, { range: filters.range, stale: filters.stale || undefined, marketer: filters.marketer || undefined, consultant: filters.consultant || undefined, client: filters.client || undefined, page: filters.page, size: filters.size }),
      mgmtApi.pipelineSummary(orgId, filters.range),
      mgmtApi.team(orgId, { status: "ACTIVE", size: 100 }),
    ]);
    if (b.kind === "DENIED" || s.kind === "DENIED" || marketers.kind === "DENIED") return setState("denied");
    if (b.kind !== "OK" || s.kind !== "OK") return setState("failed");
    setBoard(b.data);
    setSummary(s.data);
    if (marketers.kind === "OK") setTeam(marketers.data);
    setState("ready");
  }, [filters, orgId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const change = (patch: Partial<PipelineState>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 0 }));
  const cards = useMemo(() => board?.columns.flatMap((column) => column.items) ?? [], [board]);
  const marketerOptions = [{ value: "", label: "All marketers" }, ...(team?.items ?? []).map((member) => ({ value: String(member.memberId), label: member.name }))];
  const consultantOptions = [{ value: "", label: "All consultants" }, ...uniqueOptions(cards.map((card) => ({ value: String(card.consultantId), label: card.consultant })))];
  const clientOptions = [{ value: "", label: "All clients" }, ...uniqueOptions(cards.map((card) => ({ value: String(card.clientId), label: card.client })))];

  if (state === "denied") return <ErrorState what="the pipeline" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-pipeline data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Pipeline" subtitle="See where the team's opportunities are moving and what has gone quiet." /><Toolbar><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft"><FilterIcon size={16} /> Filters</span><div className="w-40"><Select aria-label="Date range" value={String(filters.range)} onChange={(value) => change({ range: Number(value) as 30 | 90 })} options={RANGE_OPTIONS} /></div><div className="w-44"><Select aria-label="Marketer" value={filters.marketer} onChange={(marketer) => change({ marketer })} options={marketerOptions} /></div><div className="w-44"><Select aria-label="Consultant" value={filters.consultant} onChange={(consultant) => change({ consultant })} options={consultantOptions} /></div><div className="w-44"><Select aria-label="Client" value={filters.client} onChange={(client) => change({ client })} options={clientOptions} /></div><label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink"><input type="checkbox" checked={filters.stale} onChange={(event) => change({ stale: event.target.checked })} /> Stale only</label></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{summary ? <SummaryStrip summary={summary} /> : null}{state === "failed" ? <ErrorState what="the pipeline" description="The pipeline didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !board ? <Skeleton className="h-[500px] w-full rounded-[var(--radius-lg)]" /> : board?.empty || !board || board.columns.every((column) => column.items.length === 0) ? <EmptyManager title="No opportunities in the pipeline" description="When your team has opportunities in scope, their progress will appear here." /> : <><div className="overflow-x-auto pb-2" data-pipeline-board><div className="grid min-w-[1080px] grid-cols-8 gap-3">{board.columns.map((column) => <section key={column.key} className="min-h-[360px] rounded-[var(--radius-lg)] bg-paper-2 p-2.5"><header className="mb-2 flex items-center justify-between gap-2"><h2 className="text-[13px] font-bold text-ink">{column.label}</h2><span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-muted">{column.count}</span></header><div className="flex flex-col gap-2">{column.items.map((card) => <button key={card.id} type="button" onClick={() => setSelected(card)} className="rounded-[10px] border border-line bg-paper p-3 text-left shadow-[var(--shadow-xs)] transition hover:border-accent hover:shadow-[var(--shadow-sm)]"><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-[13px] font-semibold text-ink">{card.consultant}</p>{card.stale ? <span className="rounded-full bg-v2-pink-soft px-1.5 py-0.5 text-[10px] font-bold text-v2-pink-ink">Stale</span> : null}</div><p className="mt-1 truncate text-[12px] text-muted">{card.job}</p><p className="mt-2 truncate text-[11.5px] text-ink-soft">{card.client} · {card.marketer?.name ?? "Unassigned"}</p><div className="mt-2 flex items-center justify-between gap-2"><StatusBadge value={card.priority} /><span className="text-[11px] text-muted">{card.ageDays}d</span></div></button>)}</div></section>)}</div></div><TalentPagination page={board.page} size={board.size} total={board.total} sizes={[20, 50, 100]} showing={`Showing ${board.total === 0 ? 0 : board.page * board.size + 1}-${Math.min(board.total, (board.page + 1) * board.size)} of ${board.total} opportunities`} onPage={(page) => change({ page })} onSize={(size) => setFilters((current) => ({ ...current, page: 0, size }))} /></>}{selected ? <PipelineSheet card={selected} onClose={() => setSelected(null)} onEscalate={() => setRaiseOpen(true)} /> : null}<RaiseDialog key={selected?.id ?? "none"} orgId={orgId} card={selected} open={raiseOpen} onClose={() => setRaiseOpen(false)} /></div>;
}

function uniqueOptions(options: { value: string; label: string }[]) {
  return [...new Map(options.filter((option) => option.value !== "0").map((option) => [option.value, option])).values()];
}

function SummaryStrip({ summary }: { summary: PipelineSummary }) {
  return <section className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-line bg-paper p-3" aria-label="Pipeline summary"><span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-muted">Summary</span>{summary.columns.map((column) => <span key={column.key} className="rounded-full bg-paper-2 px-2.5 py-1 text-[11.5px] text-ink-soft">{column.label} <b className="text-ink">{column.count}</b></span>)}{summary.stale > 0 ? <span className="rounded-full bg-v2-pink-soft px-2.5 py-1 text-[11.5px] font-semibold text-v2-pink-ink">{summary.stale} stale</span> : null}</section>;
}

function PipelineSheet({ card, onClose, onEscalate }: { card: PipelineCard | null; onClose: () => void; onEscalate: () => void }) {
  const narrow = useNarrow();
  return <SideSheet id="mgmt-pipeline-detail" side="right" mode={narrow ? "fullscreen" : "overlay"} open={card !== null} title={card?.job ?? "Opportunity"} description={card ? `${card.client} · ${card.consultant}` : undefined} onClose={onClose}><div className="flex flex-col gap-5">{card ? <><div className="rounded-xl bg-paper-2 p-3"><p className="text-[12px] uppercase tracking-wide text-muted">Current stage</p><div className="mt-1 flex items-center justify-between gap-2"><StatusBadge value={card.column} /><span className="text-[12px] text-muted">{card.ageDays} days old</span></div></div><dl className="grid gap-3 text-[13px]"><div><dt className="text-muted">Consultant</dt><dd className="mt-1 font-semibold text-ink">{card.consultant}</dd></div><div><dt className="text-muted">Client</dt><dd className="mt-1 font-semibold text-ink">{card.client}</dd></div><div><dt className="text-muted">Marketer</dt><dd className="mt-1 font-semibold text-ink">{card.marketer?.name ?? "Unassigned"}</dd></div><div><dt className="text-muted">Last activity</dt><dd className="mt-1 font-semibold text-ink">{card.lastActivityAt ? new Date(card.lastActivityAt).toLocaleString("en-US") : "No activity recorded"}</dd></div></dl><p className="text-[12.5px] text-muted">This board remains read-only; changes belong in the marketer and consultant workflows.</p><Button type="button" variant="accent" size="sm" onClick={onEscalate}>Escalate to manager</Button></> : <Empty>No opportunity selected.</Empty>}</div></SideSheet>;
}

function RaiseDialog({ orgId, card, open, onClose }: { orgId: number; card: PipelineCard | null; open: boolean; onClose: () => void }) {
  const [severity, setSeverity] = useState("MEDIUM");
  const [title, setTitle] = useState(() => card ? `Manager help needed for ${card.job}` : "");
  const [detail, setDetail] = useState(() => card ? `${card.consultant} · ${card.client}` : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!card || !title.trim()) return;
    setBusy(true);
    const result = await mgmtApi.raiseEscalation(orgId, { kind: "MANUAL", severity, subjectType: "MKT_OPPORTUNITY", subjectId: card.id, title: title.trim(), detail: detail.trim() || undefined });
    setBusy(false);
    if (result.kind === "OK") {
      setMessage("Escalation sent to the manager queue.");
      window.setTimeout(onClose, 900);
    } else setMessage(result.kind === "FAILED" ? result.message : "You cannot raise an escalation for this opportunity.");
  };
  return <Dialog open={open} onClose={onClose} title="Escalate opportunity" description="Raise a manual escalation for the team manager." footer={<><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" variant="accent" disabled={busy || !title.trim()} onClick={() => void submit()}>Send escalation</Button></>}><div className="flex flex-col gap-3"><Select aria-label="Escalation severity" value={severity} onChange={setSeverity} options={[{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }]} /><Input aria-label="Escalation title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="What needs attention?" /><textarea aria-label="Escalation detail" value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={500} rows={4} placeholder="Add context" className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />{message ? <p role="status" className="text-[12.5px] text-ink-soft">{message}</p> : null}</div></Dialog>;
}
