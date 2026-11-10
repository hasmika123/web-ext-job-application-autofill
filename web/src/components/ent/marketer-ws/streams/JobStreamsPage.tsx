"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  Button, CheckCircleIcon, ChevronRightIcon, ClockIcon, ErrorState, Input, Menu,
  MoreVerticalIcon, NetworkIcon, PlusIcon, RefreshIcon, SearchIcon, Select, ShieldIcon, SourceLogo, Switch, XCircleIcon, ZapIcon, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { relativeTime } from "@/lib/ent/dashboard";
import { clockText } from "@/lib/ent/marketer-ws/home";
import {
  RULE_COPY, RULE_KEYS, STATUS_LABEL, agoText, configureStream, createStream, fetchStreams, keywordSummary, logoForStream,
  pauseStream, resumeStream, scheduleLabel, updateRule, type RuleKey, type RuleRow, type StreamInput, type StreamRow, type StreamStatus, type StreamsQuery, type StreamsView,
} from "@/lib/ent/marketer-ws/streams";
import { CARD, CardSkeleton, Empty, TH, TINTS, type MktPageProps, type TintName } from "../parts";
import { RuleDialog, StreamDialog } from "./StreamDialogs";

/**
 * The Sources tab of Jobs. One call draws the board; every card has its own empty state, never a made-up row. The writes
 * (add / configure / pause / resume a stream, toggle a rule) only RECORD settings: nothing here connects to a site, and nothing
 * submits for a consultant (E1). The sync history is written by the API's `recordSync`, which a later connector calls.
 */

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
const RECENT_SHOWN = 8;
/** The API still draws a per-day chart for this window; the board no longer shows it, so the window is fixed. */
const CHART_DAYS = 7;
const GHOST_BTN = "inline-flex h-8 flex-none items-center justify-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-50";

const ALL = "";

export default function JobStreamsPage({ orgId, hrefs }: MktPageProps) {
  const [view, setView] = useState<StreamsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<StreamsQuery>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "stream"; stream: StreamRow | null } | { kind: "rule"; rule: RuleRow } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [allRecent, setAllRecent] = useState(false);
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
  const reload = useCallback(() => load(query, CHART_DAYS), [load, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(query, CHART_DAYS), 0);
    return () => clearTimeout(t);
  }, [load, query]);
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === (search.trim() || undefined) ? q : { ...q, q: search.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [search]);

  if (status === "denied") return <ErrorState what="the sources" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-job-streams data-status="failed">
        <ErrorState what="the sources" description="Your job sources didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
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
  // one list, newest first: the syncs that ran and the warnings that were raised
  const recent = v
    ? [
        ...v.activity.map((a) => ({ kind: "sync" as const, id: `s${a.id}`, at: a.syncedAt, a })),
        ...v.alerts.map((a) => ({ kind: "alert" as const, id: `a${a.id}`, at: a.raisedAt, a })),
      ].sort((x, y) => (Date.parse(y.at) || 0) - (Date.parse(x.at) || 0))
    : [];
  const shownRecent = allRecent ? recent : recent.slice(0, RECENT_SHOWN);
  const lastSync = (v?.activity ?? []).map((a) => Date.parse(a.syncedAt)).filter((t) => !Number.isNaN(t)).sort((x, y) => y - x)[0] ?? null;
  const statusLine = v
    ? [
        `${v.streams.total} source${v.streams.total === 1 ? "" : "s"}`,
        `last sync ${lastSync === null ? "never" : agoText(new Date(lastSync).toISOString(), now)}`,
        `${v.alerts.length} warning${v.alerts.length === 1 ? "" : "s"}`,
      ].join(" · ")
    : null;

  return (
    <div data-job-streams data-status={status} className="flex min-w-0 max-w-full flex-col gap-4 sm:gap-5">
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <section data-streams-card="sources" aria-label="Sources" className={CARD}>
          <header className="mb-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16.5px] font-bold leading-tight text-ink">Sources</h2>
              <p data-sources-status className="mt-0.5 text-[13px] text-muted">{loading ? "Loading..." : statusLine}</p>
            </div>
            <Button variant="accent" size="sm" onClick={() => setDialog({ kind: "stream", stream: null })} className="h-10">
              <PlusIcon size={16} />
              Add source
            </Button>
          </header>

          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <label className="relative min-w-0 basis-full flex-1 sm:basis-56 sm:max-w-[220px]">
              <span className="sr-only">Search job sources</span>
              <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job sources..." className="pl-9" />
            </label>
            <Select
              aria-label="Source"
              value={query.source ?? ALL}
              onChange={(x) => setQuery((q) => ({ ...q, source: x || undefined }))}
              options={[{ value: ALL, label: "All sources" }, ...filters.sources.map((s) => ({ value: s, label: s }))]}
              className="w-full min-w-0 sm:w-[168px]"
            />
            <Select
              aria-label="Status"
              value={query.status ?? ALL}
              onChange={(x) => setQuery((q) => ({ ...q, status: x || undefined }))}
              options={[{ value: ALL, label: "All statuses" }, ...filters.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
              className="w-full min-w-0 sm:w-[168px]"
            />
            <Select
              aria-label="Client"
              value={query.client ?? ALL}
              onChange={(x) => setQuery((q) => ({ ...q, client: x || undefined }))}
              options={[{ value: ALL, label: "All clients" }, ...filters.clients.map((s) => ({ value: s, label: s }))]}
              className="w-full min-w-0 sm:w-[168px]"
            />
            <div className="ml-auto">
              <Switch label="Show inactive" checked={query.showInactive === true} onCheckedChange={(on) => setQuery((q) => ({ ...q, showInactive: on || undefined }))} />
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
            <Empty>{query.q || query.source || query.status || query.client ? "No sources match these filters." : "No sources yet. Add one to start capturing openings."}</Empty>
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
                    <th className={TH}>Sync schedule</th>
                    <th className={TH}>Keywords / filters</th>
                    <th className={TH}>Last sync</th>
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
                                View openings
                              </Link>
                            ) : (
                              <span aria-disabled className={cn(GHOST_BTN, "pointer-events-none opacity-50")}>
                                View openings
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

        <section data-streams-card="recent" aria-label="Recent syncs and warnings" className={CARD}>
          <header className="mb-3 flex flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">Recent syncs and warnings</h2>
            {recent.length > RECENT_SHOWN ? (
              <button type="button" onClick={() => setAllRecent((x) => !x)} className={GHOST_BTN}>
                {allRecent ? "Show less" : "View all"}
              </button>
            ) : null}
          </header>
          {loading ? (
            <CardSkeleton />
          ) : recent.length === 0 ? (
            <Empty>No syncs have run yet, and no warnings.</Empty>
          ) : (
            <ul className="flex flex-col">
              {shownRecent.map((r) =>
                r.kind === "sync" ? (
                  <li key={r.id} data-sync-row={r.a.id} className="flex items-start gap-2.5 border-t border-line py-2 text-[12.5px] first:border-0">
                    {r.a.status === "OK" ? <CheckCircleIcon size={16} aria-label="Sync completed" className="mt-0.5 flex-none text-green-500" /> : <XCircleIcon size={16} aria-label="Sync failed" className="mt-0.5 flex-none text-red-500" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink"><b>{r.a.source}</b> {r.a.message ?? (r.a.status === "OK" ? "sync completed" : "sync failed")}</span>
                      <span className="block text-[12px] text-muted">{r.a.openings} openings</span>
                    </span>
                    <span className="flex-none whitespace-nowrap text-[12px] text-muted">{clockText(r.a.syncedAt)}</span>
                  </li>
                ) : (
                  <li key={r.id} data-alert-row={r.a.id} data-severity={r.a.severity} className="flex items-start gap-2.5 border-t border-line py-2 first:border-0">
                    <span aria-hidden className={cn("mt-1 grid h-5 w-5 flex-none place-items-center rounded-full", r.a.severity === "ERROR" ? "bg-red-100" : "bg-amber-100")}>
                      <span className={cn("h-2.5 w-2.5 rounded-full", r.a.severity === "ERROR" ? "bg-red-500" : "bg-amber-500")} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{r.a.title}</span>
                      {r.a.detail ? <span className="block text-[12px] text-muted">{r.a.detail}</span> : null}
                    </span>
                    <span className="flex-none whitespace-nowrap text-[12px] text-muted">{relativeTime(r.a.raisedAt, now)}</span>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>

        <section data-streams-card="rules" aria-label="Source rules" className={CARD}>
          <header className="mb-3">
            <h2 className="text-[16.5px] font-bold leading-tight text-ink">Source rules</h2>
            <p className="text-[12px] text-muted">How incoming openings are filtered and routed.</p>
          </header>
          {loading ? (
            <CardSkeleton rows={4} />
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {rules.map((r) => {
                const { icon: Icon, tint } = RULE_ICONS[r.key];
                return (
                  <li key={r.key} className="border-t border-line">
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
      </div>

      {dialog?.kind === "stream" ? <StreamDialog stream={dialog.stream} onClose={() => setDialog(null)} onSave={(input) => saveStream(dialog.stream, input)} /> : null}
      {dialog?.kind === "rule" ? <RuleDialog rule={dialog.rule} onClose={() => setDialog(null)} onSave={(input) => saveRule(dialog.rule, input)} /> : null}
    </div>
  );
}
