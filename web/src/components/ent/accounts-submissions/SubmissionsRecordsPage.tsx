"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, CheckCircleIcon, ClockIcon, EmptyState, ErrorState, FileTextIcon, MemberAvatar, Tab, TabList, Tabs, TableSkeleton, UsersIcon, useNarrow } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { SearchBox } from "@/components/ent/placements/parts";
import { formatDay } from "@/lib/ent/placements";
import {
  APPROVAL_LABEL,
  errorSentence,
  parseSubmissionView,
  showingText,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  SUBMISSION_PAGE_SIZE,
  submissionsApi,
  submissionViewParams,
  type SubmissionCounts,
  type SubmissionRow,
  type SubmissionStatus,
  type SubmissionView,
} from "@/lib/ent/submissions-records";

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: SubmissionRow[]; total: number };

function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span className="ent-pill !rounded-md !px-2.5 !py-[3px] !text-[11px] !font-medium" data-tone={STATUS_TONE[status]} data-submission-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const HEAD = "px-2 py-2 text-left text-[12px] font-bold text-[color:var(--ent-title)]";
const CELL = "px-2 py-2.5 text-[13px] text-ink";

/**
 * The Accounts workspace Submissions page. These are RECORDS of the organization's submissions (who, which requirement and client, where each stands).
 * There is no submit control and no write call anywhere on this page: the consultant submits, the marketer records the fact, Kiwiply never submits.
 */
export default function SubmissionsRecordsPage({ orgId, orgName }: { orgId: number; orgName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const narrow = useNarrow();
  const view = useMemo(() => parseSubmissionView(new URLSearchParams(search.toString())), [search]);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: SubmissionCounts | null }>({ status: "loading", data: null });
  const seq = useRef(0);

  const setView = useCallback(
    (patch: Partial<SubmissionView>, resetPage = true) => {
      const next: SubmissionView = { ...view, ...patch, page: patch.page ?? (resetPage ? 0 : view.page) };
      const qs = submissionViewParams(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [view, router, pathname],
  );

  const load = useCallback(
    async (v: SubmissionView) => {
      const mine = ++seq.current;
      setList({ status: "loading" });
      const r = await submissionsApi.list(orgId, v);
      if (mine !== seq.current) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );
  const listKey = JSON.stringify([view.status, view.q, view.page]);
  useEffect(() => {
    void load(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key above is the view's list-affecting part
  }, [listKey, load]);
  useEffect(() => {
    void submissionsApi.counts(orgId).then((r) => setCounts(r.ok ? { status: "ok", data: r.data } : { status: "error", data: null }));
  }, [orgId]);

  const rows = list.status === "ok" ? list.items : [];
  const total = list.status === "ok" ? list.total : 0;
  const c = counts.data;
  const pages = Math.max(1, Math.ceil(total / SUBMISSION_PAGE_SIZE));
  const tiles = [
    { key: "total", label: "All submissions", icon: <FileTextIcon size={20} />, tone: "blue", value: c?.total ?? null },
    { key: "review", label: "In client review", icon: <ClockIcon size={20} />, tone: "orange", value: c ? (c.byStatus.CLIENT_REVIEW ?? 0) : null },
    { key: "interview", label: "Interview requested", icon: <CheckCircleIcon size={20} />, tone: "green", value: c ? (c.byStatus.INTERVIEW_REQUESTED ?? 0) : null },
    { key: "awaiting", label: "Waiting on consultants", icon: <UsersIcon size={20} />, tone: "violet", value: c?.awaitingApproval ?? null },
  ];

  return (
    <div data-submissions-records-page>
      <PageHeader title="Submissions" subtitle={`The submissions recorded for ${orgName} clients. The consultant submits; this page only shows the record.`} />
      <div className="space-y-4">
        <ul aria-label="Submission figures" className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-submission-tiles>
          {tiles.map((t) => (
            <li key={t.key} data-tile={t.key}>
              <div className="ent-card flex h-full flex-col px-4 pb-3 pt-3.5">
                <span aria-hidden className="ent-kpi-chip !h-10 !w-10 !rounded-[10px]" data-tone={t.tone}>
                  {t.icon}
                </span>
                <span className="ent-kpi-label mt-2.5 !text-[12.5px] !font-normal leading-tight">{t.label}</span>
                <span className="ent-kpi-value mt-1 !text-[25px]" data-tile-value>
                  {counts.status === "loading" ? "" : t.value === null ? "—" : t.value.toLocaleString("en-US")}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <section aria-label="Submissions" className="ent-card px-4 pb-4 pt-1.5" data-submissions-card>
          <Tabs value={view.status || "all"} onValueChange={(t) => setView({ status: t === "all" ? "" : (t as SubmissionStatus) })} variant="underline">
            <TabList aria-label="Submission statuses" className="!gap-3 overflow-x-auto">
              <Tab value="all" className="!px-1 !py-2.5 !text-[13px]">
                All{c ? ` (${c.total})` : ""}
              </Tab>
              {STATUS_ORDER.map((s) => (
                <Tab key={s} value={s} className="!px-1 !py-2.5 !text-[13px]">
                  {STATUS_LABEL[s]}
                  {c ? ` (${c.byStatus[s] ?? 0})` : ""}
                </Tab>
              ))}
            </TabList>
          </Tabs>
          <div className="mt-2.5">
            <SearchBox value={view.q} onChange={(q) => setView({ q })} label="Search submissions" placeholder="Search by consultant, client, requirement or code…" />
          </div>

          <div className="mt-3">
            {list.status === "loading" && <TableSkeleton count={5} columns={5} label="Loading submissions" />}
            {list.status === "error" && <ErrorState what="the submissions" description={list.message} onRetry={() => void load(view)} />}
            {list.status === "ok" && rows.length === 0 && (
              <EmptyState title="No submissions here" description="Submissions appear once a marketer prepares a package for a consultant and records it. You can see them here as they move." />
            )}
            {list.status === "ok" && rows.length > 0 && !narrow && (
              <div className="overflow-x-auto" data-submissions-table>
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-[color:var(--ent-table-line)]">
                      <th className={HEAD}>Consultant</th>
                      <th className={HEAD}>Requirement</th>
                      <th className={HEAD}>Client</th>
                      <th className={HEAD}>Status</th>
                      <th className={HEAD}>Consultant approval</th>
                      <th className={HEAD}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} data-row-id={r.id} className="border-b border-[color:var(--ent-table-line)]">
                        <td className={CELL}>
                          <span className="flex items-center gap-2">
                            <MemberAvatar name={r.consultant.name} size={30} />
                            <span className="font-semibold">{r.consultant.name}</span>
                          </span>
                        </td>
                        <td className={CELL}>
                          <span className="block font-medium">{r.requirementTitle}</span>
                          <span className="block text-[12px] text-muted">{r.code}</span>
                        </td>
                        <td className={CELL}>{r.clientName}</td>
                        <td className={CELL}>
                          <StatusPill status={r.status} />
                        </td>
                        <td className={`${CELL} text-[12.5px]`}>{APPROVAL_LABEL[r.approvalState] ?? r.approvalState}</td>
                        <td className={`${CELL} whitespace-nowrap`}>{r.submittedOn ? formatDay(r.submittedOn) : <span className="text-muted">Not yet</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list.status === "ok" && rows.length > 0 && narrow && (
              <ul aria-label="Submissions" className="space-y-2.5" data-submission-cards>
                {rows.map((r) => (
                  <li key={r.id} data-row-id={r.id} className="rounded-[14px] border border-[color:var(--ent-card-border)] bg-white p-3">
                    <div className="flex items-start gap-2.5">
                      <MemberAvatar name={r.consultant.name} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-ink">{r.consultant.name}</p>
                        <p className="text-[12.5px] text-muted">
                          {r.requirementTitle} at {r.clientName}
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    <p className="mt-2 text-[12px] text-muted">
                      {r.code} · {APPROVAL_LABEL[r.approvalState] ?? r.approvalState} · {r.submittedOn ? `Submitted ${formatDay(r.submittedOn)}` : "Not submitted yet"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {list.status === "ok" && rows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between" data-pagination>
              <p aria-live="polite">{showingText(total, view.page, SUBMISSION_PAGE_SIZE, rows.length)}</p>
              {pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={view.page <= 0} onClick={() => setView({ page: view.page - 1 }, false)}>
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {view.page + 1} of {pages}
                  </span>
                  <Button type="button" variant="ghost" disabled={view.page >= pages - 1} onClick={() => setView({ page: view.page + 1 }, false)}>
                    Next
                  </Button>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
