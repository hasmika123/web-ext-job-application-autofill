"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BriefcaseIcon,
  BuildingIcon,
  Button,
  CalendarCheckIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  DollarIcon,
  Dialog,
  DownloadIcon,
  ErrorState,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  RefreshIcon,
  Skeleton,
  ZapIcon,
  BookOpenIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, Empty, Pill, SampleMark, TABLE, TD, useWorkspaceData } from "./parts";
import { firstName, initialsOf, shortDate } from "@/lib/ent/consultant-ws/home";
import {
  ACTIVITY_TYPES,
  MAX_NOTE,
  RESOURCES,
  checklistProgress,
  durationSub,
  durationText,
  engagementInfo,
  fetchPlacement,
  meetingBlock,
  noteProblem,
  postStatusNote,
  relativeDay,
  setChecklistItem,
  stampParts,
  withCompleted,
  type Activity,
  type ChecklistItem,
  type Meeting,
  type Placement,
  type PlacementView,
} from "@/lib/ent/consultant-ws/placements";

/**
 * Consultant My Placement (design/enterprise-consultant/placements.webp): one call to `GET /api/orgs/{orgId}/me-workspace/placements` draws the
 * page for the signed-in consultant's OWN current placement. No rate is shown anywhere: a consultant does not see the bill rate. Ticking a checklist
 * item and posting a status note are the consultant's own writes; everything else (end client, project, manager, schedule, engagement status, milestones,
 * meetings, other activity) is written by the employer / ops side, which is not built yet, so those facts are demo stand-ins (`sample`) and say so.
 */

const CONTACT_HINT = "Messages go through My Marketer. Email addresses are not shown here.";
const NO_LINK_HINT = "No join link has been shared for this meeting yet.";
const BTN_LINE = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55";

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

function Tile({ title, icon: Icon, tone, value, sub, subTone }: { title: string; icon: ComponentType<IconProps>; tone: IconTone; value: ReactNode; sub: ReactNode; subTone?: "green" | "muted" }) {
  return (
    <section aria-label={title} data-stat-tile={title} className="flex min-h-[100px] min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-12 w-12 flex-none place-items-center rounded-[14px]", TONES[tone])}>
        <Icon size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-bold leading-tight text-ink">{title}</h3>
        <p data-tile-value className="mt-0.5 text-[22px] font-extrabold leading-tight text-ink sm:text-[24px]">
          {value}
        </p>
        <p className={cn("mt-0.5 flex items-center gap-1.5 text-[12px] leading-tight", subTone === "green" ? "font-semibold text-v2-green-ink" : "text-muted")}>{sub}</p>
      </div>
    </section>
  );
}

function Tiles({ view, now }: { view: PlacementView | null; now: number }) {
  if (!view) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[100px] w-full" />
        ))}
      </div>
    );
  }
  const p = view.active;
  const dash = <span aria-label="not available">-</span>;
  return (
    <section aria-label="Key numbers" data-placement-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
      <Tile title="Active Placement" icon={BriefcaseIcon} tone="accent" value={view.activeCount} sub={p ? <><span aria-hidden className="h-2 w-2 rounded-full bg-v2-green-ink" />Current Engagement</> : "No active placement yet"} subTone={p ? "green" : "muted"} />
      <Tile title="Start Date" icon={CalendarIcon} tone="violet" value={p ? shortDate(p.startDate) : dash} sub={p ? relativeDay(p.startDate, now) : ""} />
      <Tile title="Duration" icon={ClockIcon} tone="coral" value={p ? durationText(p) : dash} sub={p ? durationSub(p) : ""} />
      <Tile title="Billable Status" icon={DollarIcon} tone="green" value={p ? (p.billable ? "Active" : "Inactive") : dash} sub={p ? <><span aria-hidden className={cn("h-2 w-2 rounded-full", p.billable ? "bg-v2-green-ink" : "bg-muted")} />{p.billable ? "Billable" : "Not billable"}</> : ""} subTone={p?.billable ? "green" : "muted"} />
      <Tile title="Next Check-in" icon={CalendarCheckIcon} tone="accent" value={p?.nextCheckIn ? shortDate(p.nextCheckIn) : p ? "Not scheduled" : dash} sub={p?.nextCheckIn ? relativeDay(p.nextCheckIn, now) : ""} />
    </section>
  );
}

/* ── placement overview ─────────────────────────────────────────────────────────────── */

function Row({ label, icon: Icon, children }: { label: string; icon?: ComponentType<IconProps>; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[110px_minmax(0,1fr)]">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
        {Icon ? <Icon size={18} className="flex-none text-accent-deep" /> : null}
        <span className="min-w-0 break-words">{children}</span>
      </dd>
    </div>
  );
}

const Nothing = () => <span className="text-muted">Not shared yet</span>;

function PersonRow({ label, name, title, sample }: { label: string; name: string | null; title: string | null; sample?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[110px_minmax(0,1fr)]">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2.5">
        {name ? (
          <>
            <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-deep">
              {initialsOf(name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold leading-tight text-ink">
                {name} {sample ? <SampleMark /> : null}
              </span>
              <span className="block truncate text-[12.5px] text-muted">{title ?? ""}</span>
            </span>
            <Link href={`${BASE}/marketer`} title={CONTACT_HINT} aria-label={`Contact ${name} (opens My Marketer)`} className={BTN_LINE}>
              Contact
            </Link>
          </>
        ) : (
          <Nothing />
        )}
      </dd>
    </div>
  );
}

function Overview({ p, marketerName, marketerTitle }: { p: Placement; marketerName: string | null; marketerTitle: string | null }) {
  const eng = engagementInfo(p.engagementStatus);
  const place = p.locationLabel ?? null;
  return (
    <Card id="placement-overview" title="Placement Overview" icon={FileTextIcon} extra={<span className="flex flex-wrap items-center gap-2"><Pill tone="green" className="min-h-7 px-3 text-[13px]">Active</Pill><span className="text-[12.5px] text-muted">Started {shortDate(p.startDate)}</span></span>}>
      {p.sample ? (
        <p data-sample-note className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <SampleMark />
          End client, project, manager, schedule and status are demo stand-ins until the employer side is connected.
        </p>
      ) : null}
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-3.5 lg:grid-cols-2">
        <div className="grid min-w-0 content-start gap-3.5">
          <Row label="Client" icon={BuildingIcon}>
            <span className="font-semibold text-accent-deep">{p.clientName ?? <Nothing />}</span>
          </Row>
          <Row label="End Client" icon={BuildingIcon}>{p.endClientName ?? <Nothing />}</Row>
          <Row label="Project Name">{p.projectName ?? <Nothing />}</Row>
          <Row label="Role / Title">{p.roleTitle}</Row>
          <Row label="Location" icon={MapPinIcon}>{place ?? <Nothing />}</Row>
          <Row label="Work Mode" icon={MonitorIcon}>{p.workMode ?? <Nothing />}</Row>
        </div>
        <div className="grid min-w-0 content-start gap-3.5">
          <PersonRow label="Manager" name={p.managerName} title={p.managerTitle} sample={p.sample} />
          <PersonRow label="Marketer" name={marketerName} title={marketerTitle} />
          <Row label="Schedule" icon={CalendarIcon}>
            {p.hoursPerWeek !== null || p.scheduleLabel ? (
              <span>
                {p.hoursPerWeek !== null ? <span className="block font-semibold">{p.hoursPerWeek} hours/week</span> : null}
                {p.scheduleLabel ? <span className="block text-[12.5px] font-normal text-muted">{p.scheduleLabel}</span> : null}
              </span>
            ) : (
              <Nothing />
            )}
          </Row>
          <Row label="Engagement Status" icon={eng ? CheckCircleIcon : undefined}>
            {eng ? (
              <span>
                <Pill tone={eng.tone} className="text-[13px]">{eng.label}</Pill>
                {p.statusNote ? <span className="mt-1 block text-[12.5px] font-normal text-muted">{p.statusNote}</span> : null}
              </span>
            ) : (
              <Nothing />
            )}
          </Row>
        </div>
      </dl>
    </Card>
  );
}

/* ── checklist, milestones, meetings ────────────────────────────────────────────────── */

interface Undo {
  id: number;
  label: string;
  completed: boolean;
}

function ChecklistCard({ items, notice, undo, sample, onToggle, onUndo }: { items: ChecklistItem[]; notice: string; undo: Undo | null; sample: boolean; onToggle: (i: ChecklistItem) => void; onUndo: () => void }) {
  const { done, total } = checklistProgress(items);
  return (
    <Card id="placement-checklist" title="Onboarding Checklist" icon={CheckCircleIcon} tone="accent" extra={total ? <span data-progress className="flex-none text-[12.5px] font-semibold text-muted">{`${done}/${total}`}</span> : null}>
      {items.length === 0 ? (
        <Empty>No onboarding items have been set up for this placement yet.</Empty>
      ) : (
        <ul aria-label="Onboarding checklist" className="divide-y divide-line">
          {items.map((c) => {
            const finished = c.completedAt !== null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={finished}
                  data-check={c.id}
                  onClick={() => onToggle(c)}
                  className="flex min-h-10 w-full items-center gap-2.5 py-1.5 text-left text-[13.5px] text-ink hover:bg-paper-2/60"
                >
                  {finished ? <CheckCircleIcon size={20} className="flex-none text-v2-green-ink" /> : <span aria-hidden className="h-5 w-5 flex-none rounded-full border-2 border-line" />}
                  <span className={cn("min-w-0 flex-1", finished && "text-ink-soft")}>{c.label}</span>
                  <span className={cn("flex-none text-[12px]", finished ? "font-semibold text-v2-green-ink" : "text-muted")}>{finished ? "Completed" : c.dueOn ? `Due ${shortDate(c.dueOn)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" aria-live="polite" data-check-notice className={cn("mt-2 flex flex-wrap items-center gap-2 text-[12.5px]", notice ? "text-v2-coral-ink" : "text-muted", !notice && !undo && "sr-only")}>
        {notice ? (
          notice
        ) : undo ? (
          <>
            <span>{`${undo.completed ? "Marked done" : "Marked not done"}: ${undo.label}`}</span>
            <button type="button" data-action="undo" onClick={onUndo} className="font-semibold text-accent-deep hover:underline">
              Undo
            </button>
          </>
        ) : null}
      </p>
      {sample && items.length > 0 ? <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted"><SampleMark />The list itself is a demo stand-in; your ticks are saved.</p> : null}
    </Card>
  );
}

function MilestonesCard({ items, sample }: { items: PlacementView["milestones"]; sample: boolean }) {
  return (
    <Card id="placement-milestones" title="Key Milestones" icon={RefreshIcon} tone="violet">
      {items.length === 0 ? (
        <Empty>No milestones have been added yet.</Empty>
      ) : (
        <ol aria-label="Key milestones" className="relative">
          {items.map((m, i) => (
            <li key={m.id} data-milestone={m.id} data-done={m.completed} className="relative flex gap-3 pb-4 last:pb-0">
              {i < items.length - 1 ? <span aria-hidden className="absolute left-[9px] top-5 h-full w-px bg-line" /> : null}
              {m.completed ? <CheckCircleIcon size={20} className="relative z-10 flex-none text-v2-green-ink" /> : <span aria-hidden className="relative z-10 mt-0.5 h-[18px] w-[18px] flex-none rounded-full border-2 border-line bg-paper-2" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13.5px] font-bold leading-tight text-ink">{m.label}</span>
                  <span className="flex-none whitespace-nowrap text-[12px] text-ink-soft">{shortDate(m.onDate)}</span>
                </span>
                {m.description ? <span className="block text-[12.5px] text-muted">{m.description}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
      {sample && items.length > 0 ? <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted"><SampleMark />Milestones are demo stand-ins until the employer side is connected.</p> : null}
    </Card>
  );
}

function MeetingsCard({ items, sample }: { items: Meeting[]; sample: boolean }) {
  return (
    <Card id="placement-meetings" title="Upcoming Meetings" icon={CalendarIcon} tone="accent">
      {items.length === 0 ? (
        <Empty>No meetings are scheduled for this placement.</Empty>
      ) : (
        <ul aria-label="Upcoming meetings" className="space-y-3">
          {items.map((m) => {
            const b = meetingBlock(m);
            return (
              <li key={m.id} data-meeting={m.id} className="flex items-center gap-3">
                <span aria-hidden className="grid h-12 w-12 flex-none place-content-center rounded-lg border border-line bg-paper text-center">
                  <span className="block text-[10.5px] font-bold leading-none text-v2-coral-ink">{b.month}</span>
                  <span className="block text-[18px] font-extrabold leading-tight text-ink">{b.day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold leading-tight text-ink">{m.label}</span>
                  <span className="block truncate text-[12px] text-muted">{b.time}</span>
                  {m.withLabel ? <span className="block truncate text-[12px] text-muted">{m.withLabel}</span> : null}
                </span>
                {m.joinUrl ? (
                  <a href={m.joinUrl} target="_blank" rel="noopener noreferrer" aria-label={`Join ${m.label} (opens in a new tab)`} className={BTN_LINE}>
                    Join
                  </a>
                ) : (
                  <button type="button" disabled title={NO_LINK_HINT} aria-label={`Join ${m.label}: ${NO_LINK_HINT}`} className={BTN_LINE}>
                    Join
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sample && items.length > 0 ? <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted"><SampleMark />Meetings are demo stand-ins until calendars are connected.</p> : null}
    </Card>
  );
}

/* ── recent activity ────────────────────────────────────────────────────────────────── */

function ActivityCard({ items, onView }: { items: Activity[]; onView: (a: Activity) => void }) {
  return (
    <Card id="placement-activity" title="Recent Placement Activity" icon={ClockIcon} tone="accent">
      {items.length === 0 ? (
        <Empty>Nothing has happened on this placement yet. Updates you post will show up here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[560px]")}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Date", "Type", "Description", "By", "Actions"].map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((a) => {
                const when = stampParts(a.occurredAt);
                const t = ACTIVITY_TYPES[a.type];
                return (
                  <tr key={a.id} data-activity={a.id}>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className="block text-ink">{when.date}</span>
                      <span className="block text-[12px] text-muted">{when.time}</span>
                    </td>
                    <td className={TD}>
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </td>
                    <td className={cn(TD, "max-w-[260px] break-words")}>{a.description}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-deep">
                          {initialsOf(a.actorLabel)}
                        </span>
                        <span className="min-w-0 truncate">{a.actorLabel ?? "-"}</span>
                      </span>
                    </td>
                    <td className={TD}>
                      <button type="button" data-action="view" aria-label={`View activity: ${a.description}`} onClick={() => onView(a)} className={BTN_LINE}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.some((a) => a.sample) ? <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted"><SampleMark />Entries from the employer side are demo stand-ins; the updates you post are real.</p> : null}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

interface QuickSpec {
  key: string;
  title: string;
  sub: string;
  icon: ComponentType<IconProps>;
  href?: string;
  onClick?: () => void;
  hint?: string;
}

function QuickActions({ hasActive, marketerName, onClient, onStatus, onDocs }: { hasActive: boolean; marketerName: string | null; onClient: () => void; onStatus: () => void; onDocs: () => void }) {
  const items: QuickSpec[] = [
    { key: "contact", title: "Contact Marketer", sub: marketerName ? `Reach out to ${marketerName}` : "Open My Marketer", icon: MailIcon, href: `${BASE}/marketer`, hint: CONTACT_HINT },
    { key: "client", title: "View Client Details", sub: "See client and project information", icon: BuildingIcon, onClick: onClient },
    { key: "status", title: "Update Status", sub: "Share an update on your placement", icon: RefreshIcon, onClick: onStatus },
    { key: "docs", title: "Download Documents", sub: "Access contracts and resources", icon: DownloadIcon, onClick: onDocs },
  ];
  const cls = "flex h-full min-h-[64px] w-full min-w-0 items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60 disabled:cursor-not-allowed disabled:opacity-55";
  return (
    <Card id="placement-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((q) => {
          const Icon = q.icon;
          const off = !hasActive && (q.key === "client" || q.key === "status");
          const body = (
            <>
              <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-tight text-ink">{q.title}</span>
                <span className="block text-[11.5px] leading-snug text-muted">{q.sub}</span>
              </span>
              <ChevronRightIcon size={15} className="flex-none text-muted" />
            </>
          );
          return (
            <li key={q.key} className="min-w-0">
              {q.href ? (
                <Link href={q.href} data-quick={q.key} title={q.hint} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" data-quick={q.key} disabled={off} title={off ? "You need an active placement for this." : undefined} onClick={q.onClick} className={cls}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ResourcesCard() {
  return (
    <Card id="placement-resources" title="Helpful Resources" icon={BookOpenIcon} tone="accent">
      <ul aria-label="Helpful resources" className="divide-y divide-line">
        {RESOURCES.map((r) => (
          <li key={r.key} className="flex min-h-10 items-center gap-2.5 py-1.5 text-[13.5px]">
            <FileTextIcon size={17} className="flex-none text-muted" />
            {r.href ? (
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-ink hover:text-accent-deep hover:underline">
                {r.label}
              </a>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-ink-soft">{r.label}</span>
                <span className="flex-none text-[11.5px] text-muted">Coming soon</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── dialogs ────────────────────────────────────────────────────────────────────────── */

function ClientDialog({ p, open, onClose }: { p: Placement | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open && p !== null}
      onClose={onClose}
      title="Client details"
      description={p ? [p.clientName, p.projectName].filter(Boolean).join(" - ") : undefined}
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {p ? (
        <dl data-client-details className="grid grid-cols-[minmax(0,1fr)] gap-3 text-[13.5px] sm:grid-cols-2">
          {(
            [
              ["Client", p.clientName],
              ["End client", p.endClientName],
              ["Project", p.projectName],
              ["Role", p.roleTitle],
              ["Location", p.locationLabel],
              ["Work mode", p.workMode],
              ["Started", shortDate(p.startDate)],
              ["Expected end", p.endDate ? shortDate(p.endDate) : "Open-ended"],
            ] as [string, string | null][]
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
              <dd className="mt-0.5 text-ink">{v ?? <span className="text-muted">Not shared yet</span>}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3 text-[12px] text-muted">Client contacts are not shown here. Reach the client through your marketer.</p>
    </Dialog>
  );
}

function StatusDialog({ open, busy, error, onCancel, onSubmit }: { open: boolean; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const problem = touched ? noteProblem(note) : null;
  const close = () => {
    setNote("");
    setTouched(false);
    onCancel();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Update status"
      description="Share a short update on your placement. It is added to your activity."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (!noteProblem(note)) onSubmit(note.trim());
            }}
          >
            Post update
          </Button>
        </div>
      }
    >
      <label className="block text-[13px] font-semibold text-ink">
        What is the latest?
        <textarea
          aria-label="Status update"
          value={note}
          maxLength={MAX_NOTE + 50}
          rows={4}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={problem !== null || error !== null}
          className="mt-1.5 w-full rounded-lg border border-line bg-paper p-2.5 text-[13.5px] font-normal text-ink"
          placeholder="For example: onboarding is finished and the first sprint starts Monday."
        />
      </label>
      <p className="mt-1 flex justify-between gap-2 text-[12px] text-muted">
        <span role="alert" className="text-v2-coral-ink">
          {problem ?? error ?? ""}
        </span>
        <span className="tabular-nums">
          {note.trim().length}/{MAX_NOTE}
        </span>
      </p>
      <p className="mt-2 text-[12px] text-muted">Please don&apos;t include personal identifiers such as ID or account numbers.</p>
    </Dialog>
  );
}

function ActivityDialog({ a, onClose }: { a: Activity | null; onClose: () => void }) {
  const when = a ? stampParts(a.occurredAt) : null;
  return (
    <Dialog
      open={a !== null}
      onClose={onClose}
      title={a ? ACTIVITY_TYPES[a.type].label : "Activity"}
      description={a && when ? `${when.date}, ${when.time}${a.actorLabel ? ` - ${a.actorLabel}` : ""}` : undefined}
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink">{a?.description}</p>
    </Dialog>
  );
}

/* ── no active placement ────────────────────────────────────────────────────────────── */

function NoPlacement({ view }: { view: PlacementView }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5">
      <Card id="placement-none" title="No active placement yet" icon={BriefcaseIcon}>
        <p data-no-placement className="text-[13.5px] leading-relaxed text-ink-soft">
          When you accept an offer and your placement starts, its details, onboarding checklist and meetings will appear here.
        </p>
        <Link href={`${BASE}/offers`} className={cn(BTN_LINE, "mt-3 w-fit")}>
          View my offers
        </Link>
      </Card>
      <Card id="placement-past" title="Past Placements" icon={ClockIcon} tone="violet">
        {view.past.length === 0 ? (
          <Empty>You have no ended placements.</Empty>
        ) : (
          <ul aria-label="Past placements" className="divide-y divide-line">
            {view.past.map((p) => (
              <li key={p.id} data-past={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{p.roleTitle}</span>
                  <span className="block text-[12.5px] text-muted">{p.clientName ?? "-"}</span>
                </span>
                <span className="text-[12.5px] text-ink-soft">
                  {shortDate(p.startDate)} - {p.endDate ? shortDate(p.endDate) : "present"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface PlacementsPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantPlacementsPage({ orgId, firstName: first }: PlacementsPageProps) {
  const toast = useToast();
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchPlacement(orgId), [orgId]));
  const loading = status === "loading";
  const [checkNotice, setCheckNotice] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Activity | null>(null);
  const [docsHint, setDocsHint] = useState(false);

  useEffect(() => () => void (undoTimer.current && clearTimeout(undoTimer.current)), []);

  const now = view ? Date.parse(view.generatedAt) || 0 : 0; // the server clock at the time of the answer

  const applyCheck = useCallback(
    async (id: number, completed: boolean): Promise<boolean> => {
      const at = new Date().toISOString();
      setView((v) => (v ? { ...v, checklist: withCompleted(v.checklist, id, completed, at) } : v));
      const res = await setChecklistItem(orgId, id, completed);
      if (!res.ok) {
        setView((v) => (v ? { ...v, checklist: withCompleted(v.checklist, id, !completed, at) } : v));
        setCheckNotice(res.status === 409 ? (res.message ?? "This placement has ended, so its checklist is locked.") : (res.message ?? "That didn't save. Nothing has changed."));
      }
      return res.ok;
    },
    [orgId, setView],
  );

  const toggle = (item: ChecklistItem) => {
    const next = item.completedAt === null;
    setCheckNotice("");
    if (undoTimer.current) clearTimeout(undoTimer.current);
    void applyCheck(item.id, next).then((ok) => {
      if (!ok) return;
      setUndo({ id: item.id, label: item.label, completed: next });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    });
  };

  const undoLast = () => {
    if (!undo) return;
    const { id, completed } = undo;
    setUndo(null);
    setCheckNotice("");
    void applyCheck(id, !completed);
  };

  const submitStatus = (note: string) => {
    setStatusError(null);
    setStatusBusy(true);
    void postStatusNote(orgId, note).then((res) => {
      setStatusBusy(false);
      if (res.ok) {
        setStatusOpen(false);
        toast({ title: "Update posted", description: "It is now in your placement activity.", variant: "success" });
        void reload();
      } else setStatusError(res.message ?? "We couldn't post your update. Nothing has changed.");
    });
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const p = view?.active ?? null;

  return (
    <div data-consultant-placements data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Placement" subtitle="View your current placement details, track progress, and stay aligned with your client engagement." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your placement" description="Your placement didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <Tiles view={loading ? null : view} now={now} />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {!view ? (
                <div className="grid gap-4" aria-busy="true">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-56 w-full" />
                  ))}
                </div>
              ) : !p ? (
                <NoPlacement view={view} />
              ) : (
                <>
                  <Overview p={p} marketerName={view.marketer?.name ?? null} marketerTitle={view.marketer?.title ?? null} />
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                    <ChecklistCard items={view.checklist} notice={checkNotice} undo={undo} sample={p.sample} onToggle={toggle} onUndo={undoLast} />
                    <MilestonesCard items={view.milestones} sample={p.sample} />
                    <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
                      <MeetingsCard items={view.meetings} sample={p.sample} />
                    </div>
                  </div>
                  <ActivityCard items={view.activity} onView={setViewing} />
                </>
              )}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
              <BeeCard
                name={firstName(first)}
                title="Your placement companion, here to help!"
                body="Have questions about your current placement? Get guidance on working with your client, managing expectations, and making the most of your engagement."
              />
              <div className="grid min-w-0 content-start gap-2">
                <QuickActions hasActive={p !== null} marketerName={view?.marketer?.name ?? null} onClient={() => setClientOpen(true)} onStatus={() => { setStatusError(null); setStatusOpen(true); }} onDocs={() => setDocsHint(true)} />
                <p role="status" aria-live="polite" data-docs-hint className={cn("px-1 text-[12.5px] text-muted", !docsHint && "sr-only")}>
                  {docsHint ? "Documents arrive with the HR workspace. Nothing is available to download yet." : ""}
                </p>
              </div>
              <ResourcesCard />
            </div>
          </div>
        </>
      )}

      <ClientDialog p={p} open={clientOpen} onClose={() => setClientOpen(false)} />
      <StatusDialog open={statusOpen} busy={statusBusy} error={statusError} onCancel={() => setStatusOpen(false)} onSubmit={submitStatus} />
      <ActivityDialog a={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
