"use client";

import { useRef, useState } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GearIcon,
  MonitorIcon,
  SearchIcon,
  SparklesIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import {
  INTERVIEW_DETAIL,
  INTERVIEW_DETAIL_TABS,
  INTERVIEW_PREP,
  INTERVIEW_TABS,
  INTERVIEW_TASKS,
  PAST_INTERVIEWS,
  UPCOMING_INTERVIEWS,
  type InterviewSample,
} from "../sample-data.pages";
import { AppArt, CompanyTile, IconTile, KebabMenu, PageHero, SectionCard, StatusChip, TONE, UnderlineTabs } from "../local";

const PREP_ICON: Record<string, React.ReactNode> = {
  "AI Mock Interview": <ChatIcon className="h-5 w-5" />,
  "Common Questions": <SearchIcon className="h-5 w-5" />,
  "Behavioral Questions": <SparklesIcon className="h-5 w-5" />,
  "Technical Preparation": <GearIcon className="h-5 w-5" />,
  "Company-Specific Prep": <BriefcaseIcon className="h-5 w-5" />,
};

const tab = (label: string) => ({ value: label, label });

/**
 * Interviews (board `app-interviews.webp`; `-alt` differs only in hero art). All sample data
 * with client state: tab strip, selected interview + detail tabs, task checkboxes. Nothing is
 * scheduled or joined for real, so the meeting buttons say so.
 */
export default function InterviewsPage() {
  const toast = useToast();
  const [top, setTop] = useState(INTERVIEW_TABS[0]);
  const [selectedId, setSelectedId] = useState(UPCOMING_INTERVIEWS[0].id);
  const [detailTab, setDetailTab] = useState(INTERVIEW_DETAIL_TABS[0]);
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(INTERVIEW_TASKS.map((t) => [t.id, t.done])));
  const detailRef = useRef<HTMLElement>(null);

  const selected = UPCOMING_INTERVIEWS.find((i) => i.id === selectedId) ?? UPCOMING_INTERVIEWS[0];
  const noLink = () => toast({ title: "No meeting link saved yet", description: "Paste the invite link from your email once the employer sends it." });
  const soon = () => toast({ title: "Coming soon" });

  const prepare = (i: InterviewSample) => {
    setSelectedId(i.id);
    setDetailTab("Preparation Plan");
    setTop(INTERVIEW_TABS[0]);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mx-auto grid w-full max-w-[1400px] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-4">
        <PageHero
          title="Interviews"
          subtitle={
            <>
              Stay prepared and confident for every interview.
              <br className="hidden sm:block" /> Track your schedule, get AI-powered preparation, practice with real questions, and never miss an opportunity.
            </>
          }
          art={<AppArt name="calendar-note" height={150} className="mt-3 hidden flex-none lg:block" />}
        />

        <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
          <UnderlineTabs
            ariaLabel="Interview views"
            value={top}
            onChange={setTop}
            className="px-2 sm:px-4"
            tabs={INTERVIEW_TABS.map(tab)}
          />

          {top === INTERVIEW_TABS[0] && (
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-extrabold tracking-tight text-v2-navy">
                  Upcoming Interviews <span className="ml-1 font-semibold text-v2-ink-soft">({UPCOMING_INTERVIEWS.length})</span>
                </h2>
                <button type="button" onClick={soon} className="inline-flex items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline">
                  View Calendar <ArrowRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-2.5">
                {UPCOMING_INTERVIEWS.map((i) => (
                  <li
                    key={i.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl border p-3.5 md:flex-row md:items-center md:gap-4",
                      i.id === selectedId ? "border-v2-lime bg-v2-lime-soft/50" : "border-v2-line bg-white",
                    )}
                  >
                    <button type="button" onClick={() => setSelectedId(i.id)} className="flex min-w-0 flex-1 items-start gap-3.5 text-left" aria-label={`Show details for ${i.title} at ${i.company}`}>
                      <CompanyTile name={i.company} size={52} />
                      <span className="min-w-0">
                        <span className="block text-[15.5px] font-bold leading-snug text-v2-navy">{i.title}</span>
                        <span className="block text-[13px] text-v2-ink-soft">
                          {i.company} {"·"} {i.location}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <StatusChip tone="blue" className="rounded-md">{i.type}</StatusChip>
                          <StatusChip tone="violet" className="rounded-md">{i.round}</StatusChip>
                        </span>
                      </span>
                    </button>
                    <ul className="space-y-1.5 text-[13px] text-v2-ink-soft md:w-[200px] md:flex-none">
                      <li className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 flex-none" />{i.date}</li>
                      <li className="flex items-center gap-2"><ClockIcon className="h-4 w-4 flex-none" />{i.time}</li>
                      {i.mode && <li className="flex items-center gap-2"><MonitorIcon className="h-4 w-4 flex-none" />{i.mode}</li>}
                    </ul>
                    <div className="flex items-center gap-1.5 md:flex-none">
                      <div className="flex flex-1 flex-col gap-2 md:w-[130px] md:flex-none">
                        <button
                          type="button"
                          onClick={() => prepare(i)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-v2-lime text-[13.5px] font-bold text-v2-navy hover:brightness-95"
                        >
                          Prepare <ArrowRightIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={i.primary === "Join Meeting" ? noLink : () => setSelectedId(i.id)}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-v2-line bg-white text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
                        >
                          {i.primary}
                        </button>
                      </div>
                      <KebabMenu
                        label={`More actions for ${i.title} at ${i.company}`}
                        items={[
                          { label: "Prepare", onSelect: () => prepare(i) },
                          { label: "Add to calendar", onSelect: soon },
                        ]}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {top === INTERVIEW_TABS[1] && (
            <ul className="divide-y divide-v2-line/70 p-4 sm:p-5">
              {PAST_INTERVIEWS.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <CompanyTile name={p.company} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-v2-navy">{p.company}</p>
                    <p className="text-[13px] text-v2-ink-soft">{p.title}</p>
                    <p className="text-[12.5px] text-v2-muted">{p.meta}</p>
                  </div>
                  <StatusChip tone={p.outcome === "Positive" ? "green" : "amber"}>{p.outcome}</StatusChip>
                </li>
              ))}
            </ul>
          )}

          {top === INTERVIEW_TABS[2] && (
            <ul className="divide-y divide-v2-line/70 p-4 sm:p-5">
              {INTERVIEW_PREP.map((p) => (
                <li key={p.title}>
                  <button type="button" onClick={soon} className="flex w-full items-center gap-3 py-3 text-left">
                    <IconTile tone={`${TONE[p.tone].soft} ${TONE[p.tone].ink}`}>{PREP_ICON[p.title]}</IconTile>
                    <span className="flex-1">
                      <span className="block font-bold text-v2-navy">{p.title}</span>
                      <span className="block text-[13px] text-v2-ink-soft">{p.sub}</span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 text-v2-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {top === INTERVIEW_TABS[3] && (
            <div className="px-5 py-12 text-center">
              <h2 className="text-[18px] font-extrabold text-v2-navy">Interview Resources</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-v2-ink-soft">
                Guides, question banks and interview experiences from other candidates will be collected here.
              </p>
              <p className="mt-4 inline-flex rounded-full bg-v2-lime-soft px-3 py-1 text-[12.5px] font-bold text-v2-navy">Coming soon</p>
            </div>
          )}
        </section>

        {top === INTERVIEW_TABS[0] && (
          <section ref={detailRef} aria-labelledby="interview-details" className="scroll-mt-24 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:p-5">
            <h2 id="interview-details" className="text-[18px] font-extrabold tracking-tight text-v2-navy">Interview Details</h2>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <CompanyTile name={selected.company} size={52} />
                <div className="min-w-0">
                  <p className="text-[15.5px] font-bold leading-snug text-v2-navy">{selected.title}</p>
                  <p className="text-[13px] text-v2-ink-soft">{selected.company} {"·"} {selected.location}</p>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <StatusChip tone="blue" className="rounded-md">{selected.type}</StatusChip>
                    <StatusChip tone="violet" className="rounded-md">{selected.round}</StatusChip>
                  </span>
                </div>
              </div>
              <ul className="space-y-1.5 text-[13px] text-v2-ink-soft md:w-[200px] md:flex-none">
                <li className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 flex-none" />{selected.date}</li>
                <li className="flex items-center gap-2"><ClockIcon className="h-4 w-4 flex-none" />{selected.time}</li>
                {selected.mode && <li className="flex items-center gap-2"><MonitorIcon className="h-4 w-4 flex-none" />{selected.mode}</li>}
              </ul>
              <div className="flex items-center gap-2 md:flex-none">
                <button type="button" onClick={noLink} className="inline-flex h-10 items-center rounded-lg bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95">
                  Join Meeting
                </button>
                <button type="button" onClick={soon} className="inline-flex h-10 items-center rounded-lg border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]">
                  Add to Calendar
                </button>
                <KebabMenu label="More actions" items={[{ label: "Add to calendar", onSelect: soon }]} />
              </div>
            </div>

            <UnderlineTabs
              ariaLabel="Interview detail sections"
              value={detailTab}
              onChange={setDetailTab}
              className="mt-4"
              tabs={INTERVIEW_DETAIL_TABS.map(tab)}
            />

            {detailTab === "Overview" ? (
              <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
                <div className="flex items-start gap-3">
                  <IconTile tone={`${TONE.amber.soft} ${TONE.amber.ink}`}><FileTextIcon className="h-5 w-5" /></IconTile>
                  <div>
                    <h3 className="text-[15px] font-bold tracking-normal text-v2-navy">{INTERVIEW_DETAIL.expectTitle}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-v2-ink-soft">{INTERVIEW_DETAIL.expectBody}</p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {INTERVIEW_DETAIL.expectTags.map((t) => (
                        <li key={t} className="rounded-md bg-[#EEF1F6] px-2.5 py-1 text-[12px] font-medium text-v2-ink-soft">{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IconTile tone={`${TONE.amber.soft} ${TONE.amber.ink}`}><CheckIcon className="h-5 w-5" /></IconTile>
                  <div>
                    <h3 className="text-[15px] font-bold tracking-normal text-v2-navy">Key Topics</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-v2-ink-soft marker:text-v2-green">
                      {INTERVIEW_DETAIL.topics.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IconTile tone={`${TONE.blue.soft} ${TONE.blue.ink}`}><SparklesIcon className="h-5 w-5" /></IconTile>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold tracking-normal text-v2-navy">Quick Actions</h3>
                    <ul className="mt-2 space-y-1.5">
                      {INTERVIEW_DETAIL.quickActions.map((a) => (
                        <li key={a}>
                          <button type="button" onClick={soon} className="flex w-full items-center justify-between gap-2 rounded-lg border border-v2-line px-3 py-2 text-left text-[13px] text-v2-navy hover:bg-[#F8FAFF]">
                            {a}
                            <ChevronRightIcon className="h-3.5 w-3.5 flex-none text-v2-muted" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-v2-ink-soft">{INTERVIEW_DETAIL.tabBodies[detailTab]}</p>
            )}
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Interview Preparation" action={{ label: "View all", onClick: () => setTop(INTERVIEW_TABS[2]) }}>
          <ul className="divide-y divide-v2-line/70">
            {INTERVIEW_PREP.map((p) => (
              <li key={p.title}>
                <button type="button" onClick={soon} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <IconTile tone={`${TONE[p.tone].soft} ${TONE[p.tone].ink}`}>{PREP_ICON[p.title]}</IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-tight text-v2-navy">{p.title}</span>
                    <span className="block text-[12.5px] leading-snug text-v2-ink-soft">{p.sub}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Upcoming Tasks" action={{ label: "View all", onClick: soon }}>
          <ul className="divide-y divide-v2-line/70">
            {INTERVIEW_TASKS.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done[t.id]}
                  aria-label={t.title}
                  onClick={() => setDone((p) => ({ ...p, [t.id]: !p[t.id] }))}
                  className={cn(
                    "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2",
                    done[t.id] ? "border-v2-green bg-v2-green text-white" : "border-v2-line bg-white",
                  )}
                >
                  {done[t.id] && <CheckIcon className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0">
                  <p className={cn("text-[13.5px] leading-snug text-v2-navy", done[t.id] && "text-v2-ink-soft line-through decoration-v2-line")}>{t.title}</p>
                  <p className="text-[12px] text-v2-muted">{t.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Past Interviews" action={{ label: "View all", onClick: () => setTop(INTERVIEW_TABS[1]) }}>
          <ul className="space-y-3.5">
            {PAST_INTERVIEWS.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <CompanyTile name={p.company} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold leading-tight text-v2-navy">{p.company}</p>
                  <p className="text-[12.5px] leading-snug text-v2-ink-soft">{p.title}</p>
                  <p className="text-[12px] text-v2-muted">{p.meta}</p>
                </div>
                <StatusChip tone={p.outcome === "Positive" ? "green" : "amber"}>{p.outcome}</StatusChip>
                <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
              </li>
            ))}
          </ul>
        </SectionCard>
      </aside>
    </div>
  );
}
