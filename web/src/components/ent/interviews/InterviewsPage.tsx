"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChartIcon,
  Button,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  FunnelIcon,
  GridIcon,
  IconButton,
  Input,
  ListIcon,
  Menu,
  PlusIcon,
  Popover,
  RouteIcon,
  Select,
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
  DEFAULT_VIEW,
  errorSentence,
  filtersActive,
  interviewsApi,
  monthOf,
  moreFiltersActive,
  nextSort,
  parseView,
  rangeLabel,
  shiftMonth,
  showingText,
  viewParams,
  type Analytics,
  type Column,
  type Counts,
  type DetailTab,
  type FilterOptions,
  type InterviewDetail,
  type InterviewRow,
  type MainTab,
  type SortKey,
  type Status,
  type ViewState,
} from "@/lib/ent/interviews";
import { FeedbackDialog, RescheduleDialog, ScheduleDialog } from "./Dialogs";
import DetailDrawer from "./DetailDrawer";
import HelpBeeCard from "./HelpBeeCard";
import { useReminder, useStatusMove } from "./hooks";
import { InterviewsGrid, InterviewsTable, Pagination } from "./InterviewsTable";
import KpiTiles from "./KpiTiles";
import { SearchBox } from "./parts";
import { AnalyticsTab, CalendarView, PipelineBoard } from "./Views";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which every column fits beside the docked drawer
const DOCK_QUERY = "(min-width: 1280px)"; // config-literal-ok: the width at which the right-hand column (help card, drawer) sits beside the table

export interface InterviewsPageProps {
  orgId: number;
  orgName: string;
  workspace: string;
  /** `me.permissions` of the tenant session: decides which controls are drawn (the API is the gate). */
  permissions: Record<string, string>;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: InterviewRow[]; total: number };
type PipelineState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; columns: Column[] };
type AnalyticsState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: Analytics };

const SORT_MENU: { key: SortKey; label: string }[] = [
  { key: "scheduled", label: "Scheduled Date" },
  { key: "role", label: "Role" },
  { key: "consultant", label: "Consultant" },
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
];

/** The board's field-like control for the date range and More Filters. */
const FIELD_BTN = "inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--ent-control-border,var(--color-line))] bg-paper px-3 text-[13px] font-medium text-ink-soft hover:border-accent";

export default function InterviewsPage({ orgId, orgName, permissions, supportEmail }: InterviewsPageProps) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const dock = useMediaQuery(DOCK_QUERY, false);
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);
  const canCoordinate = can("interviews.coordinate");

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
  const [calendar, setCalendar] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: Counts | null }>({ status: "loading", data: null });
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState<InterviewDetail | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<InterviewDetail | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef({ list: 0, pipeline: 0, analytics: 0, calendar: 0 });
  const dismissed = useRef(false);
  const month = view.month || monthOf(new Date());
  const today = new Date().toISOString().slice(0, 10);

  /* ── data ────────────────────────────────────────────────────────────────────── */

  const listKey = JSON.stringify([view.q, view.status, view.client, view.consultant, view.round, view.mode, view.from, view.to, view.sort, view.page, view.size]);
  const pipelineKey = JSON.stringify([view.q, view.client, view.consultant, view.round, view.mode, view.from, view.to]);
  const calendarKey = JSON.stringify([view.q, view.status, view.client, view.consultant, view.round, view.mode, month]);

  const loadList = useCallback(
    async (v: ViewState, quiet: boolean) => {
      const mine = ++seq.current.list;
      if (!quiet) setList({ status: "loading" });
      const r = await interviewsApi.list(orgId, v);
      if (mine !== seq.current.list) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadPipeline = useCallback(
    async (v: ViewState, quiet: boolean) => {
      const mine = ++seq.current.pipeline;
      if (!quiet) setPipeline({ status: "loading" });
      const r = await interviewsApi.pipeline(orgId, v);
      if (mine !== seq.current.pipeline) return;
      setPipeline(r.ok ? { status: "ok", columns: r.data.columns } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadAnalytics = useCallback(
    async (quiet: boolean) => {
      const mine = ++seq.current.analytics;
      if (!quiet) setAnalytics({ status: "loading" });
      const r = await interviewsApi.analytics(orgId);
      if (mine !== seq.current.analytics) return;
      setAnalytics(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadCalendar = useCallback(
    async (v: ViewState, m: string, quiet: boolean) => {
      const mine = ++seq.current.calendar;
      if (!quiet) setCalendar({ status: "loading" });
      const r = await interviewsApi.calendar(orgId, v, m);
      if (mine !== seq.current.calendar) return;
      setCalendar(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadCounts = useCallback(async () => {
    const r = await interviewsApi.counts(orgId);
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
    if (view.tab === "calendar") void loadCalendar(viewRef.current, month, false);
  }, [calendarKey, view.tab, month, loadCalendar]);
  useEffect(() => {
    void loadCounts();
    void interviewsApi.filters(orgId).then((r) => setOptions(r.ok ? r.data : null));
  }, [orgId, loadCounts]);
  useEffect(() => {
    setPicked(new Set());
  }, [listKey]);

  /** After any change: the visible tab, the tiles, and the open drawer reload quietly. */
  const refresh = useCallback(() => {
    const v = viewRef.current;
    if (v.tab === "all") void loadList(v, true);
    if (v.tab === "pipeline") void loadPipeline(v, true);
    if (v.tab === "analytics") void loadAnalytics(true);
    if (v.tab === "calendar") void loadCalendar(v, v.month || monthOf(new Date()), true);
    void loadCounts();
    setReloadToken((n) => n + 1);
  }, [loadList, loadPipeline, loadAnalytics, loadCalendar, loadCounts]);

  const onChanged = useCallback(
    (d: InterviewDetail) => {
      setList((l) =>
        l.status === "ok"
          ? { ...l, items: l.items.map((r) => (r.id === d.id ? { ...r, status: d.status, nextStep: d.nextStep, scheduledAt: d.scheduledAt, durationMinutes: d.durationMinutes, mode: d.mode, interviewers: d.interviewers } : r)) }
          : l,
      );
      refresh();
    },
    [refresh],
  );

  const move = useStatusMove(orgId, onChanged);
  const remind = useReminder(orgId, onChanged);

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

  const active = filtersActive(view);
  const clearAll = () => setView({ q: "", status: "", client: "", consultant: "", round: "", mode: "", from: "", to: "" });
  const moreCount = moreFiltersActive(view);

  /* ── rows ────────────────────────────────────────────────────────────────────── */

  const openRow = useCallback((row: { id: number }, t: DetailTab = "details") => setView({ selected: row.id, detailTab: t }, false), [setView]);

  /** Opens a dialog for a row: the drawer's own detail is what the dialogs work from. */
  const withDetail = useCallback(
    async (id: number, then: (d: InterviewDetail) => void) => {
      const r = await interviewsApi.detail(orgId, id);
      if (r.ok) then(r.data);
      else toast({ title: "Couldn't open that interview", description: errorSentence(r), variant: "error" });
    },
    [orgId, toast],
  );

  const rowMenu = (row: InterviewRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (canCoordinate) {
      if (row.status === "SCHEDULED" || row.status === "CANCELLED") items.push({ label: "Reschedule…", onSelect: () => void withDetail(row.id, setRescheduling) });
      if (row.status === "SCHEDULED") items.push({ label: "Send reminder", onSelect: () => void remind(row.id) });
      if (row.status === "IN_PROGRESS" || row.status === "COMPLETED") items.push({ label: "Add feedback…", onSelect: () => void withDetail(row.id, setFeedbackFor) });
      const next: Status[] = row.status === "SCHEDULED" ? ["IN_PROGRESS", "COMPLETED", "CANCELLED"] : row.status === "IN_PROGRESS" ? ["COMPLETED", "CANCELLED"] : [];
      if (next.length > 0) {
        items.push({ separator: true }, { heading: "Record a change" });
        for (const s of next) items.push({ label: s === "IN_PROGRESS" ? "Record as In Progress" : s === "COMPLETED" ? "Record as Completed" : "Record as Cancelled", onSelect: () => void move(row.id, s) });
      }
    }
    items.push({ separator: true });
    items.push({
      label: "Copy interview ID",
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
  const mode = narrow ? "sheet" : dock ? "dock" : "overlay";
  const drawerOpen = view.selected !== null;
  const columnOn = dock && !narrow;

  /* the board opens with its first interview in the drawer (wide screens, once, unless it was closed) */
  useEffect(() => {
    if (mode !== "dock" || view.tab !== "all" || view.selected !== null || dismissed.current) return;
    if (list.status === "ok" && list.items.length > 0) setView({ selected: list.items[0].id }, false);
  }, [mode, list, view.tab, view.selected, setView]);

  const noInterviewsAtAll = list.status === "ok" && total === 0 && !active && view.tab === "all";
  const lines = (
    <span className="inline-flex items-center gap-1.5">
      <FunnelIcon size={15} aria-hidden /> More Filters
      {moreCount > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent" data-more-count>{moreCount}</span>}
    </span>
  );

  const filterRow = (
    <div role="search" aria-label="Filter interviews" className="flex flex-wrap items-center gap-2.5" data-filter-row>
      <SearchBox value={view.q} onChange={(q) => setView({ q })} label="Search interviews" placeholder="Search interviews by role, consultant, client, or interviewer..." />
      <Popover
        label="Date range"
        align="end"
        trigger={(t) => (
          <button type="button" {...t.props} ref={t.ref} className={FIELD_BTN} data-date-range>
            <span className="whitespace-nowrap">{rangeLabel(view.from, view.to)}</span> <CalendarIcon size={15} aria-hidden />
          </button>
        )}
      >
        {({ close }) => (
          <div className="w-64 space-y-2.5 p-1">
            <label className="block text-[12.5px] font-medium text-ink-soft">
              Scheduled from
              <Input type="date" className="mt-1" value={view.from} max={view.to || undefined} onChange={(e) => setView({ from: e.target.value })} aria-label="Scheduled from" />
            </label>
            <label className="block text-[12.5px] font-medium text-ink-soft">
              Scheduled to
              <Input type="date" className="mt-1" value={view.to} min={view.from || undefined} onChange={(e) => setView({ to: e.target.value })} aria-label="Scheduled to" />
            </label>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" disabled={!view.from && !view.to} onClick={() => setView({ from: "", to: "" })}>
                Clear dates
              </Button>
              <Button type="button" size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Popover>
      <div className="w-[7.6rem]">
        <Select aria-label="Client" value={view.client} onChange={(v) => setView({ client: v })} options={[{ value: "", label: "All Clients" }, ...(options?.clients ?? [])]} />
      </div>
      <div className="w-[8.4rem]">
        <Select aria-label="Status" value={view.status} onChange={(v) => setView({ status: v })} options={[{ value: "", label: "All Statuses" }, ...(options?.statuses ?? [])]} />
      </div>
      <Popover
        label="More filters"
        align="end"
        trigger={(t) => (
          <button type="button" {...t.props} ref={t.ref} className={FIELD_BTN} data-more-filters>
            {lines}
          </button>
        )}
      >
        {({ close }) => (
          <div className="w-64 space-y-2.5 p-1">
            <label className="block text-[12.5px] font-medium text-ink-soft">
              Mode
              <Select aria-label="Mode" value={view.mode} onChange={(v) => setView({ mode: v })} options={[{ value: "", label: "Any mode" }, ...(options?.modes ?? [])]} />
            </label>
            <label className="block text-[12.5px] font-medium text-ink-soft">
              Consultant
              <Select aria-label="Consultant" value={view.consultant} onChange={(v) => setView({ consultant: v })} options={[{ value: "", label: "Any consultant" }, ...(options?.consultants ?? [])]} />
            </label>
            <label className="block text-[12.5px] font-medium text-ink-soft">
              Round
              <Select aria-label="Round" value={view.round} onChange={(v) => setView({ round: v })} options={[{ value: "", label: "Any round" }, ...(options?.rounds ?? [])]} />
            </label>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" disabled={moreCount === 0} onClick={() => setView({ mode: "", consultant: "", round: "" })}>
                Clear
              </Button>
              <Button type="button" size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  );

  const sortLabel = SORT_MENU.find((s) => s.key === view.sort.key)?.label ?? "Scheduled Date";
  const pages = Math.max(1, Math.ceil(total / view.size));
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2" data-list-toolbar>
      <p aria-live="polite" className="text-[12.5px] text-ink-soft" data-showing>
        {list.status === "ok" ? showingText(total, view.page, view.size, rows.length) : " "}
      </p>
      <div className="flex items-center gap-2.5">
        <Menu
          trigger={
            <button type="button" className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink" data-sort-menu>
              Sort by: <span className="font-semibold text-ink">{sortLabel}</span> <ChevronDownIcon size={13} aria-hidden />
            </button>
          }
          items={[
            ...SORT_MENU.map((s) => ({ label: s.label, onSelect: () => setView({ sort: { key: s.key, dir: s.key === "scheduled" ? "desc" : "asc" } }) })),
            { separator: true as const },
            { label: view.sort.dir === "asc" ? "Newest or Z to A first" : "Oldest or A to Z first", onSelect: () => setView({ sort: { key: view.sort.key, dir: view.sort.dir === "asc" ? "desc" : "asc" } }) },
          ]}
        />
        <span className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Layout">
          <IconButton aria-label="List view" aria-pressed={view.layout === "list"} title="List view" onClick={() => setView({ layout: "list" }, false)} className={`!rounded-none ${view.layout === "list" ? "bg-accent-soft text-accent-deep" : ""}`}>
            <ListIcon size={16} />
          </IconButton>
          <IconButton aria-label="Grid view" aria-pressed={view.layout === "grid"} title="Grid view" onClick={() => setView({ layout: "grid" }, false)} className={`!rounded-none ${view.layout === "grid" ? "bg-accent-soft text-accent-deep" : ""}`}>
            <GridIcon size={16} />
          </IconButton>
        </span>
        <span className="flex gap-1.5">
          <IconButton aria-label="Previous page" title="Previous page" disabled={view.page <= 0} onClick={() => setView({ page: view.page - 1 }, false)} className="border border-line disabled:opacity-40">
            <ChevronDownIcon size={15} className="rotate-90" />
          </IconButton>
          <IconButton aria-label="Next page" title="Next page" disabled={view.page >= pages - 1} onClick={() => setView({ page: view.page + 1 }, false)} className="border border-line disabled:opacity-40">
            <ChevronDownIcon size={15} className="-rotate-90" />
          </IconButton>
        </span>
      </div>
    </div>
  );

  const bulkReminders = async () => {
    const targets = rows.filter((r) => picked.has(r.id) && r.status === "SCHEDULED");
    if (targets.length === 0) {
      toast({ title: "Nothing to remind", description: "Reminders can be recorded for scheduled interviews.", variant: "error" });
      return;
    }
    let ok = 0;
    for (const t of targets) {
      const r = await interviewsApi.remind(orgId, t.id);
      if (r.ok) ok++;
    }
    toast({ title: `${ok} reminder${ok === 1 ? "" : "s"} recorded`, description: "Kiwiply doesn't send the messages itself.", variant: ok > 0 ? "success" : "error" });
    setPicked(new Set());
    refresh();
  };

  const main = (
    <div className="min-w-0 space-y-3">
      <KpiTiles counts={counts.data} loading={counts.status === "loading"} error={counts.status === "error"} />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Tabs value={view.tab} onValueChange={(t) => setView({ tab: t as MainTab, page: 0 }, false)} variant="underline" className="min-w-0 flex-1">
          <TabList aria-label="Interviews views">
            <Tab value="all"><span className="inline-flex items-center gap-2"><CalendarCheckIcon size={16} aria-hidden /> All Interviews</span></Tab>
            <Tab value="calendar"><span className="inline-flex items-center gap-2"><CalendarIcon size={16} aria-hidden /> Calendar View</span></Tab>
            <Tab value="pipeline"><span className="inline-flex items-center gap-2"><RouteIcon size={16} aria-hidden /> Pipeline</span></Tab>
            <Tab value="analytics"><span className="inline-flex items-center gap-2"><BarChartIcon size={16} aria-hidden /> Analytics</span></Tab>
          </TabList>
        </Tabs>
        {canCoordinate && (
          <Button type="button" variant="accent" onClick={() => setScheduling(true)} data-schedule-interview className="flex-none">
            <PlusIcon size={16} aria-hidden /> Schedule Interview
          </Button>
        )}
      </div>

      {view.tab !== "analytics" && filterRow}

      {view.tab === "all" && (
        <>
          {toolbar}
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent-soft/50 px-3 py-2 text-[13px]" data-bulk-bar>
              <span className="font-semibold text-ink">{picked.size} selected</span>
              <span className="flex items-center gap-2">
                {canCoordinate && (
                  <Button type="button" size="sm" variant="accent-soft" onClick={() => void bulkReminders()}>
                    Record reminders
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                  Clear selection
                </Button>
              </span>
            </div>
          )}
          {list.status === "loading" && <TableSkeleton count={6} columns={6} label="Loading interviews" />}
          {list.status === "error" && <ErrorState what="the interviews" description={list.message} onRetry={() => void loadList(view, false)} />}
          {list.status === "ok" && rows.length > 0 && (
            <>
              {view.layout === "grid" && !narrow ? (
                <InterviewsGrid rows={rows} openId={view.selected} onOpen={(r) => openRow(r)} rowMenu={rowMenu} />
              ) : (
                <InterviewsTable
                  rows={rows}
                  openId={view.selected}
                  onOpen={(r) => openRow(r)}
                  rowMenu={rowMenu}
                  sort={view.sort}
                  onSort={(k: SortKey) => setView({ sort: nextSort(view.sort, k) })}
                  selected={picked}
                  onToggle={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                  onToggleAll={(on) => setPicked(on ? new Set(rows.map((r) => r.id)) : new Set())}
                  compact={columnOn && drawerOpen && !wide}
                />
              )}
              <Pagination page={view.page} size={view.size} total={total} onPage={(page) => setView({ page }, false)} onSize={(size) => setView({ size })} />
            </>
          )}
          {list.status === "ok" && rows.length === 0 && (
            <EmptyState
              variant="page"
              mascot={false}
              title={noInterviewsAtAll ? "No interviews yet" : "No interviews match"}
              description={noInterviewsAtAll ? "Interviews appear here once they are scheduled for a consultant." : "Try a different search, or clear the filters to see everything."}
              action={
                active ? (
                  <Button type="button" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : canCoordinate ? (
                  <Button type="button" onClick={() => setScheduling(true)}>
                    <PlusIcon size={16} aria-hidden /> Schedule Interview
                  </Button>
                ) : undefined
              }
            />
          )}
        </>
      )}

      {view.tab === "calendar" && (
        <>
          {calendar.status === "loading" && <TableSkeleton count={5} columns={7} label="Loading the calendar" />}
          {calendar.status === "error" && <ErrorState what="the calendar" description={calendar.message} onRetry={() => void loadCalendar(view, month, false)} />}
          {calendar.status === "ok" && (
            <CalendarView
              month={month}
              rows={calendar.items}
              total={calendar.total}
              openId={view.selected}
              onOpen={(r) => openRow(r)}
              today={today}
              onMonth={(d) => setView({ month: d === "today" ? "" : shiftMonth(month, d) }, false)}
            />
          )}
        </>
      )}

      {view.tab === "pipeline" && (
        <>
          {pipeline.status === "loading" && <TableSkeleton count={4} columns={4} label="Loading the pipeline" />}
          {pipeline.status === "error" && <ErrorState what="the pipeline" description={pipeline.message} onRetry={() => void loadPipeline(view, false)} />}
          {pipeline.status === "ok" && <PipelineBoard columns={pipeline.columns} openId={view.selected} onOpen={(r) => openRow(r)} canMove={canCoordinate} onMove={(r, s) => void move(r.id, s)} />}
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
  );

  const drawer = (
    <DetailDrawer
      orgId={orgId}
      interviewId={view.selected}
      mode={mode}
      tab={view.detailTab}
      onTab={(t) => setView({ detailTab: t }, false)}
      onClose={() => {
        dismissed.current = true;
        setView({ selected: null, detailTab: DEFAULT_VIEW.detailTab }, false);
      }}
      onChanged={onChanged}
      reloadToken={reloadToken}
      maxInterviewers={options?.limits.maxInterviewers ?? 6}
      onReschedule={setRescheduling}
      onFeedback={setFeedbackFor}
    />
  );

  return (
    <div ref={root} data-interviews-page>
      <PageHeader title="Interviews" subtitle="Coordinate and track all consultant interviews across clients, roles, and teams." />
      {columnOn ? (
        <div className="grid grid-cols-[minmax(0,1fr)_17.6rem] items-start gap-4">
          {main}
          <div className="sticky top-3 flex h-[calc(100dvh-7.2rem)] min-h-[34rem] flex-col gap-3" data-right-column>
            <HelpBeeCard orgName={orgName} supportEmail={supportEmail} />
            {drawer}
          </div>
        </div>
      ) : (
        <>
          {main}
          {drawer}
        </>
      )}

      <ScheduleDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        orgId={orgId}
        maxInterviewers={options?.limits.maxInterviewers ?? 6}
        onCreated={(d) => {
          toast({ title: `${d.code} scheduled`, description: `${d.consultant.name}, ${d.round ?? "interview"}. Nobody was invited from here.`, variant: "success" });
          refresh();
          void interviewsApi.filters(orgId).then((r) => r.ok && setOptions(r.data));
          dismissed.current = false;
          setView({ selected: d.id, detailTab: "details" }, false);
        }}
      />
      <RescheduleDialog
        detail={rescheduling}
        onClose={() => setRescheduling(null)}
        orgId={orgId}
        onDone={(d) => {
          onChanged(d);
          toast({ title: "Rescheduled", description: `${d.code} is recorded for a new time. Nobody was notified from here.`, variant: "success" });
        }}
      />
      <FeedbackDialog
        detail={feedbackFor}
        onClose={() => setFeedbackFor(null)}
        orgId={orgId}
        onDone={(d) => {
          onChanged(d);
          toast({ title: "Feedback added", description: d.code, variant: "success" });
        }}
      />
    </div>
  );
}
