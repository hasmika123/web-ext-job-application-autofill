import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookmarkOutlineIcon,
  CalendarIcon,
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
  ProgressRing,
  QuickActionTiles,
  SectionCard,
  StatTile,
  StatusChip,
  TONE,
} from "@/components/app-v2/common";
import { SaveButton } from "@/components/app-v2/jobs/JobBits";
import type { SampleJob } from "@/components/app-v2/sample-data";
import type { Tone } from "@/components/app-v2/common";
import { statusLabel, statusTone } from "@/lib/applications";
import type { DashRecent, DashStat } from "./compute";
import Greeting from "./Greeting";
import ActivityCard from "./ActivityCard";
import UpcomingInterviews from "./UpcomingInterviews";

export interface DashboardProps {
  firstName: string;
  stats: DashStat[];
  status: { label: string; value: number; tone: Tone }[];
  total: number;
  recent: DashRecent[];
  recommended: { id: string; title: string; company: string; score: number; real?: SampleJob["real"] }[];
  profile: { pct: number; checks: { id: string; label: string; done: boolean }[] };
  /** Slot under the hero (the "learned while applying" suggestions card). */
  children?: ReactNode;
}

const STAT_ICON: Record<DashStat["id"], ReactNode> = {
  applications: <FileTextIcon size={22} />,
  interviews: <CalendarIcon size={22} />,
  offers: <TrophyIcon size={22} />,
  saved: <BookmarkOutlineIcon size={22} />,
};

const QUICK = [
  { id: "jobs", label: "Find Jobs", icon: <SearchIcon size={22} />, href: "/jobs" },
  { id: "resume", label: "Update Resume", icon: <FileTextIcon size={22} />, href: "/resume-builder" },
  { id: "practice", label: "Practice Interview", icon: <MicIcon size={22} />, href: "/interview-prep" },
  { id: "ai", label: "Ask AI Assistant", icon: <SparklesIcon size={22} />, href: "/assistant" },
];

/**
 * Dashboard (APP-V3-SPEC 2.1, U3.1). Under the hero: the four stat tiles; activity (a real per-day feed) beside the
 * status donut; recent applications, recommended jobs and profile strength; upcoming interviews, job alerts and quick
 * actions. Three-up from `xl`, two-up from `md`, one column on phones. Every number is the account's own: the tiles
 * and the donut come from the list summary, activity and interviews from their feeds. Where a source does not exist
 * yet (job alerts) the card is an honest empty state with a next step, never a sample row.
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
        <ActivityCard hasApplications={!noApplications} className="md:col-span-2 xl:col-span-2" />

        <SectionCard title="Application Status" className="md:col-span-2 xl:col-span-1">
          {noApplications ? (
            <EmptyState variant="inline" title="No applications yet" description="Your statuses will be counted here." />
          ) : (
            <Donut segments={p.status} centerValue={p.total} centerLabel="Total" size={132} />
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
                <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/applications?app=${r.id}`} className="flex items-center gap-3 rounded-lg hover:bg-paper-2/60">
                    <CompanyTile name={r.company} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink">{r.company}</span>
                      <span className="block truncate text-[12.5px] text-v2-muted">{r.title}</span>
                    </span>
                    <StatusChip tone={statusTone(r.status)} dot className="hidden sm:inline-flex">
                      {statusLabel(r.status)}
                    </StatusChip>
                    <span className="w-[44px] flex-none text-right text-[12.5px] text-v2-muted">{r.date}</span>
                  </Link>
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
        <UpcomingInterviews />

        <SectionCard title="Job Alerts" action={{ label: "Manage", href: "/alerts" }}>
          {/* Alerts have no data source yet (U7.2): an honest empty state, with the one next step. */}
          <EmptyState
            variant="inline"
            title="No job alerts yet"
            description="Get a nudge when a new job matches what you want."
            action={<EmptyLink href="/alerts">Create your first alert</EmptyLink>}
          />
        </SectionCard>

        <SectionCard title="Quick Actions" icon={<ClipboardIcon size={18} className="text-v2-blue" />} className={third}>
          <QuickActionTiles items={QUICK} compact cols="grid-cols-2" />
        </SectionCard>
      </div>
    </div>
  );
}
