"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ChatIcon,
  ChevronDownIcon,
  ErrorState,
  FileTextIcon,
  MoreVerticalIcon,
  Menu,
  SideSheet,
  Skeleton,
  VideoIcon,
  cn,
} from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { BASE, Card, CompanyMark, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import InboxUndo from "@/components/inbox/InboxUndo";
import { reviewEndpoints } from "@/lib/ent/consultant-ws/inbox";
import { actorLine, type Viewer } from "@/lib/actors";
import { RelationTag } from "@/components/app-v3/applications/UpdatedBy";
import { UpdatedMeta, seatViewer } from "@/components/ent/applications/changeAudit";
import {
  ACTOR_LABELS,
  DEFAULT_QUERY,
  SORT_OPTIONS,
  fetchApplications,
  fetchDetail,
  formatDate,
  nextStep,
  sourceBadge,
  stageLabel,
  statusLabel,
  type AppDetail,
  type AppRow,
  type ApplicationsView,
  type Fetched,
  type ListQuery,
  type SortKey,
} from "@/lib/ent/consultant-ws/applications";

/**
 * Consultant My Applications (design/enterprise-consultant/applications.webp): one call to
 * `GET /api/orgs/{orgId}/me-workspace/applications?status=&sort=&page=` draws the page for the signed-in consultant's OWN applications;
 * the status filter, the sort and the paging all run in the API. The page is read-only: the marketer prepares and the consultant submits
 * outside Kiwiply, so there is nothing to edit and no submit button. Empty blocks say so in a sentence; there is no made-up number.
 */

/* ── the applications table ─────────────────────────────────────────────────────────── */

interface RowActions {
  open: (r: AppRow) => void;
  go: (href: string) => void;
}

const selectCls = "min-h-9 appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function Applications({ view, query, onQuery, a, busy }: { view: ApplicationsView; query: ListQuery; onQuery: (q: ListQuery) => void; a: RowActions; busy: boolean }) {
  const { paging } = view;
  const from = paging.total === 0 ? 0 : paging.page * paging.size + 1;
  const to = Math.min(paging.total, (paging.page + 1) * paging.size);
  const filtered = query.status !== "ALL";
  return (
    <Card
      id="applications-list"
      title="My applications"
      icon={FileTextIcon}
      extra={
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="relative">
            <select aria-label="Filter by status" value={query.status} onChange={(e) => onQuery({ ...query, status: e.target.value, page: 0 })} className={selectCls}>
              {view.statuses.map((o) => (
                <option key={o.key} value={o.key}>
                  {statusLabel(o.key)} ({o.count})
                </option>
              ))}
              {!view.statuses.some((o) => o.key === query.status) ? <option value={query.status}>{statusLabel(query.status)}</option> : null}
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </span>
          <span className="relative">
            <select aria-label="Sort by" value={query.sort} onChange={(e) => onQuery({ ...query, sort: e.target.value as SortKey, page: 0 })} className={selectCls}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  Sort by: {o.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </span>
        </div>
      }
    >
      {view.rows.length === 0 ? (
        <Empty>
          {filtered
            ? `No applications are ${statusLabel(query.status).toLowerCase()} right now.`
            : "No applications yet. Your marketer prepares them with you; once one is on its way it will show up here with its stage and next step."}
        </Empty>
      ) : (
        <div className={cn("overflow-x-auto", busy && "opacity-70")} aria-busy={busy}>
          <table className={cn(TABLE, "min-w-[620px] 2xl:min-w-[860px]")}>
            {/* Submission Source only from 2xl: below it the card is too narrow and would clip the actions (it is in the details sheet) */}
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Company", "Role", "Applied date", "Submission source", "Current stage", "Next step", ""].map((c, i) => (
                  <th key={`${c}-${i}`} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Submission source" && "hidden 2xl:table-cell")}>
                    {c || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.rows.map((r) => {
                const st = stageLabel(r.stage, r.closedReason);
                const src = sourceBadge(r.source);
                const nx = nextStep(r);
                const label = `${r.title ?? "application"} at ${r.company ?? "the company"}`;
                return (
                  <tr key={r.applicationId} data-application={r.applicationId}>
                    <td className={TD}>
                      <span className="flex items-center gap-2 font-semibold">
                        <CompanyMark name={r.company} />
                        <span className="min-w-0 max-w-[120px] truncate">{r.company ?? "-"}</span>
                      </span>
                    </td>
                    <td className={cn(TD, "max-w-[160px] text-ink-soft")}>{r.title ?? "-"}</td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{formatDate(r.appliedOn) || "-"}</td>
                    <td className={cn(TD, "hidden 2xl:table-cell")}>{src ? <Pill tone={src.tone}>{src.label}</Pill> : <span className="text-muted">-</span>}</td>
                    <td className={TD}>
                      <Pill tone={st.tone} data-stage={r.stage}>
                        {st.label}
                      </Pill>
                    </td>
                    <td className={cn(TD, "text-[12.5px] leading-snug text-ink-soft")}>
                      {nx ? (
                        <>
                          <span className="block text-ink">{nx.action}</span>
                          {nx.due ? <span className="block text-muted">{nx.due}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-action="view" aria-label={`View ${label}`} onClick={() => a.open(r)} className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                          View
                        </button>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${label}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: "View details", icon: <FileTextIcon size={15} />, onSelect: () => a.open(r) },
                            { label: "Ask my marketer", icon: <ChatIcon size={15} />, onSelect: () => a.go(`${BASE}/marketer`) },
                            { label: "Prepare for interview", icon: <VideoIcon size={15} />, disabled: r.stage !== "INTERVIEWING", onSelect: () => a.go(`${BASE}/interviews?tab=prepare`) },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paging.pages > 1 ? (
        <nav aria-label="Applications pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span data-range>
            Showing {from}-{to} of {paging.total}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={paging.page <= 0 || busy} onClick={() => onQuery({ ...query, page: paging.page - 1 })}>
              Previous
            </Button>
            <span className="tabular-nums">
              Page {paging.page + 1} of {paging.pages}
            </span>
            <Button variant="ghost" size="sm" disabled={paging.page >= paging.pages - 1 || busy} onClick={() => onQuery({ ...query, page: paging.page + 1 })}>
              Next
            </Button>
          </span>
        </nav>
      ) : null}
    </Card>
  );
}

/* ── the details sheet ──────────────────────────────────────────────────────────────── */

type DetailState = { id: number; result: Fetched<AppDetail> } | null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function DetailSheet({ orgId, row, state, onClose, onRetry, go, me }: { orgId: number; row: AppRow | null; state: Fetched<AppDetail> | null; onClose: () => void; onRetry: () => void; go: (href: string) => void; me: Viewer }) {
  const d = state?.kind === "OK" ? (state.view ?? null) : null;
  const [now] = useState(() => Date.now());
  const r = d?.row ?? row;
  const st = r ? stageLabel(r.stage, r.closedReason) : null;
  const src = r ? sourceBadge(r.source) : null;
  const nx = r ? nextStep(r) : null;
  return (
    <SideSheet
      id="application-detail-sheet"
      side="right"
      mode="overlay"
      width={480}
      open={row !== null}
      title={row ? `${row.title ?? "Application"}${row.company ? ` at ${row.company}` : ""}` : "Application"}
      description={row?.code || undefined}
      icon={<FileTextIcon size={20} />}
      onClose={onClose}
      footer={
        r ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(`${BASE}/marketer`)}>
              Ask my marketer
            </Button>
            {r.stage === "INTERVIEWING" ? (
              <Button size="sm" onClick={() => go(`${BASE}/interviews?tab=prepare`)}>
                Prepare for interview
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {r && st ? (
        <div data-detail={r.applicationId} className="space-y-5 pt-1">
          {/* the same line the organization's Applications page shows for the same record */}
          {d ? <UpdatedMeta updatedAt={d.updatedAt} updatedBy={d.updatedBy} createdAt={d.createdAt} createdBy={d.createdBy} me={me} now={now} /> : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Field label="Application ID">{r.code || "-"}</Field>
            <Field label="Current stage">
              <Pill tone={st.tone}>{st.label}</Pill>
            </Field>
            <Field label="Company">{r.company ?? "-"}</Field>
            <Field label="Role">{r.title ?? "-"}</Field>
            <Field label="Applied date">{formatDate(r.appliedOn) || "-"}</Field>
            <Field label="Submission source">{src ? <Pill tone={src.tone}>{src.label}</Pill> : "-"}</Field>
            <Field label="Next step">{nx ? `${nx.action}${nx.due ? ` (${nx.due})` : ""}` : "-"}</Field>
            <Field label="Last stage change">{d ? formatDate(d.stageChangedAt) || "-" : "..."}</Field>
          </dl>
          <section aria-labelledby="app-timeline">
            <h3 id="app-timeline" className="text-[14.5px] font-bold text-ink">
              Stage timeline
            </h3>
            {!state ? (
              <div aria-busy="true" className="mt-3 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : state.kind !== "OK" || !d ? (
              <div className="py-4 text-[13px] text-muted">
                <p>The timeline didn&apos;t load. Nothing has changed.</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            ) : d.timeline.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No stage changes have been recorded for this application yet.</p>
            ) : (
              <ol className="mt-3 space-y-3 border-l border-line pl-4" data-timeline>
                {d.timeline.map((e) => {
                  const s = stageLabel(e.toStage, e.toStage === "CLOSED" ? d.row.closedReason : null);
                  return (
                    <li key={e.id} data-step={e.toStage} className="relative text-[13px]">
                      <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent" />
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold text-ink">{e.type === "CREATED" ? `Added as ${s.label}` : s.label}</span>
                        <span className="text-[12px] text-muted">{formatDate(e.at)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-muted" data-actor-line>
                        {e.actor ? actorLine(e.actor, e.actor.kind, null, me) : `By ${ACTOR_LABELS[e.by].toLowerCase()}`}
                        <RelationTag actor={e.actor} me={me} />
                      </span>
                      {e.undoable && e.inboxEventId ? (<InboxUndo endpoints={reviewEndpoints(orgId)} applicationId={r.applicationId} eventId={e.inboxEventId} at={e.at} onUndone={onRetry} />) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <p className="text-[11.5px] leading-snug text-muted">You submit applications yourself, on the employer&apos;s site. This page only follows their progress. Your marketer&apos;s internal notes are not shown here.</p>
        </div>
      ) : null}
    </SideSheet>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface ApplicationsPageProps {
  orgId: number;
  firstName?: string;
  /** The consultant's own seat: "by you" in the timeline is decided by it. */
  selfMemberId?: number | null;
}

export default function ConsultantApplicationsPage({ orgId, selfMemberId }: ApplicationsPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState<ListQuery>(DEFAULT_QUERY);
  const fetcher = useCallback(() => fetchApplications(orgId, query), [orgId, query]);
  const { view, status, reload } = useWorkspaceData(fetcher);
  const [open, setOpen] = useState<AppRow | null>(null);
  const [state, setState] = useState<DetailState>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    void fetchDetail(orgId, open.applicationId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setState({ id: open.applicationId, result });
    });
    return () => ctl.abort();
  }, [orgId, open, attempt]);

  const go = useCallback((href: string) => router.push(href), [router]);
  const actions: RowActions = { open: setOpen, go };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const busy = view !== null && (view.status !== query.status || view.sort !== query.sort || view.paging.page !== query.page);
  const detail = open && state && state.id === open.applicationId ? state.result : null;

  return (
    <div data-consultant-applications data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Applications" subtitle="Each application and its next step." />

      {status === "failed" ? (
        <ErrorState what="your applications" description="Your applications didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            {view ? (
              <Applications view={view} query={query} onQuery={setQuery} a={actions} busy={busy} />
            ) : (
              <div className="grid gap-4" aria-busy="true">
                <Skeleton className="h-56 w-full" />
              </div>
            )}
          </div>
        </div>
      )}

      <DetailSheet orgId={orgId} row={open} state={detail} onClose={() => setOpen(null)} onRetry={() => setAttempt((n) => n + 1)} go={go} me={seatViewer(selfMemberId)} />
    </div>
  );
}

