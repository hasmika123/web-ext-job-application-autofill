"use client";

import type { ReactNode } from "react";
import { EmptyState, ErrorState, StatePill, Skeleton, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { matchScoreText } from "@/lib/ent/jobs";
import {
  activitySentence,
  CLOSED_LABEL,
  consultantsApi,
  formatDate,
  formatTime,
  label,
  relativeTime,
  STAGE_LABEL,
  type ActivityItem,
  type ApplicationsTab as ApplicationsData,
  type AssignmentsTab as AssignmentsData,
} from "@/lib/ent/consultants";
import { MarketerCell } from "./parts";
import { useTabData, type TabState } from "./useConsultantDetail";

if (!hasStateMap("consultant-stage")) {
  registerStateMap("consultant-stage", { ASSIGNED: "grey", SUBMITTED: "amber", UNDER_REVIEW: "amber", INTERVIEWING: "green", OFFER: "green", CLOSED: "grey-outline" });
}

function Body<T>({ state, retry, what, children }: { state: TabState<T>; retry: () => void; what: string; children: (data: T) => ReactNode }) {
  if (state.status === "loading")
    return (
      <div role="status" aria-label={`Loading ${what}`} className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  if (state.status === "error") return <ErrorState variant="inline" what={what} description={state.message} onRetry={retry} />;
  return <>{children(state.data)}</>;
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-muted">{children}</h3>;
}

/** The marketer and backup, the jobs assigned to the consultant and their placements. */
export function AssignmentsTab({ orgId, id, version }: { orgId: number | string; id: number; version: string }) {
  const { state, retry } = useTabData<AssignmentsData>(() => consultantsApi.assignments(orgId, id), [orgId, id, version]);
  return (
    <div data-tab-panel="assignments" className="space-y-4">
      <Body state={state} retry={retry} what="the assignments">
        {(d) => (
          <>
            <section aria-label="Marketer">
              <H>Marketer</H>
              {d.assignment ? (
                <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3 text-[13px]">
                  <MarketerCell marketer={d.assignment.marketer} size={28} />
                  <p className="text-[12px] text-muted">
                    {d.assignment.priority.charAt(0) + d.assignment.priority.slice(1).toLowerCase()} priority
                    {d.assignment.assignedAt ? ` · since ${formatDate(d.assignment.assignedAt)}` : ""}
                  </p>
                  {d.assignment.backup && (
                    <p className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      Backup <MarketerCell marketer={d.assignment.backup} size={20} />
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState variant="inline" title="No marketer yet" description="Use Assign Marketer to give this consultant someone to market them." />
              )}
            </section>
            <section aria-label="Assigned jobs">
              <H>Assigned jobs ({d.jobs.length})</H>
              {d.jobs.length === 0 ? (
                <EmptyState variant="inline" title="No jobs assigned" description="Jobs appear here once they are assigned to this consultant." />
              ) : (
                <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper" data-assigned-jobs>
                  {d.jobs.map((j) => (
                    <li key={j.requirementId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{j.title}</span>
                        <span className="block truncate text-[12px] text-muted">{j.clientName}</span>
                      </span>
                      {j.score !== null && <span className="flex-none text-[12px] font-semibold tabular-nums text-accent-deep">{matchScoreText(j.score)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Placements">
              <H>Placements ({d.placements.length})</H>
              {d.placements.length === 0 ? (
                <p className="text-[13px] text-muted">No placements yet.</p>
              ) : (
                <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper" data-placements>
                  {d.placements.map((p) => (
                    <li key={p.id} className="px-3 py-2.5 text-[13px]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold text-ink">{p.roleTitle}</span>
                        <span className="flex-none text-[11.5px] font-semibold text-ink-soft">{p.status === "ACTIVE" ? "Active" : "Ended"}</span>
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {p.clientName}
                        {p.startDate ? ` · ${formatDate(p.startDate)}${p.endDate ? ` to ${formatDate(p.endDate)}` : ""}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Body>
    </div>
  );
}

/** The consultant's applications (newest stage change first) and their upcoming interviews. */
export function ApplicationsTab({ orgId, id, version }: { orgId: number | string; id: number; version: string; experience?: string }) {
  const { state, retry } = useTabData<ApplicationsData>(() => consultantsApi.applications(orgId, id), [orgId, id, version]);
  return (
    <div data-tab-panel="applications" className="space-y-4">
      <Body state={state} retry={retry} what="the applications">
        {(d) => (
          <>
            <section aria-label="Upcoming interviews">
              <H>Upcoming interviews ({d.interviews.length})</H>
              {d.interviews.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing is scheduled.</p>
              ) : (
                <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper" data-interviews>
                  {d.interviews.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{i.clientName}</span>
                        <span className="block text-[12px] text-muted">{i.roundLabel ?? "Interview"}</span>
                      </span>
                      <span className="flex-none text-right text-[12.5px] text-ink">
                        {formatDate(i.scheduledAt)}
                        <span className="block text-muted">{formatTime(i.scheduledAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Applications">
              <H>Applications ({d.items.length})</H>
              {d.items.length === 0 ? (
                <EmptyState variant="inline" title="No applications yet" description="Use Create Job Application to start one for this consultant." />
              ) : (
                <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper" data-applications>
                  {d.items.map((a) => (
                    <li key={a.id} className="space-y-1 px-3 py-2.5 text-[13px]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold text-ink">{a.jobTitle}</span>
                        <StatePill domain="consultant-stage" state={a.stage} label={a.stage === "CLOSED" && a.closedReason ? label(CLOSED_LABEL, a.closedReason) : label(STAGE_LABEL, a.stage)} />
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {a.code} · {a.clientName}
                        {a.appliedOn ? ` · applied ${formatDate(a.appliedOn)}` : ""}
                      </span>
                      {a.nextAction && (
                        <span className="block text-[12px] text-ink-soft">
                          Next: {a.nextAction}
                          {a.nextActionDue ? ` (due ${formatDate(a.nextActionDue)})` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Body>
    </div>
  );
}

/** Stage events of the applications and, for people with audit access, changes made to the consultant. */
export function ActivityTab({ orgId, id, version }: { orgId: number | string; id: number; version: string }) {
  const { state, retry } = useTabData<{ items: ActivityItem[] }>(() => consultantsApi.activity(orgId, id), [orgId, id, version]);
  return (
    <div data-tab-panel="activity">
      <Body state={state} retry={retry} what="the activity">
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState variant="inline" title="No activity yet" description="Application stages and changes to this consultant show up here." />
          ) : (
            <ol className="divide-y divide-line/60" data-activity-list>
              {d.items.map((a, i) => (
                <li key={`${a.at}-${i}`} className="py-2.5 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">{activitySentence(a)}</span>
                    <time dateTime={a.at} title={formatDate(a.at)} suppressHydrationWarning className="flex-none text-[12px] text-muted">
                      {relativeTime(a.at)}
                    </time>
                  </div>
                  <p className="text-[12px] text-muted">{a.actor ? `by ${a.actor}` : "by the system"}</p>
                </li>
              ))}
            </ol>
          )
        }
      </Body>
    </div>
  );
}
