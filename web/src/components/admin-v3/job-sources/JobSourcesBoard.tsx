"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  BarChartIcon,
  BoardIcon,
  CheckCircleIcon,
  FileTextIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SparklesIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { Input, Select } from "@/components/ui";
import LocalDate from "@/components/LocalDate";
import { DataTable, Donut, FilterSelect, IconTile, Pagination, SearchInput, StatusChip, toneFor, type DataColumn } from "@/components/app-v2/common";
import type { JobSource, JobSourcesView } from "@/components/admin/JobSourcesPanel";
import { AdminHero, AdminLinkTile, AdminPanel, AdminStatTiles, BarLineChart, LegendList, SampleTag, StatusDot } from "../common";
import ActionTile from "./ActionTile";
import MiniBars from "./MiniBars";
import { PERF_IMPORTED, PERF_SUCCESS, PERF_X, SOURCES_TILE_EXTRAS as X, SYNC_HISTORY, SYNC_X } from "./sample-data";

const ATS_LABEL: Record<JobSource["ats"], string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };
const ATS_TONE = { greenhouse: "green", lever: "blue", ashby: "violet" } as const;
const ORIGIN_LABEL: Record<JobSource["origin"], string> = { SEED: "Seed list", DISCOVERED: "From users", ADMIN: "Added by admin" };
const TIME = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
const PAGE_SIZE = 8;

type RowStatus = "Healthy" | "Error" | "Paused" | "Pending";
function statusOf(s: JobSource): RowStatus {
  if (!s.enabled) return "Paused";
  if (s.lastStatus === "FAILED") return "Error";
  if (!s.lastFetchedAt) return "Pending";
  return "Healthy";
}

/**
 * Job sources (board 16). Every existing behaviour of JobSourcesPanel is kept (same BFF calls):
 * Read all boards (run), Match now, Add board, switch a board on/off, search, auto-refresh while a
 * read runs. REAL: the four tiles' numbers, the sources table (search, type + status filters,
 * paging), recent errors (failing boards' last error), the type distribution and the last-run lines.
 * SAMPLE (tagged): tile deltas/sparklines, the source-performance and sync-history charts. The board's
 * per-row "Run sync / Retry", "Test connections", "View logs" and "Bulk actions" have no endpoint
 * (the API only reads every board at once), so they are left out rather than faked.
 */
export default function JobSourcesBoard({ initial }: { initial: JobSourcesView }) {
  const router = useRouter();
  const toast = useToast();
  const data = initial;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<number | "run" | "match" | "add" | null>(null);
  const [ats, setAts] = useState<JobSource["ats"]>("greenhouse");
  const [token, setToken] = useState("");
  const [company, setCompany] = useState("");

  // While a read or a match is going, refresh the page's data every 5 s so the counts move.
  const working = data.running || data.matching;
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [working, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.sources.filter((s) => {
      if (q && !(s.companyName.toLowerCase().includes(q) || s.boardToken.toLowerCase().includes(q))) return false;
      if (typeFilter !== "All types" && ATS_LABEL[s.ats] !== typeFilter) return false;
      if (statusFilter !== "All status" && statusOf(s) !== statusFilter) return false;
      return true;
    });
    // Failing boards first: they're the ones that need a look.
    return [...list].sort((a, b) => Number(b.lastStatus === "FAILED") - Number(a.lastStatus === "FAILED"));
  }, [data.sources, query, typeFilter, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const enabled = data.sources.filter((s) => s.enabled).length;
  const failing = data.sources.filter((s) => s.lastStatus === "FAILED");
  const run = data.lastRun;
  const successPct = run && run.boardsRead > 0 ? Math.round(((run.boardsRead - run.boardsFailed) / run.boardsRead) * 100) : null;

  const byAts = (["greenhouse", "lever", "ashby"] as const).map((k) => ({ k, n: data.sources.filter((s) => s.ats === k).length }));

  async function call(url: string, init: RequestInit, done: string) {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast({ variant: "error", title: body.error ?? "That didn't work." });
      return false;
    }
    toast({ variant: "success", title: done });
    router.refresh();
    return true;
  }

  async function runNow() {
    setBusy("run");
    await call("/api/admin/job-sources/run", { method: "POST" }, "Reading every board — this takes a few minutes.");
    setBusy(null);
  }

  async function matchNow() {
    setBusy("match");
    await call("/api/admin/job-sources/match", { method: "POST" }, "Matching everyone who has daily matches on.");
    setBusy(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    const ok = await call(
      "/api/admin/job-sources",
      { method: "POST", body: JSON.stringify({ ats, boardToken: token.trim(), companyName: company.trim() }) },
      `Added ${company.trim()}.`,
    );
    if (ok) {
      setToken("");
      setCompany("");
      setShowAdd(false);
    }
    setBusy(null);
  }

  async function toggle(s: JobSource) {
    setBusy(s.id);
    await call(
      `/api/admin/job-sources/${s.id}`,
      { method: "PUT", body: JSON.stringify({ enabled: !s.enabled }) },
      `${s.companyName} switched ${s.enabled ? "off" : "on"}.`,
    );
    setBusy(null);
  }

  const cols: DataColumn<JobSource>[] = [
    {
      key: "source",
      header: "Source",
      primary: true,
      render: (s) => (
        <span className={cn("flex items-center gap-2.5", !s.enabled && "opacity-60")}>
          <IconTile tone={toneFor(s.companyName)} className="h-8 w-8 flex-none rounded-lg text-[13px] font-bold">
            {s.companyName.slice(0, 1).toUpperCase()}
          </IconTile>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-semibold text-ink">{s.companyName}</span>
            <span className="block truncate text-[11.5px] text-v2-muted">{ORIGIN_LABEL[s.origin]}</span>
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (s) => (
        <span className="leading-tight">
          <StatusChip tone={ATS_TONE[s.ats]}>{ATS_LABEL[s.ats]}</StatusChip>
          <span className="mt-0.5 block font-mono text-[11px] text-v2-muted">{s.boardToken}</span>
        </span>
      ),
    },
    {
      key: "lastSync",
      header: "Last sync",
      render: (s) => (
        <span className="leading-tight">
          {s.lastFetchedAt ? <LocalDate iso={s.lastFetchedAt} options={TIME} /> : <span className="text-v2-muted">Not yet</span>}
          {s.lastStatus === "FAILED" && s.lastError && (
            <span className="block max-w-[170px] truncate text-[11.5px] text-v2-muted" title={s.lastError}>
              {s.lastError}
              {s.consecutiveFailures > 1 && ` · ${s.consecutiveFailures} nights`}
            </span>
          )}
        </span>
      ),
    },
    { key: "stored", header: "Imported jobs", className: "tabular-nums", mobileLabel: "Imported jobs", render: (s) => s.storedPostings },
    { key: "status", header: "Status", render: (s) => <StatusDot status={statusOf(s)} tone={statusOf(s) === "Pending" ? "slate" : undefined} /> },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Job Sources"
        subtitle={`Connect and manage job sources to import jobs. Daily jobs are read every night at 02:00 UTC${data.nightlyEnabled ? "" : " (switched off on this server)"}; postings first published in the last 48 hours are kept for 7 days.`}
        note="More jobs. Happier teams."
        actions={
          <>
            <button
              type="button"
              onClick={() => void runNow()}
              disabled={data.running || busy === "run"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-v2-blue px-3.5 py-2 text-[13px] font-semibold text-white shadow-v2-soft hover:opacity-90 disabled:opacity-60"
            >
              <RefreshIcon size={15} /> {data.running ? "Reading…" : "Read all boards"}
            </button>
            <button
              type="button"
              onClick={() => void matchNow()}
              disabled={data.matching || busy === "match"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-paper/90 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-v2-soft hover:bg-paper disabled:opacity-60"
            >
              <SparklesIcon size={15} /> {data.matching ? "Matching…" : "Match now"}
            </button>
          </>
        }
      />

      <AdminStatTiles
        stats={[
          { label: "Active sources", value: `${enabled}`, icon: <BoardIcon size={26} />, tone: "blue", caption: `of ${data.sources.length} sources`, delta: X.active.delta, sparkline: X.active.spark },
          { label: "Failed sources", value: String(failing.length), icon: <AlertIcon size={26} />, tone: "coral", caption: "last read failed", delta: X.failed.delta, sparkline: X.failed.spark },
          { label: "Jobs, last 48 h", value: data.freshPostings.toLocaleString("en-US"), icon: <FileTextIcon size={26} />, tone: "green", caption: "vs yesterday", delta: X.fresh.delta, sparkline: X.fresh.spark },
          { label: "Sync success rate", value: successPct === null ? "n/a" : `${successPct}%`, icon: <BarChartIcon size={26} />, tone: "violet", caption: "last run", delta: X.success.delta, sparkline: X.success.spark },
        ]}
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <AdminPanel
            title="Job sources"
            description="Manage your job sources, sync status, and imported jobs."
            right={
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  variant="grey"
                  size="sm"
                  placeholder="Search sources…"
                  aria-label="Search companies"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  wrapperClassName="w-[180px]"
                />
                <FilterSelect
                  label="Type"
                  options={["All types", "Greenhouse", "Lever", "Ashby"]}
                  value={typeFilter}
                  onChange={(v) => {
                    setTypeFilter(v);
                    setPage(1);
                  }}
                  className="w-[124px]"
                />
                <FilterSelect
                  label="Status"
                  options={["All status", "Healthy", "Error", "Paused", "Pending"]}
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v);
                    setPage(1);
                  }}
                  className="w-[124px]"
                />
                <button
                  type="button"
                  onClick={() => setShowAdd((v) => !v)}
                  aria-expanded={showAdd}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-v2-blue px-3.5 text-[13px] font-semibold text-white hover:opacity-90"
                >
                  <PlusIcon size={15} /> Add source
                </button>
              </div>
            }
          >
            {showAdd && (
              <form onSubmit={(e) => void add(e)} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-v2-line bg-paper-2/60 p-3">
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
                  ATS
                  <Select value={ats} onChange={(v) => setAts(v as JobSource["ats"])} aria-label="ATS" className="w-36">
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                  </Select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
                  Board name (from its URL)
                  <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. stripe" />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
                  Company
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Stripe" />
                </label>
                <button
                  type="submit"
                  disabled={busy === "add" || !token.trim() || !company.trim()}
                  className="h-10 rounded-xl bg-v2-blue px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "add" ? "Checking…" : "Add board"}
                </button>
              </form>
            )}
            <DataTable
              inCard
              minWidth={640}
              columns={cols}
              rows={shown}
              rowKey={(s) => s.id}
              actionsHeader="Actions"
              actions={(s) => (
                <button
                  type="button"
                  onClick={() => void toggle(s)}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-v2-line bg-paper px-2.5 py-1 text-[12.5px] font-semibold text-ink hover:bg-paper-2 disabled:opacity-60"
                >
                  {s.enabled ? "Switch off" : (
                    <>
                      <PlayIcon size={12} /> Switch on
                    </>
                  )}
                </button>
              )}
              empty={data.sources.length === 0 ? "No boards yet — the seed list loads on the first read." : "No companies match."}
              footer={
                filtered.length > 0 ? (
                  <Pagination
                    tone="blue"
                    page={cur}
                    pages={pages}
                    onPageChange={setPage}
                    className="mt-3"
                    summary={`Showing ${(cur - 1) * PAGE_SIZE + 1}-${Math.min(cur * PAGE_SIZE, filtered.length)} of ${filtered.length} sources`}
                  />
                ) : undefined
              }
            />
          </AdminPanel>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <AdminPanel title="Source type distribution" description="Breakdown of job sources by type.">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <Donut
                  legend={false}
                  size={128}
                  centerValue={data.sources.length}
                  centerLabel="Sources"
                  segments={byAts.map((b) => ({ label: ATS_LABEL[b.k], value: b.n, tone: ATS_TONE[b.k] }))}
                />
                <LegendList
                  items={byAts.map((b) => ({
                    label: ATS_LABEL[b.k],
                    tone: ATS_TONE[b.k],
                    value: b.n,
                    pct: data.sources.length ? `${Math.round((b.n / data.sources.length) * 100)}%` : "0%",
                  }))}
                />
              </div>
            </AdminPanel>

            <AdminPanel
              title="Sync history"
              description="Total jobs imported from all sources."
              right={
                <span className="flex items-center gap-2">
                  <SampleTag />
                  <FilterSelect label="Period" options={["Last 30 days", "Last 7 days"]} className="w-[138px]" />
                </span>
              }
            >
              <MiniBars bars={SYNC_HISTORY} max={3000} xLabels={SYNC_X} yLabels={["0", "1K", "2K", "3K"]} label="Jobs imported per run" />
            </AdminPanel>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <AdminPanel
            title="Source performance"
            right={
              <span className="flex items-center gap-2">
                <SampleTag />
                <FilterSelect label="Period" options={["Last 30 days", "Last 7 days"]} className="w-[138px]" />
              </span>
            }
          >
            <BarLineChart
              bars={PERF_IMPORTED}
              line={PERF_SUCCESS}
              max={1000}
              xLabels={PERF_X}
              yLabels={["0", "200", "400", "600", "800", "1,000"]}
              barLabel="Jobs imported"
              lineLabel="Sync success rate"
              height={180}
            />
          </AdminPanel>

          <AdminPanel title="Recent errors" description="Sources that failed their last read.">
            {failing.length === 0 ? (
              <p className="flex items-center gap-2 py-3 text-[13px] text-ink-soft">
                <CheckCircleIcon size={16} className="text-v2-green-ink" /> No failing sources.
              </p>
            ) : (
              <ul className="space-y-3">
                {failing.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-start gap-2.5">
                    <IconTile tone={toneFor(s.companyName)} className="h-8 w-8 flex-none rounded-lg text-[13px] font-bold">
                      {s.companyName.slice(0, 1).toUpperCase()}
                    </IconTile>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[13px] font-semibold text-ink">{s.companyName}</span>
                      <span className="block text-[12px] text-ink-soft">
                        {s.lastError ?? "Read failed."}
                        {s.consecutiveFailures > 1 && ` · ${s.consecutiveFailures} nights in a row`}
                      </span>
                    </span>
                    {s.lastFetchedAt && (
                      <span className="flex-none text-[11.5px] text-v2-muted">
                        <LocalDate iso={s.lastFetchedAt} options={TIME} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>

          <AdminPanel className="md:col-span-2 2xl:col-span-1" title="Quick actions" description="Common job source management tasks.">
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-2">
              <ActionTile onClick={() => setShowAdd(true)} icon={<PlusIcon size={22} />} tone="blue" title="Add job source" description="Connect a new Greenhouse, Lever or Ashby board." />
              <ActionTile onClick={() => void runNow()} disabled={data.running || busy === "run"} icon={<RefreshIcon size={22} />} tone="green" title="Read all boards" description="Re-read every enabled board now." />
              <ActionTile onClick={() => void matchNow()} disabled={data.matching || busy === "match"} icon={<SparklesIcon size={22} />} tone="violet" title="Match now" description="Run daily matching for everyone who has it on." />
              <AdminLinkTile href="/admin/audit" icon={<FileTextIcon size={22} />} tone="amber" title="View audit log" description="Adds and switches are audited." />
            </div>
          </AdminPanel>
        </div>
      </div>

      {(run || data.lastMatchRun) && (
        <div className="space-y-1.5 rounded-2xl border border-v2-line/60 bg-paper p-4 text-[13px] text-ink-soft shadow-v2-soft">
          {run && (
            <p>
              Last run <LocalDate iso={run.startedAt} options={TIME} /> · {Math.round(run.durationMs / 1000)} s · {run.boardsRead} boards read,{" "}
              {run.boardsFailed} failed
              {run.boardsSwitchedOff > 0 && `, ${run.boardsSwitchedOff} switched off`} · {run.postingsAdded} postings added, {run.duplicatesSkipped}{" "}
              duplicates skipped, {run.postingsDeleted} expired · {run.discovered} new from users
              {run.seedsAdded > 0 && `, ${run.seedsAdded} from the seed list`}.
            </p>
          )}
          {data.lastMatchRun && (
            <p>
              Last matching <LocalDate iso={data.lastMatchRun.startedAt} options={TIME} /> · {Math.round(data.lastMatchRun.durationMs / 1000)} s ·{" "}
              {data.lastMatchRun.users} users with matches on: {data.lastMatchRun.matched} matched ({data.lastMatchRun.shown} jobs shown),{" "}
              {data.lastMatchRun.noCandidates} had nothing new, {data.lastMatchRun.skipped} skipped, {data.lastMatchRun.errors} failed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
