"use client";

import { useState } from "react";
import { ArrowRightIcon, CalendarIcon, ClockIcon, GearIcon, LightbulbIcon, RocketIcon, Switch, TrophyIcon, cn, useToast } from "@kiwiply/ui";
import {
  AI_SETTINGS_FIND,
  AUTO_ANALYTICS,
  AUTO_APPLY_BENEFITS,
  AUTO_SETTINGS,
  AUTO_TIPS,
  FIND_ACTIVITY,
} from "../sample-data";
import { CheckList, HeroArt, PageHero, SectionCard, TONE, UnderlineTabs } from "../common";
import AutoApply from "./AutoApply";
import FindApply from "./FindApply";
import { CopilotChip, MiniBars, SettingsList } from "./parts";

const TABS = [
  { value: "find", label: "Find & Apply" },
  { value: "bulk", label: "Bulk Apply" },
  { value: "auto", label: "Auto Apply Agent" },
  { value: "templates", label: "Application Templates" },
  { value: "preferences", label: "Manage Preferences" },
];

const SOON: Record<string, { title: string; body: string }> = {
  bulk: {
    title: "Bulk Apply",
    body: "Pick several saved jobs and let Kiwiply prepare each application in one go. You review and submit every one.",
  },
  templates: {
    title: "Application Templates",
    body: "Save reusable answers, cover-letter styles and resume choices, then apply them to any job with one click.",
  },
  preferences: {
    title: "Manage Preferences",
    body: "Fine-tune target roles, locations, salary range and the companies to skip. These feed every AI application.",
  },
};

const TILE_ICON: Record<string, React.ReactNode> = {
  Applied: <RocketIcon className="h-4 w-4" />,
  "Under Review": <ClockIcon className="h-4 w-4" />,
  Interviews: <CalendarIcon className="h-4 w-4" />,
  Offers: <TrophyIcon className="h-4 w-4" />,
};

const COMING_SOON = "Coming soon — Autopilot prepares, you submit";

/**
 * AI Apply: the merged tab row (Find & Apply, Bulk Apply, Auto Apply Agent, Application
 * Templates, Manage Preferences). The two boards are the first and third tabs and each brings
 * its own hero and right rail; the other tabs reuse the Find hero/rail around a "coming soon"
 * panel. "Start Auto Apply" / "Apply with AI" only show a toast: nothing is submitted.
 */
export default function AiApplyPage({ defaultResumeLabel }: { defaultResumeLabel?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState("find");
  const [autoOn, setAutoOn] = useState(true);
  const [review, setReview] = useState(false);
  const soon = () => toast({ title: COMING_SOON });
  const isAuto = tab === "auto";

  const findSettings = AI_SETTINGS_FIND.map((s) =>
    s.title === "Default Resume" && defaultResumeLabel ? { ...s, sub: defaultResumeLabel } : s,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1400px] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {isAuto ? (
          <PageHero
            eyebrow={<CopilotChip />}
            title={
              <span>
                Let AI apply <span className="text-v2-green">for you.</span>
              </span>
            }
            subtitle={
              "Kiwiply finds the best matching jobs, customizes your resume and answers, and applies automatically — so you can focus on what matters most."
            }
            art={<HeroArt mascot="mascot-wave-laptop" note="Same you. More opportunities." mascotHeight={132} />}
          />
        ) : (
          <PageHero
            eyebrow={<CopilotChip />}
            title={
              <span>
                Apply to more jobs, with <span className="text-v2-green">less effort.</span>
              </span>
            }
            subtitle="Kiwiply automatically fills applications with your tailored information, optimizes your resume, and helps you submit to multiple jobs — so you can focus on what really matters."
            art={<HeroArt mascot="mascot-wave-laptop" note="Same me. More opportunities." mascotHeight={132} />}
          />
        )}

        <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
          <UnderlineTabs padded counts="pill" ariaLabel="AI Apply" tabs={TABS} value={tab} onChange={setTab} className="px-2 sm:px-4" />
          {tab === "find" && <FindApply onApply={soon} />}
          {tab === "auto" && <AutoApply onStart={soon} />}
          {SOON[tab] && (
            <div className="px-5 py-12 text-center sm:py-16">
              <h2 className="text-[20px] font-extrabold tracking-tight text-v2-navy">{SOON[tab].title}</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-v2-ink-soft">{SOON[tab].body}</p>
              <p className="mt-4 inline-flex rounded-full bg-v2-lime-soft px-3 py-1 text-[12.5px] font-bold text-v2-navy">Coming soon</p>
            </div>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        {isAuto ? (
          <>
            <div className="rounded-2xl border border-v2-line bg-[linear-gradient(160deg,#F1FBE5_0%,#EAF8F0_100%)] p-5">
              <CheckList items={AUTO_APPLY_BENEFITS} />
            </div>
            <SectionCard title="Auto Apply Settings" icon={<GearIcon className="h-5 w-5 text-v2-ink-soft" />} action={{ label: "Edit", onClick: soon }}>
              <SettingsList items={AUTO_SETTINGS} onSelect={soon} />
            </SectionCard>
            <SectionCard
              title="Application Analytics"
              subtitle={AUTO_ANALYTICS.range}
              action={{ label: "View all", onClick: soon }}
            >
              <div className="grid grid-cols-4 gap-2">
                {AUTO_ANALYTICS.tiles.map((t) => (
                  <div key={t.label} className={cn("flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center", TONE[t.tone].soft)}>
                    <span className={TONE[t.tone].ink}>{TILE_ICON[t.label]}</span>
                    <span className="text-[15px] font-extrabold leading-none text-v2-navy">{t.value}</span>
                    <span className="text-[10.5px] leading-tight text-v2-ink-soft">{t.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <div className="flex flex-col justify-between pb-5 text-[10.5px] text-v2-muted">
                  {AUTO_ANALYTICS.yTicks.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex h-[96px] items-end gap-[3px] border-b border-v2-line/70">
                    {AUTO_ANALYTICS.bars.map((n, i) => (
                      <span
                        key={i}
                        className={cn("flex-1 rounded-t-sm", i % 5 === 2 ? "bg-[#7BD34A]" : "bg-v2-green")}
                        style={{ height: `${(n / 30) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10.5px] text-v2-muted">
                    {AUTO_ANALYTICS.xLabels.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Tips for Better Results" icon={<LightbulbIcon className="h-5 w-5 text-v2-amber" />} action={{ label: "View all", onClick: soon }}>
              <CheckList items={AUTO_TIPS} />
            </SectionCard>
          </>
        ) : (
          <>
            <SectionCard
              title="AI Application Settings"
              icon={<GearIcon className="h-5 w-5 text-v2-ink-soft" />}
              subtitle="Kiwiply will use your profile, resume and preferences to tailor each application."
            >
              <SettingsList items={findSettings} onSelect={soon} />
            </SectionCard>
            <section className="rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:p-5">
              <header className="flex items-center gap-2">
                <GearIcon className="h-5 w-5 flex-none text-v2-green" />
                <h2 className="text-[16px] font-bold tracking-normal text-v2-navy">Auto Apply Agent</h2>
                <span className="rounded-full bg-v2-violet-soft px-2 py-0.5 text-[11px] font-bold text-v2-violet">Beta</span>
                <span className="ml-auto">
                  <Switch checked={autoOn} onCheckedChange={setAutoOn} aria-label="Auto Apply Agent" />
                </span>
              </header>
              <p className="mt-2 text-[13.5px] leading-snug text-v2-ink-soft">Let Kiwiply apply to matching jobs for you on a schedule.</p>              <button
                type="button"
                onClick={() => setTab("auto")}
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-v2-line px-3.5 py-2.5 text-left text-[13px] font-semibold text-v2-navy hover:bg-[#F8FAFF]"
              >
                <span className="flex-1">Apply to 10 best matches daily</span>
                <ArrowRightIcon className="h-4 w-4 text-v2-muted" />
              </button>
              <div className="mt-2 flex items-center gap-3 px-3.5 py-2 text-[13px] text-v2-ink-soft">
                <span className="flex-1">Review before submitting</span>
                <Switch checked={review} onCheckedChange={setReview} aria-label="Review before submitting" />
              </div>
              <button
                type="button"
                onClick={() => setTab("auto")}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-v2-lime-soft text-[14px] font-bold text-v2-navy hover:brightness-95"
              >
                Configure Auto Apply <ArrowRightIcon className="h-4 w-4" />
              </button>
            </section>
            <SectionCard title="Application Activity" action={{ label: "View all", onClick: soon }}>
              <MiniBars data={FIND_ACTIVITY} max={8} />
            </SectionCard>
          </>
        )}
      </aside>
    </div>
  );
}
