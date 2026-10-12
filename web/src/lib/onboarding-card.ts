/**
 * The dashboard's "Finish your profile" card, the parts that are not React (Onboarding v2, R1.7,
 * DESIGN 6): the show rule, "n of total done" from the local v1 draft, and the snooze / dismiss memory.
 *
 * Interim by design: the card's memory lives in `localStorage` and "in progress" is read from the
 * `sessionStorage` setup draft. R1.8 adds the server status (`GET /api/profile/onboarding`) and R1.9
 * switches the card to it and migrates the local value once; until then this file is the only owner.
 */
import { stepsFor, type SetupState, type StepKey } from "@/lib/profile-setup/state";

/**
 * Declared defaults of the `onboarding.*` settings (DESIGN 11): `onboarding.estimateMinutes`,
 * `onboarding.card.snoozeDays`, `onboarding.stepSeconds`. They are admin settings; until the builder
 * config carries them (R1.8 API, R1.9 web) the dashboard passes these as props, so the card itself
 * holds no tunable.
 */
export const ONBOARDING_DEFAULTS = {
  estimateMinutes: 2,
  snoozeDays: 3,
  /** Seconds a person is expected to spend per step, keyed by the v2 step names. */
  stepSeconds: { hello: 10, source: 40, review: 45, skills: 20, you: 15, prefs: 30 } as Record<string, number>,
};

export type OnboardingSettings = typeof ONBOARDING_DEFAULTS;

/** localStorage key of the snooze / dismiss memory (temporary: R1.9 moves it to the server). */
export const CARD_KEY = "kiwiply.onboarding.card.v1";
/** sessionStorage flag so `onboarding_card_shown` fires once per session. */
export const CARD_SHOWN_KEY = "kiwiply.onboarding.card.shown.v1";

const DAY_MS = 24 * 60 * 60 * 1000; // config-literal-ok: unit conversion
const MINUTE = 60; // config-literal-ok: unit conversion

export type CardMemory = { snoozedUntil?: string; dismissedAt?: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * DESIGN 6 with what exists today: hidden once the person has finished onboarding AND the profile is at or
 * above `promptBelow` (`profile.setup.promptBelowPercent`). An unknown score (the API hiccuped) hides the
 * card; it never nags on a failure.
 */
export function shouldShowCard(input: { onboarded: boolean; score: number | null; promptBelow: number }): boolean {
  if (input.score === null) return false;
  return !(input.onboarded && input.score >= input.promptBelow);
}

/** The remembered snooze / dismiss for this login (keyed so two accounts on one browser do not share it). */
export function readCardMemory(storage: StorageLike | undefined, login: string): CardMemory {
  try {
    const raw = storage?.getItem(CARD_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, CardMemory> | null;
    const mine = all && typeof all === "object" ? all[login] : null;
    return mine && typeof mine === "object" ? mine : {};
  } catch {
    return {};
  }
}

export function writeCardMemory(storage: StorageLike | undefined, login: string, memory: CardMemory): void {
  try {
    if (!storage) return;
    let all: Record<string, CardMemory> = {};
    try {
      const parsed = JSON.parse(storage.getItem(CARD_KEY) ?? "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed as Record<string, CardMemory>;
    } catch {
      // unreadable value: start again
    }
    all[login] = memory;
    storage.setItem(CARD_KEY, JSON.stringify(all));
  } catch {
    // private mode / quota: the card just comes back next visit
  }
}

export function snoozeUntil(now: number, days: number): string {
  return new Date(now + days * DAY_MS).toISOString();
}

/** True while the card should stay hidden: dismissed, or snoozed and the snooze has not run out. */
export function isCardHidden(memory: CardMemory, now: number): boolean {
  if (memory.dismissedAt) return true;
  if (memory.snoozedUntil) {
    const until = Date.parse(memory.snoozedUntil);
    return Number.isFinite(until) && until > now;
  }
  return false;
}

// v1 draft steps -> the v2 step names the time estimates are keyed by (DESIGN 3.1).
const V2_STEP: Partial<Record<StepKey, string>> = { path: "hello", input: "source", cards: "review", skills: "skills", identity: "you", prefs: "prefs" };

export type CardProgress = { stepsDone: number; stepsTotal: number; secondsLeft: number };

/** "3 of 6 done" and the time still to go, from the local v1 draft the way DESIGN 6 words it. */
export function draftProgress(
  draft: Pick<SetupState, "step" | "parsed">,
  hasPrefQuestions: boolean,
  stepSeconds: Record<string, number>,
): CardProgress {
  const steps = stepsFor(draft, hasPrefQuestions);
  const at = Math.max(0, steps.indexOf(draft.step));
  const secondsLeft = steps.slice(at).reduce((sum, k) => sum + (stepSeconds[V2_STEP[k] ?? ""] ?? 0), 0);
  return { stepsDone: at, stepsTotal: steps.length, secondsLeft };
}

/** "about 2 min left" / "< 1 min left" (DESIGN 5.0: computed from the remaining steps, so it only goes down). */
export function minutesLeftLabel(secondsLeft: number): string {
  return secondsLeft < MINUTE ? "< 1 min left" : `about ${Math.ceil(secondsLeft / MINUTE)} min left`;
}
