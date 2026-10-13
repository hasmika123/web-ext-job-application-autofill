"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertIcon, BarChartIcon, Button, CheckCircleIcon, ChevronRightIcon, ClockIcon, DatabaseIcon, ErrorState, FileTextIcon, FolderIcon, GearIcon, Input, MessageIcon, Menu,
  MoreVerticalIcon, NetworkIcon, PlusIcon, RefreshIcon, SearchIcon, Select, ShieldIcon, SourceLogo, StackedBarChart, Switch, XCircleIcon, ZapIcon, chartColor, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import { clockText } from "@/lib/ent/marketer-ws/home";
import {
  ASSISTANT_ART, KPI_KEYS, KPI_TITLES, RULE_COPY, RULE_KEYS, STATUS_LABEL, agoText, configureStream, createStream, dayLabel, fetchStreams, keywordSummary, logoForStream,
  pauseStream, resumeStream, scheduleLabel, updateRule, type KpiKey, type RuleKey, type RuleRow, type StreamInput, type StreamRow, type StreamStatus, type StreamsQuery, type StreamsView,
} from "@/lib/ent/marketer-ws/streams";
import { CARD, CardSkeleton, Empty, KpiTile, TH, TINTS, type MktPageProps, type TintName } from "../parts";
import { RuleDialog, StreamDialog } from "./StreamDialogs";

/**
 * Job Streams (design: Job Streams). One call draws the board; every card has its own empty state, never a made-up row. The writes
 * (add / configure / pause / resume a stream, toggle a rule) only RECORD settings: nothing here connects to a site, and nothing
 * submits for a consultant (E1). The sync history is written by the API's `recordSync`, which a later connector calls.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName; spark: number; versus: string }> = {
  activeStreams: { icon: DatabaseIcon, tint: "green", spark: 3, versus: "vs last month" },
  syncHealth: { icon: FileTextIcon, tint: "violet", spark: 4, versus: "vs prior syncs" },
  newOpenings: { icon: FolderIcon, tint: "pink", spark: 5, versus: "vs last week" },
  streamErrors: { icon: AlertIcon, tint: "amber", spark: 2, versus: "vs last month" },
};
const RULE_ICONS: Record<RuleKey, { icon: ComponentType<IconProps>; tint: TintName }> = {
  DEFAULT_KEYWORDS: { icon: RefreshIcon, tint: "coral" },
  CLIENT_MAPPING: { icon: NetworkIcon, tint: "violet" },
  DUPLICATE_DETECTION: { icon: ShieldIcon, tint: "pink" },
  AUTO_PUBLISH: { icon: ZapIcon, tint: "amber" },
};
const STATUS_CHIP: Record<StreamStatus, { chip: string; dot: string }> = {
  ACTIVE: { chip: "bg-v2-green-soft text-v2-green-ink", dot: "bg-green-500" },
  PAUSED: { chip: "bg-v2-amber-soft text-v2-amber-ink", dot: "bg-amber-400" },
  ERROR: { chip: "bg-v2-pink-soft text-v2-pink-ink", dot: "bg-red-500" },
};
const ACTIVITY_SHOWN = 6;
const ALERTS_SHOWN = 4;
const GHOST_BTN = "inline-flex h-8 flex-none items-center justify-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-50";

const ALL = "";

function CardHead({ icon: Icon, title, tint = "blue", children }: { icon: ComponentType<IconProps>; title: string; tint?: TintName; children?: ReactNode }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2.5">
      <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-full", TINTS[tint])}>
        <Icon size={17} />
      </span>
      <h2 className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">{title}</h2>
      {children}
    </header>
  );
}

export default function JobStreamsPage({ orgId, hrefs }: MktPageProps) {
  const [view, setView] = useState<StreamsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<StreamsQuery>({});
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "stream"; stream: StreamRow | null } | { kind: "rule"; rule: RuleRow } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [allActivity, setAllActivity] = useState(false);
  const [allAlerts, setAllAlerts] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (q: StreamsQuery, chartDays: number) => {
      const mine = ++seq.current;
      const r = await fetchStreams(orgId, { ...q, days: chartDays });
      if (mine !== seq.current) return; // a newer request owns the screen
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
        setNow(Date.now());
        setSelected(new Set());
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
    },
    [orgId],
  );
  const reload = useCallback(() => load(query, days), [load, query, days]);

  useEffect(() => {
    const t = setTimeout(() => void load(query, days), 0);
    return () => clearTimeout(t);
  }, [load, query, days]);
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === (search.trim() || undefined) ? q : { ...q, q: search.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const header = (
    <>
      <PageHeader title="Job Streams" subtitle="Monitor and configure job-source feeds to capture new openings and keep your talent pipeline full." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "denied") return <ErrorState what="Job Streams" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-job-streams data-status="failed">
        {header}
        <ErrorState what="Job Streams" description="Your job streams didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const jobsHref = hrefs.jobs ?? null;
  const filters = v?.filters ?? { sources: [], statuses: [], clients: [] };

  async function act(row: StreamRow, run: () => Promise<{ ok: boolean; error?: string; denied?: boolean }>) {
    setBusyId(row.id);
    setNote(null);
    const r = await run();
    setBusyId(null);
    if (!r.ok) {
      if (r.denied) setStatus("denied");
      else setNote(r.error ?? "That didn't save. Nothing has changed.");
      return;
    }
    await reload();
  }
  const togglePause = (row: StreamRow) => act(row, () => (row.status === "PAUSED" ? resumeStream(orgId, row.id) : pauseStream(orgId, row.id)));

  async function saveStream(stream: StreamRow | null, input: StreamInput): Promise<string | null> {
    const r = stream ? await configureStream(orgId, stream.id, input) : await createStream(orgId, input);
    if (!r.ok) return r.error;
    setDialog(null);
    await reload();
    return null;
  }
  async function saveRule(rule: RuleRow, input: { enabled: boolean; value: string }): Promise<string | null> {
    const r = await updateRule(orgId, rule.key, input);
    if (!r.ok) return r.error;
    setDialog(null);
    await reload();
    return null;
  }

  const rows = v?.streams.items ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const rules: RuleRow[] = RULE_KEYS.map((k) => v?.rules.find((r) => r.key === k) ?? { key: k, enabled: false, value: null });
  const activity = v ? (allActivity ? v.activity : v.activity.slice(0, ACTIVITY_SHOWN)) : [];
  const alerts = v ? (allAlerts ? v.alerts : v.alerts.slice(0, ALERTS_SHOWN)) : [];
  const series = (v?.chart.series ?? []).map((s, i) => ({ key: s.key, label: s.label, values: s.values, color: chartColor(i) }));

  return (
    <div data-job-streams data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-streams-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint, spark, versus } = KPI_ICONS[key];
          const value = k?.value ?? null;
          return (
            <KpiTile
              key={key}
              id={key}
              title={KPI_TITLES[key]}
              icon={icon}
              tint={tint}
              layout="inline"
              loading={loading}
              value={value === null ? null : key === "syncHealth" ? `${Math.round(value * 10) / 10}%` : value}
              deltaPct={k?.deltaPct ?? null}
              versus={versus}
              sparkline={k?.sparkline}
              sparkIndex={spark}
              lowerIsBetter={key === "streamErrors"}
            />
          );
        })}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <section data-streams-card="sources" aria-label="Job Source Streams" className={CARD}>
            <header className="mb-3 flex flex-wrap items-start gap-3">
              <DatabaseIcon size={30} className="mt-0.5 flex-none text-accent-deep" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-bold leading-tight text-ink">Job Source Streams</h2>
                <p className="mt-0.5 text-[13.5px] text-muted">Manage your job-source integrations, sync schedules, and keyword filters.</p>
              </div>
              <Button variant="accent" size="sm" onClick={() => setDialog({ kind: "stream", stream: null })} className="h-10">
                <PlusIcon size={16} />
                Add Job Stream
              </Button>
            </header>

            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <label className="relative min-w-[200px] flex-1 sm:max-w-[220px]">
                <span className="sr-only">Search job sources</span>
                <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job sources..." className="pl-9" />
              </label>
              <Select
                aria-label="Source"
                value={query.source ?? ALL}
                onChange={(x) => setQuery((q) => ({ ...q, source: x || undefined }))}
                options={[{ value: ALL, label: "All Sources" }, ...filters.sources.map((s) => ({ value: s, label: s }))]}
                className="w-[168px]"
              />
              <Select
                aria-label="Status"
                value={query.status ?? ALL}
                onChange={(x) => setQuery((q) => ({ ...q, status: x || undefined }))}
                options={[{ value: ALL, label: "All Statuses" }, ...filters.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
                className="w-[168px]"
              />
              <Select
                aria-label="Client"
                value={query.client ?? ALL}
                onChange={(x) => setQuery((q) => ({ ...q, client: x || undefined }))}
                options={[{ value: ALL, label: "All Clients" }, ...filters.clients.map((s) => ({ value: s, label: s }))]}
                className="w-[168px]"
              />
              <div className="ml-auto">
                <Switch label="Show Inactive" checked={query.showInactive === true} onCheckedChange={(on) => setQuery((q) => ({ ...q, showInactive: on || undefined }))} />
              </div>
            </div>

            {note ? (
              <p role="alert" className="mb-2 rounded-lg bg-v2-pink-soft px-3 py-2 text-[13px] font-semibold text-v2-pink-ink">
                {note}
              </p>
            ) : null}

            {loading ? (
              <CardSkeleton rows={4} />
            ) : rows.length === 0 ? (
              <Empty>{query.q || query.source || query.status || query.client ? "No job streams match these filters." : "No job streams yet. Add one to start capturing openings."}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2">
                      <th className="w-9 rounded-l-lg px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select all streams"
                          checked={allSelected}
                          onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                          className="h-4 w-4 accent-[var(--color-accent)]"
                        />
                      </th>
                      <th className={TH}>Source</th>
                      <th className={TH}>Status</th>
                      <th className={TH}>Sync Schedule</th>
                      <th className={TH}>Keywords / Filters</th>
                      <th className={TH}>Last Sync</th>
                      <th className={TH}>Openings</th>
                      <th className={cn(TH, "rounded-r-lg")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const kw = keywordSummary(s.keywords);
                      const chip = STATUS_CHIP[s.status];
                      const busy = busyId === s.id;
                      const paused = s.status === "PAUSED";
                      return (
                        <tr key={s.id} data-stream-row={s.sourceLabel} className="border-b border-line last:border-0">
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              aria-label={`Select ${s.sourceLabel}`}
                              checked={selected.has(s.id)}
                              onChange={(e) =>
                                setSelected((cur) => {
                                  const next = new Set(cur);
                                  if (e.target.checked) next.add(s.id);
                                  else next.delete(s.id);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-[var(--color-accent)]"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="flex items-center gap-2.5">
                              <SourceLogo source={s.sourceLabel} src={logoForStream(s.sourceLabel)} size={36} />
                              <span className="min-w-0">
                                <span className="block font-semibold text-ink">{s.sourceLabel}</span>
                                {s.subtitle ? <span className="block text-[12px] text-muted">{s.subtitle}</span> : null}
                              </span>
                            </span>
                          </td>
                          <td className="px-2">
                            <span data-stream-status className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-semibold", chip.chip)}>
                              <span aria-hidden className={cn("h-2 w-2 rounded-full", chip.dot)} />
                              {STATUS_LABEL[s.status]}
                            </span>
                          </td>
                          <td className="px-2">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
                              <ClockIcon size={15} className="text-accent-deep" />
                              {scheduleLabel(s.syncEveryMinutes)}
                            </span>
                          </td>
                          <td className="max-w-[190px] px-2 text-ink-soft">
                            {kw.shown.length === 0 ? (
                              <span className="text-muted">No filters</span>
                            ) : (
                              <>
                                {kw.shown.join(", ")}
                                {kw.more > 0 ? <span className="font-semibold text-ink"> +{kw.more}</span> : null}
                              </>
                            )}
                          </td>
                          <td className="px-2">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
                              {s.lastSyncAt === null ? null : s.status === "ERROR" ? <XCircleIcon size={16} className="text-red-500" /> : <CheckCircleIcon size={16} className="text-green-500" />}
                              {agoText(s.lastSyncAt, now)}
                            </span>
                          </td>
                          <td className="px-2">
                            <span className="block font-bold tabular-nums text-ink">{s.newOpenings.toLocaleString("en-US")}</span>
                            {s.openingsDeltaPct !== null ? (
                              <span className={cn("block text-[12px] font-semibold", s.openingsDeltaPct < 0 ? "text-red-600" : "text-green-600")}>
                                {s.openingsDeltaPct < 0 ? "↓" : "↑"} {s.openingsDeltaPct > 0 ? "+" : ""}
                                {Math.round(s.openingsDeltaPct)}%
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2">
                            <span className="flex items-center gap-2">
                              <Button variant="accent" size="sm" disabled={busy} onClick={() => setDialog({ kind: "stream", stream: s })} className="h-8 px-3.5">
                                Configure
                              </Button>
                              <button type="button" disabled={busy} onClick={() => void togglePause(s)} className={GHOST_BTN}>
                                {paused ? "Resume" : "Pause"}
                              </button>
                              {jobsHref ? (
                                <Link href={jobsHref} className={GHOST_BTN}>
                                  View Jobs
                                </Link>
                              ) : (
                                <span aria-disabled className={cn(GHOST_BTN, "pointer-events-none opacity-50")}>
                                  View Jobs
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-1">
                            <Menu
                              trigger={
                                <button type="button" aria-label={`More for ${s.sourceLabel}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper-2">
                                  <MoreVerticalIcon size={16} />
                                </button>
                              }
                              items={[
                                { label: "Configure", onSelect: () => setDialog({ kind: "stream", stream: s }) },
                                { label: paused ? "Resume" : "Pause", onSelect: () => void togglePause(s) },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
            <section data-streams-card="activity" aria-label="Sync Activity" className={CARD}>
              <CardHead icon={ClockIcon} title="Sync Activity">
                {v && v.activity.length > ACTIVITY_SHOWN ? (
                  <button type="button" onClick={() => setAllActivity((x) => !x)} className={GHOST_BTN}>
                    {allActivity ? "Show less" : "View all"}
                  </button>
                ) : null}
              </CardHead>
              {loading ? (
                <CardSkeleton />
              ) : activity.length === 0 ? (
                <Empty>No syncs have run yet.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[12.5px]">
                    <thead>
                      <tr className="text-[11.5px] font-semibold text-ink-soft">
                        <th className="py-1 pr-2">Time</th>
                        <th className="px-2">Source</th>
                        <th className="px-2">Status</th>
                        <th className="px-2">Openings</th>
                        <th className="px-2">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((a) => (
                        <tr key={a.id} data-sync-row={a.id} className="border-t border-line">
                          <td className="whitespace-nowrap py-1.5 pr-2 text-ink-soft">{clockText(a.syncedAt)}</td>
                          <td className="px-2 text-ink">{a.source}</td>
                          <td className="px-2">
                            {a.status === "OK" ? <CheckCircleIcon size={16} aria-label="Sync completed" className="text-green-500" /> : <XCircleIcon size={16} aria-label="Sync failed" className="text-red-500" />}
                          </td>
                          <td className="px-2 text-center tabular-nums text-ink">{a.openings}</td>
                          <td className="px-2 text-ink-soft">{a.message ?? (a.status === "OK" ? "Sync completed" : "Sync failed")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section data-streams-card="openings" aria-label="Openings Captured" className={CARD}>
              <CardHead icon={BarChartIcon} title="Openings Captured">
                <Select
                  aria-label="Chart range"
                  variant="pill"
                  value={String(days)}
                  onChange={(x) => setDays(Number(x) === 14 ? 14 : 7)}
                  options={[
                    { value: "7", label: "Last 7 Days" },
                    { value: "14", label: "Last 14 Days" },
                  ]}
                />
              </CardHead>
              {loading ? (
                <CardSkeleton />
              ) : !v || series.length === 0 ? (
                <Empty>No openings captured in this period.</Empty>
              ) : (
                <StackedBarChart categories={v.chart.days.map(dayLabel)} series={series} label="Openings captured per day, by source" />
              )}
            </section>

            <section data-streams-card="alerts" aria-label="Stream Alerts & Warnings" className={cn(CARD, "lg:col-span-2 2xl:col-span-1")}>
              <CardHead icon={AlertIcon} title="Stream Alerts & Warnings" tint="pink">
                {v && v.alerts.length > ALERTS_SHOWN ? (
                  <button type="button" onClick={() => setAllAlerts((x) => !x)} className={GHOST_BTN}>
                    {allAlerts ? "Show less" : "View all"}
                  </button>
                ) : null}
              </CardHead>
              {loading ? (
                <CardSkeleton />
              ) : alerts.length === 0 ? (
                <Empty>No alerts. Your streams are running smoothly.</Empty>
              ) : (
                <ul className="flex flex-col">
                  {alerts.map((a) => (
                    <li key={a.id} data-alert-row={a.id} data-severity={a.severity} className="flex items-start gap-2.5 border-t border-line py-2 first:border-0">
                      <span aria-hidden className={cn("mt-1 grid h-5 w-5 flex-none place-items-center rounded-full", a.severity === "ERROR" ? "bg-red-100" : "bg-amber-100")}>
                        <span className={cn("h-2.5 w-2.5 rounded-full", a.severity === "ERROR" ? "bg-red-500" : "bg-amber-500")} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">{a.title}</span>
                        {a.detail ? <span className="block text-[12px] text-muted">{a.detail}</span> : null}
                      </span>
                      <span className="flex-none whitespace-nowrap text-[12px] text-muted">{relativeTime(a.raisedAt, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 sm:gap-5" aria-label="Stream help and rules">
          <section data-streams-card="assistant" aria-label="Stream Assistant" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
            <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
              <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-accent text-on-accent">
                <MessageIcon size={17} />
              </span>
              <h2 className="text-[16.5px] font-bold text-ink">Stream Assistant</h2>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
            <img src={ASSISTANT_ART} alt="" className="block w-full object-cover" />
            <div className="p-4">
              <h3 className="text-[17px] font-extrabold leading-tight text-ink">Keep your job streams running smoothly</h3>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted">I monitor your integrations and can help you set up new sources, optimize keywords, or troubleshoot sync issues.</p>
              <button type="button" onClick={openHelpPanel} className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
                <MessageIcon size={17} className="flex-none" />
                <span className="min-w-0 flex-1 truncate">Ask a question</span>
                <ChevronRightIcon size={16} className="flex-none" />
              </button>
            </div>
          </section>

          <section data-streams-card="rules" aria-label="Stream Rules" className={CARD}>
            <header className="mb-3 flex items-center gap-2.5">
              <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TINTS.blue)}>
                <GearIcon size={19} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16.5px] font-bold leading-tight text-ink">Stream Rules</h2>
                <p className="text-[12px] text-muted">Manage how incoming jobs are filtered and routed.</p>
              </div>
            </header>
            {loading ? (
              <CardSkeleton rows={4} />
            ) : (
              <ul className="flex flex-col">
                {rules.map((r) => {
                  const { icon: Icon, tint } = RULE_ICONS[r.key];
                  return (
                    <li key={r.key} className="border-t border-line first:border-0">
                      <button type="button" data-rule-row={r.key} onClick={() => setDialog({ kind: "rule", rule: r })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-paper-2">
                        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TINTS[tint])}>
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold text-ink">{RULE_COPY[r.key].title}</span>
                          <span className="block text-[12px] text-muted">{RULE_COPY[r.key].blurb}</span>
                        </span>
                        {!r.enabled ? <span className="flex-none rounded-md bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-muted">Off</span> : null}
                        <ChevronRightIcon size={16} className="flex-none text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {dialog?.kind === "stream" ? <StreamDialog stream={dialog.stream} onClose={() => setDialog(null)} onSave={(input) => saveStream(dialog.stream, input)} /> : null}
      {dialog?.kind === "rule" ? <RuleDialog rule={dialog.rule} onClose={() => setDialog(null)} onSave={(input) => saveRule(dialog.rule, input)} /> : null}
    </div>
  );
}
