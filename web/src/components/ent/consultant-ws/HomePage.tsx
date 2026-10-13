"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
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
  MoreVerticalIcon,
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
import { CARD, CardHead, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import {
  OPPORTUNITY_LABELS,
  PRIORITY_TONE,
  applicationLabel,
  deltaText,
  employmentLabel,
  fetchHome,
  firstName,
  initialsOf,
  interviewWhen,
  matchTone,
  placeLabel,
  shortDate,
  taskStatusLabel,
  type HomeView,
  type TileData,
  type Tone,
} from "@/lib/ent/consultant-ws/home";

/**
 * Consultant Home (design/enterprise-consultant/home.webp): one call to `GET /api/orgs/{orgId}/me-workspace/home` (through the BFF)
 * draws the page for the signed-in consultant's OWN data. A block the API flags `sample` carries a small "Sample" marker (it is
 * another role's module and gets real data when the roles merge). Empty cards say so in a sentence; there is no made-up number.
 */

export const REVALIDATE_MS = 30_000;

const PILL: Record<Tone, string> = {
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  blue: "bg-accent-soft text-accent-deep",
  red: "bg-v2-coral-soft text-v2-coral-ink",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  slate: "bg-paper-2 text-ink-soft",
};

function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex min-h-6 items-center whitespace-nowrap rounded-md px-2 text-[12px] font-semibold", PILL[tone], className)}>{children}</span>;
}

function SampleMark() {
  return (
    <span data-sample className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted" title="Placeholder until this module is connected">
      Sample
    </span>
  );
}

const BASE = "/w/consultant";

/* ── data hook ──────────────────────────────────────────────────────────────────────── */

type Status = "loading" | "ready" | "failed" | "denied";

function useHome(orgId: number) {
  const [view, setView] = useState<HomeView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const last = useRef(0);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const r = await fetchHome(orgId);
    inflight.current = false;
    last.current = Date.now();
    if (r.kind === "OK" && r.view) {
      setView(r.view);
      setStatus("ready");
    } else if (r.kind === "DENIED") setStatus("denied");
    else setStatus((s) => (s === "ready" ? s : "failed")); // a failed refresh keeps what is on screen
  }, [orgId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > REVALIDATE_MS) void load();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [load]);

  return { view, status, reload: load };
}

/* ── shared pieces ──────────────────────────────────────────────────────────────────── */

function Card({ id, title, icon, tone = "accent", viewAll, extra, children, className }: { id: string; title: string; icon: ComponentType<IconProps>; tone?: IconTone; viewAll?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} data-home-card={id} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5", className)}>
      <CardHead id={id} icon={icon} title={title} tone={tone}>
        {extra}
        {viewAll ? (
          <Link href={viewAll} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
            View All
          </Link>
        ) : null}
      </CardHead>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-[13.5px] text-muted">{children}</p>;

function CompanyMark({ name, tone = 0 }: { name: string | null; tone?: number }) {
  const colors = ["bg-accent-soft text-accent-deep", "bg-v2-violet-soft text-v2-violet-ink", "bg-v2-amber-soft text-v2-amber-ink", "bg-v2-green-soft text-v2-green-ink", "bg-v2-pink-soft text-v2-pink-ink", "bg-v2-teal-soft text-v2-teal-ink"];
  const i = name ? [...name].reduce((a, ch) => a + ch.charCodeAt(0), tone) % colors.length : 0;
  return (
    <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-md text-[10px] font-bold", colors[i])}>
      {initialsOf(name)}
    </span>
  );
}

const ViewButton = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} aria-label={label} className="inline-flex min-h-8 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
    View
  </Link>
);

const MoreButton = ({ label }: { label: string }) => (
  <button type="button" aria-label={label} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
    <MoreVerticalIcon size={16} />
  </button>
);

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

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

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="text-left text-[12px] font-semibold text-muted">
        {cols.map((c, i) => (
          <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg">
            {c || <span className="sr-only">Actions</span>}
          </th>
        ))}
      </tr>
    </thead>
  );
}

const TD = "px-2 py-2.5 align-middle text-[13px] text-ink";
const TABLE = "w-full border-collapse";

function RecommendedMatches({ view }: { view: HomeView }) {
  return (
    <Card id="home-matches" title="Recommended Job Matches" icon={StarIcon} viewAll={`${BASE}/matches`}>
      {view.recommendedMatches.length === 0 ? (
        <Empty>No new matches right now. Updating your profile and resume helps us find more.</Empty>
      ) : (
        <div className="overflow-x-auto">
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
        <div className="overflow-x-auto">
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
        <div className="overflow-x-auto">
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
        <div className="overflow-x-auto">
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
                        <Pill tone="blue">
                          <VideoIcon size={13} className="mr-1" />
                          Video
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
      <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto">
          <DonutChart label={`Resume strength ${pct}%`} size={132} total={pct} totalLabel="" slices={[{ key: "done", label: "Complete", value: pct }, { key: "left", label: "Remaining", value: 100 - pct }]} />
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
        <div className="overflow-x-auto">
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

function BeeCard({ name }: { name: string }) {
  return (
    <section aria-label="Help" data-home-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      <div className="flex justify-center bg-accent-soft pt-3">
        <EnterpriseMascot pose="greet" size="lg" />
      </div>
      <div className="p-4 sm:p-5">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">Your career companion, here to help!</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">Get personalized job matches, prepare for interviews, track your progress and more, {name}. I&apos;m here whenever you need support on your journey.</p>
        <button
          type="button"
          onClick={openHelpPanel}
          className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70"
        >
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}

function TodaysFocus({ view }: { view: HomeView }) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const d = view.todaysFocus.date ? shortDate(view.todaysFocus.date) : "";
  return (
    <Card id="home-focus" title="Today's Focus" icon={CalendarIcon} extra={d ? <span className="flex-none text-[12.5px] font-medium text-muted">{d}</span> : null}>
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
      <ul className="grid grid-cols-2 gap-2.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key}>
              <Link href={q.href} data-quick={q.key} className="flex h-full min-h-[68px] flex-col gap-1 rounded-xl border border-line bg-paper p-2.5 hover:bg-paper-2/60">
                <span className="flex items-center gap-1.5 text-[13px] font-bold leading-tight text-ink">
                  <Icon size={16} className="flex-none text-accent-deep" />
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
    <Card id="home-messages" title="Messages from My Marketer" icon={UsersIcon} tone="green" viewAll={`${BASE}/marketer`} extra={m.sample ? <SampleMark /> : null}>
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
  const { view, status, reload } = useHome(orgId);
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
              <div className="grid min-w-0 content-start gap-4 sm:gap-5 xl:col-span-2 xl:grid-cols-2">
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
