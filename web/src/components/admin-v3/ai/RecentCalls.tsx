"use client";

import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, RefreshIcon, Select, Switch } from "@kiwiply/ui";
import { aiFetch, compactTokens, latency, usd } from "@/lib/ai-admin";
import type { AiCallRow, AiCallsView } from "@/lib/ai-admin";
import { DataTable, StatusChip } from "@/components/app-v2/common";
import type { DataColumn } from "@/components/app-v2/common";
import { useAiAdmin } from "./useAiAdmin";
import { useNarrow } from "./useNarrow";

// config-literal-ok: the API clamps `hours` to 1..168; these are the three windows the panel offers (1 h, 24 h, 7 d)
const WINDOWS = [
  { value: "1", label: "Last 1 h" },
  { value: "24", label: "Last 24 h" },
  { value: "168", label: "Last 7 d" },
];
const DEFAULT_HOURS = "24";
// config-literal-ok: how often the panel re-reads while the tab is visible (30 s)
const POLL_MS = 30_000;
const PAGE_LIMIT = 100; // config-literal-ok: the API's default page size; `nextBefore` pages the rest

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

interface Loaded {
  /** The filters this answer is for; a different current key means "loading". */
  key: string;
  view: AiCallsView | null;
  error: string | null;
}

function query(hours: string, task: string, provider: string, failed: boolean, before?: number): string {
  const q = new URLSearchParams({ hours, limit: String(PAGE_LIMIT) });
  if (task) q.set("task", task);
  if (provider) q.set("provider", provider);
  if (failed) q.set("failed", "true");
  if (before) q.set("before", String(before));
  return `/calls?${q.toString()}`;
}

/**
 * Recent calls & errors (from the `ai_call` ledger): window, task and provider filters, Failed only, Refresh, a table
 * (stacked cards on a phone), "Showing n of total" and Load more (`nextBefore`). It polls every 30 s while the tab is
 * visible and again after a Test connection. The first paint is the server's 24 h answer.
 */
export default function RecentCalls({ initial }: { initial: AiCallsView | null }) {
  const a = useAiAdmin();
  const narrow = useNarrow();
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [task, setTask] = useState("");
  const [provider, setProvider] = useState("");
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const key = `${hours}|${task}|${provider}|${failed}`;
  const defaultKey = `${DEFAULT_HOURS}|||false`;
  const [loaded, setLoaded] = useState<Loaded | null>(initial ? { key: defaultKey, view: initial, error: null } : null);
  const [more, setMore] = useState<{ key: string; rows: AiCallRow[]; nextBefore: number | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const external = a.refreshNonce;
  const firstRun = useRef(true);
  const hasMore = useRef(false);
  useEffect(() => {
    hasMore.current = more !== null;
  }, [more]);

  // (Re)load the first page when the filters change, on Refresh, after a test, and on the 30 s poll.
  useEffect(() => {
    let cancelled = false;
    const fetchPage = async () => {
      const res = await aiFetch<AiCallsView>("GET", query(hours, task, provider, failed));
      if (cancelled) return;
      setMore(null);
      setLoaded(res.ok ? { key, view: res.data, error: null } : { key, view: null, error: res.error });
    };
    // The server already answered for the default filters: do not ask again on the very first run.
    const skip = firstRun.current && initial !== null && key === defaultKey;
    firstRun.current = false;
    if (!skip) void fetchPage();
    const timer = setInterval(() => {
      // A reader who paged further keeps their place: the poll only refreshes the first page.
      if (document.visibilityState === "visible" && !hasMore.current) void fetchPage();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hours, task, provider, failed, key, defaultKey, nonce, external, initial]);

  const loading = loaded === null || loaded.key !== key;
  const view = !loading ? loaded.view : null;
  const extra = more && more.key === key ? more : null;
  const rows = [...(view?.rows ?? []), ...(extra?.rows ?? [])];
  const nextBefore = extra ? extra.nextBefore : (view?.nextBefore ?? null);
  const total = view ? (failed ? view.summary.failed : view.summary.calls) : 0;

  async function loadMore() {
    if (nextBefore === null) return;
    setLoadingMore(true);
    const res = await aiFetch<AiCallsView>("GET", query(hours, task, provider, failed, nextBefore));
    setLoadingMore(false);
    if (res.ok) setMore({ key, rows: [...(extra?.rows ?? []), ...res.data.rows], nextBefore: res.data.nextBefore });
  }

  const taskOptions = [{ value: "", label: "All tasks" }, ...a.config.routes.map((r) => ({ value: r.task, label: r.label })), { value: "probe", label: "Connection test" }];
  const providerOptions = [{ value: "", label: "All providers" }, ...a.config.providers.map((p) => ({ value: p.id, label: p.label }))];

  const cols: DataColumn<AiCallRow>[] = [
    {
      key: "when",
      header: "When",
      primary: true,
      className: "whitespace-nowrap",
      render: (r) => (
        <time dateTime={r.createdAt} suppressHydrationWarning className="tabular-nums">
          {new Date(r.createdAt).toLocaleString("en-US", WHEN)}
        </time>
      ),
    },
    { key: "login", header: "User", render: (r) => r.login ?? "—" },
    { key: "task", header: "Task", render: (r) => r.task },
    { key: "provider", header: "Provider", render: (r) => r.provider ?? "—" },
    { key: "model", header: "Model", className: "max-w-[220px] break-all", render: (r) => r.model ?? "—" },
    {
      key: "result",
      header: "Result",
      render: (r) => (r.success ? <StatusChip tone="green">OK</StatusChip> : <StatusChip tone="coral">✖ {r.errorKind ?? "ERROR"}</StatusChip>),
    },
    { key: "latency", header: "Latency", className: "whitespace-nowrap tabular-nums", render: (r) => latency(r.latencyMs) },
    {
      key: "tokens",
      header: "Tokens",
      className: "whitespace-nowrap tabular-nums",
      render: (r) => (r.inputTokens + r.cachedTokens + r.outputTokens === 0 ? "—" : `${compactTokens(r.inputTokens + r.cachedTokens)}/${compactTokens(r.outputTokens)}`),
    },
    { key: "cost", header: "Cost", className: "whitespace-nowrap tabular-nums", render: (r) => (r.success ? usd(r.costMicros) : "—") },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Select variant="pill" aria-label="Time window" value={hours} options={WINDOWS} onChange={setHours} />
        <Select variant="pill" aria-label="Task" value={task} options={taskOptions} onChange={setTask} />
        <Select variant="pill" aria-label="Provider" value={provider} options={providerOptions} onChange={setProvider} />
        <label className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-ink-soft sm:min-h-0">
          <Switch aria-label="Failed only" checked={failed} onCheckedChange={setFailed} />
          Failed only
        </label>
        <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-11 sm:min-h-0" onClick={() => setNonce((n) => n + 1)}>
          <RefreshIcon size={14} className="mr-1.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <p role="status" className="py-8 text-center text-[13px] text-ink-soft">
          Loading recent calls…
        </p>
      ) : loaded.error ? (
        <ErrorState variant="inline" what="recent calls" title="Couldn't load recent calls." onRetry={() => setNonce((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title="No AI calls in this window." />
      ) : (
        <>
          {narrow ? (
            <ul aria-label="Recent AI calls" className="divide-y divide-v2-line/60">
              {rows.map((r) => (
                <li key={r.id} className="py-2.5 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-semibold text-ink">
                      <time dateTime={r.createdAt} suppressHydrationWarning className="tabular-nums">
                        {new Date(r.createdAt).toLocaleTimeString("en-US", TIME)}
                      </time>{" "}
                      {r.task} · {r.provider ?? "—"}
                    </span>
                    {r.success ? <StatusChip tone="green">OK</StatusChip> : <StatusChip tone="coral">✖ {r.errorKind ?? "ERROR"}</StatusChip>}
                  </div>
                  <p className="mt-0.5 break-words text-ink-soft">
                    {latency(r.latencyMs)} · {r.success ? usd(r.costMicros) : "—"} · {r.login ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <DataTable inCard minWidth={900} actions={false} columns={cols} rows={rows} rowKey={(r) => r.id} aria-label="Recent AI calls" />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
            <span>
              Showing {rows.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
            </span>
            {nextBefore !== null && (
              <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
