"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, IconButton, Menu, MoreHorizontalIcon, Meter, Tooltip, buttonVariants, cn, useToast } from "@kiwiply/ui";
import { unansweredQuestions } from "@/components/onboarding/preferences";
import { track } from "@/lib/analytics";
import {
  CARD_SHOWN_KEY,
  ONBOARDING_DEFAULTS,
  draftProgress,
  isCardHidden,
  minutesLeftLabel,
  readCardMemory,
  shouldShowCard,
  snoozeUntil,
  writeCardMemory,
  type CardProgress,
  type OnboardingSettings,
} from "@/lib/onboarding-card";
import { loadDraft } from "@/lib/profile-setup/state";

type View = { state: "not_started" } | ({ state: "in_progress" } & CardProgress);

/**
 * The dashboard's friendly "Let's get you job-ready" card (Onboarding v2 R1.7, DESIGN 6): an invitation, never
 * a gate. Not started: mascot-wave, "Start". In progress (a setup draft exists in this tab): mascot-laptop,
 * "n of total done", a meter and "Continue". The ⋯ menu snoozes it for `onboarding.card.snoozeDays` or hides
 * it for good; both are remembered in `localStorage` per login until R1.9 moves them to the server.
 *
 * The mascots are server components (`Mascot` checks the file on disk), so the dashboard page renders them
 * and hands them in as slots. Everything that reads browser storage waits for mount, so server and first
 * client render agree (nothing shows until then).
 */
export default function FinishProfileCard({
  login,
  onboarded,
  score,
  promptBelow,
  bio,
  settings = ONBOARDING_DEFAULTS,
  mascotWave,
  mascotLaptop,
}: {
  /** Whoever is signed in; the snooze / dismiss memory is kept per login. */
  login: string;
  /** `bio.onboardedAt` is set (the person finished or skipped the old onboarding). */
  onboarded: boolean;
  /** Profile completeness, null when the API could not say. */
  score: number | null;
  /** `config.profile.setupPromptBelowPercent` (admin setting `profile.setup.promptBelowPercent`). */
  promptBelow: number;
  /** The profile's string values: which application questions are still unanswered decides whether the flow has that step. */
  bio: Record<string, unknown>;
  settings?: OnboardingSettings;
  mascotWave?: ReactNode;
  mascotLaptop?: ReactNode;
}) {
  const toast = useToast();
  const eligible = shouldShowCard({ onboarded, score, promptBelow });
  const [view, setView] = useState<View | null>(null);
  const hasPrefQuestions = unansweredQuestions(bio).length > 0;

  // Browser storage is only readable after mount.
  useEffect(() => {
    if (!eligible) return;
    if (isCardHidden(readCardMemory(window.localStorage, login), Date.now())) return;
    const draft = loadDraft(window.sessionStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists on the client
    setView(draft ? { state: "in_progress", ...draftProgress(draft, hasPrefQuestions, settings.stepSeconds) } : { state: "not_started" });
  }, [eligible, login, hasPrefQuestions, settings.stepSeconds]);

  // Once per session, however many times the dashboard renders.
  useEffect(() => {
    if (!view) return;
    try {
      if (window.sessionStorage.getItem(CARD_SHOWN_KEY)) return;
      window.sessionStorage.setItem(CARD_SHOWN_KEY, "1");
    } catch {
      // storage blocked: the event may repeat, never break the card
    }
    track("onboarding_card_shown", {
      state: view.state,
      stepsDone: view.state === "in_progress" ? view.stepsDone : 0,
      stepsTotal: view.state === "in_progress" ? view.stepsTotal : 0,
      resurfaced: false,
    });
  }, [view]);

  if (!view) return null;

  const snooze = () => {
    writeCardMemory(window.localStorage, login, { snoozedUntil: snoozeUntil(Date.now(), settings.snoozeDays) });
    track("onboarding_dismissed", { action: "snooze" });
    toast({ title: `Okay — we'll bring it back in ${settings.snoozeDays} ${settings.snoozeDays === 1 ? "day" : "days"}.` });
    setView(null);
  };
  const dismiss = () => {
    writeCardMemory(window.localStorage, login, { dismissedAt: new Date().toISOString() });
    track("onboarding_dismissed", { action: "dismiss" });
    toast({ title: "Got it. You can set up anytime from My Profiles." });
    setView(null);
  };

  const inProgress = view.state === "in_progress";
  const minutes = settings.estimateMinutes;
  return (
    <section aria-label="Set up your profile" className="relative flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-v2-lime-soft/60 p-4 shadow-v2-soft sm:gap-5 sm:p-5">
      {(inProgress ? mascotLaptop : mascotWave) && <div className="flex-none self-end">{inProgress ? mascotLaptop : mascotWave}</div>}
      <div className="min-w-0 flex-1 pr-9">
        <h2 className="text-[15px] font-extrabold text-v2-navy">{inProgress ? "Finish your profile" : "Let's get you job-ready"}</h2>
        <p className="mt-0.5 text-[13.5px] text-v2-navy/80">
          {view.state === "in_progress"
            ? `${view.stepsDone} of ${view.stepsTotal} done · ${minutesLeftLabel(view.secondsLeft)}`
            : `Drop in a resume, confirm a few cards, done. About ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`}
        </p>
        {view.state === "in_progress" && (
          <Meter value={view.stepsDone} max={view.stepsTotal} label="Setup progress" valueText={`${view.stepsDone} of ${view.stepsTotal} steps done`} neutral className="mt-2.5 max-w-xs" />
        )}
        <Link href="/profiles/setup" className={cn(buttonVariants("accent"), "mt-3 max-sm:min-h-11 max-sm:w-full")}>
          {inProgress ? "Continue" : "Start"} <ArrowRightIcon size={15} aria-hidden />
        </Link>
      </div>
      <Tooltip content="Hide this card" className="absolute right-2 top-2">
        <Menu
          trigger={
            <IconButton aria-label="Hide this card" className="h-11 w-11 text-v2-navy/70">
              <MoreHorizontalIcon size={20} aria-hidden />
            </IconButton>
          }
          items={[
            { label: "Remind me in a few days", onSelect: snooze },
            { label: "Don't show this again", onSelect: dismiss },
          ]}
        />
      </Tooltip>
    </section>
  );
}
