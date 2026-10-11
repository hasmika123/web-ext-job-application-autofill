"use client";

import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BookmarkIcon,
  BookmarkOutlineIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  MicIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  Mark,
  cn,
} from "@kiwiply/ui";
import { CompanyTile, SectionCard, TONE, type Tone } from "@/components/app-v2/common";
import { HOME_AI_ACTIONS, HOME_SAVED_JOBS, HOME_TASKS, type SampleJob } from "@/components/app-v2/sample-data";
import { JobTag, SaveButton } from "@/components/app-v2/jobs/JobBits";

/* ── Greeting (time of day is the viewer's, so it is decided in the browser) ───────────────── */

function noopSubscribe() {
  return () => {};
}
function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Greeting({ name }: { name: string }) {
  const part = useSyncExternalStore(noopSubscribe, partOfDay, () => "Welcome back");
  return (
    <p className="text-[16px] font-bold text-ink">
      {part}, {name}! <span aria-hidden>👋</span>
    </p>
  );
}

/* ── Recommended Jobs ─────────────────────────────────────────────────────────────────────── */

export function RecommendedJobs({ jobs, real }: { jobs: SampleJob[]; real: boolean }) {
  return (
    <SectionCard title="Recommended Jobs" action={{ label: "View all", href: "/jobs" }}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <li key={job.id} className="flex min-w-0 flex-col rounded-2xl border border-v2-line/70 bg-paper p-3.5">
            <div className="flex items-start justify-between">
              <CompanyTile name={job.company} size={40} />
              <SaveButton job={job} className="-mr-1.5 -mt-1.5" />
            </div>
            <Link href={`/jobs/${job.id}`} className="mt-2.5 text-[14.5px] font-bold leading-snug text-ink hover:underline">
              {job.title}
            </Link>
            <div className="mt-0.5 text-[13px] text-ink-soft">{job.company}</div>
            <div className="mt-0.5 text-[12.5px] text-v2-muted">{[job.location, job.mode].filter(Boolean).join(" · ")}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {job.tags.slice(0, 2).map((t) => (
                <JobTag key={t}>{t}</JobTag>
              ))}
            </div>
            <Link
              href={real ? `/jobs/${job.id}` : `/ai-apply?job=${job.id}`}
              className="mt-3.5 flex items-center justify-center gap-1.5 rounded-xl bg-v2-lime px-3 py-2.5 text-[13.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
            >
              Apply with AI
              <ArrowRightIcon size={14} />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* ── Kiwiply AI panel ─────────────────────────────────────────────────────────────────────── */

const AI_ICON = {
  sparkles: <SparklesIcon size={16} />,
  file: <FileTextIcon size={16} />,
  pencil: <PencilIcon size={16} />,
  calendar: <CalendarIcon size={16} />,
  building: <BuildingIcon size={16} />,
} as const;

export function AiPanel() {
  const router = useRouter();
  const [q, setQ] = useState("");
  function ask(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    router.push(text ? `/ai-tools?q=${encodeURIComponent(text)}` : "/ai-tools");
  }
  return (
    <section className="rounded-2xl border border-v2-line/70 bg-[linear-gradient(160deg,#F4F0FF_0%,#EAF3FF_100%)] p-4 shadow-v2-soft">
      <div className="flex items-center justify-between">
        <Link href="/ai-tools" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink">
          <Mark size={26} />
          Kiwiply AI
          <ArrowRightIcon size={14} className="text-v2-blue" />
        </Link>
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-v2-blue-soft text-v2-blue">
          <MicIcon size={15} />
        </span>
      </div>
      <h2 className="mt-3 font-display text-[15.5px] font-bold! leading-snug! tracking-normal! text-ink">How can I help you today?</h2>
      <ul className="mt-2.5 space-y-2">
        {HOME_AI_ACTIONS.map((a) => {
          const t = TONE[a.tone as Tone];
          return (
            <li key={a.label}>
              <Link
                href={a.href}
                className="flex items-center gap-2.5 rounded-xl border border-v2-line/70 bg-paper px-3 py-2 text-[13.5px] font-medium text-ink transition-colors hover:bg-v2-blue-soft/50"
              >
                <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-lg", t.soft, t.ink)}>{AI_ICON[a.icon]}</span>
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                <ChevronRightIcon size={15} className="flex-none text-v2-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
      <form onSubmit={ask} className="relative mt-2.5">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-v2-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything..."
          aria-label="Ask Kiwiply AI anything"
          className="h-10 w-full rounded-xl border border-v2-line/70 bg-paper pl-9 pr-3 text-[13.5px] text-ink outline-none placeholder:text-v2-muted focus:border-v2-blue/40 focus-visible:ring-2 focus-visible:ring-v2-blue/25"
        />
      </form>
    </section>
  );
}

/* ── Today's Tasks (local state) ──────────────────────────────────────────────────────────── */

export function TodaysTasks() {
  const [done, setDone] = useState<boolean[]>(() => HOME_TASKS.map((t) => t.done));
  return (
    <SectionCard title="Today's Tasks" action={{ label: "View all", href: "/interviews" }}>
      <ul className="space-y-3">
        {HOME_TASKS.map((t, i) => (
          <li key={t.label}>
            <label className="flex cursor-pointer items-start gap-3 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={done[i]}
                onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-[20px] w-[20px] flex-none place-items-center rounded-full border-2 text-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-v2-green/40",
                  done[i] ? "border-v2-green bg-v2-green" : "border-v2-line bg-paper",
                )}
              >
                {done[i] && <CheckIcon size={11} />}
              </span>
              <span className="min-w-0">
                <span className={cn("block", done[i] && "text-ink-soft")}>{t.label}</span>
                {"time" in t && t.time && <span className="block text-[12px] text-v2-muted">{t.time}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* ── Saved Jobs (rail) ────────────────────────────────────────────────────────────────────── */

export function SavedJobsMini() {
  const [saved, setSaved] = useState<boolean[]>(() => HOME_SAVED_JOBS.map(() => true));
  return (
    <SectionCard title="Saved Jobs" action={{ label: "View all", href: "/saved" }}>
      <ul className="space-y-3.5">
        {HOME_SAVED_JOBS.map((j, i) => (
          <li key={j.title} className="flex items-center gap-3">
            <CompanyTile name={j.company} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-ink">{j.title}</div>
              <div className="truncate text-[12.5px] text-v2-muted">{j.meta}</div>
            </div>
            <button
              type="button"
              aria-pressed={saved[i]}
              aria-label={saved[i] ? `Unsave ${j.title}` : `Save ${j.title}`}
              onClick={() => setSaved((s) => s.map((v, k) => (k === i ? !v : v)))}
              className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg hover:bg-paper-2", saved[i] ? "text-ink" : "text-v2-muted")}
            >
              {saved[i] ? <BookmarkIcon size={17} /> : <BookmarkOutlineIcon size={17} />}
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
