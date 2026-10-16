/**
 * The subscriber's side of a plan retirement (K10.10; docs/subscriptions/11-plan-retirement.md sections 4.2, 6, 7 and 12): wire types of
 * `GET /api/billing/retirement/me` and `POST /api/billing/retirement/me/choice`, plus the copy register of section 4.2 as pure functions.
 * Every amount is an integer of minor units from the API and is formatted, never computed; every date is the subscriber's own `effectiveAt`.
 * The tone is warm and specific, no urgency theatre, nothing pre-selected, and the date is in every message.
 */
import { intervalSuffix, money, shortDate } from "./copy";
import type { Interval } from "./types";

export type DefaultOutcome = "FREE" | "MIGRATE_AT_RENEWAL" | "CANCEL";
export type DecisionStatus = "PENDING" | "SWITCH_SCHEDULED" | "SWITCHED_NOW" | "STAY_ON_FREE" | "CANCELLED";
export type RetirementChoice = "SWITCH_AT_RENEWAL" | "SWITCH_NOW" | "STAY_ON_FREE";

export type RetirementUse = {
  featureKey: string;
  name: string;
  /** "27 of 40", "12 resumes (3 free slots)": what the subscriber has used, as the API words it. */
  detail?: string | null;
  /** True when the suggested plan includes it. */
  covered: boolean;
};

export type RetirementSuggestion = {
  successorPlanKey: string;
  successorName: string;
  interval: Interval;
  currency: string;
  currentMinor: number;
  proposedMinor: number;
  /** proposed minus current for one period, from the API; positive means dearer. */
  deltaMinor: number;
  covers: string[];
  gaps: string[];
  monthlyEquivalentMinor?: number | null;
  annualAlternative?: { proposedMinor: number; savingsMinor: number } | null;
  /** The RETIREMENT_SWITCH quote that takes effect at the effective date. */
  atRenewalQuoteId: number;
  /** Only when the price is higher: the quote that takes effect now, prorated, with what is charged today. */
  nowQuoteId?: number | null;
  nowTodayMinor?: number | null;
};

export type RetirementOther = { planKey: string; name: string; priceMinor: number; interval: Interval; currency: string };

export type RetirementFallback = {
  locked: { featureKey: string; name: string }[];
  /** Resumes beyond Free's cap that become read-only. */
  readOnlyResumes?: number | null;
};

export type RetirementDecision = { status: DecisionStatus; planName?: string | null; decidedAt?: string | null };

export type RetirementNotice = {
  retirementId: number;
  planKey: string;
  planName: string;
  planVersion?: number | null;
  /** This subscriber's own date. */
  effectiveAt: string;
  lastDay?: boolean;
  defaultOutcome: DefaultOutcome;
  interval: Interval;
  currency: string;
  uses: RetirementUse[];
  suggestion: RetirementSuggestion | null;
  others: RetirementOther[];
  fallback: RetirementFallback;
  decision: RetirementDecision;
  cancelPending?: boolean;
};

export type LockedService = { featureKey: string; name: string; lockedSince: string; lockedFromPlan?: string | null };

export type RetirementMe = { retirement: RetirementNotice | null; locks?: LockedService[] };

/** The slice of `GET /api/billing/me` the banner reads (no extra request on a normal page). */
export type RetirementSummary = { planName: string; effectiveAt: string; decided: boolean; lastDay?: boolean };
export type LockSummary = { since: string; services: number };

// ---- copy register (11 section 4.2) ---------------------------------------------------------------------------------------

export const COPY = {
  banner: (planName: string, effectiveAt: string) => `${planName} is changing on ${shortDate(effectiveAt)}`,
  bannerCta: "See your options",
  title: (planName: string, effectiveAt: string) => `${planName} is changing on ${shortDate(effectiveAt)}`,
  intro: (effectiveAt: string) => `You keep everything you paid for until ${shortDate(effectiveAt)}. Here is what you use and what we suggest.`,
  lastDay: "Tomorrow your plan changes. Today is the last day to switch with no gap.",
  cancel: (planName: string, effectiveAt: string) => `Prefer to stop? Cancel any time. You keep ${planName} until ${shortDate(effectiveAt)}, and nothing more is charged. No refunds for partial periods.`,
  lockBanner: (since: string) => `Some services are read-only since ${shortDate(since)}. Your data is safe.`,
  lockBannerCta: "Pick a plan to unlock",
  lockCard: (serviceName: string) => `${serviceName} is locked. Everything you made is here to read and download. Upgrade to use it again.`,
  lockCardCta: "Locked — Pick a plan",
} as const;

/** `retire.suggest` plus the diff line: "Based on what you use, Pro v3 is the closest match: same price, everything you use is included." */
export function suggestLine(s: RetirementSuggestion): string {
  return `Based on what you use, ${s.successorName} is the closest match: ${diffLine(s)}.`;
}

export function diffLine(s: Pick<RetirementSuggestion, "deltaMinor" | "currency" | "interval" | "gaps">): string {
  const per = intervalSuffix(s.interval).replace("/", "");
  const cover = s.gaps.length === 0 ? "everything you use is included" : `${s.gaps.join(", ")} ${s.gaps.length === 1 ? "isn't" : "aren't"} included`;
  if (s.deltaMinor === 0) return `same price, ${cover}`;
  if (s.deltaMinor < 0) return `${money(-s.deltaMinor, s.currency)} less per ${per}, ${cover}`;
  return `${money(s.deltaMinor, s.currency)} more per ${per} — we will never move you to a higher price without your say-so`;
}

export function isDearer(s: RetirementSuggestion): boolean {
  return s.deltaMinor > 0;
}

/** `retire.default.free` / `retire.default.migrate` / cancel: what happens when the subscriber does nothing. */
export function defaultLine(n: RetirementNotice): string {
  const date = shortDate(n.effectiveAt);
  if (n.defaultOutcome === "MIGRATE_AT_RENEWAL" && n.suggestion) {
    const s = n.suggestion;
    return `If you do nothing, on ${date} we'll move you to ${s.successorName} at ${money(s.proposedMinor, s.currency)}${intervalSuffix(s.interval)} (not more than you pay today). Change your mind any time before then.`;
  }
  if (n.defaultOutcome === "CANCEL") {
    return `If you do nothing, your plan ends on ${date} and nothing more is charged. Everything you made stays in read-only mode. Pick a plan any time to unlock it instantly.`;
  }
  return `If you do nothing, on ${date} your account moves to Free. Everything you made stays — resumes, board, answers, history — in read-only mode for the services Free doesn't include. Pick a plan any time to unlock them instantly.`;
}

/** The plain sentence of a decision already made, with the date and how to change it. */
export function decisionLine(n: RetirementNotice): string | null {
  const d = n.decision;
  const date = shortDate(n.effectiveAt);
  const name = d.planName ?? n.suggestion?.successorName ?? "your new plan";
  switch (d.status) {
    case "SWITCH_SCHEDULED":
      return `You chose ${name}. It starts on ${date}. You can change this any time before then.`;
    case "SWITCHED_NOW":
      return `You switched to ${name}. Nothing else changes on ${date}.`;
    case "STAY_ON_FREE":
      return `You chose to move to Free on ${date}. You can change this any time before then.`;
    case "CANCELLED":
      return `Your plan is set to cancel. You keep ${n.planName} until ${date}.`;
    default:
      return null;
  }
}

export function choiceProblemCopy(code: string | undefined): string {
  switch (code) {
    case "QUOTE_STALE":
      return "Prices changed since you opened this page. Reload to see the new numbers.";
    case "QUOTE_EXPIRED":
      return "That price expired. Reload to get a fresh one.";
    case "RETIREMENT_NOT_FOUND":
    case "NOT_FOUND":
      return "This change is no longer open.";
    case "DEMO_READ_ONLY":
      return "This is a demo account, so nothing is saved.";
    default:
      return "Something went wrong. Please try again.";
  }
}
