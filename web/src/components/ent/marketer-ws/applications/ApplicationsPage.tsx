"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Button, ClockIcon, ErrorState, FileTextIcon, SearchIcon, Select, UsersIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  DEFAULT_QUERY, KPI_KEYS, KPI_TITLES, PERIODS, STAGE_KEYS, STAGE_LABELS, fetchApplications, markFollowUpDone,
  type ApplicationsView, type BoardQuery, type KpiKey, type Period,
} from "@/lib/ent/marketer-ws/applications";
import { CARD, CardSkeleton, Empty, Head, KpiTile, type TintName } from "../parts";
import type { MktPageProps } from "../parts";
import { OverdueCard } from "./BottomCards";
import TrackerTable from "./TrackerTable";

/**
 * Applications (Marketing workspace). One call draws the board; every card has its own empty state, never a
 * made-up row. The API owns scope (the consultants assigned to this marketer) and consent: a consultant who shares less than the full
 * detail shows the stage only. E1: the marketer's actions here are RECORDS (note, next action, follow-up done, a stage the consultant
 * reached); nothing submits an application or acts as a consultant.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName }> = {
  active: { icon: FileTextIcon, tint: "green" },
  awaiting: { icon: ClockIcon, tint: "violet" },
  interviewing: { icon: UsersIcon, tint: "amber" },
  offers: { icon: FileTextIcon, tint: "pink" },
};
const ALL = "all";
const SEARCH_DEBOUNCE_MS = 300;
// `w-[150px]!`: the Select's own trigger is `w-full` and its class names are joined, not merged, so without the important suffix `w-full` wins and
// each filter ballooned to the width of the whole toolbar (the page scrolled 3000 px sideways).
const FILTER = "h-9 w-[150px]! flex-none";

export default function ApplicationsPage({ orgId, hrefs, selfMemberId }: MktPageProps) {
  const [query, setQuery] = useState<BoardQuery>(DEFAULT_QUERY);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ApplicationsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reloads, setReloads] = useState(0);
  const lastGood = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 0 })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetchApplications(orgId, query, ctl.signal);
      if (ctl.signal.aborted) return;
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
        lastGood.current = true;
      } else setStatus(r.kind === "DENIED" ? "denied" : lastGood.current ? "ready" : "failed");
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, query, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const patch = (p: Partial<BoardQuery>) => setQuery((q) => ({ ...q, ...p, page: p.page ?? 0 }));
  const clear = () => {
    setSearch("");
    setQuery((q) => ({ ...DEFAULT_QUERY, funnelPeriod: q.funnelPeriod, sort: q.sort }));
  };
  const markDone = async (id: number) => {
    const r = await markFollowUpDone(orgId, id);
    if (r.ok) reload();
  };

  if (status === "denied") return <ErrorState what="Applications" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = <PageHeader title="Applications" subtitle="Where each consultant's applications stand." />;
  if (status === "failed")
    return (
      <div data-applications data-status="failed">
        {header}
        <ErrorState what="Applications" description="Your applications didn't load. Nothing has changed." onRetry={reload} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const tr = v?.tracker;
  const perms = v?.perms ?? { followups: false, record: false };
  const pages = tr ? Math.max(1, Math.ceil(tr.total / Math.max(1, tr.size))) : 1;
  const from = tr && tr.total > 0 ? tr.page * tr.size + 1 : 0;
  const to = tr ? Math.min(tr.total, (tr.page + 1) * tr.size) : 0;
  const consultantOptions = [{ value: ALL, label: "All consultants" }, ...(tr?.filters.consultants ?? []).map((c) => ({ value: String(c.id), label: c.name }))];
  const clientOptions = [{ value: ALL, label: "All clients" }, ...(tr?.filters.clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))];
  const stageOptions = [{ value: ALL, label: "All stages" }, ...STAGE_KEYS.map((k) => ({ value: k, label: STAGE_LABELS[k] }))];
  const filtered = query.q !== "" || query.consultantId !== "" || query.clientId !== "" || query.stage !== "all" || query.period !== "3m";

  return (
    <div data-applications data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-app-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint } = KPI_ICONS[key];
          return <KpiTile key={key} id={key} title={KPI_TITLES[key]} icon={icon} tint={tint} value={k ? k.value : null} loading={loading} layout="inline" />;
        })}
      </section>

      <section data-app-card="tracker" className={CARD}>
        <Head icon={UsersIcon} title="Applications">
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
            <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-[var(--radius)] border border-line bg-paper-2 px-3 text-[13px] lg:w-[300px] lg:flex-none">
              <SearchIcon size={15} aria-hidden className="flex-none text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search applications, consultants, or roles..."
                aria-label="Search applications"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
              />
            </label>
            <Select value={query.consultantId || ALL} onChange={(x) => patch({ consultantId: x === ALL ? "" : x })} options={consultantOptions} aria-label="Consultant" className={FILTER} />
            <Select value={query.clientId || ALL} onChange={(x) => patch({ clientId: x === ALL ? "" : x })} options={clientOptions} aria-label="Client" className={FILTER} />
            <Select value={query.stage} onChange={(x) => patch({ stage: x as BoardQuery["stage"] })} options={stageOptions} aria-label="Stage" className={FILTER} />
            <Select value={query.period} onChange={(x) => patch({ period: x as Period })} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} aria-label="Period" className={FILTER} />
            <button type="button" onClick={clear} disabled={!filtered} className="flex-none px-2 text-[13.5px] font-semibold text-accent-deep hover:underline disabled:opacity-60 disabled:no-underline">
              Clear
            </button>
          </div>
        </Head>

        <div role="tablist" aria-label="Application stage" className="mb-3 flex flex-wrap gap-2">
          {(tr?.tabs ?? []).map((t) => {
            const on = (t.key === "all" ? "all" : t.key) === query.stage;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                data-stage-tab={t.key}
                onClick={() => patch({ stage: t.key })}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors",
                  on ? "border-accent bg-accent text-white" : "border-line bg-paper text-ink-soft hover:border-accent",
                )}
              >
                {t.key === "all" ? "All" : (STAGE_LABELS[t.key] ?? t.label)}
                <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-bold", on ? "bg-white/25 text-white" : "bg-paper-2 text-ink-soft")}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <CardSkeleton rows={5} />
        ) : !tr || tr.items.length === 0 ? (
          <Empty>{filtered ? "No applications match these filters." : "No applications for your consultants yet."}</Empty>
        ) : (
          <>
            <TrackerTable
              orgId={orgId}
              rows={tr.items}
              perms={perms}
              selected={selected}
              onToggle={(id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onToggleAll={(on) => setSelected(on ? new Set(tr.items.map((r) => r.id)) : new Set())}
              sortAsc={query.sort === "appliedOn,asc"}
              onSort={() => patch({ sort: query.sort === "appliedOn,asc" ? "appliedOn,desc" : "appliedOn,asc" })}
              onChanged={reload}
              selfMemberId={selfMemberId}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
              <span data-tracker-count>
                Showing {from}-{to} of {tr.total}
              </span>
              <span className="flex items-center gap-2">
                <Button variant="accent-soft" size="sm" disabled={tr.page <= 0} onClick={() => patch({ page: tr.page - 1 })}>
                  Previous
                </Button>
                <span>
                  Page {tr.page + 1} of {pages}
                </span>
                <Button variant="accent-soft" size="sm" disabled={tr.page + 1 >= pages} onClick={() => patch({ page: tr.page + 1 })}>
                  Next
                </Button>
              </span>
            </div>
          </>
        )}
        {tr && tr.notShared > 0 ? (
          <p data-not-shared-note className="mt-3 text-[12.5px] text-muted">
            {tr.notShared === 1 ? "1 consultant hasn't" : `${tr.notShared} consultants haven't`} shared their applications, so they are not counted here.
          </p>
        ) : null}
      </section>

      <OverdueCard view={v} loading={loading} viewAll={hrefs.followups ?? null} canMark={perms.followups} onDone={(id) => void markDone(id)} />
    </div>
  );
}
