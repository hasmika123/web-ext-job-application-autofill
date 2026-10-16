/**
 * The subscription module's customer API mock (K5.1 / K5.3 / K5.5 / K5.6 / K9.4), in memory, DEV ONLY. It answers the routes the web calls, with the shapes of
 * docs/subscriptions/09-apis.md, so /pricing, checkout, the success page and /settings/plan can be tried without MySQL or Stripe:
 *
 *   GET  /api/catalog/public                public catalog (FREE, PRO, AUTOPILOT; add-ons with prices at MONTH / QUARTER / YEAR; precomputed totals)
 *   POST /api/billing/quotes                CHECKOUT, CHANGE (add-ons, plus interval / plan switch), or anonymous
 *   GET  /api/billing/quotes/{id}
 *   POST /api/billing/quotes/{id}/checkout  "pays" at once: the mock activates the subscription and returns a same-site success URL
 *   POST /api/billing/quotes/{id}/confirm   needs an Idempotency-Key UUID; same key returns the same batch
 *   DELETE /api/billing/changes/{id}        undo a scheduled removal
 *   GET  /api/billing/me                    plan v3 once subscribed (otherwise falls through to the main mock's Free body)
 *   GET  /api/billing/invoices, GET /api/entitlements/me
 *   POST /mock/billing/reset | /mock/billing/stale   back to Free | the next checkout / confirm answers 409 QUOTE_STALE once
 *
 * Env: MOCK_SUB=pro seeds a Pro monthly subscription with 2 Extra AI credits; MOCK_ANNUAL=0 turns the yearly tab off; MOCK_CATALOG=none publishes no
 * plan (the pricing page then shows today's static cards). The real API is the truth; keep this in step with it.
 */
const CURRENCY = "USD";
const DAY = 86_400_000;
const INTERVALS = ["MONTH", "QUARTER", "YEAR"];
const MONTHS = { MONTH: 1, QUARTER: 3, YEAR: 12 };
const ANNUAL = process.env.MOCK_ANNUAL !== "0";
const NO_CATALOG = process.env.MOCK_CATALOG === "none";

const ADDONS = {
  "ai.credits_extra": { name: "Extra AI credits", description: "More Kiwiply AI for the period.", max: 5, prices: { MONTH: 499, QUARTER: 1299, YEAR: 5389 } },
  "resumes.extra_10": { name: "Extra resumes +10", description: "Ten more saved resumes.", max: 5, prices: { MONTH: 199, QUARTER: 519, YEAR: 2149 } },
  "ai.deep_tailor": { name: "Deep tailoring", description: "Needs Extra AI credits.", max: 1, prices: { MONTH: 699, QUARTER: 1799, YEAR: 7549 }, requires: "ai.credits_extra" },
};

const PLANS = {
  FREE: { name: "Free", description: "Everything you need to apply.", prices: {}, included: ["Autofill on every ATS", "Board, capture and profile", "3 resumes, AI-parsed"], optional: [] },
  PRO: {
    name: "Pro",
    badge: "Most popular",
    description: "Kiwiply AI does the heavy lifting.",
    prices: { MONTH: 1999, QUARTER: 4999, YEAR: 21589 },
    included: ["Kiwiply AI autofill", "AI tailors and scores resumes", "Inbox updates your board", "Daily job matches", "25 saved resumes"],
    optional: ["ai.credits_extra", "resumes.extra_10", "ai.deep_tailor"],
  },
  AUTOPILOT: {
    name: "Autopilot",
    description: "Pick jobs. Kiwiply prepares them. You submit.",
    prices: { MONTH: 3999, QUARTER: 9999, YEAR: 43189 },
    included: ["Everything in Pro", "Prepares 300 applications a month", "50 saved resumes"],
    optional: ["ai.credits_extra", "resumes.extra_10"],
  },
};

const featureKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

/** The price object of an interval, with the monthly equivalent and savings on QUARTER / YEAR (what the real catalog sends). */
function priceObj(prices, interval) {
  const amount = prices[interval];
  if (amount == null) return undefined;
  if (interval === "MONTH") return { amountMinor: amount };
  const months = MONTHS[interval];
  const monthlyEquivalentMinor = Math.round(amount / months);
  const savingsMinor = Math.max(0, prices.MONTH * months - amount);
  return { amountMinor: amount, monthlyEquivalentMinor, savingsMinor, savingsBp: Math.round((savingsMinor / (prices.MONTH * months)) * 10000) };
}

function planIntervals(plan) {
  return INTERVALS.filter((i) => plan.prices[i] != null && (i !== "YEAR" || ANNUAL));
}

function basketKey(sel) {
  return Object.keys(sel)
    .filter((k) => sel[k] > 0)
    .sort()
    .map((k) => `${k}:${sel[k]}`)
    .join(",");
}

function priceBasket(planKey, interval, addons) {
  const plan = PLANS[planKey];
  let total = plan.prices[interval];
  for (const [k, q] of Object.entries(addons)) total += ADDONS[k].prices[interval] * q;
  return total;
}

function buildCatalog() {
  if (NO_CATALOG) return { catalogVersion: 1, currency: CURRENCY, intervals: [], annualEnabled: ANNUAL, plans: [], totals: {} };
  const totals = {};
  const plans = Object.entries(PLANS).map(([planKey, p]) => {
    const intervals = planIntervals(p);
    const prices = {};
    for (const i of intervals) prices[i] = priceObj(p.prices, i);
    const optional = p.optional.map((k) => {
      const a = ADDONS[k];
      const ap = {};
      for (const i of intervals) ap[i] = priceObj(a.prices, i);
      return { featureKey: k, name: a.name, description: a.description, maxQuantity: a.max, prices: ap };
    });
    // totals for one or two add-ons at quantity 1..2 (the real endpoint precomputes up to billing.plan.max_optional_addons)
    totals[planKey] = {};
    for (const i of intervals) {
      const row = {};
      const keys = p.optional;
      for (const a of keys) for (const q of [1, 2]) row[`${a}:${q}`] = priceBasket(planKey, i, { [a]: q });
      for (let x = 0; x < keys.length; x++)
        for (let y = x + 1; y < keys.length; y++) row[basketKey({ [keys[x]]: 1, [keys[y]]: 1 })] = priceBasket(planKey, i, { [keys[x]]: 1, [keys[y]]: 1 });
      totals[planKey][i] = row;
    }
    return {
      planKey,
      name: p.name,
      badge: p.badge ?? null,
      description: p.description,
      intervals,
      prices,
      included: p.included.map((n) => ({ featureKey: featureKey(n), name: n })),
      optional,
      sunset: false,
    };
  });
  return {
    catalogVersion: 17,
    currency: CURRENCY,
    intervals: INTERVALS.filter((i) => i !== "YEAR" || ANNUAL),
    annualEnabled: ANNUAL,
    consentText: "By continuing you agree to the Terms and that your subscription renews automatically until you cancel.",
    plans,
    totals,
  };
}

export function createBillingMock({ json, withBody }) {
  const quotes = new Map();
  const batches = new Map();
  let nextQuote = 900;
  let nextChange = 50;
  let staleOnce = false;
  let sub = null;

  const seed = () => {
    sub = null;
    quotes.clear();
    batches.clear();
    if (process.env.MOCK_SUB === "pro") {
      const now = Date.now();
      sub = { planKey: "PRO", interval: "MONTH", addons: { "ai.credits_extra": 2 }, periodStart: now - 10 * DAY, periodEnd: now + 20 * DAY, pending: [], scheduled: null, cancelAtPeriodEnd: false };
    }
  };
  seed();

  const problem = (res, status, code, extra = {}) => json(res, status, { code, title: code, status, ...extra });
  const authed = (req) => !!req.headers.authorization;

  const lineFor = (planKey, interval, key, qty) => {
    if (key == null) {
      const p = PLANS[planKey];
      return { featureKey: null, kind: "BASE", name: p.name, quantity: 1, unitListMinor: p.prices[interval], unitEffectiveMinor: p.prices[interval], lineTotalMinor: p.prices[interval] };
    }
    const a = ADDONS[key];
    return { featureKey: key, kind: "ADDON", name: a.name, quantity: qty, unitListMinor: a.prices[interval], unitEffectiveMinor: a.prices[interval], lineTotalMinor: a.prices[interval] * qty };
  };

  const basketOf = (planKey, interval, addons) => {
    const lines = [lineFor(planKey, interval, null, 1)];
    for (const k of Object.keys(addons).sort()) if (addons[k] > 0) lines.push(lineFor(planKey, interval, k, addons[k]));
    const recurringMinor = priceBasket(planKey, interval, addons);
    const b = { lines, recurringMinor };
    if (interval !== "MONTH") {
      const baseMonthly = PLANS[planKey].prices.MONTH;
      let monthlyAll = baseMonthly;
      for (const [k, q] of Object.entries(addons)) monthlyAll += ADDONS[k].prices.MONTH * q;
      const months = MONTHS[interval];
      b.monthlyEquivalentMinor = Math.round(recurringMinor / months);
      b.savingsMinor = Math.max(0, monthlyAll * months - recurringMinor);
      b.savingsBp = monthlyAll ? Math.round((b.savingsMinor / (monthlyAll * months)) * 10000) : 0;
    } else {
      b.monthlyEquivalentMinor = recurringMinor;
      b.savingsMinor = 0;
      b.savingsBp = 0;
    }
    return b;
  };

  /** Effective quantities now: pending removals do not take effect until the period end. */
  const effectiveAddons = () => {
    const out = { ...sub.addons };
    for (const c of sub.pending) if (c.status === "PENDING") out[c.featureKey] = c.quantityTo;
    for (const k of Object.keys(out)) if (out[k] <= 0) delete out[k];
    return out;
  };

  /** True when it already answered with a problem (the caller then returns). */
  const validateBasket = (res, planKey, interval, addons) => {
    const fail = (status, code, extra) => (problem(res, status, code, extra), true);
    const plan = PLANS[planKey];
    if (!plan || !Object.keys(plan.prices).length) return fail(422, "PLAN_NOT_SELLABLE", { planKey });
    if (!planIntervals(plan).includes(interval)) return fail(422, "INTERVAL_NOT_AVAILABLE", { interval });
    for (const [k, q] of Object.entries(addons)) {
      if (!plan.optional.includes(k)) return fail(422, "ADDON_NOT_IN_PLAN", { featureKey: k });
      if (q > ADDONS[k].max) return fail(422, "QUANTITY_LIMIT", { max: ADDONS[k].max });
    }
    return false;
  };

  const iso = (ms) => new Date(ms).toISOString();

  function handle(req, res, path, method) {
    if (method === "GET" && path === "/api/catalog/public") return json(res, 200, buildCatalog()), true;

    if (method === "POST" && path === "/mock/billing/reset") return seed(), json(res, 200, { ok: true }), true;
    if (method === "POST" && path === "/mock/billing/stale") return (staleOnce = true), json(res, 200, { ok: true }), true;

    if (method === "GET" && path === "/api/billing/me") {
      if (!sub) return false;
      const eff = effectiveAddons();
      const addons = Object.entries(sub.addons).map(([k, q]) => {
        const pend = sub.pending.find((c) => c.featureKey === k && c.status === "PENDING");
        const a = { featureKey: k, name: ADDONS[k].name, quantity: q, unitMinor: ADDONS[k].prices[sub.interval] };
        if (pend && pend.quantityTo === 0) a.endsAt = iso(pend.effectiveAt);
        else if (pend) a.pendingQuantity = pend.quantityTo;
        return a;
      });
      return (
        json(res, 200, {
          plan: "PRO",
          status: "active",
          currentPeriodEnd: iso(sub.periodEnd),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          billingEnabled: true,
          hasCustomer: true,
          planKey: sub.planKey,
          planVersion: 2,
          planName: PLANS[sub.planKey].name,
          interval: sub.interval,
          currency: CURRENCY,
          currentPeriodStart: iso(sub.periodStart),
          recurringMinor: priceBasket(sub.planKey, sub.interval, eff),
          addons,
          features: [...PLANS[sub.planKey].included.map(featureKey), ...Object.keys(sub.addons)],
          pendingChanges: sub.pending
            .filter((c) => c.status === "PENDING")
            .map((c) => ({ id: c.id, kind: c.kind, featureKey: c.featureKey, quantityFrom: c.quantityFrom, quantityTo: c.quantityTo, effectiveAt: iso(c.effectiveAt), status: c.status })),
        }),
        true
      );
    }

    if (method === "GET" && path === "/api/entitlements/me") {
      if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED"), true;
      if (!sub) return json(res, 200, { planKey: "FREE", features: [], state: "FREE" }), true;
      const eff = effectiveAddons();
      const extraResumes = (eff["resumes.extra_10"] ?? 0) * 10;
      const credits = eff["ai.credits_extra"] ?? 0;
      const resets = iso(sub.periodEnd);
      return (
        json(res, 200, {
          planKey: sub.planKey,
          planVersion: 2,
          interval: sub.interval,
          periodStart: iso(sub.periodStart),
          periodEnd: resets,
          aiPct: 72,
          state: "ACTIVE",
          features: [
            { featureKey: "ai.budget", name: "AI budget", source: "PLAN", quantity: 1, allowance: 100 + credits * 50, used: 72, remaining: 28 + credits * 50, resetsAt: resets },
            { featureKey: "resumes.max", name: "Resumes", source: "PLAN", quantity: 1, allowance: 25 + extraResumes, used: 21, remaining: 4 + extraResumes },
            { featureKey: "tailor.runs", name: "Tailorings", source: "PLAN", quantity: 1, allowance: 40, used: 13, remaining: 27, resetsAt: resets },
            { featureKey: "matches.daily", name: "Matches today", source: "PLAN", quantity: 1, allowance: 20, used: 18, remaining: 2 },
            ...Object.entries(sub.addons).map(([k, q]) => ({ featureKey: k, name: ADDONS[k].name, source: "ADDON", quantity: q })),
          ],
        }),
        true
      );
    }

    if (method === "GET" && path === "/api/billing/invoices") {
      if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED"), true;
      if (!sub) return json(res, 200, []), true;
      const total = priceBasket(sub.planKey, sub.interval, effectiveAddons());
      const mk = (n, startMs, endMs) => ({
        number: `KIWI-000${n}`,
        status: "paid",
        amountPaidMinor: total,
        currency: CURRENCY,
        periodStart: iso(startMs),
        periodEnd: iso(endMs),
        paidAt: iso(startMs),
        hostedUrl: "https://invoice.stripe.com/mock",
        pdfUrl: "https://invoice.stripe.com/mock.pdf",
        lines: [
          { kind: "BASE", description: PLANS[sub.planKey].name, quantity: 1, unitAmountMinor: PLANS[sub.planKey].prices[sub.interval], amountMinor: PLANS[sub.planKey].prices[sub.interval], proration: false },
          ...Object.entries(effectiveAddons()).map(([k, q]) => ({ kind: "ADDON", description: ADDONS[k].name, quantity: q, unitAmountMinor: ADDONS[k].prices[sub.interval], amountMinor: ADDONS[k].prices[sub.interval] * q, proration: false })),
        ],
      });
      const span = sub.periodEnd - sub.periodStart;
      return json(res, 200, [mk(2, sub.periodStart, sub.periodEnd), mk(1, sub.periodStart - span, sub.periodStart)]), true;
    }

    if (method === "POST" && path === "/api/billing/quotes") {
      withBody(req, (b) => {
        const anonymous = b.anonymous === true;
        if (!anonymous && !authed(req)) return problem(res, 401, "UNAUTHENTICATED");
        const kind = (b.kind ?? "CHECKOUT").toUpperCase();
        const addons = {};
        for (const a of b.addons ?? []) if ((a.quantity ?? 1) > 0) addons[a.featureKey] = (addons[a.featureKey] ?? 0) + (a.quantity ?? 1);
        const now = Date.now();
        const base = { quoteId: nextQuote++, status: "OPEN", createdAt: iso(now), expiresAt: iso(now + 15 * 60_000), currency: CURRENCY, catalogVersion: 17, taxNote: "Taxes are calculated by Stripe at invoice time where applicable.", warnings: [] };

        if (kind === "CHANGE") {
          if (anonymous) return problem(res, 400, "INVALID_KIND");
          if (!sub) return problem(res, 409, "NO_SUBSCRIPTION");
          const planKey = (b.planKey ?? sub.planKey).toUpperCase();
          const interval = b.interval ?? sub.interval;
          const bad = validateBasket(res, planKey, interval, addons);
          if (bad) return;
          const cur = effectiveAddons();
          for (const k of new Set([...Object.keys(cur), ...Object.keys(addons)])) {
            const pend = sub.pending.find((c) => c.featureKey === k && c.status === "PENDING");
            if (pend && (addons[k] ?? 0) !== (cur[k] ?? 0)) return problem(res, 409, "REMOVAL_PENDING", { featureKey: k });
          }
          const planChange = planKey !== sub.planKey;
          const intervalChange = interval !== sub.interval;
          const same = basketKey(addons) === basketKey(cur);
          if (same && !planChange && !intervalChange) return problem(res, 422, "NO_CHANGE");
          const current = basketOf(sub.planKey, sub.interval, cur);
          const proposed = basketOf(planKey, interval, addons);
          const remaining = Math.max(0, Math.min(1, (sub.periodEnd - now) / (sub.periodEnd - sub.periodStart)));
          const additions = [];
          const removals = [];
          for (const k of new Set([...Object.keys(cur), ...Object.keys(addons)])) {
            const from = cur[k] ?? 0;
            const to = addons[k] ?? 0;
            if (to > from) additions.push({ featureKey: k, name: ADDONS[k].name, quantityFrom: from, quantityTo: to, unitEffectiveMinor: ADDONS[k].prices[interval], prorationMinor: Math.round(ADDONS[k].prices[interval] * (to - from) * remaining) });
            if (to < from) removals.push({ featureKey: k, quantityFrom: from, quantityTo: to, effectiveAt: iso(sub.periodEnd), note: `works until ${new Date(sub.periodEnd).toDateString().slice(4, 10)} - no refund` });
          }
          const upgrade = planChange && PLANS[planKey].prices.MONTH > PLANS[sub.planKey].prices.MONTH;
          let proration = additions.reduce((s, a) => s + a.prorationMinor, 0);
          if (upgrade && !intervalChange) proration += Math.round((PLANS[planKey].prices[interval] - PLANS[sub.planKey].prices[interval]) * remaining);
          const atPeriodEnd = intervalChange || (planChange && !upgrade);
          const q = {
            ...base,
            kind: "CHANGE",
            plan: { planKey, version: 2, name: PLANS[planKey].name },
            interval,
            intervalChange: intervalChange ? { from: sub.interval, to: interval, effectiveAt: "period end" } : null,
            current,
            proposed,
            deltaMinor: proposed.recurringMinor - current.recurringMinor,
            additions,
            removals,
            requiresConfirmation: [],
            autoAdded: [],
            prorationEstimateMinor: atPeriodEnd ? 0 : proration,
            nextInvoiceEstimateMinor: proposed.recurringMinor,
            nextInvoiceAt: iso(sub.periodEnd),
            effectiveAt: atPeriodEnd ? iso(sub.periodEnd) : "now",
            inputsHash: `h${base.quoteId}`,
            _target: { planKey, interval, addons },
          };
          quotes.set(q.quoteId, q);
          const { _target, ...pub } = q;
          void _target;
          return json(res, 200, pub);
        }

        // CHECKOUT / anonymous
        if (!anonymous && sub) return problem(res, 409, "ALREADY_SUBSCRIBED");
        const planKey = (b.planKey ?? "").toUpperCase();
        const interval = b.interval ?? "MONTH";
        const bad = validateBasket(res, planKey, interval, addons);
        if (bad) return;
        const confirmed = b.confirmedCommercialDeps ?? [];
        const needs = [];
        for (const k of Object.keys(addons)) {
          const req_ = ADDONS[k].requires;
          if (req_ && !addons[req_] && !confirmed.includes(req_)) needs.push({ featureKey: k, requires: req_, kind: "COMMERCIAL", priceMinor: ADDONS[req_].prices[interval], name: ADDONS[req_].name });
        }
        const finalAddons = { ...addons };
        for (const k of confirmed) if (ADDONS[k] && !finalAddons[k]) finalAddons[k] = 1;
        const proposed = basketOf(planKey, interval, finalAddons);
        const q = {
          ...base,
          kind: anonymous ? "ANONYMOUS" : "CHECKOUT",
          plan: { planKey, version: 2, name: PLANS[planKey].name },
          interval,
          intervalChange: null,
          current: null,
          proposed,
          deltaMinor: proposed.recurringMinor,
          additions: [],
          removals: [],
          requiresConfirmation: needs,
          autoAdded: confirmed,
          prorationEstimateMinor: 0,
          nextInvoiceEstimateMinor: proposed.recurringMinor,
          nextInvoiceAt: iso(now + MONTHS[interval] * 30 * DAY),
          effectiveAt: "now",
          inputsHash: `h${base.quoteId}`,
          _target: { planKey, interval, addons: finalAddons },
        };
        quotes.set(q.quoteId, q);
        const { _target, ...pub } = q;
        void _target;
        return json(res, 200, pub);
      });
      return true;
    }

    let m = path.match(/^\/api\/billing\/quotes\/(\d+)$/);
    if (m && method === "GET") {
      if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED"), true;
      const q = quotes.get(Number(m[1]));
      if (!q) return problem(res, 404, "NOT_FOUND"), true;
      if (Date.parse(q.expiresAt) < Date.now()) return problem(res, 410, "QUOTE_EXPIRED"), true;
      const { _target, ...pub } = q;
      void _target;
      return json(res, 200, pub), true;
    }

    m = path.match(/^\/api\/billing\/quotes\/(\d+)\/checkout$/);
    if (m && method === "POST") {
      withBody(req, () => {
        if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED");
        const q = quotes.get(Number(m[1]));
        if (!q || q.kind !== "CHECKOUT") return problem(res, q ? 422 : 404, q ? "INVALID_KIND" : "NOT_FOUND");
        if (Date.parse(q.expiresAt) < Date.now()) return problem(res, 410, "QUOTE_EXPIRED");
        if (sub) return problem(res, 409, "ALREADY_SUBSCRIBED");
        if (staleOnce) {
          staleOnce = false;
          // the price moved: hand back a fresh quote id by expiring this one the way the API does
          q.status = "STALE";
          return problem(res, 409, "QUOTE_STALE", { reason: "PRICES_CHANGED" });
        }
        const t = q._target;
        const now = Date.now();
        sub = { planKey: t.planKey, interval: t.interval, addons: { ...t.addons }, periodStart: now, periodEnd: now + MONTHS[t.interval] * 30 * DAY, pending: [], scheduled: null, cancelAtPeriodEnd: false };
        q.status = "APPLIED";
        return json(res, 200, { url: "/billing/success?return_to=%2Fsettings%2Fplan" });
      });
      return true;
    }

    m = path.match(/^\/api\/billing\/quotes\/(\d+)\/confirm$/);
    if (m && method === "POST") {
      withBody(req, () => {
        if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED");
        const key = req.headers["idempotency-key"];
        if (!key || !/^[0-9a-f-]{36}$/i.test(String(key))) return problem(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
        if (batches.has(key)) return json(res, 200, batches.get(key));
        const q = quotes.get(Number(m[1]));
        if (!q || q.kind !== "CHANGE" || !sub) return problem(res, q ? 422 : 404, q ? "INVALID_KIND" : "NOT_FOUND");
        if (Date.parse(q.expiresAt) < Date.now()) return problem(res, 410, "QUOTE_EXPIRED");
        if (sub.cancelAtPeriodEnd) return problem(res, 409, "CANCEL_PENDING");
        if (staleOnce) {
          staleOnce = false;
          return problem(res, 409, "QUOTE_STALE", { reason: "SUBSCRIPTION_CHANGED" });
        }
        const t = q._target;
        const changes = [];
        const cur = effectiveAddons();
        for (const k of new Set([...Object.keys(cur), ...Object.keys(t.addons)])) {
          const from = cur[k] ?? 0;
          const to = t.addons[k] ?? 0;
          if (to > from) {
            sub.addons[k] = to;
            const add = q.additions.find((a) => a.featureKey === k);
            changes.push({ id: nextChange++, kind: from === 0 ? "ADD" : "INCREASE", featureKey: k, quantityFrom: from, quantityTo: to, effectiveAt: iso(Date.now()), prorationMinor: add?.prorationMinor ?? 0, status: "APPLIED" });
          } else if (to < from) {
            const c = { id: nextChange++, kind: to === 0 ? "REMOVE" : "DECREASE", featureKey: k, quantityFrom: from, quantityTo: to, effectiveAt: sub.periodEnd, prorationMinor: 0, status: "PENDING" };
            sub.pending.push(c);
            changes.push({ ...c, effectiveAt: iso(c.effectiveAt) });
          }
        }
        if (t.planKey !== sub.planKey || t.interval !== sub.interval) {
          if (q.effectiveAt === "now") {
            sub.planKey = t.planKey;
            changes.push({ id: nextChange++, kind: "PLAN_SWITCH", featureKey: null, effectiveAt: iso(Date.now()), prorationMinor: q.prorationEstimateMinor, status: "APPLIED" });
          } else {
            sub.scheduled = { planKey: t.planKey, interval: t.interval, at: sub.periodEnd };
            changes.push({ id: nextChange++, kind: t.interval !== sub.interval ? "INTERVAL_SWITCH" : "PLAN_SWITCH", featureKey: null, effectiveAt: q.effectiveAt, prorationMinor: 0, status: "PENDING" });
          }
        }
        q.status = "APPLIED";
        const batch = { batchId: String(key), changes, proposedRecurringMinor: q.proposed.recurringMinor, nextInvoiceAt: q.nextInvoiceAt };
        batches.set(key, batch);
        return json(res, 200, batch);
      });
      return true;
    }

    m = path.match(/^\/api\/billing\/changes\/(\d+)$/);
    if (m && method === "DELETE") {
      if (!authed(req)) return problem(res, 401, "UNAUTHENTICATED"), true;
      const id = Number(m[1]);
      const c = sub?.pending.find((x) => x.id === id);
      if (!c) return problem(res, 404, "NOT_FOUND"), true;
      if (c.status !== "PENDING") return problem(res, 409, "NOT_PENDING"), true;
      c.status = "CANCELLED";
      return json(res, 200, { id, kind: c.kind, featureKey: c.featureKey, quantityFrom: c.quantityFrom, quantityTo: c.quantityTo, effectiveAt: iso(c.effectiveAt), prorationMinor: 0, status: "CANCELLED" }), true;
    }

    return false;
  }
  return handle;
}
