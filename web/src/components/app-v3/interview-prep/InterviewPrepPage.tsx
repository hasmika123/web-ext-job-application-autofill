"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckIcon,
  ChatIcon,
  EmptyState,
  ClockIcon,
  GearIcon,
  SparklesIcon,
  SearchIcon,
  TargetIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { AppArt, FilterSelect, IconTile, ProgressRing, SectionCard, StatusChip, UnderlineTabs } from "@/components/app-v2/common";
import type { Tone } from "@/components/app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import { IP_COMPANIES, IP_MODES, IP_QUESTION_FILTERS, IP_ROLES, IP_TABS } from "../sample-data";
import { useSamples } from "../SamplesProvider";

const MODE_ICON: Record<string, React.ReactNode> = {
  quick: <ClockIcon className="h-5 w-5" />,
  full: <ChatIcon className="h-5 w-5" />,
  behavioral: <SparklesIcon className="h-5 w-5" />,
  technical: <GearIcon className="h-5 w-5" />,
};

const SET_ICON: Record<string, React.ReactNode> = {
  "Technical Questions": <GearIcon className="h-5 w-5" />,
  "Behavioral Questions": <SparklesIcon className="h-5 w-5" />,
  "System Design": <TargetIcon className="h-5 w-5" />,
  "Company Specific": <BriefcaseIcon className="h-5 w-5" />,
  "Coding Practice": <SearchIcon className="h-5 w-5" />,
};

const LIME_BTN = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-v2-lime px-5 text-[14px] font-bold text-v2-navy hover:brightness-95";

function scoreTone(score: number): Tone {
  return score >= 80 ? "green" : score >= 60 ? "amber" : "coral";
}

/**
 * Interview Prep (APP-V3-SPEC 2.8). Its question sets, sessions and progress are SAMPLE data with client state
 * (tabs, selected mode, role / company, question filter) until U9.x builds them, so only a demo account on a
 * sample-enabled build sees them (`samples()`, U0.5); a real account sees an honest empty state. Nothing is
 * recorded or scored for real yet, so every "Start" / "Practice" says "Coming soon".
 */
export default function InterviewPrepPage() {
  const toast = useToast();
  const sample = useSamples();
  const questionSets = sample("IP_QUESTION_SETS");
  const popularQuestions = sample("IP_POPULAR_QUESTIONS");
  const moreQuestions = sample("IP_MORE_QUESTIONS");
  const mockTypes = sample("IP_MOCK_TYPES");
  const recentSessions = sample("IP_RECENT_SESSIONS");
  const progress = sample("IP_PROGRESS");
  const soon = () => toast({ title: "Coming soon" });
  const [tab, setTab] = useState("practice");
  const [mode, setMode] = useState(IP_MODES[0].id);
  const [role, setRole] = useState(IP_ROLES[0]);
  const [company, setCompany] = useState("Google");
  const [filter, setFilter] = useState("All");

  const allQuestions = [...popularQuestions, ...moreQuestions];
  const shown = filter === "All" ? allQuestions : allQuestions.filter((q) => q.category === filter);

  const questionList = (items: { text: string; category?: string }[]) => (
    <ul className="divide-y divide-v2-line/70">
      {items.map((q) => (
        <li key={q.text} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 text-[14px] text-v2-navy">{q.text}</span>
          {q.category && <StatusChip tone="slate" className="hidden rounded-md sm:inline-flex">{q.category}</StatusChip>}
          <button type="button" onClick={soon} className="-my-2 inline-flex min-h-11 flex-none items-center gap-1 px-1 text-[13px] font-semibold text-v2-blue hover:underline sm:min-h-0">
            Practice <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  if (allQuestions.length + questionSets.length + mockTypes.length + recentSessions.length === 0 && !progress) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        <HeroBand title="Interview Preparation" subtitle="Practice, learn, and build confidence." mascot="calendar-note" />
        <EmptyState mascot title="Nothing to practice yet" description="Question sets and your practice sessions show up here." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand title="Interview Preparation" subtitle="Practice, learn, and build confidence." mascot="calendar-note" />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_clamp(260px,26vw,330px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="rounded-2xl border border-v2-line bg-white shadow-v2-soft">
            <UnderlineTabs padded counts="pill" ariaLabel="Interview prep sections" value={tab} onChange={setTab} className="border-b-0 px-2 sm:px-4" tabs={IP_TABS} />
          </div>

          {tab === "practice" && (
            <>
              <SectionCard title="Choose a practice mode">
                <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {IP_MODES.map((m) => {
                    const on = m.id === mode;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setMode(m.id)}
                          className={cn(
                            "relative flex h-full w-full flex-col items-start gap-2.5 rounded-2xl border-2 p-3.5 text-left sm:p-4 transition-colors",
                            on ? "border-v2-green bg-v2-lime-soft/40" : "border-v2-line bg-white hover:bg-[#F8FAFF]",
                          )}
                        >
                          <IconTile tone={m.tone}>{MODE_ICON[m.id]}</IconTile>
                          <span>
                            <span className="block text-[14.5px] font-bold leading-tight text-v2-navy">{m.title}</span>
                            <span className="mt-0.5 block text-[12.5px] leading-snug text-v2-ink-soft">{m.sub}</span>
                          </span>
                          {on && (
                            <span aria-hidden className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-v2-green text-white">
                              <CheckIcon className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div className="min-w-[150px] flex-1">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-v2-ink-soft">Select a Role</p>
                    <FilterSelect label="Select a Role" options={IP_ROLES} value={role} onChange={setRole} />
                  </div>
                  <div className="min-w-[150px] flex-1">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-v2-ink-soft">Select Company (Optional)</p>
                    <FilterSelect label="Select Company (Optional)" options={IP_COMPANIES} placeholder value={company} onChange={setCompany} />
                  </div>
                  <button type="button" onClick={soon} className={cn(LIME_BTN, "w-full sm:w-auto")}>
                    Start Mock Interview
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Common Question Sets">
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {questionSets.map((s) => (
                    <li key={s.title}>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter(s.title === "Technical Questions" ? "Technical" : s.title === "Behavioral Questions" ? "Behavioral" : s.title === "Coding Practice" ? "Coding" : s.title);
                          setTab("questions");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-v2-line bg-white p-3 text-left hover:bg-[#F8FAFF]"
                      >
                        <IconTile tone={s.tone}>{SET_ICON[s.title]}</IconTile>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold leading-tight text-v2-navy">{s.title}</span>
                          <span className="block text-[12.5px] text-v2-ink-soft">{s.sub}</span>
                        </span>
                        <ArrowRightIcon className="h-4 w-4 flex-none text-v2-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              <SectionCard title="Popular questions" action={{ label: "View all", onClick: () => setTab("questions") }}>
                {questionList(popularQuestions.map((q) => ({ text: q.text })))}
              </SectionCard>
            </>
          )}

          {tab === "questions" && (
            <SectionCard title="Question bank" subtitle="Pick a question to practice out loud.">
              <ul className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" aria-label="Question category">
                {IP_QUESTION_FILTERS.map((f) => (
                  <li key={f} className="flex-none">
                    <button
                      type="button"
                      aria-pressed={f === filter}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "whitespace-nowrap rounded-full border px-3.5 py-2.5 text-[12.5px] font-semibold sm:px-3 sm:py-1.5",
                        f === filter ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue" : "border-v2-line bg-white text-v2-ink-soft hover:bg-[#F1F5FB]",
                      )}
                    >
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
              {shown.length > 0 ? questionList(shown) : <p className="py-6 text-center text-[13.5px] text-v2-ink-soft">No questions in this set yet.</p>}
            </SectionCard>
          )}

          {tab === "mock" && (
            <SectionCard title="Mock interviews" subtitle="Simulate a full round with an AI interviewer.">
              <ul className="divide-y divide-v2-line/70">
                {mockTypes.map((m) => (
                  <li key={m.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <IconTile tone={m.tone}>
                      <ChatIcon className="h-5 w-5" />
                    </IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-v2-navy">{m.title}</span>
                      <span className="block text-[12.5px] text-v2-ink-soft">{m.sub}</span>
                    </span>
                    <span className="hidden flex-none text-[12.5px] text-v2-muted sm:inline">{m.duration}</span>
                    <button type="button" onClick={soon} className="inline-flex h-11 flex-none items-center rounded-lg bg-v2-lime sm:h-9 px-4 text-[13px] font-bold text-v2-navy hover:brightness-95">
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {tab === "sessions" && (
            <SectionCard title="My sessions" subtitle="Scores from your recent practice.">
              <ul className="divide-y divide-v2-line/70">
                {recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-v2-navy">{s.title}</span>
                      <span className="block text-[12.5px] text-v2-ink-soft">{s.sub}</span>
                    </span>
                    <StatusChip tone={scoreTone(s.score)}>{s.score}%</StatusChip>
                    <button type="button" onClick={soon} className="min-h-11 px-1 text-[13px] font-semibold text-v2-blue hover:underline sm:min-h-0">
                      Review
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-4 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 lg:grid-cols-1 lg:[&>*:last-child]:col-span-1">
          {/* Board 2/3/4: the mock-interview mascot card heads the rail. */}
          <section className="flex flex-col items-center gap-2 rounded-2xl border border-v2-line bg-[linear-gradient(160deg,#F1FBE5_0%,#E4F1FF_100%)] p-4 text-center shadow-v2-soft">
            <h2 className="self-start font-display text-[16px] font-extrabold tracking-tight text-v2-navy">Mock Interview</h2>
            <AppArt name="mascot-wave-laptop" height={112} />
            <p className="text-[14.5px] font-bold leading-tight text-v2-navy">Start a real-time mock interview</p>
            <p className="max-w-[260px] text-[12.5px] leading-snug text-v2-ink-soft">Get feedback on your answers, communication, and confidence.</p>
            <button type="button" onClick={soon} className={cn(LIME_BTN, "mt-1 h-10 w-full text-[13.5px]")}>
              Start Mock Interview
            </button>
          </section>

          {recentSessions.length > 0 && (
          <SectionCard title="Recent Practice Sessions" action={{ label: "View all", onClick: () => setTab("sessions") }}>
            <ul className="space-y-3">
              {recentSessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <ProgressRing value={s.score} tone={scoreTone(s.score)} size={46} label={`${s.score} percent`}>
                    <span className="text-[11.5px] font-extrabold text-v2-navy">{s.score}%</span>
                  </ProgressRing>
                  <div className="min-w-[150px] flex-1">
                    <p className="truncate text-[14px] font-bold leading-tight text-v2-navy">{s.title}</p>
                    <p className="truncate text-[12.5px] text-v2-ink-soft">{s.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
          )}

          {progress && (
          <SectionCard title="Your Progress">
            <div className="flex items-center gap-4">
              <ProgressRing value={progress.pct} tone="green" size={92} thickness={9} label={`${progress.pct} percent`}>
                <span className="font-display text-[22px] font-extrabold text-v2-navy">{progress.pct}%</span>
              </ProgressRing>
              <ul className="min-w-0 flex-1 space-y-2">
                {progress.stats.map((s) => (
                  <li key={s.label} className="flex items-baseline gap-2 text-[13px] text-v2-ink-soft">
                    <span className="w-7 text-right font-display text-[16px] font-extrabold tabular-nums text-v2-navy">{s.value}</span>
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}
