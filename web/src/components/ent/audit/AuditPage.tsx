"use client";

import { useEffect, useState } from "react";
import { Button, DownloadIcon, EmptyState, ErrorState, Input, Select, Skeleton, buttonVariants } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import { auditExportHref } from "@/lib/ent/org-settings";
import { DEFAULT_AUDIT_QUERY, fetchAudit, type AuditPage as Page, type AuditQuery } from "@/lib/ent/audit";

/**
 * Audit Logs (admin workspace, `/w/admin/audit`, needs audit.view at ORG scope): who did what, to whom and when, newest first, filtered by kind and by date
 * and paged. Read only. Free text, logins and IP addresses are never part of what the API sends, so nothing here can show them.
 */
export default function AuditPage({ orgId }: { orgId: number }) {
  const [q, setQ] = useState<AuditQuery>(DEFAULT_AUDIT_QUERY);
  const [state, setState] = useState<{ status: "loading" | "ready" | "failed" | "denied"; page: Page | null }>({ status: "loading", page: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    let live = true;
    void fetchAudit(orgId, q, ctl.signal).then((r) => {
      if (!live) return;
      setState(r.kind === "OK" ? { status: "ready", page: r.page } : { status: r.kind === "DENIED" ? "denied" : "failed", page: null });
    });
    return () => {
      live = false;
      ctl.abort();
    };
  }, [orgId, q, attempt]);

  const change = (patch: Partial<AuditQuery>) => {
    setState((s) => ({ status: "loading", page: s.page }));
    setQ((cur) => ({ ...cur, ...patch, page: patch.page ?? 0 }));
  };

  if (state.status === "denied") return <ErrorState what="the audit log" title="This isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (state.status === "failed") return <ErrorState what="the audit log" description="It didn't load. Nothing has changed." onRetry={() => setAttempt((n) => n + 1)} variant="inline" />;

  const page = state.page;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.size)) : 1;
  const filtered = q.action !== "" || q.from !== "" || q.to !== "";
  return (
    <section data-audit-page className={`${CARD} p-4 sm:p-5`} aria-busy={state.status === "loading"}>
      <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter the audit log">
        <label className="flex min-w-[12rem] flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
          What happened
          <Select
            aria-label="What happened"
            value={q.action}
            onChange={(v) => change({ action: v })}
            options={[{ value: "", label: "Everything" }, ...(page?.actions ?? []).map((a) => ({ value: a.action, label: a.label.charAt(0).toUpperCase() + a.label.slice(1) }))]}
          />
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
          <Button variant="ghost" onClick={() => change({ action: "", from: "", to: "" })}>
            Clear filters
          </Button>
        ) : null}
        <a href={auditExportHref(orgId, q)} download="audit-log.csv" data-audit-export className={buttonVariants("ghost", "md", "ml-auto")}>
          <DownloadIcon size={16} />
          Download CSV
        </a>
      </div>

      {state.status === "loading" && !page ? (
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : page && page.items.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches these filters" : "Nothing has been logged yet"} description={filtered ? "Try a different kind of event or a wider date range." : "Changes to your organization appear here as they happen."} className="mt-4" />
      ) : page ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]" data-audit-table>
              <thead>
                <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Who</th>
                  <th className="px-2 py-2">What</th>
                  <th className="px-2 py-2">To whom</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((r) => (
                  <tr key={r.id} data-audit-row={r.id} className="border-b border-line/60 align-top">
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink-soft">
                      <time dateTime={r.at} title={new Date(r.at).toLocaleString()}>
                        {new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </time>
                    </td>
                    <td className="px-2 py-2.5 font-medium text-ink">{r.actorName}</td>
                    <td className="px-2 py-2.5 text-ink">{r.label}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{r.targetName ?? (r.targetType ? r.targetType.toLowerCase().replace(/_/g, " ") : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
            <span data-audit-range>
              Showing {page.page * page.size + 1}-{page.page * page.size + page.items.length} of {page.total}
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
