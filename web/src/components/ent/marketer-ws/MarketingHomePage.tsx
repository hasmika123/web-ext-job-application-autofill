"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertIcon, BriefcaseIcon, CalendarIcon, CheckCircleIcon, ClockIcon, ErrorState, FileTextIcon, MailIcon, MemberAvatar, MessageIcon, PhoneIcon, SearchIcon, SendIcon, UsersIcon, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import { KPI_KEYS, KPI_TITLES, clockText, dayOffset, fetchMarketingHome, matchTone, photoFor, type FollowupTask, type KpiKey, type MarketingHomeView, type Tone } from "@/lib/ent/marketer-ws/home";
import { scoreText } from "@/lib/ent/marketer-ws/score";
import { CARD, CardSkeleton, Empty, HEAD_ROW, Head, KpiTile, TH, type TintName } from "./parts";

/**
 * Marketing Home. One call draws the board; every card has its own empty state, never a made-up row. E1: the buttons here open the page
 * where the marketer PREPARES or RECORDS; nothing submits for a consultant. Blocks, in order: Today, Top openings, My talent, Recent activity.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName }> = {
  assigned: { icon: UsersIcon, tint: "violet" },
  newMatches: { icon: SearchIcon, tint: "violet" },
  pendingSubmissions: { icon: SendIcon, tint: "pink" },
  overdueFollowups: { icon: AlertIcon, tint: "pink" },
};

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

/** How many consultants the "My talent" block lists; the full list is one click away on My Talent. */
const TALENT_ROWS = 5;

export interface MarketingHomePageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** Menu hrefs of this member's Marketing workspace, by nav key; a missing key hides that "View all". */
  hrefs: Record<string, string | null>;
}

export default function MarketingHomePage({ orgId, hrefs }: MarketingHomePageProps) {
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
  const header = <PageHeader title="Home" subtitle="Your consultants, their openings, and what's due today." />;
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
  const skeleton = <CardSkeleton />;

  // "Today" is built only from what the home call already returns: its follow-ups, and the interviews that fall today or tomorrow.
  const soon = (v?.interviews ?? [])
    .map((i) => ({ i, day: dayOffset(i.startsAt, now) }))
    .filter((x): x is { i: (typeof x)["i"]; day: number } => x.day === 0 || x.day === 1);
  const dueTasks = v?.tasks ?? [];

  return (
    <div data-marketing-home data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-home-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint } = KPI_ICONS[key];
          return <KpiTile key={key} id={key} title={KPI_TITLES[key]} icon={icon} tint={tint} value={k ? k.value : null} loading={loading} />;
        })}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2">
        {card(
          <>
            <Head icon={CalendarIcon} title="Today" tint="amber" />
            {loading ? (
              skeleton
            ) : dueTasks.length === 0 && soon.length === 0 ? (
              <Empty>No follow-ups due and no interviews today or tomorrow.</Empty>
            ) : (
              <div className="flex flex-col gap-4">
                <div data-today="followups">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-ink-soft">Follow-ups due today</h3>
                    {hrefs.followups ? <Link href={hrefs.followups} className="text-[12.5px] font-semibold text-accent-deep hover:underline">View all</Link> : null}
                  </div>
                  {dueTasks.length === 0 ? (
                    <p className="py-2 text-[13px] text-muted">Nothing due today.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {dueTasks.map((t) => {
                        const { icon: Icon, tint } = TASK_ICON[t.kind];
                        return (
                          <li key={t.id} data-task-row={t.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                            <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-full", tint)}><Icon size={15} /></span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-[13px] font-semibold text-ink", t.done && "line-through")}>{t.title}</span>
                              <span className="block truncate text-[12px] text-muted">{t.sub}</span>
                            </span>
                            {t.done ? <CheckCircleIcon size={15} aria-label="Done" className="flex-none text-v2-green-ink" /> : <span className="flex-none text-[12px] font-semibold text-v2-amber-ink">{clockText(t.dueAt)}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div data-today="interviews">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-ink-soft">Interviews today and tomorrow</h3>
                    {hrefs.interviews ? <Link href={hrefs.interviews} className="text-[12.5px] font-semibold text-accent-deep hover:underline">View all</Link> : null}
                  </div>
                  {soon.length === 0 ? (
                    <p className="py-2 text-[13px] text-muted">No interviews today or tomorrow.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {soon.map(({ i, day }) => (
                        <li key={i.id} data-interview-row={i.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                          <MemberAvatar name={i.consultant} src={photoFor(i.consultant, i.avatarUrl)} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">{i.consultant}</span>
                            <span className="block truncate text-[12px] text-muted">{[i.role, i.client, i.type].filter(Boolean).join(" - ")}</span>
                          </span>
                          <span className="flex-none text-right text-[12px] font-semibold text-ink-soft">
                            <span className="block">{day === 0 ? "Today" : "Tomorrow"}</span>
                            <span className="block font-normal text-muted">{clockText(i.startsAt)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>,
          "today",
        )}

        {card(
          <>
            <Head icon={BriefcaseIcon} title="Top openings for my talent" tint="blue" viewAll={hrefs.matches ?? null} />
            {loading ? (
              skeleton
            ) : !v || v.openings.length === 0 ? (
              <Empty>No strong openings for your talent right now.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[13px]">
                  <thead>
                    <tr className={cn(HEAD_ROW, "text-[12px] font-semibold text-ink-soft")}>
                      <th className={cn(TH, "rounded-l-lg")}>Opening</th>
                      <th className={TH}>Client</th>
                      <th className={TH}>Location</th>
                      <th className={TH}>Match</th>
                      <th className={cn(TH, "rounded-r-lg")}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.openings.map((o) => (
                      <tr key={o.id} data-opening-row={o.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2 font-semibold text-ink">{o.title}</td>
                        <td className="px-2 text-ink-soft">{o.client}</td>
                        <td className="px-2 text-ink-soft">{o.location}</td>
                        <td className="px-2">
                          {o.matchPct > 0 ? (
                            <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold", matchTone(o.matchPct) === "green" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-amber-soft text-v2-amber-ink")}>{scoreText(o.matchPct)}</span>
                          ) : (
                            <span className="text-[12px] text-muted">{scoreText(o.matchPct)}</span>
                          )}
                        </td>
                        <td className="px-2">{hrefs.opportunities ? <Link href={`${hrefs.opportunities}?job=${o.id}`} className="inline-block rounded-md bg-accent px-3 py-1 text-[12px] font-bold text-white">Assign</Link> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>,
          "openings",
        )}
      </div>

      {card(
        <>
          <Head icon={UsersIcon} title="My talent" tint="blue" viewAll={talentHref} />
          {loading ? (
            skeleton
          ) : !v || v.talent.length === 0 ? (
            <Empty>No consultants are assigned to you yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className={cn(HEAD_ROW, "text-[12px] font-semibold text-ink-soft")}>
                    <th className={cn(TH, "rounded-l-lg")}>Consultant</th>
                    <th className={TH}>Availability</th>
                    <th className={TH}>Resume</th>
                    <th className={cn(TH, "rounded-r-lg")}>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {v.talent.slice(0, TALENT_ROWS).map((t) => {
                    const action = cn("inline-block whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold", ACTION_TONE[t.nextAction.tone]);
                    return (
                      <tr key={t.id} data-talent-row={t.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2"><span className="flex items-center gap-2 font-semibold text-ink"><MemberAvatar name={t.name} src={photoFor(t.name, t.avatarUrl)} size={34} />{t.name}</span></td>
                        <td className="px-2"><span className="inline-flex items-center gap-1.5 text-ink-soft"><span aria-hidden className={cn("h-2 w-2 rounded-full", DOT_TONE[t.availability.tone])} />{t.availability.label}</span></td>
                        <td className="px-2"><span className="inline-flex items-center gap-1.5 text-ink-soft"><span aria-hidden className={cn("grid h-5 w-5 place-items-center rounded", t.resume.state === "UPDATED" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}><FileTextIcon size={12} /></span>{t.resume.label}</span></td>
                        <td className="px-2">{talentHref ? <Link href={`${talentHref}?consultant=${t.id}`} className={action}>{t.nextAction.label}</Link> : <span className={action}>{t.nextAction.label}</span>}</td>
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
          <Head icon={ClockIcon} title="Recent activity" tint="blue" viewAll={hrefs.activity ?? null} />
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
  );
}
