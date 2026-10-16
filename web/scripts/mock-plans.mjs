/**
 * The plan-builder API mock (K4.7), in memory, DEV ONLY. It answers, for the mock's platform admin (demo-admin), the routes the
 * Pricing console calls:
 *
 *   GET  /api/admin/plans[?audience&status]                     PlanSummaryDTO[]
 *   POST /api/admin/plans                                       create (reason, 409 PLAN_KEY_EXISTS, 422 KEY_FORMAT)
 *   GET|PUT /api/admin/plans/{key}                              PlanDTO
 *   POST /api/admin/plans/{key}/versions                        new DRAFT (409 DRAFT_EXISTS)
 *   GET|PATCH /api/admin/plans/{key}/versions/{v}               PlanVersionDTO, autosave (409 NOT_DRAFT, 409 VERSION_CONFLICT)
 *   PUT  .../versions/{v}/components                            full replacement
 *   GET  .../versions/{v}/preview?interval&currency&roster      PlanPreviewDTO (the mock computes; the real API is the truth)
 *   POST .../versions/{v}/publish   Idempotency-Key, confirmVersion, reason, overrideReason   (412, 422 MARGIN_BELOW_FLOOR ...)
 *   POST .../versions/{v}/discard
 *   GET  /api/admin/plans/{key}/compare?a&b  and  /subscribers[?version&page]
 *   GET  /api/admin/catalog, /catalog/services[/{key}/dependencies], /catalog/margin, /catalog/versions;  POST /catalog/prices
 *
 * The margin guard here is a small model (fee 2.9 % + 30 cents, floor 8000 bp). Setting MOCK_STRIPE=off makes previews say Stripe is
 * off (the API publishes silently then, P-02). The API does not refuse an organization plan without a setup fee; this mock does
 * (422 SETUP_FEE_REQUIRED) so the page's inline refusal can be exercised: that is a deliberate difference, see
 * docs/subscriptions/decisions-for-user.md. POST /mock/plans/reset restores the seed. Nothing is persisted.
 */
import { createRetirementsState } from "./mock-retirements.mjs";
import { DEPENDENCIES, NOW, PRICES, PRODUCTS, SERVICES, SUBSCRIBERS, SUBSCRIBER_ROWS, seedPlans } from "./fixtures/admin-plans.mjs";

const CURRENCY = "USD";
const FLOOR_BP = 8000;
const REASON_MIN = 10;
const INTERVALS = ["MONTH", "QUARTER", "YEAR"];
const DEFAULT_ANNUAL_BP = 1000;
const ROLES = { INDIVIDUAL: ["INCLUDED", "OPTIONAL"], ORG: ["SEAT_BASE", "SEAT_INCLUDED", "SEAT_OPTIONAL", "FEE"] };

const fee = (p) => Math.round(p * 0.029) + 30;
const marginBp = (p, ai) => (p > 0 ? Math.floor((10000 * (p - ai - fee(p))) / p) : 0);
const minPriceFor = (ai) => {
  for (let p = 1; p < 1_000_000; p += 1) if (marginBp(p, ai) >= FLOOR_BP) return p;
  return null;
};
const ok = (body, status = 200) => ({ status, body });
const fail = (status, code, error, extra = {}) => ({ status, body: { status, code, title: error, detail: error, message: "error.catalog", ...extra } });

export function createPlansState({ stripeEnabled = process.env.MOCK_STRIPE !== "off" } = {}) {
  let plans = seedPlans();
  let prices = PRICES.map((p) => ({ currency: CURRENCY, ...p }));
  let nextPriceId = 1000;
  let catalogVersion = 17;
  let tick = 0;
  let catalogRows = [
    { version: 16, publishedAt: "2026-10-01T09:00:00Z", publishedBy: "jk", summary: "Published FREE v1 (0 price row(s))", snapshotHash: "h16" },
    { version: 17, publishedAt: "2026-10-12T09:00:00Z", publishedBy: "jk", summary: "Published PRO v2 (2 price row(s))", snapshotHash: "h17" },
  ];
  let published = new Map(); // idempotency key -> version DTO

  const service = (key) => SERVICES.find((s) => s.key === key);
  const product = (id) => PRODUCTS.find((p) => p.id === id);
  const find = (key) => plans.find((p) => p.planKey === key);
  const stamp = () => new Date(Date.parse(NOW) + ++tick * 1000).toISOString();
  const priceRow = (productId, interval) => {
    const rows = prices.filter((p) => p.productId === productId && p.interval === interval);
    return rows.find((p) => p.status === "DRAFT") ?? rows.find((p) => p.status === "ACTIVE") ?? null;
  };
  const annualBp = (v) => v.annualDiscountBp ?? DEFAULT_ANNUAL_BP;
  const yearOf = (monthly, v) => Math.round((monthly * 12 * (10000 - annualBp(v))) / 10000);
  const aiFor = (v, interval) => (interval === "QUARTER" ? (v.aiWindows?.QUARTER ?? v.aiBudgetCapCents * 3) : interval === "YEAR" ? v.aiBudgetCapCents * 12 : v.aiBudgetCapCents);
  const periodsOf = (interval) => (interval === "QUARTER" ? 3 : interval === "YEAR" ? 12 : 1);
  const isSetup = (p) => /SETUP/i.test(p?.code ?? "");

  /** The priced intervals of a product within a version: MONTH/QUARTER rows, YEAR derived from MONTH, ONE_TIME for a setup fee. */
  function priceViews(productId, v, ai, kind) {
    const prod = product(productId);
    const intervals = isSetup(prod) ? ["ONE_TIME"] : v.intervals;
    const out = [];
    for (const i of intervals) {
      if (i === "YEAR") {
        const m = priceRow(productId, "MONTH");
        if (m) {
          const amt = yearOf(m.amountMinor, v);
          out.push({ priceId: null, interval: "YEAR", currency: CURRENCY, amountMinor: amt, source: "DERIVED", derived: true, stripePriceId: null, marginBp: kind ? marginBp(amt, ai * 12) : null, ok: kind ? marginBp(amt, ai * 12) >= FLOOR_BP : null });
        }
        continue;
      }
      const r = priceRow(productId, i);
      if (!r) continue;
      const mb = kind ? marginBp(r.amountMinor, ai * periodsOf(i)) : null;
      out.push({ priceId: r.id, interval: i, currency: CURRENCY, amountMinor: r.amountMinor, source: r.status, derived: false, stripePriceId: null, marginBp: mb, ok: mb === null ? null : mb >= FLOOR_BP });
    }
    return out;
  }

  function versionDto(plan, v) {
    const base = v.baseProductId ? product(v.baseProductId) : null;
    const baseViews = base ? v.intervals.flatMap((i) => priceViews(base.id, { ...v, intervals: [i] }, aiFor(v, "MONTH") / periodsOf("MONTH"), true).filter(() => true)) : [];
    return {
      planKey: plan.planKey,
      version: v.version,
      status: v.status,
      audience: plan.audience,
      intervals: v.intervals,
      annualDiscountBp: v.annualDiscountBp,
      aiBudgetCapCents: v.aiBudgetCapCents,
      aiWindows: v.aiWindows,
      baseProduct: base ? { id: base.id, code: base.code, prices: baseViews.map((p) => ({ ...p, ...baseMargin(v, p) })) } : null,
      components: v.components.map((c, i) => componentDto(plan, v, c, i)),
      presets: v.presets,
      seatRules: v.seatRules,
      snapshotHash: v.status === "DRAFT" ? null : `hash-${plan.planKey}-${v.version}`,
      effectiveFrom: v.effectiveFrom,
      effectiveUntil: v.effectiveUntil,
      catalogVersion: v.status === "DRAFT" ? null : catalogVersion,
      summary: v.summary,
      publishedAt: v.effectiveFrom,
      publishedBy: v.status === "DRAFT" ? null : "jk",
      updatedAt: v.updatedAt,
    };
  }
  const baseMargin = (v, p) => {
    if (p.interval === "ONE_TIME") return {};
    const ai = aiFor(v, p.interval);
    const mb = marginBp(p.amountMinor, ai);
    return { marginBp: mb, ok: mb >= FLOOR_BP };
  };

  function componentDto(plan, v, c, index) {
    const s = service(c.featureKey) ?? { name: c.featureKey, category: null, usageUnit: null, defaultAllowance: null, aiBudgetCents: 0, limitKey: null, maxQuantity: null };
    const prod = c.productId ? product(c.productId) : null;
    const priced = ["OPTIONAL", "SEAT_BASE", "SEAT_OPTIONAL", "FEE"].includes(c.role) && prod;
    return {
      featureKey: c.featureKey,
      role: c.role,
      name: s.name,
      category: s.category,
      unit: s.usageUnit,
      productId: c.productId,
      productCode: prod?.code ?? null,
      allowance: c.allowanceOverride ?? s.defaultAllowance,
      allowanceOverride: c.allowanceOverride,
      limitKey: s.limitKey,
      limitOverrides: c.limitOverrides,
      defaultQuantity: c.defaultQuantity ?? 1,
      maxQuantity: c.maxQuantity ?? s.maxQuantity,
      componentDiscountBp: c.componentDiscountBp,
      sortOrder: index,
      marketingLabel: c.marketingLabel,
      aiBudgetCents: s.aiBudgetCents ?? 0,
      prices: priced ? priceViews(prod.id, v, s.aiBudgetCents ?? 0, true) : [],
    };
  }

  const planDto = (plan) => ({
    planKey: plan.planKey,
    name: plan.name,
    audience: plan.audience,
    status: plan.status,
    publicPlan: plan.publicPlan,
    description: plan.description,
    badge: plan.badge,
    sortOrder: plan.sortOrder,
    eligibility: plan.eligibility,
    successorPlanKey: plan.successorPlanKey,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    updatedBy: plan.updatedBy,
    versions: plan.versions.map((v) => versionDto(plan, v)),
  });

  // ---- the guard and the preview -------------------------------------------------------------------------------------

  function optionalRows(plan, v, interval) {
    const rows = [];
    for (const c of v.components) {
      if (!["OPTIONAL", "SEAT_OPTIONAL"].includes(c.role) || !c.productId) continue;
      const s = service(c.featureKey);
      const row = priceRow(c.productId, "MONTH");
      if (!row) continue;
      const ai = (s?.aiBudgetCents ?? 0) * periodsOf(interval);
      const unit = interval === "YEAR" ? yearOf(row.amountMinor, v) : interval === "QUARTER" ? (priceRow(c.productId, "QUARTER")?.amountMinor ?? row.amountMinor * 3) : row.amountMinor;
      const mb = marginBp(unit, ai);
      const passes = mb >= FLOOR_BP;
      const min = passes ? null : minPriceFor(s?.aiBudgetCents ?? 0);
      rows.push({
        featureKey: c.featureKey,
        unitMinor: unit,
        maxQuantity: c.maxQuantity ?? s?.maxQuantity ?? 1,
        aiWindowCents: ai,
        marginBp: mb,
        ok: passes,
        levers: passes ? null : { minPriceMinor: min, maxAiBudgetCents: null, maxDiscountBp: null },
      });
    }
    return rows;
  }

  function worstCase(plan, v, interval, baseMinor, optional) {
    if (baseMinor == null) return null;
    const total = optional.reduce((n, o) => n + o.unitMinor * o.maxQuantity, baseMinor);
    const ai = optional.reduce((n, o) => n + o.aiWindowCents * o.maxQuantity, aiFor(v, interval));
    const f = fee(total);
    const mb = marginBp(total, ai);
    const passes = mb >= FLOOR_BP;
    // the lever: the dearest unit price of the weakest add-on that makes the whole composition pass
    let lever = null;
    if (!passes && optional.length) {
      const weakest = [...optional].sort((a, b) => a.marginBp - b.marginBp)[0];
      for (let p = weakest.unitMinor; p < weakest.unitMinor + 100000; p += 1) {
        const t = total - weakest.unitMinor * weakest.maxQuantity + p * weakest.maxQuantity;
        if (marginBp(t, ai) >= FLOOR_BP) {
          lever = p;
          break;
        }
      }
    }
    return { totalMinor: total, aiCents: ai, feeMinor: f, marginBp: mb, floorBp: FLOOR_BP, ok: passes, levers: passes ? null : { minPriceMinor: lever, maxAiBudgetCents: null, maxDiscountBp: null } };
  }

  function baseAmount(plan, v, interval) {
    if (plan.audience === "ORG") {
      const seat = v.components.find((c) => c.role === "SEAT_BASE");
      return seat?.productId ? (priceRow(seat.productId, "MONTH")?.amountMinor ?? null) : null;
    }
    if (!v.baseProductId) return null;
    if (interval === "YEAR") {
      const m = priceRow(v.baseProductId, "MONTH");
      return m ? yearOf(m.amountMinor, v) : null;
    }
    return priceRow(v.baseProductId, interval)?.amountMinor ?? null;
  }

  function parseRoster(text, token = "BASE") {
    const out = [];
    for (const part of (text ?? "").split(",")) {
      const m = /^\s*\[(\d{1,4})\]\s*([A-Z0-9_]+)\s*$/i.exec(part);
      if (m) out.push({ count: Number(m[1]), token: m[2].toUpperCase() });
    }
    return out.length ? out : [{ count: 5, token }];
  }

  function preview(plan, v, q) {
    const interval = q.interval && v.intervals.includes(q.interval) ? q.interval : (v.intervals[0] ?? "MONTH");
    const base = baseAmount(plan, v, interval);
    const optional = plan.audience === "ORG" ? [] : optionalRows(plan, v, interval);
    const worst = plan.audience === "ORG" ? null : worstCase(plan, v, interval, base, optional);
    const priceMissing = [];
    if (plan.audience === "INDIVIDUAL" && v.baseProductId && !/FREE/.test(plan.planKey)) {
      for (const i of v.intervals) if (i !== "YEAR" && !priceRow(v.baseProductId, i)) priceMissing.push({ featureKey: "base", interval: i, currency: CURRENCY });
    }
    for (const c of v.components) if (c.role === "OPTIONAL" && (!c.productId || !priceRow(c.productId, "MONTH"))) priceMissing.push({ featureKey: c.featureKey, interval: "MONTH", currency: CURRENCY });
    const missingDeps = [];
    for (const c of v.components) for (const d of DEPENDENCIES[c.featureKey] ?? []) if (d.kind === "TECHNICAL" && !v.components.some((x) => x.featureKey === d.requiresFeatureKey)) missingDeps.push({ featureKey: c.featureKey, requires: d.requiresFeatureKey });
    const failingMargin = [
      ...optional.filter((o) => !o.ok).map((o) => ({ featureKey: o.featureKey, interval, currency: CURRENCY, marginBp: o.marginBp, floorBp: FLOOR_BP, levers: o.levers })),
      ...(worst && !worst.ok ? [{ featureKey: "composition", interval, currency: CURRENCY, marginBp: worst.marginBp, floorBp: FLOOR_BP, levers: worst.levers }] : []),
    ];
    let seats = null;
    if (plan.audience === "ORG") seats = seatsPreview(plan, v, q.roster);
    const presetsBad = seats ? seats.presets.filter((p) => !p.aboveIndividualOk).map((p) => ({ featureKey: p.key, requires: p.individualMonthMinor })) : [];
    const checks = [
      { id: "deps", ok: missingDeps.length === 0, failing: missingDeps.length ? missingDeps : null },
      { id: "prices", ok: priceMissing.length === 0, failing: priceMissing.length ? priceMissing : null },
      { id: "margin", ok: failingMargin.length === 0, failing: failingMargin.length ? failingMargin : null },
      ...(seats ? [{ id: "presets", ok: presetsBad.length === 0, failing: presetsBad.length ? presetsBad : null }] : []),
    ];
    const drafts = prices.filter((p) => p.status === "DRAFT" && (p.productId === v.baseProductId || v.components.some((c) => c.productId === p.productId)));
    return {
      planKey: plan.planKey,
      version: v.version,
      status: v.status,
      audience: plan.audience,
      interval,
      currency: CURRENCY,
      baseMinor: base,
      includedAiCapCents: aiFor(v, interval),
      optional,
      worstCase: worst,
      annual: v.intervals.includes("YEAR")
        ? { enabled: true, discountBp: annualBp(v), baseYearMinor: baseAmount(plan, v, "YEAR"), monthlyEquivalentMinor: baseAmount(plan, v, "YEAR") == null ? null : Math.round(baseAmount(plan, v, "YEAR") / 12), savingsMinor: null, savingsBp: annualBp(v), derived: true, checks: null }
        : { enabled: false, discountBp: null, baseYearMinor: null, monthlyEquivalentMinor: null, savingsMinor: null, savingsBp: null, derived: false, checks: null },
      seats,
      checks,
      impact: {
        subscribersByVersion: Object.fromEntries(Object.entries(SUBSCRIBERS[plan.planKey] ?? {}).map(([k, n]) => [k, n])),
        grandfathered: true,
        newSignupsFrom: stamp(),
        catalogVersionAfter: catalogVersion + 1,
        stripeEnabled,
        stripeObjectsToCreate: drafts.map((p) => ({ kind: "price", productCode: product(p.productId)?.code ?? "?", interval: p.interval, currency: CURRENCY, priceRowId: p.id, idempotencyKey: `price-${p.id}` })),
      },
    };
  }

  function seatsPreview(plan, v, rosterText) {
    const seatBaseId = v.components.find((c) => c.role === "SEAT_BASE")?.productId;
    const seatBase = seatBaseId ? (priceRow(seatBaseId, "MONTH")?.amountMinor ?? 0) : 0;
    const individual = priceRow(12, "MONTH")?.amountMinor ?? null;
    const presets = (v.presets ?? []).map((p) => {
      const add = p.addons.reduce((n, a) => {
        const c = v.components.find((x) => x.featureKey === a.featureKey);
        return n + (c?.productId ? (priceRow(c.productId, "MONTH")?.amountMinor ?? 0) * a.quantity : 0);
      }, 0);
      const total = seatBase + add;
      return { key: p.key, seatTotalMinor: total, aboveIndividualOk: individual == null || total >= individual, mirrored: false, individualMonthMinor: individual, features: p.addons.map((a) => a.featureKey) };
    });
    const lines = parseRoster(rosterText).map((r) => {
      const total = r.token === "BASE" ? seatBase : (presets.find((p) => p.key === r.token)?.seatTotalMinor ?? seatBase);
      return { token: r.token, count: r.count, seatTotalMinor: total, lineTotalMinor: total * r.count, features: [] };
    });
    const setupId = v.seatRules?.setupFeeProductId ?? v.components.find((c) => c.role === "FEE" && isSetup(product(c.productId)))?.productId;
    return {
      seatBaseMinor: seatBase,
      presets,
      roster: { lines, orgRecurringMinor: lines.reduce((n, l) => n + l.lineTotalMinor, 0), setupFeeMinor: setupId ? (priceRow(setupId, "ONE_TIME")?.amountMinor ?? null) : null },
    };
  }

  // ---- routes ------------------------------------------------------------------------------------------------------

  const summaries = (q) =>
    plans
      .filter((p) => (!q.audience || p.audience === q.audience) && (!q.status || p.status === q.status))
      .map((p) => {
        const live = p.versions.find((v) => v.status === "PUBLISHED");
        const draft = p.versions.find((v) => v.status === "DRAFT");
        const shown = live ?? draft;
        const pricesByInterval = {};
        if (shown) {
          for (const i of shown.intervals) {
            const amt = baseAmount(p, shown, i);
            if (amt != null) pricesByInterval[i] = amt;
          }
        }
        let worstBp = null;
        if (shown && p.audience === "INDIVIDUAL" && shown.baseProductId) {
          const pv = preview(p, shown, {});
          worstBp = pv.worstCase?.marginBp ?? null;
        }
        return {
          planKey: p.planKey,
          name: p.name,
          audience: p.audience,
          status: p.status,
          publicPlan: p.publicPlan,
          liveVersion: live ? { version: live.version, effectiveFrom: live.effectiveFrom } : null,
          draftVersion: draft ? draft.version : null,
          subscribersByVersion: Object.fromEntries(Object.entries(SUBSCRIBERS[p.planKey] ?? {}).map(([k, n]) => [k, n])),
          pricesByInterval,
          marginWorstBp: worstBp,
          successorPlanKey: p.successorPlanKey,
        };
      });

  const needDraft = (v) => (v.status === "DRAFT" ? null : fail(409, "NOT_DRAFT", `Version ${v.version} is ${v.status.toLowerCase()} and cannot be edited.`));
  const conflict = (v, expected) => (expected && Date.parse(expected) !== Date.parse(v.updatedAt) ? fail(409, "VERSION_CONFLICT", `Version ${v.version} changed since you opened it.`, { updatedAt: v.updatedAt }) : null);

  function patchVersion(plan, v, b) {
    const bad = needDraft(v) ?? conflict(v, b.expectedUpdatedAt);
    if (bad) return bad;
    if ("intervals" in b) {
      const wanted = (b.intervals ?? []).map(String);
      if (plan.audience === "ORG" && wanted.includes("QUARTER")) return fail(422, "ORG_QUARTER_REFUSED", "Organizations are billed monthly or yearly, not quarterly.");
      if (wanted.some((i) => !INTERVALS.includes(i)) || wanted.length === 0) return fail(422, "INVALID_VALUE", "intervals is a non-empty list of MONTH, QUARTER and YEAR.", { field: "intervals" });
      v.intervals = INTERVALS.filter((i) => wanted.includes(i));
    }
    if ("annualDiscountBp" in b) {
      if (b.annualDiscountBp !== null && !(Number.isInteger(b.annualDiscountBp) && b.annualDiscountBp >= 0 && b.annualDiscountBp <= 10000)) return fail(422, "INVALID_VALUE", "annualDiscountBp is 0 to 10000 or null.", { field: "annualDiscountBp" });
      v.annualDiscountBp = b.annualDiscountBp;
    }
    if ("aiBudgetCapCents" in b) {
      if (!Number.isInteger(b.aiBudgetCapCents) || b.aiBudgetCapCents < 0 || b.aiBudgetCapCents > 1_000_000) return fail(422, "INVALID_VALUE", "aiBudgetCapCents is 0 to 1000000.", { field: "aiBudgetCapCents" });
      v.aiBudgetCapCents = b.aiBudgetCapCents;
    }
    if ("aiWindows" in b) v.aiWindows = b.aiWindows && Object.keys(b.aiWindows).length ? b.aiWindows : null;
    if ("baseProductId" in b) {
      const prod = b.baseProductId == null ? null : product(b.baseProductId);
      if (b.baseProductId != null && (!prod || prod.kind !== "SUBSCRIPTION")) return fail(422, "INVALID_VALUE", "The base of a plan is a SUBSCRIPTION product.", { field: "baseProductId" });
      v.baseProductId = b.baseProductId ?? null;
    }
    if ("seatRules" in b) {
      if (b.seatRules !== null && plan.audience !== "ORG") return fail(422, "INVALID_VALUE", "seatRules applies to ORG plans only.", { field: "seatRules" });
      v.seatRules = b.seatRules;
    }
    if ("presets" in b) {
      const keys = new Set();
      for (const p of b.presets ?? []) {
        if (!p.key || keys.has(p.key) || "price" in p) return fail(422, "INVALID_VALUE", "Every preset has a unique key and no price (S-05).", { field: "presets" });
        keys.add(p.key);
      }
      v.presets = b.presets;
    }
    if ("summary" in b) v.summary = b.summary ?? null;
    v.updatedAt = stamp();
    return ok(versionDto(plan, v));
  }

  function putComponents(plan, v, b) {
    const bad = needDraft(v) ?? conflict(v, b.expectedUpdatedAt);
    if (bad) return bad;
    const list = b.components ?? [];
    const seen = new Set();
    for (const c of list) {
      if (!ROLES[plan.audience].includes(c.role)) return fail(422, "ROLE_INVALID_FOR_AUDIENCE", `${c.role} is not a role of an ${plan.audience} plan.`, { featureKey: c.featureKey });
      if (seen.has(c.featureKey)) return fail(422, "DUPLICATE_COMPONENT", `${c.featureKey} appears twice.`, { featureKey: c.featureKey });
      seen.add(c.featureKey);
      const s = service(c.featureKey);
      if (!s) return fail(422, "INVALID_VALUE", `Unknown service ${c.featureKey}.`, { field: "featureKey" });
      if (["OPTIONAL", "SEAT_OPTIONAL"].includes(c.role) && !c.productId) return fail(422, "PRODUCT_REQUIRED", `${s.name} needs a catalog product to be sold as an add-on.`, { featureKey: c.featureKey });
      if (s.usageUnit !== "none" && c.allowanceOverride == null && s.defaultAllowance == null) return fail(422, "ALLOWANCE_REQUIRED", `${s.name} needs an allowance.`, { featureKey: c.featureKey });
    }
    v.components = list.map((c) => ({
      featureKey: c.featureKey,
      role: c.role,
      productId: c.productId ?? null,
      allowanceOverride: c.allowanceOverride ?? null,
      limitOverrides: c.limitOverrides ?? null,
      defaultQuantity: c.defaultQuantity ?? 1,
      maxQuantity: c.maxQuantity ?? null,
      componentDiscountBp: c.componentDiscountBp ?? null,
      marketingLabel: c.marketingLabel ?? null,
    }));
    v.updatedAt = stamp();
    return ok(versionDto(plan, v));
  }

  function publish(plan, v, b, headers) {
    const key = headers["idempotency-key"];
    if (!key) return fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Publishing needs an Idempotency-Key header.");
    if (published.has(key)) return ok(published.get(key));
    if (v.status !== "DRAFT") return fail(409, "NOT_DRAFT", `Version ${v.version} is ${v.status.toLowerCase()}.`);
    if (b.confirmVersion !== v.version) return fail(412, "CONFIRM_MISMATCH", `Type the version number (${v.version}) to confirm.`);
    if (!b.reason || b.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", `Publishing a plan needs a reason of at least ${REASON_MIN} characters.`);
    const pv = preview(plan, v, {});
    const priceCheck = pv.checks.find((c) => c.id === "prices");
    if (priceCheck && !priceCheck.ok) return fail(422, "PLAN_PRICE_MISSING", `${priceCheck.failing[0].featureKey} has no ${priceCheck.failing[0].interval.toLowerCase()} price.`, priceCheck.failing[0]);
    const deps = pv.checks.find((c) => c.id === "deps");
    if (deps && !deps.ok) return fail(422, "PLAN_DEPENDENCY_MISSING", `${deps.failing[0].featureKey} needs ${deps.failing[0].requires}.`, deps.failing[0]);
    if (plan.audience === "ORG" && !v.seatRules?.setupFeeProductId) return fail(422, "SETUP_FEE_REQUIRED", "An organization plan needs a setup fee before it can be published.");
    const margin = pv.checks.find((c) => c.id === "margin");
    if (margin && !margin.ok) {
      const reasonOk = b.overrideReason && b.overrideReason.trim().length >= REASON_MIN;
      if (!reasonOk) {
        const first = margin.failing[0];
        return fail(422, "MARGIN_BELOW_FLOOR", `${first.featureKey} sells below the margin floor.`, { overrideAllowed: true, reasonMissing: !b.overrideReason, ...first, checks: margin.failing });
      }
    }
    const drafts = draftRows(v);
    for (const d of drafts) {
      for (const old of priceRows().filter((p) => p.productId === d.productId && p.interval === d.interval && p.status === "ACTIVE")) old.status = "RETIRED";
      d.status = "ACTIVE";
    }
    for (const other of plan.versions) if (other.status === "PUBLISHED") other.status = "SUPERSEDED";
    v.status = "PUBLISHED";
    v.effectiveFrom = stamp();
    catalogVersion += 1;
    catalogRows.push({ version: catalogVersion, publishedAt: v.effectiveFrom, publishedBy: "demo-admin", summary: `Published ${plan.planKey} v${v.version} (${drafts.length} price row(s))`, snapshotHash: `h${catalogVersion}` });
    plan.status = "PUBLISHED";
    plan.updatedAt = stamp();
    v.updatedAt = stamp();
    const dto = versionDto(plan, v);
    published.set(key, dto);
    return ok(dto);
  }
  const priceRows = () => prices;
  const draftRows = (v) => prices.filter((p) => p.status === "DRAFT" && (p.productId === v.baseProductId || v.components.some((c) => c.productId === p.productId)));

  function compare(plan, a, b) {
    const va = plan.versions.find((v) => v.version === a);
    const vb = plan.versions.find((v) => v.version === b);
    if (!va || !vb) return fail(404, "NOT_FOUND", "No such version.");
    const da = versionDto(plan, va);
    const db = versionDto(plan, vb);
    const diff = [];
    const d = (path, x, y) => JSON.stringify(x) !== JSON.stringify(y) && diff.push({ path, a: x, b: y });
    d("intervals", da.intervals, db.intervals);
    d("annualDiscountBp", da.annualDiscountBp, db.annualDiscountBp);
    d("aiBudgetCapCents", da.aiBudgetCapCents, db.aiBudgetCapCents);
    const pm = (views) => Object.fromEntries((views ?? []).map((p) => [`${p.interval}/${p.currency}`, p.amountMinor]));
    d("baseProduct.prices", pm(da.baseProduct?.prices), pm(db.baseProduct?.prices));
    const ca = new Map(da.components.map((c) => [c.featureKey, c]));
    const cb = new Map(db.components.map((c) => [c.featureKey, c]));
    for (const k of [...new Set([...ca.keys(), ...cb.keys()])].sort()) {
      const x = ca.get(k);
      const y = cb.get(k);
      if (!x || !y) {
        diff.push({ path: `components.${k}`, a: x?.role ?? null, b: y?.role ?? null });
        continue;
      }
      d(`components.${k}.role`, x.role, y.role);
      d(`components.${k}.allowance`, x.allowance, y.allowance);
      d(`components.${k}.maxQuantity`, x.maxQuantity, y.maxQuantity);
      d(`components.${k}.prices`, pm(x.prices), pm(y.prices));
    }
    const by = SUBSCRIBERS[plan.planKey] ?? {};
    const margins = (pl, v) => {
      if (pl.audience !== "INDIVIDUAL" || !v.baseProductId) return {};
      const out = {};
      for (const i of v.intervals.filter((x) => x !== "YEAR")) {
        const pv = preview(pl, v, { interval: i });
        if (pv.worstCase) out[i] = pv.worstCase.marginBp;
      }
      return out;
    };
    return ok({ planKey: plan.planKey, a, b, diff, subscribers: { a: by[a] ?? 0, b: by[b] ?? 0 }, marginByIntervalA: margins(plan, va), marginByIntervalB: margins(plan, vb) });
  }

  // K10.9: the retirement wizard's API lives in mock-retirements.mjs; it reads the plan list and writes RETIRING / RETIRED / PUBLISHED back
  const retirements = createRetirementsState({
    plansOf: () => plans.map((p) => ({ planKey: p.planKey, name: p.name, status: p.status, liveVersion: p.versions.find((v) => v.status === "PUBLISHED")?.version ?? null })),
    setStatus: (key, status) => {
      const pl = find(key);
      if (pl) pl.status = status;
    },
    subscribersOf: (key) => Object.values(SUBSCRIBERS[key] ?? {}).reduce((n, x) => n + x, 0),
  });

  function handle({ method, path, query = new URLSearchParams(), body = {}, headers = {}, admin = true }) {
    if (path === "/mock/retirements/reset" || path === "/mock/retirements/event" || path.startsWith("/api/admin/retirements")) return retirements.handle({ method, path, query, body, admin });
    if (path === "/mock/plans/reset" && method === "POST") {
      retirements.handle({ method: "POST", path: "/mock/retirements/reset" });
      plans = seedPlans();
      prices = PRICES.map((p) => ({ currency: CURRENCY, ...p }));
      catalogVersion = 17;
      published = new Map();
      return ok({ ok: true });
    }
    if (!path.startsWith("/api/admin/plans") && !path.startsWith("/api/admin/catalog")) return null;
    if (!admin) return fail(403, "FORBIDDEN", "Forbidden");
    const seg = path.split("/").filter(Boolean); // api admin plans {key} ...
    if (seg[2] === "plans") {
      if (seg.length === 3) {
        if (method === "GET") return ok(summaries(Object.fromEntries(query)));
        if (method === "POST") {
          if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(body.planKey ?? "")) return fail(422, "KEY_FORMAT", "The plan key is 2 to 40 characters: A-Z, 0-9 and _, starting with a letter.");
          if (find(body.planKey)) return fail(409, "PLAN_KEY_EXISTS", `Plan ${body.planKey} already exists.`);
          if (!body.reason || body.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", "A reason of at least 10 characters is required.");
          const plan = seedPlans()[0];
          Object.assign(plan, { planKey: body.planKey, name: body.name, audience: body.audience, status: "DRAFT", publicPlan: body.publicPlan ?? true, description: body.description ?? null, badge: body.badge ?? null, sortOrder: 99, versions: [] });
          plan.versions.push({ version: 1, status: "DRAFT", intervals: body.audience === "ORG" ? ["MONTH"] : ["MONTH", "QUARTER"], annualDiscountBp: null, aiBudgetCapCents: 0, aiWindows: null, baseProductId: null, components: [], presets: null, seatRules: null, summary: null, effectiveFrom: null, effectiveUntil: null, updatedAt: stamp() });
          plans.push(plan);
          return ok(planDto(plan), 201);
        }
      }
      const plan = find(seg[3]);
      if (!plan) return fail(404, "NOT_FOUND", `No plan ${seg[3]}.`);
      if (seg.length === 4) {
        if (method === "GET") return ok(planDto(plan));
        if (method === "PUT") {
          if (!body.reason || body.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", "A reason of at least 10 characters is required.");
          if (body.expectedUpdatedAt && Date.parse(body.expectedUpdatedAt) !== Date.parse(plan.updatedAt)) return fail(409, "VERSION_CONFLICT", `Plan ${plan.planKey} changed since you opened it.`);
          for (const k of ["name", "description", "badge", "sortOrder", "eligibility"]) if (k in body) plan[k] = body[k];
          if ("publicPlan" in body) plan.publicPlan = body.publicPlan;
          plan.updatedAt = stamp();
          return ok(planDto(plan));
        }
      }
      if (seg[4] === "compare" && method === "GET") return compare(plan, Number(query.get("a")), Number(query.get("b")));
      if (seg[4] === "subscribers" && method === "GET") {
        const by = SUBSCRIBERS[plan.planKey] ?? {};
        const version = query.get("version") ? Number(query.get("version")) : null;
        const total = version ? (by[version] ?? 0) : Object.values(by).reduce((n, x) => n + x, 0);
        return ok({ planKey: plan.planKey, version, total, byVersion: Object.fromEntries(Object.entries(by)), rows: version ? SUBSCRIBER_ROWS.slice(0, Math.min(3, total)) : null, page: Number(query.get("page") ?? 0), size: 50 });
      }
      if (seg[4] === "versions") {
        if (seg.length === 5 && method === "POST") {
          if (plan.versions.some((v) => v.status === "DRAFT")) return fail(409, "DRAFT_EXISTS", `Plan ${plan.planKey} already has a draft version.`);
          if (!body.reason || body.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", "A reason of at least 10 characters is required.");
          const from = plan.versions.find((v) => v.version === (body.from ?? plan.versions.find((x) => x.status === "PUBLISHED")?.version)) ?? plan.versions[plan.versions.length - 1];
          const copy = JSON.parse(JSON.stringify(from));
          Object.assign(copy, { version: Math.max(...plan.versions.map((v) => v.version)) + 1, status: "DRAFT", effectiveFrom: null, effectiveUntil: null, summary: null, updatedAt: stamp() });
          plan.versions.push(copy);
          return ok(versionDto(plan, copy), 201);
        }
        const v = plan.versions.find((x) => x.version === Number(seg[5]));
        if (!v) return fail(404, "NOT_FOUND", `No version ${seg[5]}.`);
        if (seg.length === 6) {
          if (method === "GET") return ok(versionDto(plan, v));
          if (method === "PATCH") return patchVersion(plan, v, body);
        }
        if (seg[6] === "components" && method === "PUT") return putComponents(plan, v, body);
        if (seg[6] === "preview" && method === "GET") return ok(preview(plan, v, Object.fromEntries(query)));
        if (seg[6] === "publish" && method === "POST") return publish(plan, v, body, headers);
        if (seg[6] === "discard" && method === "POST") {
          const bad = needDraft(v);
          if (bad) return bad;
          plan.versions = plan.versions.filter((x) => x !== v);
          if (plan.versions.length === 0) plans = plans.filter((x) => x !== plan);
          return { status: 204, body: null };
        }
      }
      return fail(404, "NOT_FOUND", "No such route.");
    }

    // ---- /api/admin/catalog ----
    if (seg.length === 3 && method === "GET") {
      return ok({ products: PRODUCTS, prices, services: SERVICES, presets: [], tiers: [], floors: { worst: FLOOR_BP }, feeModel: "SIMPLE", catalogVersion });
    }
    if (seg[3] === "services") {
      if (seg.length === 4) {
        const a = query.get("audience");
        const q = (query.get("q") ?? "").toLowerCase();
        return ok(SERVICES.filter((s) => (!a || s.audience === a || s.audience === "BOTH") && (!q || s.name.toLowerCase().includes(q) || s.key.includes(q))));
      }
      if (seg[5] === "dependencies") return ok(DEPENDENCIES[seg[4]] ?? []);
    }
    if (seg[3] === "versions" && method === "GET") return ok(catalogRows);
    if (seg[3] === "prices" && method === "POST") {
      if (!product(body.productId)) return fail(422, "INVALID_VALUE", "Unknown product.", { field: "productId" });
      if (!Number.isInteger(body.amountMinor) || body.amountMinor < 0) return fail(422, "INVALID_VALUE", "amountMinor is a whole number of cents.", { field: "amountMinor" });
      prices = prices.filter((p) => !(p.productId === body.productId && p.interval === body.interval && p.status === "DRAFT"));
      const row = { id: nextPriceId++, productId: body.productId, interval: body.interval, currency: body.currency ?? CURRENCY, amountMinor: body.amountMinor, status: "DRAFT" };
      prices.push(row);
      for (const pl of plans) for (const v of pl.versions) if (v.status === "DRAFT" && (v.baseProductId === row.productId || v.components.some((c) => c.productId === row.productId))) v.updatedAt = stamp();
      return ok({ ...row, productCode: product(row.productId)?.code, audience: body.audience, status: "DRAFT", active: false }, 201);
    }
    if (seg[3] === "margin" && method === "GET") {
      const amount = Number(query.get("amountMinor"));
      const ai = Number(query.get("aiBudgetCents") ?? 0);
      if (!Number.isFinite(amount)) return fail(400, "INVALID_VALUE", "amountMinor is required.");
      const mb = marginBp(amount, ai);
      const passes = mb >= FLOOR_BP;
      const min = passes ? null : minPriceFor(ai);
      return ok({
        worst: { marginBp: mb, costMinor: ai + fee(amount), feeMinor: fee(amount), aiMinor: ai, lines: [] },
        typical: null,
        floorBp: FLOOR_BP,
        ok: passes,
        headroomBp: mb - FLOOR_BP,
        levers: passes ? null : { minPriceMinor: min, maxAiBudgetCents: Math.max(0, amount - fee(amount) - Math.ceil((amount * FLOOR_BP) / 10000)), maxDiscountBp: null },
        code: passes ? null : "MARGIN_BELOW_FLOOR",
        overridable: true,
      });
    }
    return fail(404, "NOT_FOUND", "No such route.");
  }

  return { handle };
}

/** The http adapter: `createPlansMock({ json, withBody, subOf, isAdmin })(req, res, path, method)` answers true when it handled the request. `isAdmin(login)`. */
export function createPlansMock({ json, withBody, subOf, isAdmin }) {
  const state = createPlansState();
  return (req, res, path, method) => {
    if (!path.startsWith("/api/admin/plans") && !path.startsWith("/api/admin/catalog") && !path.startsWith("/api/admin/retirements") && !path.startsWith("/mock/retirements") && path !== "/mock/plans/reset") return false;
    const sub = subOf(req);
    if (!sub && path !== "/mock/plans/reset" && !path.startsWith("/mock/retirements")) {
      req.resume();
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const url = new URL(req.url ?? "/", "http://mock");
    const run = (body) => {
      const out = state.handle({ method, path, query: url.searchParams, body, headers: req.headers, admin: path === "/mock/plans/reset" || path.startsWith("/mock/retirements") || isAdmin(sub) });
      if (!out) return json(res, 404, { code: "NOT_FOUND" });
      if (out.status === 204) {
        res.writeHead(204);
        return res.end();
      }
      return json(res, out.status, out.body);
    };
    if (method === "GET" || method === "HEAD") run({});
    else withBody(req, run);
    return true;
  };
}
