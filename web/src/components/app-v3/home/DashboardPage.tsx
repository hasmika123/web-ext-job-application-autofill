import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  BookmarkOutlineIcon,
  CalendarIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClipboardIcon,
  FileTextIcon,
  MicIcon,
  SearchIcon,
  SparklesIcon,
  TrophyIcon,
  EmptyState,
  cn,
} from "@kiwiply/ui";
import {
  CompanyTile,
  Donut,
  HeroBand,
  IconTile,
  ProgressRing,
  QuickActionTiles,
  SectionCard,
  StatTile,
  StatusChip,
  TONE,
  type Tone,
} from "@/components/app-v2/common";
import { SaveButton } from "@/components/app-v2/jobs/JobBits";
import type { SampleJob } from "@/components/app-v2/sample-data";
import type { DashRecent, DashStat } from "@/components/app-v3/sample-data";
import Greeting from "./Greeting";
import ActivityCard from "./ActivityCard";

export interface DashboardProps {
  firstName: string;
  stats: DashStat[];
  activity: Record<string, { label: string; values: number[] }[]>;
  status: { label: string; value: number; tone: Tone }[];
  total: number;
  recent: DashRecent[];
  recommended: { id: string; title: string; company: string; score: number; real?: SampleJob["real"] }[];
  profile: { pct: number; checks: { id: string; label: string; done: boolean }[] };
  /** AI insights, upcoming interviews and job alerts: no API yet, so these are `[]` for a real account (U0.5). */
  insights: { text: string; href: string }[];
  interviews: { company: string; title: string; when: string }[];
  alerts: { title: string; count: number; ago: string }[];
  /** Slot under the hero (the "learned while applying" suggestions card). */
  children?: ReactNode;
}

const STAT_ICON: Record<DashStat["id"], ReactNode> = {
  applications: <FileTextIcon size={22} />,
  interviews: <CalendarIcon size={22} />,
  offers: <TrophyIcon size={22} />,
  saved: <BookmarkOutlineIcon size={22} />,
};

const CHIP_TONE: Record<string, Tone> = {
  Applied: "blue",
  "Under Review": "amber",
  Interview: "green",
  Offer: "violet",
  Rejected: "coral",
};

const QUICK = [
  { id: "jobs", label: "Find Jobs", icon: <SearchIcon size={22} />, href: "/jobs" },
  { id: "resume", label: "Update Resume", icon: <FileTextIcon size={22} />, href: "/resume-builder" },
  { id: "practice", label: "Practice Interview", icon: <MicIcon size={22} />, href: "/interview-prep" },
  { id: "ai", label: "Ask AI Assistant", icon: <SparklesIcon size={22} />, href: "/assistant" },
];

/**
 * Dashboard (APP-V3-SPEC 2.1). Four rows under the hero: stat tiles, three cards (activity, status,
 * AI insights), three cards (recent applications, recommended, profile strength) and three more
 * (interviews, alerts, quick actions). Three-up from `xl`, two-up from `md`, one column on phones.
 * Every number follows real data. Insights, interviews and alerts have no API yet: a real account gets `[]` and
 * an honest empty state (U0.5); only a demo account on a sample-enabled build sees the board's rows.
 */
/** The one low-key action link of an inline empty state. */
function EmptyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-bold text-v2-blue-ink hover:underline">
      {children}
    </Link>
  );
}

export default function DashboardPage(p: DashboardProps) {
  const noApplications = p.total === 0;
  const grid = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
  const third = "md:col-span-2 xl:col-span-1";
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <HeroBand
        title={<Greeting name={p.firstName} />}
        subtitle="Let's find your next opportunity."
        art="mascot-wave-laptop"
        artHeight={130}
        note="You're doing great! Keep going!"
      />

      {p.children}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4">
        {p.stats.map((s) => (
          <StatTile
            key={s.id}
            icon={STAT_ICON[s.id]}
            value={s.value}
            label={s.label}
            sublabel={<span className={cn("font-semibold", TONE[s.tone].ink)}>{s.note}</span>}
            tone={s.tone}
          />
        ))}
      </div>

      <div className={grid}>
        {noApplications ? (
          <SectionCard title="Application Activity">
            <EmptyState
              variant="inline"
              title="No activity yet"
              description="Applications you submit show up here."
              action={<EmptyLink href="/jobs">Find jobs</EmptyLink>}
            />
          </SectionCard>
        ) : (
          <ActivityCard periods={p.activity} />
        )}

        <SectionCard title="Application Status">
          {noApplications ? (
            <EmptyState variant="inline" title="No applications yet" description="Your statuses will be counted here." />
          ) : (
            <Donut segments={p.status} centerValue={p.total} centerLabel="Total" size={132} />
          )}
        </SectionCard>

        <SectionCard
          title="AI Insights"
          icon={<SparklesIcon size={18} className="text-v2-green" />}
          className={cn("bg-v2-lime-soft/60", third)}
        >
          {p.insights.length === 0 ? (
            <EmptyState variant="inline" title="No insights yet" description="They appear as you apply." />
          ) : (
          <ul className="space-y-2">
            {p.insights.map((i) => (
              <li key={i.text}>
                <Link
                  href={i.href}
                  className="flex items-center gap-3 rounded-xl bg-paper/70 px-3 py-3 text-[13.5px] font-medium leading-snug text-ink transition-colors hover:bg-paper"
                >
                  <CheckCircleIcon className="h-5 w-5 flex-none text-v2-green" />
                  <span className="min-w-0 flex-1">{i.text}</span>
                  <ChevronRightIcon size={16} className="flex-none text-v2-muted" />
                </Link>
              </li>
            ))}
          </ul>
          )}
        </SectionCard>
      </div>

      <div className={grid}>
        <SectionCard title="Recent Applications" action={{ label: "View All", href: "/applications" }}>
          {p.recent.length === 0 ? (
            <EmptyState variant="inline" title="No applications yet" action={<EmptyLink href="/jobs">Find a job</EmptyLink>} />
          ) : (
            <ul className="divide-y divide-v2-line/60">
              {p.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <CompanyTile name={r.company} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{r.company}</span>
                    <span className="block truncate text-[12.5px] text-v2-muted">{r.title}</span>
                  </span>
                  <StatusChip tone={CHIP_TONE[r.status] ?? "slate"} dot className="hidden sm:inline-flex">
                    {r.status}
                  </StatusChip>
                  <span className="w-[44px] flex-none text-right text-[12.5px] text-v2-muted">{r.date}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recommended for You" action={{ label: "See all", href: "/jobs" }}>
          {p.recommended.length === 0 ? (
            <EmptyState variant="inline" title="No recommendations yet" description="Finish your profile to get matches." action={<EmptyLink href="/profiles">Open profile</EmptyLink>} />
          ) : (
          <ul className="divide-y divide-v2-line/60">
            {p.recommended.map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <CompanyTile name={j.company} size={38} />
                <Link href={`/jobs?job=${encodeURIComponent(j.id)}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink hover:underline">{j.title}</span>
                  <span className="block truncate text-[12.5px] text-v2-muted">{j.company}</span>
                </Link>
                <span className="flex-none text-[12.5px] font-bold text-v2-green-ink">{j.score}% Match</span>
                <SaveButton job={{ id: j.id, title: j.title, company: j.company, real: j.real }} className="-mr-1" />
              </li>
            ))}
          </ul>
          )}
        </SectionCard>

        <SectionCard title="Profile Strength" action={{ label: "Improve", href: "/profiles" }} className={third}>
          <div className="flex items-start gap-4">
            <ProgressRing value={p.profile.pct} size={84} thickness={9} label={`Profile ${p.profile.pct} percent complete`}>
              <span className="font-display text-[19px] font-extrabold text-ink">{p.profile.pct}%</span>
            </ProgressRing>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-soft">
              {p.profile.pct >= 70 ? "Your profile is strong! " : "Your profile is getting there. "}
              Add a few more details to get better matches.
            </p>
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-1">
            {p.profile.checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 text-[13px]">
                {c.done ? (
                  <CheckCircleIcon className="h-[18px] w-[18px] flex-none text-v2-green" />
                ) : (
                  <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-2 border-v2-line" />
                )}
                <span className={c.done ? "text-ink" : "text-ink-soft"}>{c.label}</span>
                <span className="sr-only">{c.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className={grid}>
        <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/interview-prep" }}>
          {p.interviews.length === 0 ? (
            <EmptyState variant="inline" title="No interviews scheduled" action={<EmptyLink href="/interview-prep">Practice for one</EmptyLink>} />
          ) : (
          <ul className="divide-y divide-v2-line/60">
            {p.interviews.map((i) => (
              <li key={i.company} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <CompanyTile name={i.company} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{i.company}</span>
                  <span className="block truncate text-[12.5px] text-v2-muted">
                    {i.title} · {i.when}
                  </span>
                </span>
                <Link href="/interview-prep" className="inline-flex flex-none items-center gap-1 text-[12.5px] font-bold text-v2-blue-ink hover:underline">
                  Prep
                  <ArrowRightIcon size={13} />
                </Link>
              </li>
            ))}
          </ul>
          )}
        </SectionCard>

        <SectionCard title="Job Alerts" action={{ label: "Manage", href: "/alerts" }}>
          {p.alerts.length === 0 ? (
            <EmptyState variant="inline" title="No job alerts yet" action={<EmptyLink href="/alerts">Set one up</EmptyLink>} />
          ) : (
          <ul className="divide-y divide-v2-line/60">
            {p.alerts.map((a) => (
              <li key={a.title} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <IconTile tone="blue" className="h-[38px] w-[38px]">
                  <BellIcon size={17} />
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{a.title}</span>
                  <span className="block text-[12.5px] text-v2-muted">{a.count} new</span>
                </span>
                <span className="flex-none text-[12.5px] text-v2-muted">{a.ago}</span>
              </li>
            ))}
          </ul>
          )}
        </SectionCard>

        <SectionCard title="Quick Actions" icon={<ClipboardIcon size={18} className="text-v2-blue" />} className={third}>
          <QuickActionTiles items={QUICK} compact cols="grid-cols-2" />
        </SectionCard>
      </div>
    </div>
  );
}
