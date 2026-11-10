import type { PlanPreview } from "@/lib/admin-plans";

/** The preview of the 04 section 3 example: Pro v3 monthly, the credits add-on failing the floor with a $5.49 lever. */
export const PREVIEW: PlanPreview = {
  planKey: "PRO",
  version: 3,
  status: "DRAFT",
  audience: "INDIVIDUAL",
  interval: "MONTH",
  currency: "USD",
  baseMinor: 1999,
  includedAiCapCents: 300,
  optional: [
    { featureKey: "ai.credits_extra", unitMinor: 499, maxQuantity: 4, aiWindowCents: 150, marginBp: 8216, ok: true, levers: null },
    { featureKey: "resume.pack", unitMinor: 199, maxQuantity: 3, aiWindowCents: 0, marginBp: 9650, ok: true, levers: null },
  ],
  worstCase: { totalMinor: 3594, aiCents: 600, feeMinor: 134, marginBp: 7960, floorBp: 8000, ok: false, levers: { minPriceMinor: 549, maxAiBudgetCents: null, maxDiscountBp: null } },
  annual: { enabled: false, discountBp: null, baseYearMinor: null, monthlyEquivalentMinor: null, savingsMinor: null, savingsBp: null, derived: false, checks: null },
  seats: null,
  checks: [
    { id: "deps", ok: true, failing: null },
    { id: "prices", ok: true, failing: null },
    { id: "margin", ok: false, failing: [{ featureKey: "ai.credits_extra", interval: "MONTH", marginBp: 7960, floorBp: 8000, levers: { minPriceMinor: 549, maxAiBudgetCents: null, maxDiscountBp: null } }] },
  ],
  impact: {
    subscribersByVersion: { "1": 212, "2": 1038 },
    grandfathered: true,
    newSignupsFrom: "2026-10-20T00:00:00Z",
    catalogVersionAfter: 18,
    stripeEnabled: true,
    stripeObjectsToCreate: [{ kind: "price", productCode: "FEAT_AI_CREDITS", interval: "QUARTER", currency: "USD", priceRowId: 77, idempotencyKey: "price-77" }],
  },
};
