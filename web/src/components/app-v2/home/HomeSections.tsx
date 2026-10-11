import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  ChevronRightIcon,
  ClipboardIcon,
  FileTextIcon,
  LayersIcon,
  StarDoodle,
  TrophyIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import LocalDate from "@/components/LocalDate";
import {
  CompanyTile,
  DataTable,
  Progress,
  ProgressRing,
  SectionCard,
  StatusChip,
  TONE,
  type DataColumn,
  type Tone,
} from "@/components/app-v2/common";
import {
  HOME_INSIGHT,
  HOME_LEARNING,
  HOME_SKILLS,
  HOME_UPCOMING_INTERVIEWS,
  type RecentApplication,
} from "@/components/app-v2/sample-data";
import { Greeting } from "./HomeInteractive";

/* ── Hero ─────────────────────────────────────────────────────────────────────────────────── */

export function HomeHero({ name }: { name: string }) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(105deg,#F1FBE4_0%,#E5F6EC_50%,#DDEBFF_100%)]">
      <span aria-hidden className="pointer-events-none absolute -left-12 -top-16 h-52 w-52 rounded-full bg-v2-lime/30 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full bg-v2-blue/15 blur-3xl" />
      <div className="relative grid items-center gap-2 px-5 pt-6 sm:px-7 md:grid-cols-[1.25fr_1fr] md:pb-0">
        <div className="min-w-0 pb-6 md:py-7">
          <Greeting name={name} />
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-[1.04] text-ink sm:text-[40px]">
            Let&apos;s get you
            <br />
            one step closer
            <br />
            to your <span className="text-v2-green">dream job.</span>
          </h1>
          <p className="mt-3.5 max-w-[440px] text-[14.5px] leading-relaxed text-ink-soft">
            Search jobs, apply with AI, and track your progress — all in one place.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-xl bg-v2-green px-5 py-3 text-[14.5px] font-bold text-white transition-[filter] hover:brightness-95"
            >
              Find Jobs
              <ArrowRightIcon size={15} />
            </Link>
            <Link
              href="/ai-apply"
              className="inline-flex items-center gap-2 rounded-xl border border-v2-line bg-paper px-5 py-3 text-[14.5px] font-bold text-ink transition-colors hover:bg-paper-2"
            >
              <ZapIcon size={15} />
              AI Apply Now
            </Link>
          </div>
        </div>
        <div className="relative hidden h-full min-h-[260px] items-end justify-center md:flex">
          <StarDoodle aria-hidden className="absolute left-2 top-6 h-6 w-6 text-v2-amber" />
          <StarDoodle aria-hidden className="absolute bottom-24 right-3 h-5 w-5 text-v2-amber" />
          <p
            aria-hidden
            className="absolute left-0 top-8 -rotate-6 font-[family-name:var(--font-hand)] text-[22px] leading-[1.05] text-ink"
          >
            Same me.
            <br />
            More opportunities.
          </p>
          <Image
            src="/v2/app/home-woman.png"
            alt="" unoptimized
            width={181}
            height={185}
            priority
            className="relative h-auto w-[220px] max-w-full object-contain lg:w-[250px]"
          />
        </div>
      </div>
    </section>
  );
}

/* ── KPI row ──────────────────────────────────────────────────────────────────────────────── */

export interface Kpi {
  icon: "file" | "calendar" | "offer" | "chart";
  value: string;
  label: string;
  note: string;
  tone: Tone;
}

const KPI_ICON = {
  file: <FileTextIcon size={22} />,
  calendar: <CalendarIcon size={22} />,
  offer: <BriefcaseIcon size={22} />,
  chart: <ChartIcon size={22} />,
} as const;

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <li key={k.label}>
          <div className={cn("flex h-full flex-col gap-1.5 rounded-2xl p-3.5", TONE[k.tone].soft)}>
            <div className="flex items-center gap-3">
              <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl bg-paper shadow-v2-soft", TONE[k.tone].ink)}>
                {KPI_ICON[k.icon]}
              </span>
              <div className="min-w-0">
                <div className="font-display text-[26px] font-extrabold leading-none text-ink">{k.value}</div>
                <div className="mt-1 text-[13px] font-medium text-ink-soft">{k.label}</div>
              </div>
            </div>
            <div className="text-[11.5px] font-semibold text-v2-green-ink">{k.note}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Recent Applications ──────────────────────────────────────────────────────────────────── */

export interface RecentRow extends RecentApplication {
  id: string | number;
  /** ISO date when real (rendered in the viewer's zone); otherwise the board's literal text. */
  iso?: string;
}

const STATUS_TONE: Record<string, Tone> = {
  Interview: "blue",
  "In Review": "amber",
  Applied: "slate",
  Offer: "green",
  Rejected: "coral",
  Draft: "amber",
  Saved: "slate",
};

export function RecentApplications({ rows }: { rows: RecentRow[] }) {
  const columns: DataColumn<RecentRow>[] = [
    { key: "title", header: "Job Title", primary: true, className: "font-medium", render: (r) => <span className="font-medium text-ink">{r.title}</span> },
    {
      key: "company",
      header: "Company",
      render: (r) => (
        <span className="flex items-center gap-2.5">
          <CompanyTile name={r.company} size={28} />
          {r.company}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusChip tone={STATUS_TONE[r.status] ?? "slate"}>{r.status}</StatusChip> },
    {
      key: "date",
      header: "Applied On",
      mobileLabel: "Applied",
      className: "whitespace-nowrap text-ink-soft",
      render: (r) => (r.iso ? <LocalDate iso={r.iso} options={{ month: "short", day: "numeric", year: "numeric" }} /> : r.date),
    },
  ];
  return (
    <SectionCard title="Recent Applications" action={{ label: "View all", href: "/applications" }} bodyClassName="-mx-1">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} className="border-0 shadow-none" />
    </SectionCard>
  );
}

/* ── Application Progress (chevron funnel) ───────────────────────────────────────────────── */

export interface ProgressStep {
  label: string;
  value: number;
  pct: string;
  tone: Tone;
}

export function ApplicationProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <SectionCard
      title="Application Progress"
      headerExtra={
        <label className="relative">
          <span className="sr-only">Period</span>
          <select
            defaultValue="30"
            className="h-9 cursor-pointer appearance-none rounded-lg border border-v2-line bg-paper pl-3 pr-8 text-[13px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-v2-blue/25"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <ChevronRightIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-ink-soft" />
        </label>
      }
    >
      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-0">
        {steps.map((s, i) => (
          <li key={s.label} className="min-w-0">
            <div
              className={cn(
                "flex h-[68px] flex-col items-center justify-center rounded-xl sm:rounded-none",
                TONE[s.tone].soft,
                i === 0 && "sm:rounded-l-xl",
                i === steps.length - 1 && "sm:rounded-r-xl",
                i < steps.length - 1 && "sm:[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)] sm:pr-3",
                i > 0 && "sm:-ml-px",
              )}
            >
              <span className="font-display text-[20px] font-extrabold leading-none text-ink">{s.value}</span>
              <span className={cn("mt-1 text-[12.5px] font-medium", TONE[s.tone].ink)}>{s.label}</span>
            </div>
            <div className="mt-2 text-center text-[12px] text-v2-muted">{s.pct}</div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/* ── Top Companies + Skill Match ─────────────────────────────────────────────────────────── */

export interface TopCompany {
  name: string;
  applications: string;
  interviews: string;
  pct: number;
  tone: Tone;
}

export function TopCompanies({ rows }: { rows: TopCompany[] }) {
  return (
    <SectionCard title="Top Companies You're Targeting" action={{ label: "View all", href: "/companies" }}>
      <ul className="space-y-3.5">
        {rows.map((c) => (
          <li key={c.name} className="flex items-center gap-3">
            <CompanyTile name={c.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] font-bold text-ink">{c.name}</span>
                <span className="flex-none text-[12px] text-v2-muted">{c.interviews}</span>
              </div>
              <div className="mb-1 text-[12px] text-v2-muted">{c.applications}</div>
              <Progress value={c.pct} tone={c.tone} label={`${c.name} share of applications`} />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function SkillMatch() {
  return (
    <SectionCard title="Skill Match" bodyClassName="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-v2-muted">Overall Match</span>
        <ProgressRing value={HOME_SKILLS.overall} tone="green" size={72} thickness={7} label="Overall match 78 percent">
          <span className="font-display text-[19px] font-extrabold text-ink">{HOME_SKILLS.overall}%</span>
        </ProgressRing>
      </div>
      <ul className="mt-3 space-y-2.5">
        {HOME_SKILLS.items.map((s) => (
          <li key={s.label} className="grid grid-cols-[96px_1fr_36px] items-center gap-2.5 text-[12.5px]">
            <span className="truncate text-ink-soft">{s.label}</span>
            <Progress value={s.value} tone="green" label={`${s.label} ${s.value} percent`} />
            <span className="text-right font-semibold text-ink-soft">{s.value}%</span>
          </li>
        ))}
      </ul>
      <Link
        href="/learning"
        className="mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-v2-green-soft px-3 py-2.5 pt-2.5 text-[13.5px] font-bold text-v2-green-ink transition-[filter] hover:brightness-95"
      >
        Improve Your Skills
        <ArrowRightIcon size={14} />
      </Link>
    </SectionCard>
  );
}

/* ── Rail: Upcoming Interviews, Career Insights ──────────────────────────────────────────── */

export function UpcomingInterviews() {
  return (
    <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/interviews" }}>
      <ul className="space-y-3.5">
        {HOME_UPCOMING_INTERVIEWS.map((i) => (
          <li key={i.title} className="flex items-center gap-3">
            <CompanyTile name={i.company} size={42} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-ink">{i.title}</div>
              <div className="truncate text-[12.5px] text-v2-muted">{i.when}</div>
            </div>
            <Link
              href="/interviews"
              className="inline-flex flex-none items-center gap-1 rounded-lg bg-v2-green-soft px-2.5 py-1.5 text-[12px] font-bold text-v2-green-ink hover:brightness-95"
            >
              Prepare
              <ArrowRightIcon size={12} />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const INSIGHT_TONES: Tone[] = ["violet", "blue"];

export function CareerInsights() {
  return (
    <SectionCard title="Career Insights" action={{ label: "View all", href: "/insights" }}>
      <div className="flex items-center gap-3 rounded-xl bg-v2-lime-soft/70 p-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-paper text-v2-green shadow-v2-soft">
          <TrophyIcon size={24} />
        </span>
        <div className="min-w-0 text-[12.5px] leading-snug text-ink-soft">
          <div className="text-[13.5px] font-bold text-ink">{HOME_INSIGHT.headline}</div>
          {HOME_INSIGHT.body}
        </div>
      </div>
      <h3 className="mt-4 font-display text-[13.5px] font-bold! leading-tight! tracking-normal! text-ink">Skills to improve</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HOME_INSIGHT.skillsToImprove.map((s) => (
          <span key={s} className="rounded-lg bg-v2-blue-soft px-2.5 py-1.5 text-[12px] font-medium text-v2-blue-ink">
            {s}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <h3 className="font-display text-[13.5px] font-bold! leading-tight! tracking-normal! text-ink">Recommended for you</h3>
        <Link href="/learning" aria-label="All recommendations" className="text-v2-blue">
          <ArrowRightIcon size={15} />
        </Link>
      </div>
      <ul className="mt-2.5 space-y-3">
        {HOME_INSIGHT.recommended.map((r, i) => (
          <li key={r.title} className="flex items-center gap-3">
            <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONE[INSIGHT_TONES[i] ?? "blue"].soft, TONE[INSIGHT_TONES[i] ?? "blue"].ink)}>
              {i === 0 ? <ClipboardIcon size={19} /> : <LayersIcon size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ink">{r.title}</div>
              <div className="text-[12px] text-v2-muted">{r.meta}</div>
            </div>
            <ChevronRightIcon size={15} className="flex-none text-v2-muted" />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* ── Learning & Resources ────────────────────────────────────────────────────────────────── */

const LEARN_ICON: Record<string, ReactNode> = {
  "Coding Interview Prep": <ClipboardIcon size={20} />,
  "Resume That Gets Noticed": <FileTextIcon size={20} />,
  "System Design Basics": <LayersIcon size={20} />,
};

export function LearningStrip() {
  return (
    <SectionCard title="Learning & Resources" action={{ label: "View all", href: "/learning" }}>
      <ul className="grid gap-3 md:grid-cols-3">
        {HOME_LEARNING.map((l) => (
          <li key={l.title}>
            <Link
              href="/learning"
              className="flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-paper p-3 transition-colors hover:bg-paper-2"
            >
              <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", TONE[l.tone].soft, TONE[l.tone].ink)}>
                {LEARN_ICON[l.title]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-ink">{l.title}</div>
                <div className="text-[12.5px] text-v2-muted">{l.meta}</div>
              </div>
              <ChevronRightIcon size={16} className="flex-none text-v2-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
