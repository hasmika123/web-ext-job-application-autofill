/**
 * The onboarding funnel's analytics events (Onboarding v2 R1.12, ONBOARDING-V2-DESIGN 12). This file is the ONLY place the
 * event names are spelled: every call site goes through {@link trackOnboarding}, whose property types are the table in the
 * design. Properties are counts, switches and fixed words, never content and never a name: no resume text, no entry titles,
 * no answers (a question is identified by its key, never by what was picked), no first name. A new property that is free
 * text will not type-check here, which is the point.
 *
 * Funnel for the admin tile: shown -> started -> persona_set -> path_chosen -> step_completed(you) -> finished; drop-off per
 * step from `step_completed.index`. The retired `profile_setup_step` / `profile_setup_started` / `profile_setup_completed`
 * events are gone (superseded); `profile_setup_parsed` is kept.
 */
import { track } from "@/lib/analytics";
import type { PayoffAction } from "@/components/app-v3/profiles/setup/PayoffStep";

export const ONBOARDING_EVENTS = {
  cardShown: "onboarding_card_shown",
  started: "onboarding_started",
  personaSet: "onboarding_persona_set",
  pathChosen: "onboarding_path_chosen",
  parsed: "profile_setup_parsed",
  stepCompleted: "onboarding_step_completed",
  coreConfirmed: "onboarding_core_confirmed",
  prefAnswered: "onboarding_pref_answered",
  finished: "onboarding_finished",
  dismissed: "onboarding_dismissed",
  resumed: "onboarding_resumed",
  draftConflict: "onboarding_draft_conflict",
  draftOffline: "onboarding_draft_offline",
  payoffAction: "onboarding_payoff_action",
  // The delight layer (DELIGHT 11): rule ids, percentages, counts and methods only, never text.
  delightHighlight: "onboarding_delight_highlight",
} as const;

export type OnboardingEventName = (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

/** Where a run came from (`onboarding_started.entry`). */
export type SetupEntry = "card" | "chooser" | "profiles" | "welcome" | "ext" | "direct";

type PersonaProp = "student" | "first_job" | "switching" | "experienced";

/** The property shape of every event: the design's table, as types. */
export interface OnboardingEventProps {
  [ONBOARDING_EVENTS.cardShown]: { state: "not_started" | "in_progress"; stepsDone: number; stepsTotal: number; resurfaced: boolean };
  [ONBOARDING_EVENTS.started]: { entry: SetupEntry; persona?: PersonaProp };
  [ONBOARDING_EVENTS.personaSet]: { persona: PersonaProp | "skipped"; changed: boolean };
  [ONBOARDING_EVENTS.pathChosen]: { path: "upload" | "paste" | "fresh" | "skip"; persona: PersonaProp | "none" };
  [ONBOARDING_EVENTS.parsed]: { source: string; cards: number; skills: number; removed: number };
  [ONBOARDING_EVENTS.stepCompleted]: { step: string; index: number; total: number; skipped: boolean; seconds: number; kept?: number; skippedCards?: number };
  [ONBOARDING_EVENTS.coreConfirmed]: { items: number; merged: number };
  [ONBOARDING_EVENTS.prefAnswered]: { key: string; skipped: boolean };
  [ONBOARDING_EVENTS.finished]: { fields: number; score: number | null; seconds: number; persona: PersonaProp | "none"; path: "upload" | "paste" | "fresh" | "skip"; prefsAnswered: number };
  [ONBOARDING_EVENTS.dismissed]: { action: "snooze" | "dismiss" | "exit" };
  [ONBOARDING_EVENTS.resumed]: { stepsDone: number; stepsTotal: number; device: "same" | "other"; ageHours: number };
  [ONBOARDING_EVENTS.draftConflict]: { choice: "theirs" | "mine" };
  [ONBOARDING_EVENTS.draftOffline]: { retries: number };
  [ONBOARDING_EVENTS.payoffAction]: { action: PayoffAction | "dashboard" };
  [ONBOARDING_EVENTS.delightHighlight]: { rule: "number" | "outcome" | "lead" | "built" };
}

/** Fire one funnel event. The properties are checked against the design's table at compile time. */
export function trackOnboarding<E extends OnboardingEventName>(name: E, props: OnboardingEventProps[E]): void {
  track(name, props as Record<string, unknown>);
}

/**
 * Where `/profiles/setup` was opened from. An explicit `?entry=` marker wins (the dashboard card sends `card`, the My Profiles
 * empty states send `profiles`, the extension link sends `ext`), then the signals the other entries already carry: the retired
 * `/welcome` (`from=welcome`), the new-resume chooser (`return=`), a `?path=` deep link, and the extension's `utm_source=ext`.
 */
export function entryFrom(q: { entry?: string | null; from?: string | null; returnTo?: string | null; path?: string | null; utm?: string | null }): SetupEntry {
  if (q.entry === "card" || q.entry === "profiles" || q.entry === "chooser" || q.entry === "ext") return q.entry;
  if (q.from === "welcome") return "welcome";
  if (q.returnTo) return "chooser";
  if (q.utm === "ext") return "ext";
  if (q.path) return "profiles";
  return "direct";
}
