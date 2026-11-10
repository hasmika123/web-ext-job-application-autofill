/**
 * The dashboard's "Finish your profile" card, the parts that are not React (Onboarding v2, R1.7 / R1.9,
 * DESIGN 6). Since R1.9 the card reads the server: `GET /api/profile/onboarding` evaluates `card.show` /
 * `card.state` and the draft's "n of total done" (the dashboard page passes it in), and snooze / dismiss go through
 * `PATCH`. What is left here is the card's tunables from the builder config, the time estimate, and the one-shot
 * migration of the R1.7 `localStorage` snooze / dismiss memory (DECISIONS #33e).
 */
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";

/**
 * The card's three tunables (DESIGN 11): `onboarding.estimateMinutes`, `onboarding.card.snoozeDays`,
 * `onboarding.stepSeconds`. They are admin settings and arrive on the builder config (R1.8 API,
 * `config.onboarding`); {@link onboardingSettings} picks them out. The card itself holds no tunable.
 */
export interface OnboardingSettings {
  estimateMinutes: number;
  snoozeDays: number;
  /** Seconds a person is expected to spend per step, keyed by the v2 step names. */
  stepSeconds: Record<string, number>;
}

/** The card's settings from the builder config (an older API without `onboarding` falls back to the declared defaults). */
export function onboardingSettings(config: { onboarding?: ResumeBuilderConfig["onboarding"] }): OnboardingSettings {
  const o = config.onboarding ?? DEFAULT_BUILDER_CONFIG.onboarding;
  return { estimateMinutes: o.estimateMinutes, snoozeDays: o.card.snoozeDays, stepSeconds: o.stepSeconds };
}

/** The API's declared defaults, for tests and for when the API is unreachable. */
export const ONBOARDING_DEFAULTS: OnboardingSettings = onboardingSettings(DEFAULT_BUILDER_CONFIG);

/** localStorage key of the R1.7 snooze / dismiss memory (read once and removed: the server owns it now). */
export const CARD_KEY = "kiwiply.onboarding.card.v1";
/** sessionStorage flag so `onboarding_card_shown` fires once per session. */
export const CARD_SHOWN_KEY = "kiwiply.onboarding.card.shown.v1";

const MINUTE = 60; // config-literal-ok: unit conversion

export type CardMemory = { snoozedUntil?: string; dismissedAt?: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * R1.7 kept the card's snooze / dismiss in `localStorage`, per login. R1.9 moves it to the server: this reads this
 * login's remembered value (null when there is none). The caller sends it to the server only when the server has none of
 * its own, then calls {@link dropLegacyCardMemory}, so it is migrated at most once and never lost on a failed send.
 */
export function readLegacyCardMemory(storage: StorageLike | undefined, login: string): CardMemory | null {
  try {
    const raw = storage?.getItem(CARD_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, CardMemory> | null;
    if (!all || typeof all !== "object" || Array.isArray(all)) {
      storage?.removeItem(CARD_KEY);
      return null;
    }
    const mine = all[login];
    return mine && typeof mine === "object" ? mine : null;
  } catch {
    return null;
  }
}

/** Remove this login's remembered value (the whole key once nobody's is left). */
export function dropLegacyCardMemory(storage: StorageLike | undefined, login: string): void {
  try {
    const raw = storage?.getItem(CARD_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, CardMemory> | null;
    if (!all || typeof all !== "object" || Array.isArray(all)) {
      storage?.removeItem(CARD_KEY);
      return;
    }
    delete all[login];
    if (Object.keys(all).length === 0) storage?.removeItem(CARD_KEY);
    else storage?.setItem(CARD_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** True while the remembered snooze has not run out, or the card was dismissed. */
export function isLegacyMemoryActive(memory: CardMemory, now: number): boolean {
  if (memory.dismissedAt) return true;
  const until = memory.snoozedUntil ? Date.parse(memory.snoozedUntil) : NaN;
  return Number.isFinite(until) && until > now;
}

// The v2 step names in flow order (DESIGN 3.1); the time estimates are keyed by them.
const FLOW: string[] = ["hello", "source", "review", "skills", "you", "prefs"];

/** Seconds still to go from the draft's current step on (the steps behind it are done, so it only ever goes down). */
export function secondsLeft(step: string, stepSeconds: Record<string, number>): number {
  const at = Math.max(0, FLOW.indexOf(step));
  return FLOW.slice(at).reduce((sum, k) => sum + (stepSeconds[k] ?? 0), 0);
}

/** "about 2 min left" / "< 1 min left" (DESIGN 5.0: computed from the remaining steps, so it only goes down). */
export function minutesLeftLabel(secondsLeftValue: number): string {
  return secondsLeftValue < MINUTE ? "< 1 min left" : `about ${Math.ceil(secondsLeftValue / MINUTE)} min left`;
}
