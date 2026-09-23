"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Input, Select, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

export interface JobSource {
  id: number;
  ats: "greenhouse" | "lever" | "ashby";
  boardToken: string;
  companyName: string;
  origin: "SEED" | "DISCOVERED" | "ADMIN";
  enabled: boolean;
  lastFetchedAt: string | null;
  lastStatus: "OK" | "FAILED" | null;
  lastError: string | null;
  lastJobCount: number | null;
  consecutiveFailures: number;
  storedPostings: number;
}

export interface RunSummary {
  startedAt: string;
  durationMs: number;
  boardsRead: number;
  boardsFailed: number;
  boardsSwitchedOff: number;
  seedsAdded: number;
  discovered: number;
  postingsAdded: number;
  duplicatesSkipped: number;
  postingsDeleted: number;
}

export interface JobSourcesView {
  nightlyEnabled: boolean;
  running: boolean;
  lastRun: RunSummary | null;
  freshPostings: number;
  sources: JobSource[];
}

const ATS_LABEL: Record<JobSource["ats"], string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };
const ORIGIN_LABEL: Record<JobSource["origin"], string> = { SEED: "Seed", DISCOVERED: "From users", ADMIN: "Added" };
const TIME = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

/**
 * The job-source table and its actions (Phase 13.6a): read all boards now (then refresh every few
 * seconds until the read finishes), add a board, switch one on or off. Every action goes through the
 * BFF to Spring, which enforces ADMIN and audits adds and switches.
 */
export default function JobSourcesPanel({ initial }: { initial: JobSourcesView }) {
  const router = useRouter();
  const toast = useToast();
  const data = initial;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | "run" | "add" | null>(null);
  const [ats, setAts] = useState<JobSource["ats"]>("greenhouse");
  const [token, setToken] = useState("");
  const [company, setCompany] = useState("");

  // While a read is going, refresh the page's data every 5 s so the counts move.
  useEffect(() => {
    if (!data.running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [data.running, router]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.sources.filter((s) => s.companyName.toLowerCase().includes(q) || s.boardToken.toLowerCase().includes(q))
      : data.sources;
    // Failing boards first: they're the ones that need a look.
    return [...list].sort((a, b) => Number(b.lastStatus === "FAILED") - Number(a.lastStatus === "FAILED"));
  }, [data.sources, query]);

  const enabled = data.sources.filter((s) => s.enabled).length;
  const failing = data.sources.filter((s) => s.lastStatus === "FAILED").length;

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

  const run = data.lastRun;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Boards on" value={`${enabled} of ${data.sources.length}`} />
        <Stat label="Failing" value={String(failing)} />
        <Stat label="Postings, last 48 h" value={data.freshPostings.toLocaleString()} />
        <div className="flex flex-col justify-between gap-2 rounded-[var(--radius)] border border-line bg-paper p-5">
          <div className="text-[11px] uppercase tracking-wide text-ink-soft">Read now</div>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={data.running || busy === "run"}
            className={cn(buttonVariants("primary", "sm"), "disabled:opacity-60")}
          >
            {data.running ? "Reading…" : "Read all boards"}
          </button>
        </div>
      </div>

      {run && (
        <p className="text-[13px] text-ink-soft">
          Last run <LocalDate iso={run.startedAt} options={TIME} /> · {Math.round(run.durationMs / 1000)} s ·{" "}
          {run.boardsRead} boards read, {run.boardsFailed} failed
          {run.boardsSwitchedOff > 0 && `, ${run.boardsSwitchedOff} switched off`} · {run.postingsAdded} postings added,{" "}
          {run.duplicatesSkipped} duplicates skipped, {run.postingsDeleted} expired · {run.discovered} new from users
          {run.seedsAdded > 0 && `, ${run.seedsAdded} from the seed list`}.
        </p>
      )}

      <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-line bg-paper p-4">
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
          className={cn(buttonVariants("ghost", "sm"), "disabled:opacity-60")}
        >
          {busy === "add" ? "Checking…" : "Add board"}
        </button>
      </form>

      <div>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies" aria-label="Search companies" className="mb-3 max-w-xs" />
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 font-semibold">Board</th>
                <th className="px-4 py-2.5 font-semibold">Last read</th>
                <th className="px-4 py-2.5 font-semibold">Open jobs</th>
                <th className="px-4 py-2.5 font-semibold">Stored</th>
                <th className="px-4 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                    {data.sources.length === 0 ? "No boards yet — the seed list loads on the first read." : "No companies match."}
                  </td>
                </tr>
              )}
              {shown.map((s) => (
                <tr key={s.id} className={cn("border-b border-line bg-paper last:border-0", !s.enabled && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{s.companyName}</div>
                    <div className="text-[11.5px] text-muted">{ORIGIN_LABEL[s.origin]}</div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {ATS_LABEL[s.ats]} · <span className="font-mono text-[12px]">{s.boardToken}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {s.lastFetchedAt ? (
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5">
                          {s.lastStatus === "FAILED" ? <Badge variant="review">Failed</Badge> : <span className="text-ink">OK</span>}
                          <span className="text-[12px] text-muted">
                            <LocalDate iso={s.lastFetchedAt} options={TIME} />
                          </span>
                        </span>
                        {s.lastStatus === "FAILED" && s.lastError && (
                          <span className="text-[11.5px] text-muted">
                            {s.lastError}
                            {s.consecutiveFailures > 1 && ` · ${s.consecutiveFailures} nights in a row`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">Not yet</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink">{s.lastJobCount ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink">{s.storedPostings}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void toggle(s)}
                      disabled={busy === s.id}
                      className="text-[12.5px] font-semibold text-accent-deep hover:underline disabled:opacity-60"
                    >
                      {s.enabled ? "Switch off" : "Switch on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}
