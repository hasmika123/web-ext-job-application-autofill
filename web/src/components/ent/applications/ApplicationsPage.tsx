"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChartIcon,
  Button,
  CalendarIcon,
  EmptyState,
  ErrorState,
  FileTextIcon,
  FilterBar,
  Input,
  LayoutGridIcon,
  PlusIcon,
  Tab,
  TabList,
  Tabs,
  TableSkeleton,
  useMediaQuery,
  useNarrow,
  useToast,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  applicationsApi,
  DEFAULT_VIEW,
  errorSentence,
  filtersActive,
  formatDay,
  moveOptions,
  nextSort,
  nextStagesOf,
  parseView,
  viewParams,
  type Analytics,
  type ApplicationDetail,
  type ApplicationRow,
  type CloseReason,
  type Column,
  type Counts,
  type DetailTab,
  type FilterOptions,
  type MainTab,
  type SortKey,
  type Stage,
  type ViewState,
} from "@/lib/ent/applications";
import AddApplicationDialog from "./AddApplicationDialog";
import AnalyticsTab from "./AnalyticsTab";
import { ApplicationsTable, Pagination } from "./ApplicationsTable";
import DetailDrawer from "./DetailDrawer";
import HelpBeeCard from "./HelpBeeCard";
import { useStageMove } from "./hooks";
import KpiTiles from "./KpiTiles";
import PipelineBoard from "./PipelineBoard";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which the drawer docks beside the table instead of floating over it

export interface ApplicationsPageProps {
  orgId: number;
  orgName: string;
  workspace: string;
  /** `me.permissions` of the tenant session: decides which controls are drawn (the API is the gate). */
  permissions: Record<string, string>;
  /** Menu hrefs of the pages "View Job" / "View Profile" lead to; null when the member's menu does not list them. */
  jobsHref: string | null;
  consultantsHref: string | null;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: ApplicationRow[]; total: number };
type PipelineState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; columns: Column[] };
type AnalyticsState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: Analytics };

export default function ApplicationsPage({ orgId, orgName, permissions, jobsHref, consultantsHref, supportEmail }: ApplicationsPageProps) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);
  const canAdd = can("submissions.prepare") || can("opportunities.manage");
  const canMove = can("submissions.record") || can("followups.manage") || can("offers.manage");

  /* ── the view lives in the URL ───────────────────────────────────────────────── */
  const view = useMemo(() => parseView(new URLSearchParams(search?.toString() ?? "")), [search]);
  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const setView = useCallback(
    (patch: Partial<ViewState>, resetPage = true) => {
      const next: ViewState = { ...viewRef.current, ...patch };
      if (resetPage && patch.page === undefined) next.page = 0;
      viewRef.current = next;
      const qs = viewParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [pipeline, setPipeline] = useState<PipelineState>({ status: "loading" });
  const [analytics, setAnalytics] = useState<AnalyticsState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: Counts | null }>({ status: "loading", data: null });
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [adding, setAdding] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef({ list: 0, pipeline: 0, analytics: 0 });

  /* ── data ────────────────────────────────────────────────────────────────────── */

  const listKey = JSON.stringify([view.q, view.stage, view.job, view.client, view.marketer, view.from, view.to, view.sort, view.page, view.size]);
  const pipelineKey = JSON.stringify([view.q, view.job, view.client, view.marketer, view.from, view.to]);

  const loadList = useCallback(
    async (v: ViewState, quiet: boolean) => {
      const mine = ++seq.current.list;
      if (!quiet) setList({ status: "loading" });
      const r = await applicationsApi.list(orgId, v);
      if (mine !== seq.current.list) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadPipeline = useCallback(
    async (v: ViewState, quiet: boolean) => {
      const mine = ++seq.current.pipeline;
      if (!quiet) setPipeline({ status: "loading" });
      const r = await applicationsApi.pipeline(orgId, v);
      if (mine !== seq.current.pipeline) return;
      setPipeline(r.ok ? { status: "ok", columns: r.data.columns } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadAnalytics = useCallback(
    async (quiet: boolean) => {
      const mine = ++seq.current.analytics;
      if (!quiet) setAnalytics({ status: "loading" });
      const r = await applicationsApi.analytics(orgId);
      if (mine !== seq.current.analytics) return;
      setAnalytics(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadCounts = useCallback(async () => {
    const r = await applicationsApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);

  useEffect(() => {
    if (view.tab === "all") void loadList(viewRef.current, false);
  }, [listKey, view.tab, loadList]);

  useEffect(() => {
    if (view.tab === "pipeline") void loadPipeline(viewRef.current, false);
  }, [pipelineKey, view.tab, loadPipeline]);

  useEffect(() => {
    if (view.tab === "analytics") void loadAnalytics(false);
  }, [view.tab, loadAnalytics]);

  useEffect(() => {
    void loadCounts();
    void applicationsApi.filters(orgId).then((r) => setOptions(r.ok ? r.data : null));
  }, [orgId, loadCounts]);

  /** After any change: the visible tab, the tiles, and the open drawer reload quietly. */
  const refresh = useCallback(() => {
    const v = viewRef.current;
    if (v.tab === "all") void loadList(v, true);
    if (v.tab === "pipeline") void loadPipeline(v, true);
    if (v.tab === "analytics") void loadAnalytics(true);
    void loadCounts();
    setReloadToken((n) => n + 1);
  }, [loadList, loadPipeline, loadAnalytics, loadCounts]);

  const onChanged = useCallback(
    (d: ApplicationDetail) => {
      setList((l) =>
        l.status === "ok"
          ? {
              ...l,
              items: l.items.map((r) =>
                r.id === d.id ? { ...r, stage: d.stage, closedReason: d.closedReason, nextAction: d.nextAction, nextActionDue: d.nextActionDue, overdue: d.overdue, marketer: d.marketer, stageChangedAt: d.stageChangedAt } : r,
              ),
            }
          : l,
      );
      refresh();
    },
    [refresh],
  );

  const move = useStageMove(orgId, onChanged);

  /* ── "/" jumps to the search box ─────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const box = root.current?.querySelector<HTMLInputElement>('[role="search"] input[type="search"]');
      if (box) {
        e.preventDefault();
        box.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ── filters ─────────────────────────────────────────────────────────────────── */

  const filterValues = { job: view.job, client: view.client, stage: view.stage, marketer: view.marketer };
  const onFilter = (name: string, value: string) => setView({ [name]: value } as Partial<ViewState>);
  const active = filtersActive(view);
  const clearAll = () => setView({ q: "", stage: "", job: "", client: "", marketer: "", from: "", to: "" });

  const filters = [
    { name: "job", label: "Job Title", allLabel: "All Job Titles", options: options?.jobTitles ?? [] },
    { name: "client", label: "Client", allLabel: "All Clients", options: options?.clients ?? [] },
    { name: "stage", label: "Stage", allLabel: "All Stages", options: options?.stages ?? [] },
    { name: "marketer", label: "Marketer", allLabel: "All Marketers", options: options?.marketers ?? [] },
  ];

  /* ── rows ────────────────────────────────────────────────────────────────────── */

  const openRow = useCallback((row: { id: number }, t: DetailTab = "overview") => setView({ selected: row.id, detailTab: t }, false), [setView]);

  const rowMenu = (row: ApplicationRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (canMove && row.stage !== "CLOSED") {
      const nextOpen = nextStagesOf(row.stage).find((s) => s !== "CLOSED");
      if (nextOpen) items.push({ label: moveOptions([nextOpen])[0].label, onSelect: () => void move(row.id, nextOpen) });
      items.push({ label: "Close application…", onSelect: () => openRow(row) });
    }
    items.push({ label: "Add note", onSelect: () => openRow(row, "notes") }, { label: "Edit next action", onSelect: () => openRow(row) }, { separator: true });
    items.push({
      label: "Copy application ID",
      onSelect: () => {
        void navigator.clipboard?.writeText(row.code).then(
          () => toast({ title: "Copied", description: row.code, variant: "success" }),
          () => toast({ title: "Couldn't copy", description: row.code, variant: "error" }),
        );
      },
    });
    return items;
  };

  const rows = list.status === "ok" ? list.items : [];
  const total = list.status === "ok" ? list.total : 0;
  const mode = narrow ? "sheet" : wide ? "push" : "overlay";
  const drawerOpen = view.selected !== null;
  const dateLabel = view.from || view.to ? `${view.from ? formatDay(view.from) : "Any"} – ${view.to ? formatDay(view.to) : "Any"}` : "Date Range";

  const dateControls = (
    <Button type="button" variant="ghost" size="sm" aria-expanded={dateOpen} onClick={() => setDateOpen((o) => !o)} data-date-range>
      <CalendarIcon size={15} aria-hidden /> {dateLabel}
    </Button>
  );

  const noApplicationsAtAll = list.status === "ok" && total === 0 && !active && view.tab === "all";

  return (
    <div ref={root} data-applications-page>
      <PageHeader title="Applications" subtitle="Track and manage consultant applications across all your job opportunities." />
      <div className="flex items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <KpiTiles counts={counts.data} loading={counts.status === "loading"} error={counts.status === "error"} />
            {!drawerOpen && (
              <div className="hidden md:block">
                <HelpBeeCard variant="promo" orgName={orgName} supportEmail={supportEmail} />
              </div>
            )}
          </div>

          <Tabs value={view.tab} onValueChange={(t) => setView({ tab: t as MainTab, page: 0 }, false)} variant="underline">
            <TabList aria-label="Applications views">
              <Tab value="all"><span className="inline-flex items-center gap-2"><FileTextIcon size={16} aria-hidden /> All Applications</span></Tab>
              <Tab value="pipeline"><span className="inline-flex items-center gap-2"><LayoutGridIcon size={16} aria-hidden /> Pipeline View</span></Tab>
              <Tab value="analytics"><span className="inline-flex items-center gap-2"><BarChartIcon size={16} aria-hidden /> Analytics</span></Tab>
            </TabList>
          </Tabs>

          {view.tab !== "analytics" && (
            <div className="space-y-2">
              <FilterBar
                compact
                query={view.q}
                onQueryChange={(q) => setView({ q })}
                values={filterValues}
                onFilterChange={onFilter}
                search={{ placeholder: "Search by consultant name, job title, client, or status…", label: "Search applications" }}
                filters={filters}
                actions={
                  <>
                    {dateControls}
                    {canAdd && (
                      <Button type="button" onClick={() => setAdding(true)} data-add-application>
                        <PlusIcon size={16} aria-hidden /> Add Application
                      </Button>
                    )}
                  </>
                }
              />
              {dateOpen && (
                <div className="flex flex-wrap items-end gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-date-row>
                  <label className="text-[12.5px] font-medium text-ink-soft">
                    Applied from
                    <Input type="date" className="mt-1 w-44" value={view.from} max={view.to || undefined} onChange={(e) => setView({ from: e.target.value })} aria-label="Applied from" />
                  </label>
                  <label className="text-[12.5px] font-medium text-ink-soft">
                    Applied to
                    <Input type="date" className="mt-1 w-44" value={view.to} min={view.from || undefined} onChange={(e) => setView({ to: e.target.value })} aria-label="Applied to" />
                  </label>
                  {(view.from || view.to) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setView({ from: "", to: "" })}>
                      Clear dates
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {view.tab === "all" && (
            <>
              {list.status === "loading" && <TableSkeleton count={6} columns={6} label="Loading applications" />}
              {list.status === "error" && <ErrorState what="the applications" description={list.message} onRetry={() => void loadList(view, false)} />}
              {list.status === "ok" && rows.length > 0 && (
                <>
                  <ApplicationsTable
                    rows={rows}
                    orgName={orgName}
                    openId={view.selected}
                    onOpen={(r) => openRow(r)}
                    rowMenu={rowMenu}
                    sort={view.sort}
                    onSort={(k: SortKey) => setView({ sort: nextSort(view.sort, k) })}
                    compact={drawerOpen && mode === "push"}
                  />
                  <Pagination page={view.page} size={view.size} total={total} shown={rows.length} onPage={(page) => setView({ page }, false)} onSize={(size) => setView({ size })} />
                </>
              )}
              {list.status === "ok" && rows.length === 0 && (
                <EmptyState
                  variant="page"
                  mascot={false}
                  title={noApplicationsAtAll ? "No applications yet" : "No applications match"}
                  description={noApplicationsAtAll ? "Applications appear here once a consultant is put forward for a job." : "Try a different search, or clear the filters to see everything."}
                  action={
                    active ? (
                      <Button type="button" onClick={clearAll}>
                        Clear filters
                      </Button>
                    ) : canAdd ? (
                      <Button type="button" onClick={() => setAdding(true)}>
                        <PlusIcon size={16} aria-hidden /> Add Application
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          )}

          {view.tab === "pipeline" && (
            <>
              {pipeline.status === "loading" && <TableSkeleton count={4} columns={4} label="Loading the pipeline" />}
              {pipeline.status === "error" && <ErrorState what="the pipeline" description={pipeline.message} onRetry={() => void loadPipeline(view, false)} />}
              {pipeline.status === "ok" && (
                <PipelineBoard columns={pipeline.columns} openId={view.selected} onOpen={(r) => openRow(r)} canMove={canMove} orgName={orgName} onMove={(r, s: Stage, reason?: CloseReason) => void move(r.id, s, reason)} />
              )}
            </>
          )}

          {view.tab === "analytics" && (
            <>
              {analytics.status === "loading" && <TableSkeleton count={4} columns={3} label="Loading analytics" />}
              {analytics.status === "error" && <ErrorState what="the analytics" description={analytics.message} onRetry={() => void loadAnalytics(false)} />}
              {analytics.status === "ok" && <AnalyticsTab data={analytics.data} />}
            </>
          )}
        </div>

        <DetailDrawer
          orgId={orgId}
          orgName={orgName}
          applicationId={view.selected}
          mode={mode}
          tab={view.detailTab}
          onTab={(t) => setView({ detailTab: t }, false)}
          onClose={() => setView({ selected: null, detailTab: DEFAULT_VIEW.detailTab }, false)}
          onChanged={onChanged}
          reloadToken={reloadToken}
          jobsHref={jobsHref}
          consultantsHref={consultantsHref}
          supportEmail={supportEmail}
        />
      </div>

      <AddApplicationDialog
        open={adding}
        onClose={() => setAdding(false)}
        orgId={orgId}
        onCreated={(d) => {
          toast({ title: `${d.code} added`, description: `${d.consultant.name} for ${d.jobTitle}. Nothing was submitted.`, variant: "success" });
          refresh();
          void applicationsApi.filters(orgId).then((r) => r.ok && setOptions(r.data));
          setView({ selected: d.id, detailTab: "overview" }, false);
        }}
      />
    </div>
  );
}
