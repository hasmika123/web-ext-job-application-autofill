"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckIcon,
  ChatIcon,
  ClockIcon,
  GearIcon,
  SparklesIcon,
  SearchIcon,
  TargetIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { FilterSelect, IconTile, ProgressRing, SectionCard, StatusChip, UnderlineTabs } from "@/components/app-v2/common";
import type { Tone } from "@/components/app-v2/common";
import HeroBand from "../local-d/HeroBand";
import {
  IP_COMPANIES,
  IP_MODES,
  IP_MORE_QUESTIONS,
  IP_MOCK_TYPES,
  IP_POPULAR_QUESTIONS,
  IP_PROGRESS,
  IP_QUESTION_FILTERS,
  IP_QUESTION_SETS,
  IP_RECENT_SESSIONS,
  IP_ROLES,
  IP_TABS,
} from "../sample-data.v3d";

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
 * Interview Prep (APP-V3-SPEC 2.8). All sample data with client state (tabs, selected mode, role /
 * company, question filter). Nothing is recorded or scored for real yet, so every "Start" /
 * "Practice" says "Coming soon".
 */
export default function InterviewPrepPage() {
  const toast = useToast();
  const soon = () => toast({ title: "Coming soon" });
  const [tab, setTab] = useState("practice");
  const [mode, setMode] = useState(IP_MODES[0].id);
  const [role, setRole] = useState(IP_ROLES[0]);
  const [company, setCompany] = useState("Google");
  const [filter, setFilter] = useState("All");

  const allQuestions = [...IP_POPULAR_QUESTIONS, ...IP_MORE_QUESTIONS];
  const shown = filter === "All" ? allQuestions : allQuestions.filter((q) => q.category === filter);

  const questionList = (items: { text: string; category?: string }[]) => (
    <ul className="divide-y divide-v2-line/70">
      {items.map((q) => (
        <li key={q.text} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 text-[14px] text-v2-navy">{q.text}</span>
          {q.category && <StatusChip tone="slate" className="hidden rounded-md sm:inline-flex">{q.category}</StatusChip>}
          <button type="button" onClick={soon} className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline">
            Practice <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand title="Interview Preparation" subtitle="Practice, learn, and build confidence." mascot="calendar-note" />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="rounded-2xl border border-v2-line bg-white shadow-v2-soft">
            <UnderlineTabs padded counts="pill" ariaLabel="Interview prep sections" value={tab} onChange={setTab} className="border-b-0 px-2 sm:px-4" tabs={IP_TABS} />
          </div>

          {tab === "practice" && (
            <>
              <SectionCard title="Choose a practice mode">
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {IP_MODES.map((m) => {
                    const on = m.id === mode;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setMode(m.id)}
                          className={cn(
                            "relative flex h-full w-full flex-col items-start gap-2.5 rounded-2xl border-2 p-4 text-left transition-colors",
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

                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-v2-ink-soft">Select a Role</p>
                    <FilterSelect label="Select a Role" options={IP_ROLES} value={role} onChange={setRole} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-v2-ink-soft">Select Company (Optional)</p>
                    <FilterSelect label="Select Company (Optional)" options={IP_COMPANIES} placeholder value={company} onChange={setCompany} />
                  </div>
                  <button type="button" onClick={soon} className={LIME_BTN}>
                    Start Mock Interview
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Common Question Sets">
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {IP_QUESTION_SETS.map((s) => (
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
                {questionList(IP_POPULAR_QUESTIONS.map((q) => ({ text: q.text })))}
              </SectionCard>
            </>
          )}

          {tab === "questions" && (
            <SectionCard title="Question bank" subtitle="Pick a question to practice out loud.">
              <ul className="mb-4 flex flex-wrap gap-2" aria-label="Question category">
                {IP_QUESTION_FILTERS.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      aria-pressed={f === filter}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold",
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
                {IP_MOCK_TYPES.map((m) => (
                  <li key={m.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <IconTile tone={m.tone}>
                      <ChatIcon className="h-5 w-5" />
                    </IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-v2-navy">{m.title}</span>
                      <span className="block text-[12.5px] text-v2-ink-soft">{m.sub}</span>
                    </span>
                    <span className="hidden flex-none text-[12.5px] text-v2-muted sm:inline">{m.duration}</span>
                    <button type="button" onClick={soon} className="inline-flex h-9 flex-none items-center rounded-lg bg-v2-lime px-4 text-[13px] font-bold text-v2-navy hover:brightness-95">
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
                {IP_RECENT_SESSIONS.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-v2-navy">{s.title}</span>
                      <span className="block text-[12.5px] text-v2-ink-soft">{s.sub}</span>
                    </span>
                    <StatusChip tone={scoreTone(s.score)}>{s.score}%</StatusChip>
                    <button type="button" onClick={soon} className="text-[13px] font-semibold text-v2-blue hover:underline">
                      Review
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <SectionCard title="Recent Practice Sessions" action={{ label: "View all", onClick: () => setTab("sessions") }}>
            <ul className="space-y-3">
              {IP_RECENT_SESSIONS.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <ProgressRing value={s.score} tone={scoreTone(s.score)} size={46} label={`${s.score} percent`}>
                    <span className="text-[11.5px] font-extrabold text-v2-navy">{s.score}%</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold leading-tight text-v2-navy">{s.title}</p>
                    <p className="truncate text-[12.5px] text-v2-ink-soft">{s.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Your Progress">
            <div className="flex items-center gap-4">
              <ProgressRing value={IP_PROGRESS.pct} tone="green" size={92} thickness={9} label={`${IP_PROGRESS.pct} percent`}>
                <span className="font-display text-[22px] font-extrabold text-v2-navy">{IP_PROGRESS.pct}%</span>
              </ProgressRing>
              <ul className="min-w-0 flex-1 space-y-2">
                {IP_PROGRESS.stats.map((s) => (
                  <li key={s.label} className="flex items-baseline gap-2 text-[13px] text-v2-ink-soft">
                    <span className="w-7 text-right font-display text-[16px] font-extrabold tabular-nums text-v2-navy">{s.value}</span>
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
