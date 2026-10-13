"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsUpDownIcon, Button, ErrorState, FileTextIcon, FilterIcon, Input, MemberAvatar, Menu, MoreVerticalIcon, PlusIcon, Popover, SearchIcon, Select, SendIcon, Skeleton, UsersIcon, XCircleIcon, XIcon, cn,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  APPROVAL_LABELS, BUCKET_KEYS, BUCKET_LABELS, DEFAULT_QUERY, KPI_KEYS, KPI_TITLES, KPI_VERSUS, PERIODS, STATUS_LABELS,
  dateText, deleteView, fetchSubmissions, photoFor, recordApproval, recordStatus, requestApproval, saveView, shortDate, withdrawSubmission,
  type ApprovalState, type BoardQuery, type KpiKey, type SavedView, type SubmissionRow, type SubmissionsBoard, type SubStatus, type WriteResult,
} from "@/lib/ent/marketer-ws/submissions";
import { CARD, KpiTile, TH, HEAD_ROW, type MktPageProps, type TintName } from "../parts";
import { NewSubmissionDialog, SubmissionDetailDialog, WithdrawDialog } from "./SubmissionDialogs";
import { ActivityCard, ApprovalChip, ClientLogo, Pager, SectionNote, StatusChip, StatusDonutCard, SubmissionsHelpCard } from "./SubmissionParts";

/**
 * Submissions (Marketing workspace; design: Submissions). One call draws the KPI tiles, the table page, the donut and the activity feed.
 * E1: a submission is a RECORD of a package prepared for a job. "New Submission" creates a draft, "Send for approval" asks the consultant/approver,
 * and the "Record: ..." actions note facts reported by the consultant or the client. Nothing here submits for a consultant or sends anything to a client.
 */

const KPI_VIEW: Record<KpiKey, { icon: typeof SendIcon; tint: TintName; spark: number }> = {
  pendingApprovals: { icon: SendIcon, tint: "violet", spark: 4 },
  submittedToday: { icon: FileTextIcon, tint: "green", spark: 3 },
  underClientReview: { icon: UsersIcon, tint: "amber", spark: 2 },
  rejected: { icon: XCircleIcon, tint: "pink", spark: 5 },
};

/** Which statuses may be recorded next (mirrors the API's rules; the API enforces them). */
const NEXT: Record<SubStatus, ("SUBMITTED" | "CLIENT_REVIEW" | "INTERVIEW_REQUESTED" | "REJECTED")[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED"],
  CLIENT_REVIEW: ["INTERVIEW_REQUESTED", "REJECTED"],
  INTERVIEW_REQUESTED: ["REJECTED"],
  REJECTED: [],
};
const RECORD_LABEL = { SUBMITTED: "Record: consultant submitted", CLIENT_REVIEW: "Record: client review", INTERVIEW_REQUESTED: "Record: interview requested", REJECTED: "Record: rejected" } as const;

const SORT_COLUMNS: { key: string; label: string }[] = [
  { key: "consultant", label: "Consultant" },
  { key: "jobTitle", label: "Job Title" },
  { key: "client", label: "Client" },
  { key: "date", label: "Submission Date" },
  { key: "approval", label: "Approval State" },
  { key: "resume", label: "Resume Version" },
  { key: "status", label: "Current Status" },
];

const SEARCH_DEBOUNCE_MS = 300;
type Notice = { tone: "ok" | "error"; text: string } | null;

export default function SubmissionsPage({ orgId, hrefs }: MktPageProps) {
  const [query, setQuery] = useState<BoardQuery>(DEFAULT_QUERY);
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<SubmissionsBoard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [fetching, setFetching] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [reloadTick, setReloadTick] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<SubmissionRow | null>(null);
  const [withdrawRow, setWithdrawRow] = useState<SubmissionRow | null>(null);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const first = useRef(true);

  // The search box feeds the query after a short pause (and goes back to page 1).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 0 })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setFetching(true);
      void fetchSubmissions(orgId, query, ctl.signal).then((r) => {
        if (ctl.signal.aborted) return;
        setFetching(false);
        if (r.kind === "OK") {
          setBoard(r.board);
          setStatus("ready");
          setNow(Date.now());
        } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
        if (r.kind === "FAILED") setNotice((n) => n ?? { tone: "error", text: "The list didn't refresh. What you see may be out of date." });
      });
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, query, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  const patch = (p: Partial<BoardQuery>) => setQuery((q) => ({ ...q, ...p, page: p.page ?? 0 }));

  const sortBy = (key: string) => setQuery((q) => ({ ...q, sort: key, dir: q.sort === key ? (q.dir === "asc" ? "desc" : "asc") : key === "date" ? "desc" : "asc", page: 0 }));

  const act = async (row: SubmissionRow, run: () => Promise<WriteResult<unknown>>, done: string) => {
    setBusyId(row.id);
    setNotice(null);
    const r = await run();
    setBusyId(null);
    if (r.ok) {
      setNotice({ tone: "ok", text: done });
      reload();
    } else setNotice({ tone: "error", text: r.error });
  };

  const menuFor = (row: SubmissionRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => setDetailRow(row) }];
    if (row.actions.includes("REQUEST_APPROVAL")) {
      items.push({ label: "Send for approval", onSelect: () => void act(row, () => requestApproval(orgId, row.id), `Sent ${row.consultant.name}'s package for approval.`) });
    }
    if (row.actions.includes("RECORD_APPROVAL")) {
      items.push({ label: "Record: approved", onSelect: () => void act(row, () => recordApproval(orgId, row.id, "APPROVED"), "Recorded as approved.") });
      items.push({ label: "Record: declined", danger: true, onSelect: () => void act(row, () => recordApproval(orgId, row.id, "REJECTED"), "Recorded as declined.") });
    }
    if (row.actions.includes("RECORD_STATUS")) {
      for (const next of NEXT[row.status]) {
        items.push({
          label: RECORD_LABEL[next],
          danger: next === "REJECTED",
          onSelect: () => void act(row, () => recordStatus(orgId, row.id, next), `Recorded: ${STATUS_LABELS[next].toLowerCase()}.`),
        });
      }
    }
    if (row.actions.includes("WITHDRAW")) {
      items.push({ separator: true });
      items.push({ label: "Withdraw draft", danger: true, onSelect: () => setWithdrawRow(row) });
    }
    return items;
  };

  const header = (
    <>
      <PageHeader title="Submissions" subtitle="Send consultant profiles to jobs and clients, track approval status, and manage the entire submission process." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );

  if (status === "denied") return <ErrorState what="Submissions" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-submissions-page data-status="failed">
        {header}
        <ErrorState what="the submissions" description="Your submissions didn't load. Nothing has changed." onRetry={reload} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const b = board;
  const items = b?.items ?? [];
  const filtersActive = Boolean(query.q || query.status || query.approval || query.clientId || query.jobTitle || query.period !== DEFAULT_QUERY.period);
  const moreActive = Boolean(query.approval);
  const pageIds = items.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const applyView = (v: SavedView) => {
    setSearch(v.q ?? "");
    setQuery((q) => ({ ...q, q: v.q ?? "", status: v.status ?? "", approval: v.approval ?? "", clientId: v.clientId ? String(v.clientId) : "", jobTitle: v.jobTitle ?? "", period: v.period ?? q.period, page: 0 }));
  };
  const submitView = async (close: () => void) => {
    const name = viewName.trim();
    if (!name) return;
    setViewError(null);
    const r = await saveView(orgId, {
      name, q: query.q || undefined, status: query.status || undefined, approval: query.approval || undefined,
      clientId: query.clientId ? Number(query.clientId) : null, jobTitle: query.jobTitle || undefined, period: query.period,
    });
    if (r.ok) {
      setViewName("");
      setNotice({ tone: "ok", text: `Saved the view "${r.data.name}".` });
      close();
      reload();
    } else setViewError(r.error);
  };

  const clientOptions = [{ value: "", label: "All Clients" }, ...(b?.filters.clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))];
  const titleOptions = [{ value: "", label: "All Job Titles" }, ...(b?.filters.jobTitles ?? []).map((t) => ({ value: t, label: t }))];
  const statusOptions = [{ value: "", label: "All Statuses" }, ...BUCKET_KEYS.map((k) => ({ value: k, label: BUCKET_LABELS[k] }))];

  return (
    <div data-submissions-page data-status={status} className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {header}

      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <section aria-label="Key numbers" data-submissions-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {KPI_KEYS.map((key) => {
            const k = b?.kpis[key];
            const v = KPI_VIEW[key];
            return (
              <KpiTile
                key={key}
                id={key}
                title={KPI_TITLES[key]}
                icon={v.icon}
                tint={v.tint}
                value={k ? k.value : null}
                deltaPct={k?.deltaPct ?? null}
                versus={KPI_VERSUS[key]}
                sparkline={k?.sparkline}
                sparkIndex={v.spark}
                loading={loading}
              />
            );
          })}
        </section>

        <section data-submissions-card="table" className={cn(CARD, "p-0")}>
          <div data-submissions-toolbar className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
            <label className="relative min-w-[200px] flex-[1_1_240px]">
              <span className="sr-only">Search submissions</span>
              <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input type="search" aria-label="Search submissions" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search submissions by consultant, job, or client..." className="pl-9" />
            </label>
            <Select variant="pill" aria-label="Status" value={query.status} onChange={(v) => patch({ status: v })} options={statusOptions} />
            <Select variant="pill" aria-label="Client" value={query.clientId} onChange={(v) => patch({ clientId: v })} options={clientOptions} />
            <Select variant="pill" aria-label="Job title" value={query.jobTitle} onChange={(v) => patch({ jobTitle: v })} options={titleOptions} />
            <Select variant="pill" aria-label="Period" value={query.period} onChange={(v) => patch({ period: v })} options={PERIODS} />
            <Popover
              label="More filters"
              align="end"
              trigger={(t) => (
                <button {...t.props} ref={t.ref} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-ink-soft hover:border-accent sm:min-h-0 sm:py-2">
                  <FilterIcon size={15} aria-hidden />
                  More Filters
                  {moreActive ? <span aria-label="1 active" className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                </button>
              )}
            >
              {({ close }) => (
                <div className="flex w-64 flex-col gap-3 p-1">
                  <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
                    Approval state
                    <Select
                      aria-label="Approval state"
                      value={query.approval}
                      onChange={(v) => patch({ approval: v })}
                      options={[{ value: "", label: "Any approval state" }, ...(Object.keys(APPROVAL_LABELS) as ApprovalState[]).map((k) => ({ value: k, label: APPROVAL_LABELS[k] }))]}
                    />
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => { patch({ approval: "" }); close(); }}>
                    Clear
                  </Button>
                </div>
              )}
            </Popover>
            <Popover
              label="Save view"
              align="end"
              trigger={(t) => (
                <button {...t.props} ref={t.ref} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft sm:min-h-0 sm:py-2">
                  Save View
                </button>
              )}
            >
              {({ close }) => (
                <div className="flex w-72 flex-col gap-3 p-1">
                  {(b?.views.length ?? 0) > 0 ? (
                    <ul aria-label="Your saved views" className="flex flex-col gap-1">
                      {b?.views.map((v) => (
                        <li key={v.id} data-saved-view={v.id} className="flex items-center gap-1">
                          <button type="button" className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-ink hover:bg-paper-2" onClick={() => { applyView(v); close(); }}>
                            {v.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete view ${v.name}`}
                            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-paper-2"
                            onClick={() => void deleteView(orgId, v.id).then((r) => (r.ok ? reload() : setViewError(r.error)))}
                          >
                            <XIcon size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted">Keep the filters you are using now under a name.</p>
                  )}
                  <Input aria-label="View name" maxLength={60} value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Name this view" />
                  {viewError ? <p role="alert" className="text-[12.5px] font-semibold text-v2-danger-text">{viewError}</p> : null}
                  <Button variant="accent-soft" size="sm" disabled={!viewName.trim()} onClick={() => void submitView(close)}>
                    Save view
                  </Button>
                </div>
              )}
            </Popover>
            <Button variant="accent" size="sm" onClick={() => setNewOpen(true)} className="min-h-11 sm:min-h-0">
              <PlusIcon size={15} aria-hidden />
              New Submission
            </Button>
          </div>

          {notice ? (
            <p role="status" data-notice={notice.tone} className={cn("mx-3 mb-2 rounded-lg px-3 py-2 text-[13px] font-semibold sm:mx-4", notice.tone === "ok" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}>
              {notice.text}
            </p>
          ) : null}

          {loading ? (
            <div aria-busy="true" className="flex flex-col gap-3 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <SectionNote>{filtersActive ? "No submissions match these filters." : "Nothing recorded yet. Use New Submission to prepare a package for one of your consultants."}</SectionNote>
          ) : (
            <div className={cn("overflow-x-auto", fetching && "opacity-70")}>
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th scope="col" className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        onChange={(e) => setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                    </th>
                    {SORT_COLUMNS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={query.sort === c.key ? (query.dir === "asc" ? "ascending" : "descending") : "none"} className={TH}>
                        <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 font-semibold hover:text-ink">
                          {c.label}
                          <ArrowsUpDownIcon size={12} aria-hidden className="text-muted" />
                        </button>
                      </th>
                    ))}
                    <th scope="col" className={TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} data-submission-row={r.id} aria-busy={busyId === r.id} className={cn("border-b border-line last:border-0", busyId === r.id && "opacity-60")}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.consultant.name}`}
                          checked={selected.has(r.id)}
                          onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                          className="h-4 w-4 accent-[var(--color-accent)]"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <MemberAvatar name={r.consultant.name} src={photoFor(r.consultant.name, r.consultant.avatarUrl)} size={38} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">{r.consultant.name}</span>
                            <span className="block truncate text-[12px] text-muted">{r.consultant.role}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2">
                        {hrefs.jobs ? (
                          <Link href={hrefs.jobs} className="block font-semibold text-accent-deep hover:underline">{r.job.title}</Link>
                        ) : (
                          <span className="block font-semibold text-accent-deep">{r.job.title}</span>
                        )}
                        <span className="block text-[12px] text-muted">{r.job.code}</span>
                      </td>
                      <td className="px-2">
                        <span className="flex items-center gap-2 text-ink">
                          <ClientLogo name={r.client.name} />
                          {r.client.name}
                        </span>
                      </td>
                      <td className="px-2 whitespace-nowrap">
                        <span className="block text-ink">{dateText(r.submissionDate)}</span>
                        <span className="block text-[12px] text-muted">{relativeTime(r.submissionDate, now)}</span>
                      </td>
                      <td className="px-2"><ApprovalChip state={r.approvalState} /></td>
                      <td className="px-2 whitespace-nowrap">
                        {r.resume ? (
                          <>
                            <span className="block text-ink">{r.resume.version}</span>
                            {r.resume.updatedOn ? <span className="block text-[12px] text-muted">Updated {shortDate(r.resume.updatedOn)}</span> : null}
                          </>
                        ) : (
                          <span className="text-muted">No resume</span>
                        )}
                      </td>
                      <td className="px-2"><StatusChip status={r.status} /></td>
                      <td className="px-2">
                        {r.actions.length === 0 ? (
                          <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}>
                            View
                          </Button>
                        ) : (
                          <Menu
                            align="end"
                            disabled={busyId === r.id}
                            trigger={
                              <button type="button" aria-label={`Actions for ${r.consultant.name}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-paper-2">
                                <MoreVerticalIcon size={16} />
                              </button>
                            }
                            items={menuFor(r)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && items.length > 0 && b ? (
            <Pager page={b.page} size={b.size} total={b.total} onPage={(p) => setQuery((q) => ({ ...q, page: p }))} onSize={(n) => setQuery((q) => ({ ...q, size: n, page: 0 }))} />
          ) : null}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 sm:gap-5" aria-label="Help and activity">
        <SubmissionsHelpCard />
        <ActivityCard rows={b?.activity ?? []} viewAll={hrefs.applications ?? hrefs.activity ?? null} loading={loading} now={now} />
        <StatusDonutCard breakdown={b?.breakdown ?? null} loading={loading} period={query.donutPeriod} onPeriod={(p) => setQuery((q) => ({ ...q, donutPeriod: p }))} />
      </aside>

      <NewSubmissionDialog
        orgId={orgId}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(row) => {
          setNewOpen(false);
          setNotice({ tone: "ok", text: `Draft prepared for ${row.consultant.name}. Send it for approval when it is ready.` });
          reload();
        }}
      />
      <SubmissionDetailDialog orgId={orgId} row={detailRow} onClose={() => setDetailRow(null)} />
      <WithdrawDialog
        row={withdrawRow}
        busy={busyId !== null}
        onClose={() => setWithdrawRow(null)}
        onConfirm={() => {
          const row = withdrawRow;
          setWithdrawRow(null);
          if (row) void act(row, () => withdrawSubmission(orgId, row.id), "Draft withdrawn.");
        }}
      />
    </div>
  );
}
