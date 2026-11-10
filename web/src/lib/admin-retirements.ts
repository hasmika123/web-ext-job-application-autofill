/**
 * Wire types and small helpers of the platform-admin retirement wizard and progress page (subscription module K10.9;
 * docs/subscriptions/11-plan-retirement.md sections 2 to 11). The shapes are the web's reading of the API contract; until the
 * K10 routes are published they are served by `scripts/mock-retirements.mjs` with the same shapes. Nothing here prices anything:
 * money arrives as `*Minor` longs and is formatted with `formatMinor` / `MoneyText`; every count, total and "would pay more" is a
 * field the server computed. The only logic is shape checks (is a date inside the minimum notice, is the typed key the plan key).
 */

export type RetireMode = "RETIRE_AT_RENEWAL" | "KEEP_INDEFINITELY";
export type RetireOutcome = "FREE" | "MIGRATE_AT_RENEWAL" | "CANCEL";
export type NoticeChannel = "EMAIL" | "IN_APP" | "PUSH";
export type RetirementStatus = "DRAFT" | "NOTICING" | "COMPLETING" | "COMPLETED" | "CANCELLED" | string;
export type ItemStatus = "PENDING" | "SWITCHED_NOW" | "SWITCH_SCHEDULED" | "CANCELLED" | "FELL_BACK" | "MIGRATED" | "EXCLUDED" | string;

export const MODE_LABEL: Record<RetireMode, string> = {
  RETIRE_AT_RENEWAL: "Retire at each subscriber's next renewal",
  KEEP_INDEFINITELY: "Keep indefinitely",
};
export const MODE_HINT: Record<RetireMode, string> = {
  RETIRE_AT_RENEWAL: "Notices go out, and anyone who has not chosen moves at their own renewal date. This is the default.",
  KEEP_INDEFINITELY: "Only hides the plan from new buyers. Nobody is moved and nobody is told to choose.",
};
export const OUTCOME_LABEL: Record<RetireOutcome, string> = {
  FREE: "Free, with a read-only lock",
  MIGRATE_AT_RENEWAL: "Move to the first successor at renewal",
  CANCEL: "Cancel at the end of the paid period",
};
export const OUTCOME_HINT: Record<RetireOutcome, string> = {
  FREE: "If someone does nothing, their account moves to Free on their date. Everything they made stays, read-only where Free does not include the service. This is the default.",
  MIGRATE_AT_RENEWAL: "Only allowed when nobody would pay more. A higher price always needs the subscriber's own confirmation.",
  CANCEL: "The subscription ends at the end of the paid period; data stays, read-only, exactly as with Free.",
};
export const CHANNEL_LABEL: Record<NoticeChannel, string> = { EMAIL: "Email", IN_APP: "In app", PUSH: "Push" };

export const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  SWITCHED_NOW: "Switched",
  SWITCH_SCHEDULED: "Switch scheduled",
  CANCELLED: "Cancelled",
  FELL_BACK: "Fell back to Free",
  MIGRATED: "Moved to successor",
  EXCLUDED: "Excluded",
};

/** What the server allows and suggests for a new retirement (settings, never constants in the web). */
export interface RetirementDefaults {
  /** The hard floor (billing.retirement.min_notice_days); the effective date cannot be sooner than today plus this. */
  minNoticeDays: number;
  noticeScheduleDays: number[];
  channels: NoticeChannel[];
  availableChannels: NoticeChannel[];
  /** Outcomes the admin may pick for this retirement; FREE is always present. Anything else is only offered when listed here. */
  allowedOutcomes: RetireOutcome[];
  /** Bounds of one notice day (inclusive). */
  noticeDayMin: number;
  noticeDayMax: number;
  messageMax: number;
  reasonMin: number;
}

export interface RetirementImpact {
  subscribers: number;
  mrrMinor: number;
  currency: string;
  byInterval: Record<string, number>;
  /** Subscribers with at least one add-on on the retiring plan. */
  withAddons: number;
  earliestEffectiveAt: string | null;
  latestEffectiveAt: string | null;
}

export interface GapFeature {
  featureKey: string;
  name: string;
  subscribers: number;
}

export interface SuccessorCoverage {
  planKey: string;
  name: string;
  /** Subscribers whose used features are all covered by this successor. */
  fullyCovered: number;
  withGaps: number;
  gapFeatures: GapFeature[];
  /** Subscribers who would pay more under this successor (a count; the price check of section 11). */
  wouldPayMore: number;
  /** Server computed: is the successor sellable (published, public) right now. */
  sellable: boolean;
}

export interface CoverageResult {
  planKey: string;
  planName: string;
  planVersion: number | null;
  impact: RetirementImpact;
  /** One row per successor asked for in the request, in the same order. */
  successors: SuccessorCoverage[];
  defaults: RetirementDefaults;
}

export interface NoticePreview {
  subject: string;
  /** Plain text of the first notice for a sample subscriber (the server renders the copy register of section 4.2). */
  body: string;
  sampleEffectiveAt: string | null;
}

export interface StartRetirementBody {
  planKey: string;
  planVersion?: number | null;
  mode: RetireMode;
  defaultOutcome: RetireOutcome;
  /** Optional earliest effective date (YYYY-MM-DD), never sooner than today plus the minimum notice. */
  effectiveNotBefore?: string | null;
  successors: { planKey: string; rank: number; note?: string | null }[];
  noticeScheduleDays: number[];
  channels: NoticeChannel[];
  messageMd?: string | null;
  reason: string;
  confirmPlanKey: string;
}

export interface RetirementCounts {
  pending: number;
  switchedNow: number;
  switchScheduled: number;
  cancelled: number;
  fellBack: number;
  migrated: number;
  excluded: number;
}

export interface DecisionPoint {
  /** YYYY-MM-DD */
  date: string;
  switched: number;
  cancelled: number;
  /** Everyone who had decided by the end of this day (server computed). */
  cumulative: number;
}

export interface RetirementDetail {
  id: number;
  planKey: string;
  planName: string;
  planVersion: number | null;
  status: RetirementStatus;
  mode: RetireMode;
  defaultOutcome: RetireOutcome;
  reason: string;
  startedAt: string | null;
  startedBy: string | null;
  earliestEffectiveAt: string | null;
  latestEffectiveAt: string | null;
  successors: { planKey: string; name: string; rank: number }[];
  noticeScheduleDays: number[];
  channels: NoticeChannel[];
  messageMd: string | null;
  counts: RetirementCounts;
  currency: string;
  mrrRetainedMinor: number;
  mrrAtRiskMinor: number;
  decisionsOverTime: DecisionPoint[];
  /** The retirement can be cancelled only while no subscriber has acted. */
  canCancel: boolean;
  canClose: boolean;
  driftCount: number;
  hasOrgItems: boolean;
}

export interface RetirementItem {
  id: number;
  login: string;
  scope: "PERSONAL" | "ORG";
  orgName: string | null;
  interval: string;
  periodEnd: string | null;
  effectiveAt: string | null;
  status: ItemStatus;
  successorName: string | null;
  lastNoticeDays: number | null;
  deltaMinor: number | null;
  currency: string;
  uses: string[];
}

/** The shared list contract (`useListQuery`): `{ items, total, page, size }`. */
export interface RetirementItemsResult {
  total: number;
  page: number;
  size: number;
  items: RetirementItem[];
}

export interface RetirementListRow {
  id: number;
  planKey: string;
  status: RetirementStatus;
  startedAt: string | null;
  pending: number;
  total: number;
}

// ---- helpers ----------------------------------------------------------------------------------------------------------

/** Plans in these states can be retired; a plan already retiring or retired goes to its progress page instead. */
export function canStartRetirement(status: string): boolean {
  return status === "PUBLISHED";
}

export function isRetiring(status: string): boolean {
  return status === "RETIRING" || status === "SUNSET";
}

/** The ISO date (YYYY-MM-DD) that is `days` after `from`, in UTC. Used only for the minimum of the date input. */
export function addDaysIso(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** Why `date` (YYYY-MM-DD) is not allowed, or null when it is (empty is allowed: the server computes each subscriber's own date). */
export function effectiveDateProblem(date: string, minNoticeDays: number, now: Date = new Date()): string | null {
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Pick a valid date.";
  const min = addDaysIso(now, minNoticeDays);
  return date < min ? `Subscribers must get at least ${minNoticeDays} days of notice. The earliest date is ${min}.` : null;
}

/** Notice days typed as "60, 30, 7, 1" -> [60, 30, 7, 1] (descending, unique); null when something is not a whole number in bounds. */
export function parseNoticeDays(text: string, min: number, max: number): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,4}$/.test(p)) return null;
    const n = Number(p);
    if (n < min || n > max) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => b - a);
}

/** The "would pay more" sentence of the successors step (section 11 price check). Counts only. */
export function priceCheckText(outcome: RetireOutcome, first: SuccessorCoverage | undefined): { ok: boolean; text: string } {
  if (outcome === "FREE") {
    return { ok: true, text: "Free needs no price check: nobody is charged anything when they fall back." };
  }
  if (!first) return { ok: false, text: "Add a successor first." };
  if (first.wouldPayMore > 0) {
    return {
      ok: false,
      text: `${first.wouldPayMore.toLocaleString("en-US")} subscriber${first.wouldPayMore === 1 ? "" : "s"} would pay more under ${first.name}. Moving anyone to a higher price needs their own say-so, so this outcome is refused. Choose Free, or pick a successor that costs no more.`,
    };
  }
  return { ok: true, text: `Nobody would pay more under ${first.name}.` };
}

/** Whether the review step can start the retirement. Mirrors the server's checks so the button is not lit for an obvious refusal. */
export function startProblem(args: {
  outcome: RetireOutcome;
  firstSuccessor: SuccessorCoverage | undefined;
  successorCount: number;
  noticeDays: number[] | null;
  channels: NoticeChannel[];
  dateProblem: string | null;
  reason: string;
  reasonMin: number;
  typed: string;
  planKey: string;
}): string | null {
  if (args.outcome !== "FREE" && args.successorCount === 0) return "Add at least one successor.";
  if (args.outcome === "MIGRATE_AT_RENEWAL" && (args.firstSuccessor?.wouldPayMore ?? 0) > 0) return "Some subscribers would pay more under the first successor.";
  if (!args.noticeDays) return "Fix the notice days.";
  if (args.channels.length === 0) return "Pick at least one channel.";
  if (args.dateProblem) return args.dateProblem;
  if (args.reason.trim().length < args.reasonMin) return `Add a reason of at least ${args.reasonMin} characters.`;
  if (args.typed.trim() !== args.planKey) return `Type ${args.planKey} to confirm.`;
  return null;
}
