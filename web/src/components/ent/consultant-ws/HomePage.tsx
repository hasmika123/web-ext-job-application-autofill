"use client";

import Link from "next/link";
import { useCallback, useState, type ComponentType, type ReactNode } from "react";
import {
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  DonutChart,
  ErrorState,
  FileTextIcon,
  MapPinIcon,
  SearchIcon,
  Skeleton,
  Sparkline,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
  VideoIcon,
  ZapIcon,
  chartColor,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, MoreButton, Pill, SampleMark, TABLE, TD, TableHead, ViewButton, useWorkspaceData } from "./parts";
import {
  OPPORTUNITY_LABELS,
  PRIORITY_TONE,
  applicationLabel,
  deltaText,
  employmentLabel,
  fetchHome,
  firstName,
  interviewWhen,
  matchTone,
  placeLabel,
  shortDate,
  taskStatusLabel,
  type HomeView,
  type TileData,
} from "@/lib/ent/consultant-ws/home";

/**
 * Consultant Home (design/enterprise-consultant/home.webp): one call to `GET /api/orgs/{orgId}/me-workspace/home` (through the BFF)
 * draws the page for the signed-in consultant's OWN data. A block the API flags `sample` carries a small "Sample" marker (it is
 * another role's module and gets real data when the roles merge). Empty cards say so in a sentence; there is no made-up number.
 */




/* ── data hook ──────────────────────────────────────────────────────────────────────── */



interface TileSpec {
  key: string;
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  href: string;
}
const TILE_SPECS: TileSpec[] = [
  { key: "jobMatches", title: "Job Matches", icon: BriefcaseIcon, tone: "accent", href: `${BASE}/matches` },
  { key: "assignedOpportunities", title: "Assigned Opportunities", icon: UsersIcon, tone: "pink", href: `${BASE}/opportunities` },
  { key: "activeApplications", title: "Active Applications", icon: FileTextIcon, tone: "violet", href: `${BASE}/applications` },
  { key: "upcomingInterviews", title: "Upcoming Interviews", icon: CalendarIcon, tone: "green", href: `${BASE}/interviews` },
  { key: "submissionsPending", title: "Submissions Pending Approval", icon: ClipboardCheckIcon, tone: "amber", href: `${BASE}/submissions` },
  { key: "activePlacement", title: "Active Placement", icon: TargetIcon, tone: "accent", href: `${BASE}/placements` },
];

function Tile({ spec, view, index }: { spec: TileSpec; view: HomeView | null; index: number }) {
  const Icon = spec.icon;
  const frame = (body: ReactNode, state: string) => (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-state={state} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[spec.tone])}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold leading-tight text-ink-soft">{spec.title}</h3>
        {body}
      </div>
    </section>
  );
  if (!view)
    return frame(
      <>
        <Skeleton className="mt-2 h-8 w-16" />
        <Skeleton className="mt-2 h-4 w-24" />
      </>,
      "loading",
    );
  if (spec.key === "activePlacement") {
    const p = view.tiles.activePlacement;
    return frame(
      <>
        <p data-tile-value className="mt-1 text-[28px] font-extrabold leading-none tabular-nums text-ink">
          {p.value}
        </p>
        <p className="mt-2 text-[12.5px] font-medium text-muted">{p.value > 0 ? (p.label ?? "Active") : "No active placement"}</p>
      </>,
      "ok",
    );
  }
  const t = view.tiles[spec.key as keyof Omit<HomeView["tiles"], "activePlacement">] as TileData;
  const d = deltaText(t.deltaPct);
  return frame(
    <>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p data-tile-value className="text-[28px] font-extrabold leading-none tabular-nums text-ink">
          {t.value}
        </p>
        {t.sparkline.length > 1 ? (
          <div className="mb-0.5 w-[46%] max-w-[80px] flex-none">
            <Sparkline values={t.sparkline} color={chartColor(index)} />
          </div>
        ) : null}
      </div>
      <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
        {t.sample ? (
          <SampleMark />
        ) : d ? (
          <>
            <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
              {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
            </span>
            <span>vs last week</span>
          </>
        ) : null}
      </p>
    </>,
    "ok",
  );
}

/* ── the cards ──────────────────────────────────────────────────────────────────────── */


function RecommendedMatches({ view }: { view: HomeView }) {
  return (
    <Card id="home-matches" title="Recommended Job Matches" icon={StarIcon} viewAll={`${BASE}/matches`}>
      {view.recommendedMatches.length === 0 ? (
        <Empty>No new matches right now. Updating your profile and resume helps us find more.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Job Title", "Company", "Match", "Location", "Type", "Actions"]} />
            <tbody className="divide-y divide-line">
              {view.recommendedMatches.map((m) => (
                <tr key={m.matchId} data-match={m.matchId}>
                  <td className={cn(TD, "font-semibold")}>{m.title}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <CompanyMark name={m.company} />
                      <span className="truncate">{m.company ?? "-"}</span>
                    </span>
                  </td>
                  <td className={TD}>
                    <Pill tone={matchTone(m.score)}>{m.score}%</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1 text-ink-soft">
                      <MapPinIcon size={13} className="flex-none text-muted" />
                      {placeLabel(m.location, m.workMode)}
                    </span>
                  </td>
                  <td className={TD}>{employmentLabel(m.employment) ? <Pill tone="blue">{employmentLabel(m.employment)}</Pill> : null}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1">
                      <ViewButton href={`${BASE}/matches`} label={`View ${m.title}`} />
                      <MoreButton label={`More actions for ${m.title}`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AssignedOpportunities({ view }: { view: HomeView }) {
  return (
    <Card id="home-assigned" title="Assigned Opportunities" icon={UsersIcon} tone="pink" viewAll={`${BASE}/opportunities`}>
      {view.assignedOpportunities.length === 0 ? (
        <Empty>Nothing assigned to you yet. Your marketer will line up roles here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Role / Company", "Status", "Assigned Date", "Actions"]} />
            <tbody className="divide-y divide-line">
              {view.assignedOpportunities.map((o) => {
                const s = OPPORTUNITY_LABELS[o.status];
                return (
                  <tr key={o.matchId} data-opportunity={o.matchId}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <CompanyMark name={o.company} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{o.title}</span>
                          <span className="block truncate text-[12px] text-muted">{o.company}</span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{shortDate(o.assignedAt)}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-1">
                        <ViewButton href={`${BASE}/opportunities`} label={`View ${o.title}`} />
                        <MoreButton label={`More actions for ${o.title}`} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MyApplications({ view }: { view: HomeView }) {
  return (
    <Card id="home-applications" title="My Applications" icon={FileTextIcon} tone="violet" viewAll={`${BASE}/applications`}>
      {view.applications.length === 0 ? (
        <Empty>No applications yet. They appear here once you or your marketer apply.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Job Title", "Company", "Status", "Applied Date", "Actions"]} />
            <tbody className="divide-y divide-line">
              {view.applications.map((a) => {
                const s = applicationLabel(a.stage, a.closedReason);
                return (
                  <tr key={a.id} data-application={a.id}>
                    <td className={cn(TD, "font-semibold")}>{a.title ?? "Application"}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-1.5">
                        <CompanyMark name={a.company} />
                        <span className="truncate">{a.company ?? "-"}</span>
                      </span>
                    </td>
                    <td className={TD}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{shortDate(a.appliedOn)}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-1">
                        <ViewButton href={`${BASE}/applications`} label={`View ${a.title ?? a.code}`} />
                        <MoreButton label={`More actions for ${a.title ?? a.code}`} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UpcomingInterviews({ view }: { view: HomeView }) {
  return (
    <Card id="home-interviews" title="Upcoming Interviews" icon={CalendarCheckIcon} tone="green" viewAll={`${BASE}/interviews`}>
      {view.interviews.length === 0 ? (
        <Empty>No interviews scheduled.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Date & Time", "Role / Company", "Mode", "Actions"]} />
            <tbody className="divide-y divide-line">
              {view.interviews.map((i) => {
                const w = interviewWhen(i.scheduledAt, i.durationMinutes);
                return (
                  <tr key={i.id} data-interview={i.id}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <span className="grid w-11 flex-none place-items-center rounded-lg border border-line bg-paper py-1 text-center leading-none">
                          <span className="text-[10px] font-bold text-v2-coral-ink">{w.month}</span>
                          <span className="text-[17px] font-extrabold text-ink">{w.day}</span>
                        </span>
                        <span className="text-[12.5px] leading-snug text-ink-soft">
                          <span className="block font-medium text-ink">{w.line1}</span>
                          {w.line2}
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="flex items-center gap-2">
                        <CompanyMark name={i.company} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{i.title ?? "Interview"}</span>
                          <span className="block truncate text-[12px] text-muted">{i.company}</span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Pill tone={i.mode === "NOT_SET" ? "slate" : "blue"}>
                          {i.mode === "NOT_SET" ? null : <VideoIcon size={13} className="mr-1" />}
                          {{ VIDEO: "Video", ONSITE: "Onsite", PHONE: "Phone" }[i.mode] ?? "Not set"}
                        </Pill>
                        {i.modeSample ? <SampleMark /> : null}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="flex items-center gap-1">
                        <ViewButton href={`${BASE}/interviews`} label={`Details for ${i.title ?? "interview"}`} />
                        <MoreButton label={`More actions for ${i.title ?? "interview"}`} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ResumeStrength({ view }: { view: HomeView }) {
  const r = view.resumeStrength;
  const pct = r.percent;
  const verdict = pct >= 75 ? "Your resume is looking good!" : pct >= 50 ? "Your resume is getting there." : "Your resume needs attention.";
  return (
    <Card id="home-resume" title="Resume Strength" icon={FileTextIcon}>
      <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-1 2xl:justify-items-center min-[1800px]:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto">
          <DonutChart label={`Resume strength ${pct}%`} size={132} legend={false} total={pct} totalSuffix="%" slices={[{ key: "done", label: "Complete", value: pct, color: "var(--color-v2-green-ink)" }, { key: "left", label: "Remaining", value: 100 - pct, color: "transparent" }]} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink">{verdict}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">Add a few more details to stand out to recruiters and get more views.</p>
          <Link href={`${BASE}/resumes`} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-semibold text-paper hover:bg-accent-deep">
            Improve Resume
            <SparklesIcon size={15} />
          </Link>
        </div>
        <ul className="min-w-0 space-y-2" aria-label="Resume checklist">
          {r.checks.map((c) => (
            <li key={c.key} data-check={c.key} data-done={c.done} className="flex items-center gap-2 text-[13px] text-ink">
              {c.done ? <CheckCircleIcon size={18} className="flex-none text-v2-green-ink" /> : <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line" />}
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.done ? null : <ChevronRightIcon size={15} className="flex-none text-muted" />}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TasksCard({ view }: { view: HomeView }) {
  return (
    <Card id="home-tasks" title="Tasks & Follow-ups" icon={ClipboardCheckIcon} viewAll={`${BASE}/tasks`}>
      {view.tasks.length === 0 ? (
        <Empty>All caught up. New follow-ups will show up here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Task", "Due Date", "Priority", "Status"]} />
            <tbody className="divide-y divide-line">
              {view.tasks.map((t) => {
                const s = taskStatusLabel(t.status);
                const overdue = t.dueOn !== null && t.dueOn < view.todaysFocus.date;
                return (
                  <tr key={t.id} data-task={t.id}>
                    <td className={TD}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line" />
                        <span className="min-w-0 truncate">{t.title}</span>
                      </span>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap", overdue || t.dueOn === view.todaysFocus.date ? "font-semibold text-v2-coral-ink" : "text-ink-soft")}>{shortDate(t.dueOn)}</td>
                    <td className={TD}>
                      <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</Pill>
                    </td>
                    <td className={TD}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function TodaysFocus({ view }: { view: HomeView }) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const d = view.todaysFocus.date ? shortDate(view.todaysFocus.date) : "";
  return (
    <Card id="home-focus" title="Today's Focus" icon={CalendarIcon}>
      {d ? <p className="-mt-1 mb-2 text-[12.5px] font-medium text-muted">{d}</p> : null}
      {view.todaysFocus.items.length === 0 ? (
        <Empty>Nothing urgent today.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {view.todaysFocus.items.map((i) => (
            <li key={i.key}>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={done.has(i.key)}
                  onChange={() => setDone((s) => (s.has(i.key) ? new Set([...s].filter((k) => k !== i.key)) : new Set(s).add(i.key)))}
                  className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line accent-[var(--brand-600)]"
                />
                <span className={cn("min-w-0 flex-1", done.has(i.key) && "text-muted line-through")}>{i.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const QUICK: { key: string; label: string; hint: string; href: string; icon: ComponentType<IconProps> }[] = [
  { key: "update-resume", label: "Update Resume", hint: "Keep your profile current", href: `${BASE}/resumes`, icon: FileTextIcon },
  { key: "view-matches", label: "View Matches", hint: "Explore new opportunities", href: `${BASE}/matches`, icon: SearchIcon },
  { key: "practice-interview", label: "Practice Interview", hint: "Sharpen your skills", href: `${BASE}/interview-prep`, icon: VideoIcon },
  { key: "set-availability", label: "Set Availability", hint: "Update your schedule", href: `${BASE}/availability`, icon: CalendarCheckIcon },
];

function QuickActions() {
  return (
    <Card id="home-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key} className="min-w-0">
              <Link href={q.href} data-quick={q.key} className="flex h-full min-h-[68px] flex-col gap-1 rounded-xl border border-line bg-paper p-2.5 hover:bg-paper-2/60">
                <span className="flex items-start gap-1.5 break-words text-[13px] font-bold leading-tight text-ink">
                  <Icon size={16} className="mt-px flex-none text-accent-deep" />
                  {q.label}
                </span>
                <span className="text-[11.5px] leading-snug text-muted">{q.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MarketerMessages({ view }: { view: HomeView }) {
  const m = view.marketerMessages;
  return (
    <Card id="home-messages" title="Marketer Messages" icon={UsersIcon} tone="green">
      <p className="-mt-1 mb-1 flex min-h-5 items-center justify-between gap-2">
        {m.sample ? <SampleMark /> : <span />}
        <Link href={`${BASE}/marketer`} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
          View All
        </Link>
      </p>
      {m.items.length === 0 ? <Empty>No messages yet. Your marketer&apos;s notes will appear here.</Empty> : (
        <ul className="space-y-3">
          {m.items.map((x, i) => (
            <li key={i} className="text-[13px]">
              <p className="font-semibold text-ink">{x.from}</p>
              <p className="text-muted">{x.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface HomePageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantHomePage({ orgId, firstName: first }: HomePageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchHome(orgId), [orgId]));
  const loading = status === "loading";

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-home data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Home" subtitle="Your consultant dashboard – explore opportunities, track your progress and take the next step in your career." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your home page" description="Your workspace didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-home-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
            {TILE_SPECS.map((s, i) => (
              <Tile key={s.key} spec={s} view={loading ? null : view} index={i} />
            ))}
          </section>

          {view ? (
            <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.62fr)]">
              <div className="grid min-w-0 content-start gap-4 sm:gap-5 xl:col-span-2 2xl:grid-cols-2">
                <RecommendedMatches view={view} />
                <AssignedOpportunities view={view} />
                <MyApplications view={view} />
                <UpcomingInterviews view={view} />
                <ResumeStrength view={view} />
                <TasksCard view={view} />
              </div>
              <div className="grid min-w-0 content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-1">
                <BeeCard name={firstName(first)} />
                <TodaysFocus view={view} />
                <QuickActions />
                <MarketerMessages view={view} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
