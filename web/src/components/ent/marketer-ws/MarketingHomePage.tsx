"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertIcon, BarChartIcon, BriefcaseIcon, CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClipboardIcon, ClockIcon, DeltaChip, ErrorState, FileTextIcon,
  FUNNEL_COLORS, FunnelChart, LayersIcon, MailIcon, MemberAvatar, MessageIcon, MoreVerticalIcon, PhoneIcon, SearchIcon, SendIcon, Skeleton, SourceLogo, Sparkline, SparklesIcon, UsersIcon,
  chartColor, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { deltaFromPct, relativeTime } from "@/lib/ent/dashboard";
import { KPI_KEYS, KPI_TITLES, HELP_BANNER, clockText, fetchMarketingHome, logoFor, matchTone, photoFor, type FollowupTask, type KpiKey, type MarketingHomeView, type Tone } from "@/lib/ent/marketer-ws/home";

/**
 * Marketing Home (design: Talent Marketing Dashboard). One call draws the board; every card has its own empty state, never a
 * made-up row. E1: the buttons here open the page where the marketer PREPARES or RECORDS; nothing submits for a consultant.
 */

const CARD = "min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4";
const VIEW_ALL = "inline-flex h-8 flex-none items-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft";

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: string }> = {
  assigned: { icon: UsersIcon, tint: "bg-v2-violet-soft text-v2-violet-ink" },
  profilesReady: { icon: FileTextIcon, tint: "bg-v2-green-soft text-v2-green-ink" },
  newMatches: { icon: SearchIcon, tint: "bg-v2-violet-soft text-v2-violet-ink" },
  pendingSubmissions: { icon: SendIcon, tint: "bg-v2-pink-soft text-v2-pink-ink" },
  upcomingInterviews: { icon: CalendarIcon, tint: "bg-v2-amber-soft text-v2-amber-ink" },
  overdueFollowups: { icon: AlertIcon, tint: "bg-v2-pink-soft text-v2-pink-ink" },
};
const SPARK_COLOR_INDEX: Record<KpiKey, number> = { assigned: 1, profilesReady: 1, newMatches: 3, pendingSubmissions: 4, upcomingInterviews: 2, overdueFollowups: 4 };

const ACTION_TONE: Record<Tone, string> = {
  blue: "bg-accent-soft text-accent-deep",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  red: "bg-v2-pink-soft text-v2-pink-ink",
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
};
const DOT_TONE: Record<Tone, string> = { green: "bg-green-500", amber: "bg-amber-400", blue: "bg-blue-500", red: "bg-red-500", violet: "bg-violet-500" };
const TASK_ICON: Record<FollowupTask["kind"], { icon: ComponentType<IconProps>; tint: string }> = {
  CALL: { icon: PhoneIcon, tint: "bg-accent-soft text-accent-deep" },
  EMAIL: { icon: MailIcon, tint: "bg-v2-amber-soft text-v2-amber-ink" },
  CHAT: { icon: MessageIcon, tint: "bg-v2-violet-soft text-v2-violet-ink" },
  NOTE: { icon: PhoneIcon, tint: "bg-v2-amber-soft text-v2-amber-ink" },
  DOC: { icon: FileTextIcon, tint: "bg-v2-violet-soft text-v2-violet-ink" },
};

function Head({ icon: Icon, title, tint, viewAll, children }: { icon: ComponentType<IconProps>; title: string; tint: string; viewAll?: string | null; children?: ReactNode }) {
  return (
    <header className="mb-3 flex items-center gap-2.5">
      <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-[9px]", tint)}><Icon size={18} /></span>
      <h2 className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">{title}</h2>
      {children}
      {viewAll ? <Link href={viewAll} className={VIEW_ALL}>View all</Link> : null}
    </header>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-[13.5px] text-muted">{children}</p>;
const More = ({ label }: { label: string }) => <MoreVerticalIcon size={16} aria-label={label} className="text-muted" />;

export interface MarketingHomePageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** Menu hrefs of this member's Marketing workspace, by nav key; a missing key hides that "View all". */
  hrefs: Record<string, string | null>;
}

export default function MarketingHomePage({ orgId, firstName, hrefs }: MarketingHomePageProps) {
  const [view, setView] = useState<MarketingHomeView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await fetchMarketingHome(orgId);
    if (r.kind === "OK") {
      setView(r.view);
      setStatus("ready");
      setNow(Date.now());
    } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
  }, [orgId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (status === "denied") return <ErrorState what="the Marketing home" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const loading = status === "loading";
  const header = (
    <>
      <PageHeader title="Talent Marketing Dashboard" subtitle="Manage your assigned consultants, find matching opportunities, and drive successful placements." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "failed")
    return (
      <div data-marketing-home data-status="failed">
        {header}
        <ErrorState what="the Marketing home" description="Your assigned talent didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );
  const v = view;
  const talentHref = hrefs.talent ?? null;
  const card = (children: ReactNode, name: string) => (
    <section data-home-card={name} className={CARD}>
      {children}
    </section>
  );
  const skeleton = (
    <div aria-busy="true" className="flex flex-col gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );

  return (
    <div data-marketing-home data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-home-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon: Icon, tint } = KPI_ICONS[key];
          const delta = k ? deltaFromPct(k.deltaPct) : null;
          return (
            <section key={key} aria-label={KPI_TITLES[key]} data-stat-tile={key} className="flex min-h-[148px] min-w-0 flex-col rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
              <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-[11px]", tint)}><Icon size={20} /></span>
              <h3 className="mt-2.5 truncate text-[14px] font-semibold text-ink-soft">{KPI_TITLES[key]}</h3>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-20" />
              ) : !k ? (
                <p className="mt-2 text-[13.5px] font-semibold text-muted">Nothing yet</p>
              ) : (
                <>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <p data-tile-value className="text-[30px] font-extrabold leading-none tabular-nums text-ink">{k.value.toLocaleString("en-US")}</p>
                    <div className="mb-0.5 w-[44%] max-w-[88px] flex-none"><Sparkline values={k.sparkline} color={chartColor(SPARK_COLOR_INDEX[key])} /></div>
                  </div>
                  <p className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
                    {delta ? (
                      <>
                        <DeltaChip delta={delta} />
                        <span>vs last month</span>
                      </>
                    ) : null}
                  </p>
                </>
              )}
            </section>
          );
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.72fr)]">
        {card(
          <>
            <Head icon={UsersIcon} title="My Assigned Talent" tint="text-accent-deep" viewAll={talentHref} />
            {loading ? (
              skeleton
            ) : !v || v.talent.length === 0 ? (
              <Empty>No consultants are assigned to you yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                      <th className="rounded-l-lg px-2 py-2">Consultant</th>
                      <th className="px-2">Primary Skill</th>
                      <th className="px-2">Availability</th>
                      <th className="px-2">Resume</th>
                      <th className="px-2">Active Apps</th>
                      <th className="px-2">Next Action</th>
                      <th className="rounded-r-lg" />
                    </tr>
                  </thead>
                  <tbody>
                    {v.talent.map((t) => {
                      const action = cn("inline-block whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold", ACTION_TONE[t.nextAction.tone]);
                      return (
                        <tr key={t.id} data-talent-row={t.id} className="border-b border-line last:border-0">
                          <td className="px-2 py-2"><span className="flex items-center gap-2 font-semibold text-ink"><MemberAvatar name={t.name} src={photoFor(t.name, t.avatarUrl)} size={34} />{t.name}</span></td>
                          <td className="px-2 text-ink-soft">{t.primarySkill}</td>
                          <td className="px-2"><span className="inline-flex items-center gap-1.5 text-ink-soft"><span aria-hidden className={cn("h-2 w-2 rounded-full", DOT_TONE[t.availability.tone])} />{t.availability.label}</span></td>
                          <td className="px-2"><span className="inline-flex items-center gap-1.5 text-ink-soft"><span aria-hidden className={cn("grid h-5 w-5 place-items-center rounded", t.resume.state === "UPDATED" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}><FileTextIcon size={12} /></span>{t.resume.label}</span></td>
                          <td className="px-2 text-center text-ink-soft">{t.activeApps}</td>
                          <td className="px-2">{talentHref ? <Link href={`${talentHref}?consultant=${t.id}`} className={action}>{t.nextAction.label}</Link> : <span className={action}>{t.nextAction.label}</span>}</td>
                          <td className="px-1"><More label={`More for ${t.name}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>,
          "talent",
        )}

        {card(
          <>
            <Head icon={LayersIcon} title="Job Stream Monitor" tint="text-accent-deep" viewAll={hrefs.jobs ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.streams.length === 0 ? (
              <Empty>No job streams are connected yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                      <th className="rounded-l-lg px-2 py-2">Source</th>
                      <th className="px-2">Status</th>
                      <th className="px-2">New Openings</th>
                      <th className="px-2">Last Sync</th>
                      <th className="rounded-r-lg" />
                    </tr>
                  </thead>
                  <tbody>
                    {v.streams.map((s) => (
                      <tr key={s.source} data-stream-row={s.source} className="border-b border-line last:border-0">
                        <td className="px-2 py-2"><span className="flex items-center gap-2 font-semibold text-ink"><SourceLogo source={s.source} src={logoFor(s.source)} />{s.source}</span></td>
                        <td className="px-2"><span className="inline-block rounded-md bg-v2-green-soft px-2 py-0.5 text-[12px] font-semibold text-v2-green-ink">{s.status}</span></td>
                        <td className="px-2 font-semibold text-ink">{s.newOpenings}</td>
                        <td className="px-2 text-ink-soft">{s.lastSyncAt ? relativeTime(s.lastSyncAt, now) : "-"}</td>
                        <td className="px-1"><More label={`More for ${s.source}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>,
          "streams",
        )}

        <section aria-label="Help" data-home-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper lg:col-span-2 xl:col-span-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
          <img src={HELP_BANNER} alt="" className="block w-full object-cover" />
          <div className="p-4">
            <h2 className="text-[19px] font-extrabold leading-tight text-ink">Find the right opportunities for your talent faster!</h2>
            <p className="mt-1.5 text-[13.5px] leading-snug text-muted">I can help you find matches, track submissions, and never miss a follow-up{firstName ? `, ${firstName}` : ""}.</p>
            <button type="button" onClick={openHelpPanel} className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
              <SparklesIcon size={17} className="flex-none" />
              <span className="min-w-0 flex-1 truncate">Ask a question</span>
              <ChevronRightIcon size={16} className="flex-none" />
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)_minmax(0,1.05fr)]">
        {card(
          <>
            <Head icon={BriefcaseIcon} title="Top Openings for My Talent" tint="text-accent-deep" viewAll={hrefs.matches ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.openings.length === 0 ? (
              <Empty>No strong openings for your talent right now.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                      <th className="rounded-l-lg px-2 py-2">Job Title</th>
                      <th className="px-2">Client</th>
                      <th className="px-2">Location</th>
                      <th className="px-2">Match</th>
                      <th className="px-2">Action</th>
                      <th className="rounded-r-lg" />
                    </tr>
                  </thead>
                  <tbody>
                    {v.openings.map((o) => (
                      <tr key={o.id} data-opening-row={o.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2 font-semibold text-ink">{o.title}</td>
                        <td className="px-2 text-ink-soft">{o.client}</td>
                        <td className="px-2 text-ink-soft">{o.location}</td>
                        <td className="px-2"><span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold", matchTone(o.matchPct) === "green" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-amber-soft text-v2-amber-ink")}>{o.matchPct}%</span></td>
                        <td className="px-2">{hrefs.opportunities ? <Link href={`${hrefs.opportunities}?job=${o.id}`} className="inline-block rounded-md bg-accent px-3 py-1 text-[12px] font-bold text-white">Assign</Link> : null}</td>
                        <td className="px-1"><More label={`More for ${o.title}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>,
          "openings",
        )}

        {card(
          <>
            <Head icon={BarChartIcon} title="Submission Pipeline" tint="text-accent-deep">
              <span className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] text-ink-soft">Last 3 Months</span>
            </Head>
            {loading ? (
              skeleton
            ) : !v?.pipeline || v.pipeline.stages.length === 0 ? (
              <Empty>No submissions in this period.</Empty>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <FunnelChart label="Submission pipeline" stages={v.pipeline.stages.map((s) => ({ key: s.key, label: s.label, count: s.count }))} />
                <ul className="flex flex-col gap-3 text-[13px]">
                  {v.pipeline.stages.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                      <span className="text-ink-soft">{s.label}</span>
                      <span className="ml-auto pl-3 text-muted">{s.pct}%</span>
                    </li>
                  ))}
                </ul>
                <p className="col-span-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  Total Submissions <b className="text-[14px] text-ink">{v.pipeline.total}</b>
                  {deltaFromPct(v.pipeline.deltaPct) ? (
                    <>
                      <DeltaChip delta={deltaFromPct(v.pipeline.deltaPct)!} /> vs last quarter
                    </>
                  ) : null}
                </p>
              </div>
            )}
          </>,
          "pipeline",
        )}

        {card(
          <>
            <Head icon={CheckCircleIcon} title="Today's Follow-ups & Tasks" tint="text-v2-green-ink" viewAll={hrefs.followups ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.tasks.length === 0 ? (
              <Empty>Nothing due today. Nice.</Empty>
            ) : (
              <ul className="flex flex-col">
                {v.tasks.map((t) => {
                  const { icon: Icon, tint } = TASK_ICON[t.kind];
                  return (
                    <li key={t.id} data-task-row={t.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                      <input type="checkbox" defaultChecked={t.done} aria-label={`Done: ${t.title}`} className="h-4 w-4 flex-none rounded border-line" />
                      <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-full", tint)}><Icon size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{t.title}</span>
                        <span className="block truncate text-[12px] text-muted">{t.sub}</span>
                      </span>
                      <span className="flex-none text-[12px] font-semibold text-v2-amber-ink">{clockText(t.dueAt)}</span>
                      <ClipboardIcon size={15} aria-hidden className="flex-none text-muted" />
                      <More label={`More for ${t.title}`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>,
          "tasks",
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2">
        {card(
          <>
            <Head icon={CalendarIcon} title="Upcoming Interviews" tint="text-v2-pink-ink" viewAll={hrefs.interviews ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.interviews.length === 0 ? (
              <Empty>No interviews scheduled.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                      <th className="rounded-l-lg px-2 py-2">Time</th>
                      <th className="px-2">Consultant</th>
                      <th className="px-2">Role</th>
                      <th className="px-2">Client</th>
                      <th className="px-2">Type</th>
                      <th className="px-2">Status</th>
                      <th className="rounded-r-lg" />
                    </tr>
                  </thead>
                  <tbody>
                    {v.interviews.map((i) => (
                      <tr key={i.id} data-interview-row={i.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-1.5 text-ink-soft">{clockText(i.startsAt)}</td>
                        <td className="px-2"><span className="flex items-center gap-2 font-semibold text-ink"><MemberAvatar name={i.consultant} src={photoFor(i.consultant, i.avatarUrl)} size={20} />{i.consultant}</span></td>
                        <td className="px-2 text-ink-soft">{i.role}</td>
                        <td className="px-2 text-ink-soft">{i.client}</td>
                        <td className="px-2 text-ink-soft">{i.type}</td>
                        <td className="px-2"><span className="inline-flex items-center gap-1.5 rounded-md bg-v2-green-soft px-2 py-0.5 text-[12px] font-semibold text-v2-green-ink"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-500" />{i.status}</span></td>
                        <td className="px-1"><More label={`More for ${i.consultant}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>,
          "interviews",
        )}

        {card(
          <>
            <Head icon={ClockIcon} title="Recent Activity" tint="text-accent-deep" viewAll={hrefs.activity ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.activity.length === 0 ? (
              <Empty>Nothing has happened yet.</Empty>
            ) : (
              <ul className="flex flex-col">
                {v.activity.map((a) => (
                  <li key={a.id} data-activity-row={a.id} className="flex items-start gap-2.5 border-b border-line py-2 last:border-0">
                    <MemberAvatar name={a.actor} src={photoFor(a.actor, a.avatarUrl)} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink"><b>{a.actor}</b> {a.text}</span>
                      {a.detail ? <span className="block truncate text-[12px] text-muted">{a.detail}</span> : null}
                    </span>
                    <span className="flex-none text-[12px] text-muted">{relativeTime(a.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>,
          "activity",
        )}
      </div>
    </div>
  );
}
