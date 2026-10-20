"use client";

import { useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  BriefcaseIcon,
  BuildingIcon,
  Button,
  CalendarIcon,
  ChevronDownIcon,
  ErrorState,
  GlobeIcon,
  GraduationCapIcon,
  UserIcon,
  Menu,
  MapPinIcon,
  MemberAvatar,
  PencilIcon,
  SideSheet,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  DollarIcon,
  ClockIcon,
  useToast,
} from "@kiwiply/ui";
import {
  AVAILABILITY_LABEL,
  employmentLabel,
  experienceLabel,
  jobsApi,
  matchScoreText,
  errorSentence,
  postedText,
  rateText,
  relativeTime,
  STAGE_LABEL,
  STATUS_LABEL,
  workModeLabel,
  type ClientOption,
  type JobDetail,
  type PatchBody,
  type TopMatch,
} from "@/lib/ent/jobs";
import EditForm from "./EditForm";
import { Kebab, SkillChips, StatusPill } from "./parts";
import { useJobDetail } from "./useJobDetail";

export type SheetMode = "push" | "overlay" | "sheet";
export type DrawerTab = "overview" | "matches" | "submissions" | "activity";
export const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

export interface JobDrawerProps {
  orgId: number | string;
  jobId: number | null;
  mode: SheetMode;
  clientOptions: ClientOption[];
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  onClose: () => void;
  /** A saved or reloaded job: the list row and the tiles refresh from it. */
  onChanged: () => void;
  /** Bumped by the page when something outside the drawer changed this job. */
  reloadToken: number;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const OPEN_STATES = new Set(["OPEN", "IN_REVIEW"]);

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span aria-hidden className="mt-0.5 flex-none text-[var(--ent-x-4b5a8a)]">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[10.5px] text-[var(--ent-soft)]">{label}</dt>
        <dd className="mt-0.5 text-[11.5px] font-semibold leading-snug text-[var(--ent-title)]">{children}</dd>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading job" className="space-y-3 py-2">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** One consultant of "Top Consultant Matches": initials, name, title, score, and Assign (or the state the match is in). */
function MatchRow({ m, job, canAssign, busy, onAssign, onDismiss, onRestore }: { m: TopMatch; job: JobDetail; canAssign: boolean; busy: boolean; onAssign: () => void; onDismiss: () => void; onRestore: () => void }) {
  const jobOpen = OPEN_STATES.has(job.status);
  return (
    <li data-match-row={m.matchId} className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 py-2 ${m.status === "DISMISSED" ? "opacity-60" : ""}`}>
      <MemberAvatar name={m.name} size={36} />
      <div className="min-w-[5rem] flex-1">
        <p className="truncate text-[11.5px] font-bold leading-tight text-[var(--ent-title)]">{m.name}</p>
        <p className="truncate text-[10px] text-[var(--ent-soft)]" title={[m.reason, m.availability ? AVAILABILITY_LABEL[m.availability] ?? m.availability : null].filter(Boolean).join(" \u00b7 ")}>{m.title ?? ""}</p>
      </div>
      <span className="flex-none text-[11px] font-semibold text-[var(--ent-x-17995c)] tabular-nums" data-match-score>
        {matchScoreText(m.score)}
      </span>
      {m.status === "ASSIGNED" ? (
        <span data-match-assigned className="ent-pill" data-tone="purple" data-shape="round">
          Assigned{m.applicationCode ? ` \u00b7 ${m.applicationCode}` : ""}
        </span>
      ) : m.status === "DISMISSED" ? (
        canAssign && (
          <Button type="button" size="sm" variant="ghost" className="ent-ctl-btn !h-[28px]" onClick={onRestore} disabled={busy}>
            Restore
          </Button>
        )
      ) : (
        canAssign && (
          <>
            <Button type="button" size="sm" variant="accent" className="ent-btn !h-[28px] !px-4" onClick={onAssign} disabled={busy || !jobOpen} title={jobOpen ? undefined : "Reopen the job to assign someone"} aria-label={`Assign ${m.name}`}>
              Assign
            </Button>
            <Kebab label={`More for ${m.name}`} items={[{ label: "Not a fit (dismiss)", onSelect: onDismiss }]} />
          </>
        )
      )}
    </li>
  );
}

function MatchList({ orgId, job, limit, onChanged, replace }: { orgId: number | string; job: JobDetail; limit?: number; onChanged: () => void; replace: (d: JobDetail) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const live = job.topMatches.filter((m) => m.status !== "DISMISSED");
  const rows = limit ? live.slice(0, limit) : job.topMatches;
  if (job.topMatches.length === 0) {
    return (
      <p className="rounded-xl bg-paper-2 p-3 text-[11.5px] text-ink-soft" data-no-matches>
        No consultants are matched to this job yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--ent-table-line)]" data-match-list>
      {rows.map((m) => (
        <MatchRow
          key={m.matchId}
          m={m}
          job={job}
          canAssign={job.access.canAssign}
          busy={busy === m.matchId}
          onAssign={async () => {
            setBusy(m.matchId);
            const res = await jobsApi.assign(orgId, job.id, m.matchId);
            setBusy(null);
            if (!res.ok) {
              toast({ title: `Couldn't assign ${m.name}`, description: errorSentence(res), variant: "error" });
              return;
            }
            replace(res.data.job);
            onChanged();
            toast({ title: res.data.alreadyAssigned ? `${m.name} was already assigned` : `${m.name} assigned`, description: `Application ${res.data.applicationCode} is open in the Assigned stage.`, variant: "success" });
          }}
          onDismiss={async () => {
            setBusy(m.matchId);
            const res = await jobsApi.setMatch(orgId, job.id, m.matchId, "DISMISSED");
            setBusy(null);
            if (!res.ok) {
              toast({ title: `Couldn't dismiss ${m.name}`, description: errorSentence(res), variant: "error" });
              return;
            }
            replace(res.data);
            onChanged();
            toast({
              title: `${m.name} dismissed for this job`,
              variant: "success",
              duration: UNDO_MS,
              action: {
                label: "Undo",
                onClick: () =>
                  void jobsApi.setMatch(orgId, job.id, m.matchId, "SUGGESTED").then((u) => {
                    if (u.ok) {
                      replace(u.data);
                      onChanged();
                      toast({ title: "Restored", variant: "success" });
                    } else toast({ title: "Couldn't undo", description: errorSentence(u), variant: "error" });
                  }),
              },
            });
          }}
          onRestore={async () => {
            setBusy(m.matchId);
            const res = await jobsApi.setMatch(orgId, job.id, m.matchId, "SUGGESTED");
            setBusy(null);
            if (!res.ok) {
              toast({ title: `Couldn't restore ${m.name}`, description: errorSentence(res), variant: "error" });
              return;
            }
            replace(res.data);
            onChanged();
          }}
        />
      ))}
    </ul>
  );
}

function Overview({ d, save, contacts, editing }: { d: JobDetail; save: ReturnType<typeof useJobDetail>["save"]; contacts: ClientOption["contacts"]; editing: boolean }) {
  const rate = rateText(d.rate);
  if (editing) return <EditForm key={d.id} detail={d} contacts={contacts} save={save as (b: PatchBody) => ReturnType<typeof save>} />;
  return (
    <div className="space-y-4" data-overview>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
        <Fact icon={<BriefcaseIcon size={16} />} label="Job type">
          {employmentLabel(d.employment) || "Not set"}
        </Fact>
        <Fact icon={<GraduationCapIcon size={16} />} label="Experience level">
          {experienceLabel(d.experienceLevel) || "Not set"}
        </Fact>
        <Fact icon={<CalendarIcon size={16} />} label="Duration">
          {d.durationLabel || "Not set"}
        </Fact>
        <Fact icon={<DollarIcon size={16} />} label="Compensation">
          {rate || "Not stated"}
        </Fact>
        <div data-client-contact>
          <Fact icon={<UserIcon size={16} />} label="Client contact">
            {d.contact ? (
              <span className="mt-1 flex items-center gap-2">
                <MemberAvatar name={d.contact.name} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[10.5px] font-semibold leading-tight text-[var(--ent-title)]">{d.contact.name}</span>
                  <span className="block break-all text-[9px] font-normal leading-tight text-[var(--ent-soft)]">{d.contact.email ?? d.contact.title ?? ""}</span>
                </span>
              </span>
            ) : (
              <span className="font-normal text-muted">No contact set</span>
            )}
          </Fact>
        </div>
        <Fact icon={<ClockIcon size={16} />} label="Skills">
          {d.skills.length > 0 ? <SkillChips skills={d.skills} max={4} size="md" /> : <span className="font-normal text-muted">None listed</span>}
        </Fact>
      </dl>
    </div>
  );
}

function SubmissionsTab({ d }: { d: JobDetail }) {
  if (d.submissions.length === 0) return <p className="rounded-xl bg-paper-2 p-3 text-[13px] text-ink-soft">No one has been assigned or submitted for this job yet.</p>;
  return (
    <ul className="divide-y divide-line/70 rounded-xl border border-line" data-submissions-list>
      {d.submissions.map((s) => (
        <li key={s.applicationId} className="flex items-center gap-3 p-2.5">
          <MemberAvatar name={s.consultantName} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-ink">{s.consultantName}</p>
            <p className="text-[12px] text-muted">
              {s.code}
              {s.appliedOn ? ` · ${postedText(s.appliedOn + "T00:00:00Z")}` : ""}
            </p>
          </div>
          <span className="flex-none rounded-full bg-paper-2 px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            {STAGE_LABEL[s.stage] ?? s.stage}
            {s.closedReason ? ` · ${s.closedReason.toLowerCase().replace(/_/g, " ")}` : ""}
          </span>
        </li>
      ))}
      {d.submissionCount > d.submissions.length && <li className="p-2.5 text-[12.5px] text-muted">Showing {d.submissions.length} of {d.submissionCount}.</li>}
    </ul>
  );
}

function ActivityTab({ d }: { d: JobDetail }) {
  if (d.activity.length === 0) return <p className="rounded-xl bg-paper-2 p-3 text-[13px] text-ink-soft">Nothing has happened on this job yet.</p>;
  return (
    <ol className="space-y-3" data-activity-list>
      {d.activity.map((a, i) => (
        <li key={`${a.at}-${i}`} className="flex gap-2.5">
          <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
          <div className="min-w-0">
            <p className="text-[13.5px] leading-snug text-ink">{a.summary}</p>
            <p className="text-[12px] text-muted">
              {a.actor ? `${a.actor} · ` : ""}
              {relativeTime(a.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The drawer itself: docks beside the list on a wide screen, floats over it on a tablet and rises from the bottom on a phone. */
export default function JobDrawer(p: JobDrawerProps) {
  const open = p.jobId !== null;
  const toast = useToast();
  const { state, save, replace, reload } = useJobDetail(p.orgId, p.jobId, p.reloadToken);
  const [editing, setEditing] = useState(false);
  const [editFor, setEditFor] = useState<number | null>(null);
  // leaving the job being edited ends the edit mode (state derived during render, no effect)
  if (editFor !== p.jobId) {
    setEditFor(p.jobId);
    if (editing) setEditing(false);
  }

  const replaceAndNotify = (d: JobDetail) => {
    replace(d);
  };

  async function changeStatus(d: JobDetail, v: string) {
    const prev = d.status;
    const r = await save({ status: v as JobDetail["status"] });
    if (!r.ok) {
      toast({ title: "Couldn't change the status", description: r.error, variant: "error" });
      return;
    }
    p.onChanged();
    toast({
      title: `Status is now ${STATUS_LABEL[v] ?? v}`,
      variant: "success",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void save({ status: prev }).then((u) => {
            toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: u.error, variant: "error" });
            p.onChanged();
          }),
      },
    });
  }

  /** The status pill of the header: a menu that changes the status (autosave, with Undo) for someone who may edit, a plain pill otherwise. */
  const statusControl =
    state.status === "ok" ? (
      state.detail.access.canEdit ? (
        <Menu
          trigger={
            <button type="button" aria-label="Status" data-status-menu className="inline-flex items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <StatusPill status={state.detail.status} className="gap-1 !pr-2.5" trailing={<ChevronDownIcon aria-hidden size={13} />} />
            </button>
          }
          items={Object.entries(STATUS_LABEL).map(([value, label]) => ({ label, onSelect: () => void changeStatus((state as { detail: JobDetail }).detail, value), disabled: value === state.detail.status }))}
        />
      ) : (
        <StatusPill status={state.detail.status} />
      )
    ) : null;

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this job" description="It is no longer in your view. It may have been removed." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this job" description={state.message} onRetry={() => void reload()} />;
    const d = state.detail;
    const contacts = p.clientOptions.find((c) => c.id === d.client.id)?.contacts ?? (d.contact ? [d.contact] : []);
    return (
      <div data-detail-body data-job-id={d.id} className="space-y-3">
        <div className="ent-card p-3.5">
          <div className="space-y-2.5">
            {p.mode === "sheet" ? (
              <div className="flex items-center gap-2">{statusControl}</div>
            ) : (
              <div className="flex items-start gap-2 pr-8">
                <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-tight text-[var(--ent-title)]" data-job-heading>
                  {d.title}
                </h3>
                <div className="flex-none">{statusControl}</div>
              </div>
            )}
            <ul className="space-y-1.5 text-[11px] text-[var(--ent-x-46527e)]" data-job-facts>
              <li className="flex items-center gap-1.5">
                <BuildingIcon aria-hidden size={14} className="flex-none text-[var(--ent-x-4b5a8a)]" /> <span className="font-semibold text-[var(--ent-title)]">{d.client.name}</span>
                {d.access.canEdit && (
                  <button type="button" aria-pressed={editing} onClick={() => setEditing((e) => !e)} data-edit-toggle className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-accent-deep hover:bg-accent-soft">
                    <PencilIcon size={12} aria-hidden /> {editing ? "Done editing" : "Edit job"}
                  </button>
                )}
              </li>
              <li className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {d.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon aria-hidden size={13} className="text-[var(--ent-x-4b5a8a)]" /> {d.location}
                  </span>
                )}
                {d.workMode && (
                  <span className="inline-flex items-center gap-1.5">
                    <GlobeIcon aria-hidden size={13} className="text-[var(--ent-x-4b5a8a)]" /> {workModeLabel(d.workMode)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon aria-hidden size={13} className="text-[var(--ent-x-4b5a8a)]" /> Posted {postedText(d.postedAt)}
                </span>
              </li>
            </ul>
            <SkillChips skills={d.skills} max={4} size="md" />
            {d.description && !editing && (
              <p className="whitespace-pre-line text-[11px] leading-[1.5] text-[var(--ent-x-46527e)]" data-description>
                {d.description}
              </p>
            )}
          </div>
          <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DrawerTab)} variant="underline" className="ent-tabs ent-tabs-sm mt-3">
            <TabList aria-label="Job details">
              <Tab value="overview">Overview</Tab>
              <Tab value="matches">Top matches ({d.topMatches.filter((m) => m.status !== "DISMISSED").length})</Tab>
              <Tab value="submissions">Submissions ({d.submissionCount})</Tab>
              <Tab value="activity">Activity</Tab>
            </TabList>
            <TabPanel value="overview" className="pt-3.5">
              <Overview d={d} save={save} contacts={contacts} editing={editing} />
            </TabPanel>
            <TabPanel value="matches" className="pt-3">
              <MatchList orgId={p.orgId} job={d} onChanged={p.onChanged} replace={replaceAndNotify} />
            </TabPanel>
            <TabPanel value="submissions" className="pt-3">
              <SubmissionsTab d={d} />
            </TabPanel>
            <TabPanel value="activity" className="pt-3">
              <ActivityTab d={d} />
            </TabPanel>
          </Tabs>
        </div>

        <section aria-label="Top consultant matches" data-top-matches className="ent-card p-3.5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[12.5px] font-bold text-[var(--ent-title)]">Top consultant matches</h3>
            {d.topMatches.length > 3 && (
              <button type="button" onClick={() => p.onTab("matches")} className="text-[10.5px] font-semibold text-[var(--ent-x-2b5fd6)] hover:underline">
                View all matches ›
              </button>
            )}
          </div>
          <MatchList orgId={p.orgId} job={d} limit={3} onChanged={p.onChanged} replace={replaceAndNotify} />
        </section>

      </div>
    );
  })();

  const title = state.status === "ok" ? state.detail.title : "Job";
  const description = state.status === "ok" ? state.detail.client.name : undefined;

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-job-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  const sheet = (
    <SideSheet id="ent-job-sheet" side="right" mode={p.mode} bare className="ent-drawer ent-drawer-col" width={p.mode === "push" ? 426 : 480} open={open} onClose={p.onClose} title={title} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
  if (p.mode === "push") {
    return <div className={`ent-drawer-slot sticky top-2 shrink-0 self-start ${open ? "ml-[12px]" : ""}`}>{sheet}</div>;
  }
  return sheet;
}
