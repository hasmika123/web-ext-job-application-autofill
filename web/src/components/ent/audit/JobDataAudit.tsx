"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import { DEFAULT_JOB_DATA_QUERY, codeLabel, fetchJobData, jobDataCsv, narrow, type JobDataPage, type JobDataQuery } from "@/lib/ent/job-data-audit";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-");

/**
 * Captured jobs (admin workspace, Audit Logs, needs audit.view at ORG scope): who captured which job, when, from where and with which extension
 * version. Read only. Filters by date (the API) and by text or source over the page on screen; Export CSV writes the rows on screen with spreadsheet
 * formulas neutralized. The API sends no job text beyond the title and employer.
 */
export default function JobDataAudit({ orgId }: { orgId: number }) {
  const [q, setQ] = useState<JobDataQuery>(DEFAULT_JOB_DATA_QUERY);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" | "failed" | "denied"; page: JobDataPage | null }>({ status: "loading", page: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    let live = true;
    void fetchJobData(orgId, q, ctl.signal).then((r) => {
      if (!live) return;
      setState(r.kind === "OK" ? { status: "ready", page: r.page } : { status: r.kind === "DENIED" ? "denied" : "failed", page: null });
    });
    return () => {
      live = false;
      ctl.abort();
    };
  }, [orgId, q, attempt]);

  const page = state.page;
  const sources = useMemo(() => Array.from(new Set((page?.items ?? []).map((i) => i.job.captureSource).filter((s): s is string => !!s))).sort(), [page]);
  const shown = useMemo(() => (page ? narrow(page.items, text, source) : []), [page, text, source]);

  const change = (patch: Partial<JobDataQuery>) => {
    setState((s) => ({ status: "loading", page: s.page }));
    setQ((cur) => ({ ...cur, ...patch, page: patch.page ?? 0 }));
  };

  if (state.status === "denied") return <ErrorState what="the captured jobs" title="This isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (state.status === "failed") return <ErrorState what="the captured jobs" description="They didn't load. Nothing has changed." onRetry={() => setAttempt((n) => n + 1)} variant="inline" />;

  const pages = page ? Math.max(1, Math.ceil(page.total / page.size)) : 1;
  const filtered = q.from !== "" || q.to !== "" || text !== "" || source !== "";
  return (
    <section data-job-data-audit className={`${CARD} p-4 sm:p-5`} aria-busy={state.status === "loading"}>
      <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter the captured jobs">
        <label className="flex min-w-[12rem] flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
          Search
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Job, employer, person or version" aria-label="Search captured jobs" />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
          Source
          <Select aria-label="Source" value={source} onChange={(v) => setSource(v)} options={[{ value: "", label: "Every source" }, ...sources.map((s) => ({ value: s, label: codeLabel(s) }))]} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
          From
          <Input type="date" value={q.from} max={q.to || undefined} onChange={(e) => change({ from: e.target.value })} aria-label="From date" />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
          To
          <Input type="date" value={q.to} min={q.from || undefined} onChange={(e) => change({ to: e.target.value })} aria-label="To date" />
        </label>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setText("");
              setSource("");
              change({ from: "", to: "" });
            }}
          >
            Clear filters
          </Button>
        ) : null}
        <Button variant="secondary" data-job-data-export disabled={shown.length === 0} onClick={() => download("captured-jobs.csv", jobDataCsv(shown))}>
          Export CSV
        </Button>
      </div>

      {state.status === "loading" && !page ? (
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : page && shown.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches these filters" : "No jobs have been captured yet"} description={filtered ? "Try a wider date range or a different search." : "When a job is captured with the extension it appears here, with who captured it."} className="mt-4" />
      ) : page ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]" data-job-data-table>
              <thead>
                <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                  <th className="px-2 py-2">Job</th>
                  <th className="px-2 py-2">Captured by</th>
                  <th className="px-2 py-2">Captured</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Extension version</th>
                  <th className="px-2 py-2">Events</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.job.id} data-job-row={i.job.id} className="border-b border-line/60 align-top">
                    <td className="px-2 py-2.5">
                      <span className="block font-medium text-ink">{i.job.title}</span>
                      {i.job.employer ? <span className="block text-ink-soft">{i.job.employer}</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-ink">{i.job.capturedBy?.name ?? "-"}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink-soft">{when(i.job.capturedAt)}</td>
                    <td className="px-2 py-2.5 text-ink-soft">
                      {codeLabel(i.job.captureSource)}
                      {i.job.captureMethod ? <span className="block text-[12px]">{codeLabel(i.job.captureMethod)}</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-ink-soft">{i.job.extensionVersion ?? "-"}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{i.events.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
            <span data-job-data-range>
              Showing {shown.length} of {page.items.length} on this page ({page.total} jobs)
            </span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={q.page === 0 || state.status === "loading"} onClick={() => change({ page: q.page - 1 })}>
                Previous
              </Button>
              <span>
                Page {q.page + 1} of {pages}
              </span>
              <Button variant="ghost" disabled={q.page + 1 >= pages || state.status === "loading"} onClick={() => change({ page: q.page + 1 })}>
                Next
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
