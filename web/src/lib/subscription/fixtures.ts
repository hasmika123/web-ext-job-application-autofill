/** Test fixtures shaped like the subscription APIs (docs/subscriptions/09-apis.md). Money is minor units. */
import type { ChangeBatch, EntitlementSet, Invoice, PlanQuote, PlanV3, PublicCatalog } from "./types";

export const CATALOG: PublicCatalog = {
  catalogVersion: 17,
  currency: "USD",
  intervals: ["MONTH", "QUARTER", "YEAR"],
  annualEnabled: true,
  consentText: "By continuing you agree to the Terms.",
  plans: [
    { planKey: "FREE", name: "Free", description: "Everything you need to apply.", intervals: [], prices: {}, included: [{ featureKey: "autofill", name: "Autofill on every ATS" }], optional: [] },
    {
      planKey: "PRO",
      name: "Pro",
      badge: "Most popular",
      description: "Kiwiply AI does the heavy lifting.",
      intervals: ["MONTH", "QUARTER", "YEAR"],
      prices: {
        MONTH: { amountMinor: 1999 },
        QUARTER: { amountMinor: 4999, monthlyEquivalentMinor: 1666, savingsMinor: 998, savingsBp: 1664 },
        YEAR: { amountMinor: 21589, monthlyEquivalentMinor: 1799, savingsMinor: 2399, savingsBp: 1000 },
      },
      included: [
        { featureKey: "ai.autofill", name: "Kiwiply AI autofill" },
        { featureKey: "resumes.max", name: "Saved resumes", allowance: 25, unit: "resumes" },
      ],
      optional: [
        {
          featureKey: "ai.credits_extra",
          name: "Extra AI credits",
          maxQuantity: 5,
          prices: { MONTH: { amountMinor: 499 }, QUARTER: { amountMinor: 1299 }, YEAR: { amountMinor: 5389 } },
        },
        { featureKey: "resumes.extra_10", name: "Extra resumes +10", maxQuantity: 5, prices: { MONTH: { amountMinor: 199 } } },
      ],
    },
  ],
  totals: {
    PRO: {
      MONTH: { "ai.credits_extra:1": 2498, "ai.credits_extra:2": 2997, "resumes.extra_10:1": 2198, "ai.credits_extra:1,resumes.extra_10:1": 2697 },
      QUARTER: { "ai.credits_extra:1": 6298 },
      YEAR: { "ai.credits_extra:1": 26978 },
    },
  },
};

export const CHECKOUT_QUOTE: PlanQuote = {
  quoteId: 901,
  kind: "CHECKOUT",
  status: "OPEN",
  createdAt: "2026-10-20T10:00:00Z",
  expiresAt: "2026-10-20T10:15:00Z",
  currency: "USD",
  catalogVersion: 17,
  plan: { planKey: "PRO", version: 2, name: "Pro" },
  interval: "MONTH",
  proposed: {
    lines: [
      { featureKey: null, kind: "BASE", name: "Pro", quantity: 1, unitListMinor: 1999, unitEffectiveMinor: 1999, lineTotalMinor: 1999 },
      { featureKey: "ai.credits_extra", kind: "ADDON", name: "Extra AI credits", quantity: 2, unitListMinor: 499, unitEffectiveMinor: 499, lineTotalMinor: 998 },
    ],
    recurringMinor: 2997,
    monthlyEquivalentMinor: 2997,
  },
  deltaMinor: 2997,
  prorationEstimateMinor: 0,
  nextInvoiceEstimateMinor: 2997,
  nextInvoiceAt: "2026-11-15T00:00:00Z",
  effectiveAt: "now",
  taxNote: "Taxes are calculated by Stripe at invoice time where applicable.",
};

export const SUB: PlanV3 = {
  plan: "PRO",
  status: "active",
  currentPeriodEnd: "2026-11-15T00:00:00Z",
  cancelAtPeriodEnd: false,
  billingEnabled: true,
  hasCustomer: true,
  planKey: "PRO",
  planVersion: 2,
  planName: "Pro",
  interval: "MONTH",
  currency: "USD",
  currentPeriodStart: "2026-10-15T00:00:00Z",
  recurringMinor: 2997,
  addons: [{ featureKey: "ai.credits_extra", name: "Extra AI credits", quantity: 2, unitMinor: 499 }],
  features: ["ai.autofill"],
  pendingChanges: [],
};

export const CHANGE_QUOTE: PlanQuote = {
  ...CHECKOUT_QUOTE,
  quoteId: 902,
  kind: "CHANGE",
  current: CHECKOUT_QUOTE.proposed,
  proposed: {
    lines: [
      { featureKey: null, kind: "BASE", name: "Pro", quantity: 1, unitListMinor: 1999, unitEffectiveMinor: 1999, lineTotalMinor: 1999 },
      { featureKey: "ai.credits_extra", kind: "ADDON", name: "Extra AI credits", quantity: 1, unitListMinor: 499, unitEffectiveMinor: 499, lineTotalMinor: 499 },
    ],
    recurringMinor: 2498,
    monthlyEquivalentMinor: 2498,
  },
  deltaMinor: -499,
  additions: [],
  removals: [{ featureKey: "ai.credits_extra", quantityFrom: 2, quantityTo: 1, effectiveAt: "2026-11-15T00:00:00Z", note: "works until Nov 15 - no refund" }],
  prorationEstimateMinor: 0,
  nextInvoiceEstimateMinor: 2498,
  nextInvoiceAt: "2026-11-15T00:00:00Z",
};

export const BATCH: ChangeBatch = {
  batchId: "11111111-1111-4111-8111-111111111111",
  changes: [{ id: 51, kind: "DECREASE", featureKey: "ai.credits_extra", quantityFrom: 2, quantityTo: 1, effectiveAt: "2026-11-15T00:00:00Z", prorationMinor: 0, status: "PENDING" }],
  proposedRecurringMinor: 2498,
  nextInvoiceAt: "2026-11-15T00:00:00Z",
};

export const ENTITLEMENTS: EntitlementSet = {
  planKey: "PRO",
  planVersion: 2,
  interval: "MONTH",
  periodEnd: "2026-11-15T00:00:00Z",
  aiPct: 72,
  state: "ACTIVE",
  features: [
    { featureKey: "ai.budget", name: "AI budget", source: "PLAN", quantity: 1, allowance: 100, used: 72, remaining: 28, resetsAt: "2026-11-15T00:00:00Z" },
    { featureKey: "resumes.max", name: "Resumes", source: "PLAN", quantity: 1, allowance: 25, used: 21, remaining: 4 },
    { featureKey: "ai.credits_extra", name: "Extra AI credits", source: "ADDON", quantity: 2 },
  ],
};

export const INVOICES: Invoice[] = [
  {
    number: "KIWI-0002",
    status: "paid",
    amountPaidMinor: 2997,
    currency: "USD",
    periodStart: "2026-10-15T00:00:00Z",
    periodEnd: "2026-11-15T00:00:00Z",
    paidAt: "2026-10-15T00:00:00Z",
    hostedUrl: "https://invoice.stripe.com/x",
    pdfUrl: null,
    lines: [{ kind: "BASE", description: "Pro", quantity: 1, unitAmountMinor: 1999, amountMinor: 1999, proration: false }],
  },
];
