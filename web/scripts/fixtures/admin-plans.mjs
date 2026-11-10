/**
 * Seed data of the plan-builder mock (K4.7; scripts/mock-plans.mjs). DEV ONLY: the real catalog lives in the API.
 * The shapes are the API's (PlanDTOs, CatalogPriceDTOs, ServiceDTO); the numbers are chosen so the journey of
 * docs/subscriptions/04 section 12 works: "Extra AI credits" fails the 80 % floor at $3.99 and passes from the lever the guard
 * answers with. The guard is the mock's own small model (fee 2.9 % + 30 cents, floor 8000 bp); the real one is the API's.
 */

export const NOW = "2026-10-16T09:00:00.000Z";

export const PRODUCTS = [
  { id: 11, code: "FREE", name: "Free", kind: "SUBSCRIPTION", soldTo: "INDIVIDUAL", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 1, demoData: false, stripeProductId: null },
  { id: 12, code: "PRO", name: "Pro", kind: "SUBSCRIPTION", soldTo: "INDIVIDUAL", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 2, demoData: false, stripeProductId: "prod_mock_pro" },
  { id: 13, code: "AUTOPILOT", name: "Autopilot", kind: "SUBSCRIPTION", soldTo: "INDIVIDUAL", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 3, demoData: false, stripeProductId: "prod_mock_autopilot" },
  { id: 14, code: "PRO_STUDENT", name: "Pro Student", kind: "SUBSCRIPTION", soldTo: "INDIVIDUAL", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 4, demoData: false, stripeProductId: null },
  { id: 20, code: "ORG_SETUP_FEE", name: "Organization setup fee", kind: "FEE", soldTo: "ORG", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 20, demoData: false, stripeProductId: null },
  { id: 21, code: "ORG_PLATFORM_FEE", name: "Organization platform fee", kind: "FEE", soldTo: "ORG", featureKey: null, quantityBasis: null, roleKey: null, active: true, sortOrder: 21, demoData: false, stripeProductId: null },
  { id: 22, code: "ORG_BASE_LICENSE", name: "Consultant base license", kind: "BASE_LICENSE", soldTo: "ORG", featureKey: null, quantityBasis: "SEAT", roleKey: null, active: true, sortOrder: 22, demoData: false, stripeProductId: "prod_mock_org_base" },
  { id: 23, code: "ORG_FEAT_RESUME_AI", name: "Resume and AI", kind: "FEATURE", soldTo: "ORG", featureKey: "org.resume_ai", quantityBasis: "SEAT", roleKey: null, active: true, sortOrder: 23, demoData: false, stripeProductId: null },
  { id: 77, code: "FEAT_AI_CREDITS", name: "Extra AI credits", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "ai.credits_extra", quantityBasis: null, roleKey: null, active: true, sortOrder: 30, demoData: false, stripeProductId: null },
  { id: 78, code: "FEAT_RESUME_PACK", name: "Extra resumes (+10)", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "resume.pack", quantityBasis: null, roleKey: null, active: true, sortOrder: 31, demoData: false, stripeProductId: null },
  { id: 79, code: "FEAT_AUTOPILOT", name: "Autopilot prepare", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "autopilot.prepare", quantityBasis: null, roleKey: null, active: true, sortOrder: 32, demoData: false, stripeProductId: null },
  { id: 80, code: "FEAT_SUPPORT", name: "Priority support", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "support.priority", quantityBasis: null, roleKey: null, active: true, sortOrder: 33, demoData: false, stripeProductId: null },
];

/** Services (feature definitions). `ai` is the worst-case AI cost of ONE unit over a period, in cents. */
export const SERVICES = [
  { key: "ai.autofill", name: "Kiwiply AI autofill", audience: "BOTH", category: "AUTOFILL", usageUnit: "ops", defaultAllowance: 2000, allowancePeriod: "MONTH", aiBudgetCents: 150, maxQuantity: null, limitKey: null },
  { key: "resume.library", name: "Resume library", audience: "BOTH", category: "RESUME", usageUnit: "resumes", defaultAllowance: 25, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: null, limitKey: "resumes.max" },
  { key: "ai.tailoring", name: "AI resume tailoring", audience: "INDIVIDUAL", category: "RESUME", usageUnit: "tailorings", defaultAllowance: 40, allowancePeriod: "MONTH", aiBudgetCents: 125, maxQuantity: null, limitKey: null },
  { key: "inbox.monitor", name: "Inbox monitoring", audience: "INDIVIDUAL", category: "EMAIL", usageUnit: "connections", defaultAllowance: 1, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: null, limitKey: null },
  { key: "interview.practice", name: "AI interview practice", audience: "INDIVIDUAL", category: "INTERVIEW", usageUnit: "sessions", defaultAllowance: 20, allowancePeriod: "MONTH", aiBudgetCents: 40, maxQuantity: null, limitKey: null },
  { key: "jobs.matching", name: "AI Job Matching", audience: "INDIVIDUAL", category: "MATCHING", usageUnit: "matches", defaultAllowance: 20, allowancePeriod: "DAY", aiBudgetCents: 50, maxQuantity: null, limitKey: null },
  { key: "autopilot.prepare", name: "Autopilot prepare", audience: "INDIVIDUAL", category: "AUTOMATION", usageUnit: "applications", defaultAllowance: 300, allowancePeriod: "MONTH", aiBudgetCents: 100, maxQuantity: null, limitKey: null },
  { key: "ai.credits_extra", name: "Extra AI credits", audience: "INDIVIDUAL", category: "AI_CREDITS", usageUnit: "credits", defaultAllowance: 100, allowancePeriod: "MONTH", aiBudgetCents: 64, maxQuantity: 4, limitKey: null },
  { key: "resume.pack", name: "Extra resumes (+10)", audience: "INDIVIDUAL", category: "RESUME", usageUnit: "resumes", defaultAllowance: 10, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: 3, limitKey: null },
  { key: "support.priority", name: "Priority support", audience: "INDIVIDUAL", category: "SUPPORT", usageUnit: "none", defaultAllowance: null, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: 1, limitKey: null },
  { key: "org.seat_base", name: "Consultant seat", audience: "ORG", category: "BASE", usageUnit: "seats", defaultAllowance: 1, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: null, limitKey: null },
  { key: "org.resume_ai", name: "Resume and AI", audience: "ORG", category: "AI_CREDITS", usageUnit: "seats", defaultAllowance: 1, allowancePeriod: "NONE", aiBudgetCents: 120, maxQuantity: null, limitKey: null },
  { key: "org.setup_fee", name: "Organization setup fee", audience: "ORG", category: "FEE", usageUnit: "none", defaultAllowance: null, allowancePeriod: "NONE", aiBudgetCents: 0, maxQuantity: 1, limitKey: null },
].map((s) => ({ description: null, active: true, poolMode: null, consumesAi: s.aiBudgetCents > 0, stackable: false, additive: false, visibility: "PUBLIC", sortOrder: 0, iconKey: null, demoData: false, catalogVersion: 1, ...s }));

/** TECHNICAL / COMMERCIAL requirements between services. */
export const DEPENDENCIES = {
  "autopilot.prepare": [{ requiresFeatureKey: "jobs.matching", kind: "TECHNICAL", note: "Autopilot prepares the applications that matching finds.", active: true }],
  "ai.tailoring": [{ requiresFeatureKey: "resume.library", kind: "TECHNICAL", note: null, active: true }],
};

/** Base prices already in force (ACTIVE), minor units, USD. */
export const PRICES = [
  { id: 41, productId: 12, interval: "MONTH", amountMinor: 1999, status: "ACTIVE" },
  { id: 42, productId: 12, interval: "QUARTER", amountMinor: 4999, status: "ACTIVE" },
  { id: 51, productId: 13, interval: "MONTH", amountMinor: 3999, status: "ACTIVE" },
  { id: 52, productId: 13, interval: "QUARTER", amountMinor: 9999, status: "ACTIVE" },
  { id: 61, productId: 14, interval: "MONTH", amountMinor: 1199, status: "ACTIVE" },
  { id: 62, productId: 14, interval: "QUARTER", amountMinor: 2999, status: "ACTIVE" },
  { id: 90, productId: 77, interval: "MONTH", amountMinor: 599, status: "ACTIVE" },
  { id: 91, productId: 78, interval: "MONTH", amountMinor: 199, status: "ACTIVE" },
  { id: 120, productId: 22, interval: "MONTH", amountMinor: 1499, status: "ACTIVE" },
  { id: 121, productId: 23, interval: "MONTH", amountMinor: 1397, status: "ACTIVE" },
  { id: 122, productId: 20, interval: "ONE_TIME", amountMinor: 49900, status: "ACTIVE" },
];

const comp = (featureKey, role, over = {}) => ({ featureKey, role, productId: null, allowanceOverride: null, limitOverrides: null, defaultQuantity: 1, maxQuantity: null, componentDiscountBp: null, marketingLabel: null, ...over });

const proComponents = () => [
  comp("ai.autofill", "INCLUDED"),
  comp("resume.library", "INCLUDED"),
  comp("ai.tailoring", "INCLUDED"),
  comp("inbox.monitor", "INCLUDED"),
  comp("interview.practice", "INCLUDED"),
  comp("ai.credits_extra", "OPTIONAL", { productId: 77, maxQuantity: 4 }),
  comp("resume.pack", "OPTIONAL", { productId: 78, maxQuantity: 3 }),
];

/** The plans. Pro has v1 (superseded), v2 (live) and v3 (draft); Org Consultancy is SUNSET; Pro Student is a first draft. */
export function seedPlans() {
  const ver = (version, status, extra) => ({
    version,
    status,
    intervals: ["MONTH", "QUARTER"],
    annualDiscountBp: null,
    aiBudgetCapCents: 300,
    aiWindows: null,
    baseProductId: null,
    components: [],
    presets: null,
    seatRules: null,
    summary: null,
    effectiveFrom: null,
    effectiveUntil: null,
    updatedAt: NOW,
    updatedBy: "jk",
    ...extra,
  });
  const plan = (planKey, name, audience, status, extra, versions) => ({
    planKey,
    name,
    audience,
    status,
    publicPlan: true,
    description: null,
    badge: null,
    sortOrder: 0,
    eligibility: null,
    successorPlanKey: null,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: "jk",
    ...extra,
    versions,
  });
  return [
    plan("FREE", "Free", "INDIVIDUAL", "PUBLISHED", { sortOrder: 1 }, [
      ver(1, "PUBLISHED", { baseProductId: 11, intervals: ["MONTH"], aiBudgetCapCents: 0, effectiveFrom: "2026-09-01T00:00:00Z", components: [comp("resume.library", "INCLUDED", { allowanceOverride: 3 }), comp("ai.autofill", "INCLUDED", { allowanceOverride: 100 })] }),
    ]),
    plan("PRO", "Pro", "INDIVIDUAL", "PUBLISHED", { sortOrder: 2, badge: "Most popular" }, [
      ver(1, "SUPERSEDED", { baseProductId: 12, effectiveFrom: "2026-09-01T00:00:00Z", effectiveUntil: "2026-10-12T00:00:00Z", components: proComponents().slice(0, 5) }),
      ver(2, "PUBLISHED", { baseProductId: 12, effectiveFrom: "2026-10-12T00:00:00Z", summary: "Added optional AI credits and resume packs", components: proComponents() }),
      ver(3, "DRAFT", { baseProductId: 12, components: proComponents() }),
    ]),
    plan("AUTOPILOT", "Autopilot", "INDIVIDUAL", "PUBLISHED", { sortOrder: 3 }, [
      ver(1, "PUBLISHED", {
        baseProductId: 13,
        aiBudgetCapCents: 600,
        effectiveFrom: "2026-09-01T00:00:00Z",
        components: [comp("ai.autofill", "INCLUDED"), comp("jobs.matching", "INCLUDED"), comp("autopilot.prepare", "INCLUDED"), comp("resume.library", "INCLUDED", { allowanceOverride: 50 })],
      }),
    ]),
    plan("PRO_STUDENT", "Pro Student", "INDIVIDUAL", "DRAFT", { sortOrder: 4, publicPlan: false }, [
      ver(1, "DRAFT", { baseProductId: 14, aiBudgetCapCents: 150, components: [comp("ai.autofill", "INCLUDED"), comp("resume.library", "INCLUDED")] }),
    ]),
    plan("ORG_STANDARD", "Org Standard", "ORG", "PUBLISHED", { sortOrder: 5 }, [
      ver(1, "PUBLISHED", {
        intervals: ["MONTH"],
        aiBudgetCapCents: 0,
        effectiveFrom: "2026-09-01T00:00:00Z",
        seatRules: { seatBaseProductId: 22, minSeats: 1, maxSeatsSetting: "enterprise.license.max_seats", setupFeeProductId: 20, platformFeeProductId: 21 },
        presets: [{ key: "RESUME_AI_SUPPORT", name: "Resume and AI", addons: [{ featureKey: "org.resume_ai", quantity: 1 }] }],
        components: [comp("org.seat_base", "SEAT_BASE", { productId: 22 }), comp("org.resume_ai", "SEAT_OPTIONAL", { productId: 23 }), comp("org.setup_fee", "FEE", { productId: 20 })],
      }),
    ]),
    plan("ORG_CONSULTANCY", "Org Consultancy", "ORG", "SUNSET", { sortOrder: 6, successorPlanKey: "ORG_STANDARD", publicPlan: false }, [
      ver(1, "PUBLISHED", {
        intervals: ["MONTH"],
        aiBudgetCapCents: 0,
        effectiveFrom: "2026-09-01T00:00:00Z",
        seatRules: { seatBaseProductId: 22, minSeats: 3, maxSeatsSetting: "enterprise.license.max_seats", setupFeeProductId: 20, platformFeeProductId: null },
        components: [comp("org.seat_base", "SEAT_BASE", { productId: 22 }), comp("org.setup_fee", "FEE", { productId: 20 })],
      }),
    ]),
  ];
}

/** Subscribers per plan and version (counts only). */
export const SUBSCRIBERS = {
  FREE: { 1: 4120 },
  PRO: { 1: 212, 2: 1038 },
  AUTOPILOT: { 1: 87 },
  PRO_STUDENT: {},
  ORG_STANDARD: { 1: 14 },
  ORG_CONSULTANCY: { 1: 2 },
};

/** The roster of a version (logins; admin only in the real API). */
export const SUBSCRIBER_ROWS = [
  { login: "priya.nair", since: "2026-09-03T10:00:00Z", interval: "MONTH", addons: ["ai.credits_extra x2"], state: "ACTIVE" },
  { login: "sam.lee", since: "2026-09-11T10:00:00Z", interval: "QUARTER", addons: [], state: "ACTIVE" },
  { login: "alex.cho", since: "2026-09-20T10:00:00Z", interval: "MONTH", addons: [], state: "PAST_DUE" },
];
