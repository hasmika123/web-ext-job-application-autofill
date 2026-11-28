"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorState, FilterIcon, SideSheet, Skeleton, useNarrow, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { mgmtApi, type PipelineBoard, type PipelineCard, type PipelineSummary } from "@/lib/ent/mgmt-ws/api";
import { Empty, EmptyManager, SOFT_CARD, StatusBadge, Toolbar } from "../parts";
import type { MgmtPageProps } from "../parts";

export default function PipelineBoardPage({ orgId }: MgmtPageProps) {
  const [range, setRange] = useState(30);
  const [stale, setStale] = useState(false);
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<PipelineCard | null>(null);
  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const [b, s] = await Promise.all([mgmtApi.pipeline(orgId, { range, stale: stale || undefined, page: 0, size: 100 }), mgmtApi.pipelineSummary(orgId, range)]);
    if (b.kind === "DENIED" || s.kind === "DENIED") setState("denied");
    else if (b.kind !== "OK" || s.kind !== "OK") setState("failed");
    else {
      setBoard(b.data);
      setSummary(s.data);
      setState("ready");
    }
  }, [orgId, range, stale]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (state === "denied") return <ErrorState what="the pipeline" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  return <div data-mgmt-pipeline data-status={state} className="ent-page flex flex-col gap-4 sm:gap-5"><PageHeader title="Pipeline" subtitle="See where the team's opportunities are moving and what has gone quiet." /><Toolbar><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft"><FilterIcon size={16} /> Filters</span><label className="flex items-center rounded-lg border border-line bg-paper px-3 text-[13px] text-muted"><span className="sr-only">Date range</span><select aria-label="Date range" value={range} onChange={(event) => setRange(Number(event.target.value))} className="bg-transparent py-2 text-ink outline-none"><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink"><input type="checkbox" checked={stale} onChange={(event) => setStale(event.target.checked)} /> Stale only</label></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></Toolbar>{summary ? <SummaryStrip summary={summary} /> : null}{state === "failed" ? <ErrorState what="the pipeline" description="The pipeline didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" /> : null}{state === "loading" && !board ? <Skeleton className="h-[500px] w-full rounded-[var(--radius-lg)]" /> : board?.empty || !board || board.columns.every((column) => column.items.length === 0) ? <EmptyManager title="No opportunities in the pipeline" description="When your team has opportunities in scope, their progress will appear here." /> : <div className="overflow-x-auto pb-2" data-pipeline-board><div className="grid min-w-[1080px] grid-cols-8 gap-3">{board.columns.map((column) => <section key={column.key} className="min-h-[360px] rounded-[var(--radius-lg)] bg-paper-2 p-2.5"><header className="mb-2 flex items-center justify-between gap-2 px-1"><h2 className="text-[13px] font-bold text-ink">{column.label}</h2><span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-muted">{column.count}</span></header><div className="flex flex-col gap-2">{column.items.map((card) => <button key={card.id} type="button" onClick={() => setSelected(card)} className="rounded-xl border border-line bg-paper p-3 text-left shadow-[0_1px_2px_rgb(20_30_60_/_0.04)] transition hover:border-accent/50"><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-[13px] font-bold text-ink">{card.job}</span>{card.stale ? <span title="Stale opportunity" className="h-2 w-2 flex-none rounded-full bg-danger" /> : null}</div><span className="mt-2 block truncate text-[12px] text-ink-soft">{card.consultant}</span><span className="mt-1 block truncate text-[11.5px] text-muted">{card.client}</span><span className="mt-3 flex items-center justify-between gap-2"><span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", card.stale ? "bg-v2-pink-soft text-v2-pink-ink" : "bg-paper-2 text-muted")}>{card.ageDays}d old</span><span className="text-[11px] text-muted">{card.marketer?.name ?? "Unassigned"}</span></span></button>)}</div></section>)}</div></div>}<PipelineSheet card={selected} onClose={() => setSelected(null)} /></div>;
}

function SummaryStrip({ summary }: { summary: PipelineSummary }) {
  return <section className={SOFT_CARD} data-pipeline-summary><div className="flex flex-wrap items-center gap-2.5"><span className="text-[13px] font-bold text-ink">Pipeline summary</span>{summary.columns.map((column) => <span key={column.key} className="rounded-full bg-paper-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft">{column.label} <b className="text-ink">{column.count}</b></span>)}{summary.stale > 0 ? <span className="rounded-full bg-v2-pink-soft px-2.5 py-1 text-[11.5px] font-semibold text-v2-pink-ink">{summary.stale} stale</span> : null}</div></section>;
}

function PipelineSheet({ card, onClose }: { card: PipelineCard | null; onClose: () => void }) {
  const narrow = useNarrow();
  return <SideSheet id="mgmt-pipeline-detail" side="right" mode={narrow ? "fullscreen" : "overlay"} open={card !== null} title={card?.job ?? "Opportunity"} description={card ? `${card.client} · ${card.consultant}` : undefined} onClose={onClose}><div className="flex flex-col gap-5">{card ? <><div className="rounded-xl bg-paper-2 p-3"><p className="text-[12px] uppercase tracking-wide text-muted">Current stage</p><div className="mt-1 flex items-center justify-between gap-2"><StatusBadge value={card.column} /><span className="text-[12px] text-muted">{card.ageDays} days old</span></div></div><dl className="grid gap-3 text-[13px]"><div><dt className="text-muted">Consultant</dt><dd className="mt-1 font-semibold text-ink">{card.consultant}</dd></div><div><dt className="text-muted">Client</dt><dd className="mt-1 font-semibold text-ink">{card.client}</dd></div><div><dt className="text-muted">Marketer</dt><dd className="mt-1 font-semibold text-ink">{card.marketer?.name ?? "Unassigned"}</dd></div><div><dt className="text-muted">Last activity</dt><dd className="mt-1 font-semibold text-ink">{card.lastActivityAt ? new Date(card.lastActivityAt).toLocaleString("en-US") : "No activity recorded"}</dd></div></dl><p className="text-[12.5px] text-muted">This board is read-only. Open the marketer&apos;s workspace to prepare or record the next step.</p></> : <Empty>No opportunity selected.</Empty>}</div></SideSheet>;
}
