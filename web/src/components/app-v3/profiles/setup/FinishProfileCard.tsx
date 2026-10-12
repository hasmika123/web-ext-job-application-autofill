"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, IconButton, Menu, MoreHorizontalIcon, Meter, Tooltip, buttonVariants, cn, useToast } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { patchOnboarding, type CardAction, type OnboardingStatus } from "@/lib/onboarding/api";
import {
  CARD_SHOWN_KEY,
  ONBOARDING_DEFAULTS,
  isLegacyMemoryActive,
  minutesLeftLabel,
  secondsLeft,
  dropLegacyCardMemory,
  readLegacyCardMemory,
  type OnboardingSettings,
} from "@/lib/onboarding-card";

/**
 * The dashboard's friendly "Let's get you job-ready" card (Onboarding v2 R1.7 / R1.9, DESIGN 6): an invitation, never
 * a gate. Not started: mascot-wave, "Start". In progress (a setup draft exists on the server, from any device):
 * mascot-laptop, "n of total done", a meter and "Continue". The ⋯ menu snoozes it for `onboarding.card.snoozeDays` or
 * hides it for good.
 *
 * The server decides (`status.card.show` / `.state` / the draft's `stepsDone` / `stepsTotal`, from
 * `GET /api/profile/onboarding`; the dashboard page loads it), and snooze / dismiss are `PATCH` calls. The R1.7 values
 * kept in `localStorage` are migrated once on the first load: sent to the server when it has none, then removed.
 *
 * The mascots are server components (`Mascot` checks the file on disk), so the dashboard page renders them
 * and hands them in as slots.
 */
export default function FinishProfileCard({
  login,
  status,
  settings = ONBOARDING_DEFAULTS,
  mascotWave,
  mascotLaptop,
}: {
  /** Whoever is signed in; only the one-time migration of the R1.7 browser memory is keyed by it. */
  login: string;
  /** `GET /api/profile/onboarding`; null when the API could not say (the card never nags on a failure). */
  status: OnboardingStatus | null;
  settings?: OnboardingSettings;
  mascotWave?: ReactNode;
  mascotLaptop?: ReactNode;
}) {
  const toast = useToast();
  const [hidden, setHidden] = useState(false);
  const show = status !== null && status.card.show && !hidden;
  const draft = status?.draft ?? null;
  const inProgress = status?.card.state === "IN_PROGRESS" && draft !== null;
  const serverHasMarker = !!(status?.card.dismissedAt || status?.card.snoozedUntil);

  // The R1.7 memory: carried to the server once (only when it has no marker of its own), then gone for good.
  useEffect(() => {
    if (status === null) return;
    const memory = readLegacyCardMemory(window.localStorage, login);
    if (!memory) return;
    if (serverHasMarker || !isLegacyMemoryActive(memory, Date.now())) {
      dropLegacyCardMemory(window.localStorage, login);
      return;
    }
    const action: CardAction = memory.dismissedAt ? "DISMISS" : "SNOOZE";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser memory only exists on the client
    setHidden(true);
    patchOnboarding({ card: { action } })
      .then(() => dropLegacyCardMemory(window.localStorage, login))
      // not sent: the card comes back and the remembered value stays, so the next visit tries again
      .catch(() => setHidden(false));
  }, [status, login, serverHasMarker]);

  // Once per session, however many times the dashboard renders.
  useEffect(() => {
    if (!show || status === null) return;
    try {
      if (window.sessionStorage.getItem(CARD_SHOWN_KEY)) return;
      window.sessionStorage.setItem(CARD_SHOWN_KEY, "1");
    } catch {
      // storage blocked: the event may repeat, never break the card
    }
    track("onboarding_card_shown", {
      state: inProgress ? "in_progress" : "not_started",
      stepsDone: inProgress ? draft.stepsDone : 0,
      stepsTotal: inProgress ? draft.stepsTotal : 0,
      resurfaced: status.card.resurfaced,
    });
  }, [show, status, inProgress, draft]);

  if (!show || status === null) return null;

  const act = (action: "SNOOZE" | "DISMISS") => {
    setHidden(true);
    track("onboarding_dismissed", { action: action === "SNOOZE" ? "snooze" : "dismiss" });
    patchOnboarding({ card: { action } })
      .then(() =>
        toast(
          action === "SNOOZE"
            ? { title: `Okay — we'll bring it back in ${settings.snoozeDays} ${settings.snoozeDays === 1 ? "day" : "days"}.` }
            : { title: "Got it. You can set up anytime from My Profiles." },
        ),
      )
      .catch(() => {
        setHidden(false);
        toast({ title: "Couldn't do that. Try again in a moment.", variant: "error" });
      });
  };

  const minutes = settings.estimateMinutes;
  return (
    <section aria-label="Set up your profile" className="relative flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-v2-lime-soft/60 p-4 shadow-v2-soft sm:gap-5 sm:p-5">
      {(inProgress ? mascotLaptop : mascotWave) && <div className="flex-none self-end">{inProgress ? mascotLaptop : mascotWave}</div>}
      <div className="min-w-0 flex-1 pr-9">
        <h2 className="text-[15px] font-extrabold text-v2-navy">{inProgress ? "Finish your profile" : "Let's get you job-ready"}</h2>
        <p className="mt-0.5 text-[13.5px] text-v2-navy/80">
          {inProgress
            ? `${draft.stepsDone} of ${draft.stepsTotal} done · ${minutesLeftLabel(secondsLeft(draft.step, settings.stepSeconds))}`
            : `Drop in a resume, confirm a few cards, done. About ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`}
        </p>
        {status.card.resurfaced && (
          <p className="mt-1 text-[13px] text-v2-navy/80">Your profile is {status.completeness.score}% — forms will ask for the rest.</p>
        )}
        {inProgress && (
          <Meter value={draft.stepsDone} max={draft.stepsTotal} label="Setup progress" valueText={`${draft.stepsDone} of ${draft.stepsTotal} steps done`} neutral className="mt-2.5 max-w-xs" />
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
            { label: "Remind me in a few days", onSelect: () => act("SNOOZE") },
            { label: "Don't show this again", onSelect: () => act("DISMISS") },
          ]}
        />
      </Tooltip>
    </section>
  );
}
