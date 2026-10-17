/**
 * Wire types of the subscription module's customer APIs (docs/subscriptions/09-apis.md sections 2 and 3). Every number is a DTO field: money is
 * integer MINOR units in `currency`, the web formats it and never adds, rounds or discounts anything itself.
 */

export type Interval = "MONTH" | "QUARTER" | "YEAR";

export const INTERVALS: Interval[] = ["MONTH", "QUARTER", "YEAR"];

/** One price of a plan or an add-on at one interval. The monthly-equivalent and savings fields are present on QUARTER and YEAR. */
export type IntervalPrice = {
  amountMinor: number;
  monthlyEquivalentMinor?: number;
  savingsMinor?: number;
  savingsBp?: number;
};

export type PriceMap = Partial<Record<Interval, IntervalPrice>>;

export type CatalogIncluded = { featureKey: string; name: string; description?: string; allowance?: number | null; unit?: string | null };

export type CatalogOptional = { featureKey: string; name: string; description?: string; maxQuantity?: number | null; prices: PriceMap };

export type CatalogPlan = {
  planKey: string;
  name: string;
  badge?: string | null;
  description?: string | null;
  intervals: Interval[];
  prices: PriceMap;
  included: CatalogIncluded[];
  optional: CatalogOptional[];
  sunset?: boolean;
};

/** `totals[planKey][interval]["featureKey:qty,featureKey:qty"]` is the precomputed recurring total of that basket (keys sorted by feature key). */
export type CatalogTotals = Record<string, Partial<Record<Interval, Record<string, number>>>>;

export type PublicCatalog = {
  catalogVersion: number;
  currency: string;
  intervals: Interval[];
  annualEnabled: boolean;
  /** The Stripe Checkout consent sentence (a setting); shown on the review sheet next to the button. */
  consentText?: string | null;
  plans: CatalogPlan[];
  totals: CatalogTotals;
};

export type QuoteLine = {
  featureKey?: string | null;
  kind: "BASE" | "ADDON";
  name: string;
  quantity: number;
  unitListMinor: number;
  unitEffectiveMinor: number;
  lineTotalMinor: number;
  productCode?: string;
  priceId?: string;
};

export type QuoteBasket = {
  lines: QuoteLine[];
  recurringMinor: number;
  monthlyEquivalentMinor?: number | null;
  savingsMinor?: number | null;
  savingsBp?: number | null;
};

export type PlanQuote = {
  quoteId: number;
  kind: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  currency: string;
  catalogVersion: number;
  plan: { planKey: string; version: number; name: string };
  interval: Interval;
  intervalChange?: { from: Interval; to: Interval; effectiveAt: string } | null;
  current?: QuoteBasket | null;
  proposed: QuoteBasket;
  deltaMinor: number;
  additions?: { featureKey: string; name: string; quantityFrom: number; quantityTo: number; unitEffectiveMinor: number; prorationMinor: number }[];
  removals?: { featureKey: string; quantityFrom: number; quantityTo: number; effectiveAt: string; note?: string }[];
  requiresConfirmation?: { featureKey: string; requires: string; kind: string; priceMinor: number; name: string }[];
  autoAdded?: string[];
  prorationEstimateMinor: number;
  nextInvoiceEstimateMinor?: number | null;
  nextInvoiceAt?: string | null;
  /** The string "now" or an ISO instant. */
  effectiveAt: string;
  taxNote?: string | null;
  aiBudgetPct?: number | null;
  warnings?: string[];
};

export type QuoteRequestBody = {
  kind?: "CHECKOUT" | "CHANGE";
  planKey?: string;
  interval?: Interval;
  addons: { featureKey: string; quantity: number }[];
  anonymous?: boolean;
  confirmedCommercialDeps?: string[];
};

export type ChangeDTO = {
  id: number;
  kind: string;
  featureKey?: string | null;
  quantityFrom?: number | null;
  quantityTo?: number | null;
  effectiveAt?: string | null;
  prorationMinor: number;
  status: string;
};

export type ChangeBatch = { batchId: string; changes: ChangeDTO[]; proposedRecurringMinor: number; nextInvoiceAt?: string | null };

export type HeldAddon = { featureKey: string; name: string; quantity: number; unitMinor?: number | null; endsAt?: string | null; pendingQuantity?: number | null };

export type PendingChange = {
  id: number;
  kind: string;
  featureKey?: string | null;
  quantityFrom?: number | null;
  quantityTo?: number | null;
  effectiveAt?: string | null;
  status: string;
};

/** GET /api/billing/me (v3): today's Plan plus the plan link; the v3 fields are absent for Free and for a not-yet-linked subscriber. */
export type PlanV3 = {
  plan: "FREE" | "PRO";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingEnabled: boolean;
  hasCustomer: boolean;
  planKey?: string;
  planVersion?: number;
  planName?: string;
  interval?: Interval;
  currency?: string;
  currentPeriodStart?: string;
  recurringMinor?: number;
  addons?: HeldAddon[];
  features?: string[];
  pendingChanges?: PendingChange[];
  /** Present when the plan version the subscriber holds is no longer sold (09 section 3.3); the API may not send it yet. */
  sunset?: { successorPlanKey?: string | null } | null;
  /** K10.10: present while the subscriber's plan is being retired; `decided` once they chose. `effectiveAt` is their own date. */
  retirement?: { planName: string; effectiveAt: string; decided: boolean; lastDay?: boolean } | null;
  /** K10.10: present after a fallback while services are read-only (the full list is `locked[]` of the entitlements). */
  lock?: { since: string; services: number } | null;
};

export type EntitlementFeature = {
  featureKey: string;
  name: string;
  source: "PLAN" | "ADDON";
  quantity: number;
  allowance?: number | null;
  used?: number | null;
  remaining?: number | null;
  resetsAt?: string | null;
};

export type EntitlementSet = {
  planKey?: string;
  planVersion?: number;
  interval?: Interval;
  periodStart?: string;
  periodEnd?: string;
  features: EntitlementFeature[];
  limits?: Record<string, number>;
  aiPct?: number | null;
  state?: string;
  /** K10.10: services locked read-only after a fallback to Free (11 section 7.2). */
  locked?: { featureKey: string; name: string; lockedSince: string; lockedFromPlan?: string | null }[];
};

export type InvoiceLine = { kind: string; description: string; quantity: number; unitAmountMinor?: number | null; amountMinor: number; proration: boolean };

export type Invoice = {
  number: string;
  status: string;
  amountPaidMinor: number;
  currency: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt?: string | null;
  hostedUrl?: string | null;
  pdfUrl?: string | null;
  lines: InvoiceLine[];
};

/** The problem body of a refused billing call: `code` is the machine-readable reason. */
export type ApiProblem = { code?: string; title?: string; detail?: string; reason?: string; max?: number; successor?: string };
