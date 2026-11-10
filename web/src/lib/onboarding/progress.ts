/**
 * What the setup shell's progress bar says (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.0). The estimate is computed
 * from the steps still to do (`onboarding.stepSeconds`), so it only ever goes down; the start label is the admin's
 * `onboarding.estimateMinutes`. Pure.
 */
import type { StepKey } from "@/lib/profile-setup/state";

const MINUTE = 60; // config-literal-ok: unit conversion

/** Seconds still to go: the steps from the current one on (never `done`), less the part of the current one already done. */
export function secondsRemaining(steps: StepKey[], step: StepKey, subProgress: number, stepSeconds: Record<string, number>): number {
  const at = steps.indexOf(step);
  if (at < 0 || step === "done") return 0;
  const left = steps.slice(at).reduce((sum, k) => sum + (k === "done" ? 0 : (stepSeconds[k] ?? 0)), 0);
  const into = (stepSeconds[step] ?? 0) * Math.min(1, Math.max(0, subProgress));
  return Math.max(0, Math.round(left - into));
}

/** "about 2 min left" / "< 1 min left" (DESIGN 5.14 `bar.estimate.left`). */
export function minutesLeftLabel(seconds: number): string {
  return seconds < MINUTE ? "< 1 min left" : `about ${Math.ceil(seconds / MINUTE)} min left`;
}

/**
 * The label at the right of the bar: "~2 min" on the first two screens (the admin's estimate), then the computed
 * "about N min left"; none on the payoff.
 */
export function barLabel(step: StepKey, seconds: number, estimateMinutes: number): string | null {
  if (step === "done") return null;
  if (step === "hello" || step === "source") return `~${estimateMinutes} min`;
  return minutesLeftLabel(seconds);
}

/** "Step 3 of 7, about 1 minute left" (DESIGN 5.14 `bar.aria`); "less than a minute left" under 60 s. */
export function barValueText(index: number, total: number, seconds: number): string {
  const n = Math.min(Math.max(index, 1), Math.max(total, 1));
  const m = Math.ceil(seconds / MINUTE);
  const left = seconds < MINUTE ? "less than a minute left" : `about ${m} ${m === 1 ? "minute" : "minutes"} left`;
  return `Step ${n} of ${total}, ${left}`;
}
