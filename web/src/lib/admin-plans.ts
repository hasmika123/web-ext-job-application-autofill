/**
 * Wire types and small helpers of the platform-admin plan builder (subscription module K4; docs/subscriptions/04 and 09).
 * The shapes mirror `PlanDTOs`, `PlanPreviewDTO` and the catalog DTOs in the API. Nothing here is sample data, and nothing
 * here adds two prices: money arrives as `*Minor` longs and is formatted with `formatMinor`; every total, margin and lever is
 * a field the server computed. The only arithmetic is parsing what an admin types into a minor-unit integer.
 */

export type Audience = "INDIVIDUAL" | "ORG";
export type Interval = "MONTH" | "QUARTER" | "YEAR";
export type PlanStatus = "DRAFT" | "PUBLISHED" | "SUNSET" | "RETIRING" | "RETIRED" | "SUPERSEDED" | string;

export const INTERVALS: Interval[] = ["MONTH", "QUARTER", "YEAR"];
export const INTERVAL_LABEL: Record<string, string> = { MONTH: "Monthly", QUARTER: "Quarterly", YEAR: "Annual", ONE_TIME: "One time" };
export const INTERVAL_SUFFIX: Record<string, string> = { MONTH: "mo", QUARTER: "3 mo", YEAR: "yr" };
export const AUDIENCE_LABEL: Record<string, string> = { INDIVIDUAL: "Individual", ORG: "Organization" };
export const PLAN_STATUSES = ["DRAFT", "PUBLISHED", "SUNSET", "RETIRING", "RETIRED"] as const;

export const ROLE_LABEL: Record<string, string> = {
  INCLUDED: "Included",
  OPTIONAL: "Optional add-on",
  SEAT_BASE: "Seat base",
  SEAT_INCLUDED: "Seat included",
  SEAT_OPTIONAL: "Seat optional",
  FEE: "Fee",
};
export const ROLES_BY_AUDIENCE: Record<string, string[]> = {
  INDIVIDUAL: ["INCLUDED", "OPTIONAL"],
  ORG: ["SEAT_BASE", "SEAT_INCLUDED", "SEAT_OPTIONAL", "FEE"],
};

export interface LiveVersion {
  version: number;
  effectiveFrom: string | null;
}

export interface PlanSummary {
  planKey: string;
  name: string;
  audience: Audience;
  status: PlanStatus;
  publicPlan: boolean;
  liveVersion: LiveVersion | null;
  draftVersion: number | null;
  subscribersByVersion: Record<string, number>;
  pricesByInterval: Record<string, number>;
  marginWorstBp: number | null;
  successorPlanKey: string | null;
}

export interface PriceView {
  priceId: number | null;
  interval: Interval | string;
  currency: string;
  amountMinor: number;
  source: "ACTIVE" | "DRAFT" | "DERIVED" | string;
  derived: boolean;
  stripePriceId: string | null;
  marginBp: number | null;
  ok: boolean | null;
}

export interface ProductView {
  id: number | null;
  code: string;
  prices: PriceView[];
}

export interface PlanComponent {
  featureKey: string;
  role: string;
  name: string;
  category: string | null;
  unit: string | null;
  productId: number | null;
  productCode: string | null;
  allowance: number | null;
  allowanceOverride: number | null;
  limitKey: string | null;
  limitOverrides: unknown;
  defaultQuantity: number;
  maxQuantity: number | null;
  componentDiscountBp: number | null;
  sortOrder: number;
  marketingLabel: string | null;
  aiBudgetCents: number;
  prices: PriceView[];
}

export interface PlanPreset {
  key: string;
  name: string;
  addons: { featureKey: string; quantity: number }[];
}

export interface SeatRules {
  seatBaseProductId?: number | null;
  minSeats?: number | null;
  maxSeatsSetting?: string | null;
  setupFeeProductId?: number | null;
  platformFeeProductId?: number | null;
}

export interface PlanVersion {
  planKey: string;
  version: number;
  status: PlanStatus;
  audience: Audience;
  intervals: Interval[];
  annualDiscountBp: number | null;
  aiBudgetCapCents: number;
  aiWindows: Record<string, number> | null;
  baseProduct: ProductView | null;
  components: PlanComponent[];
  presets: PlanPreset[] | null;
  seatRules: SeatRules | null;
  snapshotHash: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  catalogVersion: number | null;
  summary: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string;
}

export interface Plan {
  planKey: string;
  name: string;
  audience: Audience;
  status: PlanStatus;
  publicPlan: boolean;
  description: string | null;
  badge: string | null;
  sortOrder: number;
  eligibility: Record<string, unknown> | null;
  successorPlanKey: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  versions: PlanVersion[];
}

// ---- preview (server computed) ---------------------------------------------------------------------------------------

export interface Levers {
  minPriceMinor: number | null;
  maxAiBudgetCents: number | null;
  maxDiscountBp: number | null;
}

export interface PreviewOptional {
  featureKey: string;
  unitMinor: number;
  maxQuantity: number;
  aiWindowCents: number;
  marginBp: number;
  ok: boolean;
  levers: Levers | null;
}

export interface PreviewWorstCase {
  totalMinor: number;
  aiCents: number;
  feeMinor: number;
  marginBp: number;
  floorBp: number;
  ok: boolean;
  levers: Levers | null;
}

export interface PreviewCheck {
  id: string;
  ok: boolean;
  failing: Record<string, unknown>[] | null;
}

export interface PreviewAnnual {
  enabled: boolean;
  discountBp: number | null;
  baseYearMinor: number | null;
  monthlyEquivalentMinor: number | null;
  savingsMinor: number | null;
  savingsBp: number | null;
  derived: boolean;
  checks: PreviewCheck[] | null;
}

export interface SeatPreset {
  key: string;
  seatTotalMinor: number;
  aboveIndividualOk: boolean;
  mirrored: boolean;
  individualMonthMinor: number | null;
  features: string[];
}

export interface RosterLine {
  token: string;
  count: number;
  seatTotalMinor: number;
  lineTotalMinor: number;
  features: string[];
}

export interface PreviewSeats {
  seatBaseMinor: number | null;
  presets: SeatPreset[];
  roster: { lines: RosterLine[]; orgRecurringMinor: number; setupFeeMinor: number | null } | null;
}

export interface StripeObject {
  kind: string;
  productCode: string;
  interval: string;
  currency: string;
  priceRowId: number | null;
  idempotencyKey: string | null;
}

export interface PreviewImpact {
  subscribersByVersion: Record<string, number>;
  grandfathered: boolean;
  newSignupsFrom: string | null;
  catalogVersionAfter: number;
  stripeEnabled: boolean;
  stripeObjectsToCreate: StripeObject[];
}

export interface PlanPreview {
  planKey: string;
  version: number;
  status: PlanStatus;
  audience: Audience;
  interval: Interval | string;
  currency: string;
  baseMinor: number | null;
  includedAiCapCents: number;
  optional: PreviewOptional[];
  worstCase: PreviewWorstCase | null;
  annual: PreviewAnnual | null;
  seats: PreviewSeats | null;
  checks: PreviewCheck[];
  impact: PreviewImpact | null;
}

// ---- catalog bits the editor reads ------------------------------------------------------------------------------------

export interface CatalogService {
  key: string;
  name: string;
  description: string | null;
  audience: string;
  category: string | null;
  usageUnit: string | null;
  defaultAllowance: number | null;
  allowancePeriod: string | null;
  aiBudgetCents: number | null;
  maxQuantity: number | null;
  limitKey: string | null;
  active: boolean;
}

export interface CatalogProduct {
  id: number;
  code: string;
  name: string;
  kind: string;
  soldTo: string;
  featureKey: string | null;
  quantityBasis: string | null;
  active: boolean;
}

export interface ServiceDependency {
  requiresFeatureKey: string;
  kind: string;
  note: string | null;
  active: boolean | null;
}

export interface MarginAnswer {
  worst: { marginBp: number; costMinor: number; feeMinor: number; aiMinor: number };
  floorBp: number;
  ok: boolean;
  headroomBp: number;
  levers: Levers | null;
  code: string | null;
  overridable: boolean;
}

export interface CatalogVersionRow {
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  summary: string | null;
  snapshotHash: string | null;
}

// ---- compare and subscribers ------------------------------------------------------------------------------------------

export interface DiffRow {
  path: string;
  a: unknown;
  b: unknown;
}

export interface CompareResult {
  planKey: string;
  a: number;
  b: number;
  diff: DiffRow[];
  subscribers: Record<string, number>;
  marginByIntervalA: Record<string, number>;
  marginByIntervalB: Record<string, number>;
}

export interface SubscriberRow {
  login: string;
  since: string | null;
  interval: string | null;
  addons: string[];
  state: string;
}

export interface SubscribersResult {
  planKey: string;
  version: number | null;
  total: number;
  byVersion: Record<string, number>;
  rows: SubscriberRow[] | null;
  page: number;
  size: number;
}

// ---- helpers ----------------------------------------------------------------------------------------------------------

/** The label of a plan status in the list ("PUBLISHED" -> "Published"). */
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const STATUS_TONE: Record<string, "green" | "amber" | "coral" | "slate" | "blue"> = {
  PUBLISHED: "green",
  DRAFT: "blue",
  SUNSET: "amber",
  RETIRING: "amber",
  RETIRED: "slate",
  SUPERSEDED: "slate",
};

/** Basis points as a percentage with one decimal: 7960 -> "79.6 %". Formatting only. */
export function bpText(bp: number | null | undefined): string {
  if (bp === null || bp === undefined || !Number.isFinite(bp)) return "—";
  const tenths = Math.round(bp / 10);
  const whole = Math.trunc(tenths / 10);
  return `${tenths < 0 && whole === 0 ? "-" : ""}${whole}.${Math.abs(tenths % 10)} %`;
}

/** The decimal digits of a currency (USD 2, JPY 0). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * What an admin typed ("19.99", "$4,99") as minor units, or null when it is not an amount. Pure string work: no float ever
 * carries the value (the same rule as `formatMinor`).
 */
export function parseMinorInput(text: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = text.trim().replace(/[^\d.,]/g, "").replace(",", ".");
  if (!/^\d+(\.\d*)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > digits) return null;
  const minor = Number(whole + frac.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units as an editable decimal string ("1999" -> "19.99") for an input box (no currency symbol). */
export function minorToInput(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined || !Number.isSafeInteger(minor)) return "";
  const digits = currencyDigits(currency);
  if (digits === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(digits + 1, "0");
  return `${minor < 0 ? "-" : ""}${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
}

/** The price a version sells for an interval/currency, from the DTO (never computed). */
export function priceFor(prices: PriceView[] | undefined, interval: string, currency: string): PriceView | null {
  const rows = (prices ?? []).filter((p) => p.interval === interval && p.currency === currency);
  return rows.find((p) => p.source === "DRAFT") ?? rows.find((p) => p.source === "ACTIVE") ?? rows[0] ?? null;
}

/** The lever sentence of a failing margin ("raise the price to at least $5.49"), with the amount formatted by the caller. */
export function leverParts(levers: Levers | null | undefined): { kind: "minPrice" | "maxAi" | "maxDiscount"; value: number }[] {
  if (!levers) return [];
  const out: { kind: "minPrice" | "maxAi" | "maxDiscount"; value: number }[] = [];
  if (levers.minPriceMinor != null) out.push({ kind: "minPrice", value: levers.minPriceMinor });
  if (levers.maxAiBudgetCents != null) out.push({ kind: "maxAi", value: levers.maxAiBudgetCents });
  if (levers.maxDiscountBp != null) out.push({ kind: "maxDiscount", value: levers.maxDiscountBp });
  return out;
}

/** A path of the compare diff in words: "components.ai.credits_extra.allowance" -> "components · ai.credits_extra · allowance". */
export function diffPathText(path: string): string {
  return path.split(".").length > 1 && path.startsWith("components.") ? path.replace(/^components\./, "components · ") : path;
}

/** Count of failing publish gates in a preview. */
export function failingChecks(preview: PlanPreview | null): number {
  if (!preview) return 0;
  const own = preview.checks.filter((c) => !c.ok).length;
  const worstBad = preview.worstCase && !preview.worstCase.ok && !preview.checks.some((c) => c.id === "margin" && !c.ok) ? 1 : 0;
  return own + worstBad;
}

/** The new idempotency key for one publish attempt (a retry of the same attempt reuses it). */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The stat-tile counts of the plans list over ALL plans (the BFF sends them as the list's `summary`): plans, published, drafts,
 * sunset (or retiring), and the subscribers still on a version that is no longer the live one. Counts only, nothing priced.
 */
export function summarizePlans(rows: Pick<PlanSummary, "status" | "liveVersion" | "subscribersByVersion">[]): Record<string, number> {
  let old = 0;
  for (const r of rows) {
    const live = r.liveVersion ? String(r.liveVersion.version) : null;
    for (const [v, n] of Object.entries(r.subscribersByVersion ?? {})) if (live !== null && v !== live) old += n;
  }
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return { plans: rows.length, published: count("PUBLISHED"), drafts: count("DRAFT"), sunset: count("SUNSET") + count("RETIRING"), oldVersionSubscribers: old };
}
