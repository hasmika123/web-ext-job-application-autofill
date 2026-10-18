/**
 * The admin plan-retirement API mock (K10.9), in memory, DEV ONLY. Mounted by mock-plans.mjs (it needs the plan list and writes the plan's
 * RETIRING status back). The paths and shapes are the web's reading of docs/subscriptions/11-plan-retirement.md until sub-retire-api publishes
 * "API contract as built"; keep web/src/lib/admin-retirements.ts and this file in step with it.
 *
 *   GET  /api/admin/retirements?planKey&status                    [{ id, planKey, status, startedAt, pending, total }]
 *   POST /api/admin/retirements                                   start (HIGH): 422 NOTICE_TOO_SHORT, PRICE_INCREASE_REQUIRES_CONSENT, REASON_REQUIRED,
 *                                                                  CONFIRM_MISMATCH; 409 RETIREMENT_EXISTS, 404
 *   GET  /api/admin/retirements/coverage?planKey&successors       impact + per-successor coverage + the wizard defaults
 *   GET  /api/admin/retirements/notices/preview?planKey&outcome&successor&message
 *   GET  /api/admin/retirements/{id}                              detail (counts, MRR retained / at risk, decisions over time)
 *   GET  /api/admin/retirements/{id}/items?status&interval&page   rows
 *   POST /api/admin/retirements/{id}/cancel | close               HIGH
 *   POST /api/admin/retirements/{id}/items/{item}/resend | exclude
 *   POST /mock/retirements/event   { id, kind: "switched" | "cancelled" | "fell_back" }  moves one pending item (so the progress tiles can be watched)
 *   POST /mock/retirements/reset
 *
 * Fixture: retiring PRO (212 subscribers on v1, 180 monthly and 32 quarterly, 0 yearly, MRR $4,238.88). Under PRO_STUDENT 198 are fully covered, 14 have
 * gaps and 9 would pay more; under AUTOPILOT everyone is covered and everyone would pay more.
 */
const CURRENCY = "USD";
const MIN_NOTICE_DAYS = 30;
const DAY = 86_400_000;
const REASON_MIN = 20;

const DEFAULTS = {
  minNoticeDays: MIN_NOTICE_DAYS,
  noticeScheduleDays: [60, 30, 7, 1],
  channels: ["EMAIL", "IN_APP"],
  availableChannels: ["EMAIL", "IN_APP", "PUSH"],
  allowedOutcomes: ["FREE", "MIGRATE_AT_RENEWAL", "CANCEL"],
  noticeDayMin: 1,
  noticeDayMax: 120,
  messageMax: 2000,
  reasonMin: REASON_MIN,
};

const COVERAGE = {
  PRO_STUDENT: { fullyCovered: 198, withGaps: 14, wouldPayMore: 9, gapFeatures: [{ featureKey: "autopilot.prepare", name: "Autopilot prepare", subscribers: 9 }, { featureKey: "support.priority", name: "Priority support", subscribers: 5 }] },
  AUTOPILOT: { fullyCovered: 212, withGaps: 0, wouldPayMore: 212, gapFeatures: [] },
  FREE: { fullyCovered: 31, withGaps: 181, wouldPayMore: 0, gapFeatures: [{ featureKey: "ai.tailoring", name: "AI resume tailoring", subscribers: 174 }, { featureKey: "inbox.monitor", name: "Inbox monitoring", subscribers: 120 }] },
};

const LOGINS = ["priya.nair", "sam.lee", "alex.cho", "mina.park", "dev.patel", "rosa.diaz", "omar.haddad", "lena.fox", "tom.okafor", "ivy.chen", "ben.ross", "ana.silva"];

const iso = (ms) => new Date(ms).toISOString();
const ok = (body, status = 200) => ({ status, body });
const fail = (status, code, error, extra = {}) => ({ status, body: { status, code, title: error, detail: error, message: "error.retirement", ...extra } });

export function createRetirementsState({ plansOf, setStatus, subscribersOf, now = () => Date.now() }) {
  let retirements = [];
  let nextId = 7;

  const planOf = (key) => plansOf().find((p) => p.planKey === key);
  const subs = (key) => subscribersOf(key);

  function impactFor(key) {
    // the PRO fixture is the 212 people still on v1 (the plan builder fixture also holds 1,038 on v2, who are not being retired)
    const total = key === "PRO" ? 212 : subs(key);
    // the PRO fixture is exact; any other plan splits 85 / 15 monthly / quarterly at $19.99 for a plausible MRR
    const monthly = key === "PRO" ? 180 : Math.round(total * 0.85);
    const quarterly = total - monthly;
    const mrr = key === "PRO" ? 423888 : monthly * 1999 + Math.round((quarterly * 4999) / 3);
    const t = now();
    return {
      subscribers: total,
      mrrMinor: mrr,
      currency: CURRENCY,
      byInterval: { MONTH: monthly, QUARTER: quarterly, YEAR: 0 },
      withAddons: Math.round(total * 0.18),
      earliestEffectiveAt: total ? iso(t + 30 * DAY) : null,
      latestEffectiveAt: total ? iso(t + 87 * DAY) : null,
    };
  }

  function coverageFor(key, successorKeys) {
    const p = planOf(key);
    if (!p) return null;
    return {
      planKey: key,
      planName: p.name,
      planVersion: p.liveVersion ?? 1,
      impact: impactFor(key),
      successors: successorKeys.map((k) => {
        const sp = planOf(k);
        const c = COVERAGE[k] ?? { fullyCovered: subs(key), withGaps: 0, wouldPayMore: 0, gapFeatures: [] };
        return { planKey: k, name: sp?.name ?? k, sellable: !!sp && sp.status === "PUBLISHED", ...c };
      }),
      defaults: DEFAULTS,
    };
  }

  function seedItems(r) {
    const total = r.total;
    const items = [];
    const t = now();
    for (let i = 0; i < Math.min(total, 60); i += 1) {
      const interval = i % 6 === 5 ? "QUARTER" : "MONTH";
      const periodEnd = t + (31 + ((i * 7) % 57)) * DAY;
      items.push({
        id: r.id * 1000 + i,
        login: `${LOGINS[i % LOGINS.length]}${i >= LOGINS.length ? i : ""}`,
        scope: "PERSONAL",
        orgName: null,
        interval,
        periodEnd: iso(periodEnd),
        effectiveAt: iso(periodEnd),
        status: "PENDING",
        successorName: r.successors[0]?.name ?? null,
        lastNoticeDays: null,
        deltaMinor: r.defaultOutcome === "FREE" ? null : 0,
        currency: CURRENCY,
        uses: i % 3 === 0 ? ["AI tailoring", "Inbox"] : ["AI tailoring"],
      });
    }
    return items;
  }

  function counts(r) {
    const c = { pending: 0, switchedNow: 0, switchScheduled: 0, cancelled: 0, fellBack: 0, migrated: 0, excluded: 0 };
    const map = { PENDING: "pending", SWITCHED_NOW: "switchedNow", SWITCH_SCHEDULED: "switchScheduled", CANCELLED: "cancelled", FELL_BACK: "fellBack", MIGRATED: "migrated", EXCLUDED: "excluded" };
    // the listed rows are a sample; the remainder of the cohort is pending
    const sampled = r.items.length;
    for (const it of r.items) c[map[it.status]] += 1;
    c.pending += r.total - sampled;
    return c;
  }

  function detail(r) {
    const c = counts(r);
    const acted = c.switchedNow + c.switchScheduled + c.cancelled + c.fellBack + c.migrated;
    const perSub = r.total ? r.impact.mrrMinor / r.total : 0;
    const retained = Math.round(perSub * (c.switchedNow + c.switchScheduled + c.migrated));
    const atRisk = Math.round(perSub * c.pending);
    return {
      id: r.id,
      planKey: r.planKey,
      planName: r.planName,
      planVersion: r.planVersion,
      status: r.status,
      mode: r.mode,
      defaultOutcome: r.defaultOutcome,
      reason: r.reason,
      startedAt: r.startedAt,
      startedBy: "jk",
      earliestEffectiveAt: r.impact.earliestEffectiveAt,
      latestEffectiveAt: r.impact.latestEffectiveAt,
      successors: r.successors,
      noticeScheduleDays: r.noticeScheduleDays,
      channels: r.channels,
      messageMd: r.messageMd,
      counts: c,
      currency: CURRENCY,
      mrrRetainedMinor: retained,
      mrrAtRiskMinor: atRisk,
      decisionsOverTime: r.decisions,
      canCancel: r.status === "NOTICING" && acted === 0,
      canClose: r.status === "COMPLETED" || (r.status === "NOTICING" && c.pending === 0),
      driftCount: 0,
      hasOrgItems: r.items.some((x) => x.scope === "ORG"),
    };
  }

  function start(body) {
    const p = planOf(body.planKey);
    if (!p) return fail(404, "NOT_FOUND", `No plan ${body.planKey}.`);
    if (retirements.some((r) => r.planKey === body.planKey && ["NOTICING", "COMPLETING"].includes(r.status))) return fail(409, "RETIREMENT_EXISTS", "This plan is already being retired.");
    if (p.status !== "PUBLISHED") return fail(409, "PLAN_NOT_PUBLISHED", `Plan ${body.planKey} is not published, so it cannot be retired.`);
    if (!body.reason || body.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", `A reason of at least ${REASON_MIN} characters is required.`);
    if (body.confirmPlanKey !== body.planKey) return fail(422, "CONFIRM_MISMATCH", "Type the plan key to confirm.");
    const successors = body.successors ?? [];
    if (body.defaultOutcome !== "FREE" && successors.length === 0) return fail(422, "SUCCESSOR_REQUIRED", "Add at least one successor.");
    if (body.effectiveNotBefore) {
      const min = new Date(now() + MIN_NOTICE_DAYS * DAY).toISOString().slice(0, 10);
      if (body.effectiveNotBefore < min) return fail(422, "NOTICE_TOO_SHORT", `Subscribers must get at least ${MIN_NOTICE_DAYS} days of notice.`, { minNoticeDays: MIN_NOTICE_DAYS });
    }
    if (body.defaultOutcome === "MIGRATE_AT_RENEWAL") {
      const first = COVERAGE[successors[0]?.planKey];
      if (first && first.wouldPayMore > 0) return fail(422, "PRICE_INCREASE_REQUIRES_CONSENT", `${first.wouldPayMore} subscribers would pay more under the first successor.`, { wouldPayMore: first.wouldPayMore });
    }
    if (!DEFAULTS.allowedOutcomes.includes(body.defaultOutcome)) return fail(422, "OUTCOME_NOT_ALLOWED", "That outcome is not allowed.");
    const impact = impactFor(body.planKey);
    const r = {
      id: nextId++,
      planKey: body.planKey,
      planName: p.name,
      planVersion: p.liveVersion ?? 1,
      status: impact.subscribers === 0 ? "COMPLETED" : "NOTICING",
      mode: body.mode ?? "RETIRE_AT_RENEWAL",
      defaultOutcome: body.defaultOutcome,
      reason: body.reason.trim(),
      startedAt: iso(now()),
      successors: successors.map((s) => ({ planKey: s.planKey, name: planOf(s.planKey)?.name ?? s.planKey, rank: s.rank })),
      noticeScheduleDays: body.noticeScheduleDays,
      channels: body.channels,
      messageMd: body.messageMd ?? null,
      impact,
      total: impact.subscribers,
      items: [],
      decisions: [],
    };
    r.items = seedItems(r);
    retirements.push(r);
    setStatus(body.planKey, impact.subscribers === 0 ? "RETIRED" : "RETIRING");
    return ok(detail(r), 201);
  }

  function noticePreview(q) {
    const key = q.get("planKey");
    const p = planOf(key);
    if (!p) return fail(404, "NOT_FOUND", `No plan ${key}.`);
    const outcome = q.get("outcome") ?? "FREE";
    const successor = planOf(q.get("successor") ?? "")?.name ?? "Pro Student";
    const date = new Date(now() + 45 * DAY);
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
    const fallback =
      outcome === "FREE"
        ? `If you do nothing, on ${when} your account moves to Free. Everything you made stays, in read-only mode for the services Free doesn't include. Pick a plan any time to unlock them instantly.`
        : `If you do nothing, on ${when} we'll move you to ${successor} at no more than you pay today. Change your mind any time before then.`;
    const extra = q.get("message") ? `\n\n${q.get("message")}` : "";
    return ok({
      subject: `Your ${p.name} plan is changing on ${when}`,
      body: `We're retiring ${p.name}. Nothing changes until ${when}: you keep everything you paid for until then.${extra}\n\nBased on what you use, ${successor} is the closest match. You can switch now or at your renewal.\n\n${fallback}\n\nPrefer to stop? Cancel any time. You keep ${p.name} until ${when}, and nothing more is charged.`,
      sampleEffectiveAt: iso(date.getTime()),
    });
  }

  function handle({ method, path, query = new URLSearchParams(), body = {}, admin = true }) {
    if (path === "/mock/retirements/reset" && method === "POST") {
      for (const r of retirements) setStatus(r.planKey, "PUBLISHED");
      retirements = [];
      nextId = 7;
      return ok({ ok: true });
    }
    if (path === "/mock/retirements/event" && method === "POST") {
      const r = retirements.find((x) => x.id === Number(body.id));
      if (!r) return fail(404, "NOT_FOUND", "No such retirement.");
      const it = r.items.find((x) => x.status === "PENDING");
      if (!it) return fail(409, "NOTHING_PENDING", "Every sampled row has acted.");
      it.status = body.kind === "cancelled" ? "CANCELLED" : body.kind === "fell_back" ? "FELL_BACK" : "SWITCH_SCHEDULED";
      const day = iso(now()).slice(0, 10);
      let pt = r.decisions.find((d) => d.date === day);
      if (!pt) r.decisions.push((pt = { date: day, switched: 0, cancelled: 0, cumulative: 0 }));
      if (body.kind === "cancelled") pt.cancelled += 1;
      else if (body.kind !== "fell_back") pt.switched += 1;
      pt.cumulative = r.items.filter((x) => x.status !== "PENDING").length;
      return ok(detail(r));
    }
    if (!path.startsWith("/api/admin/retirements")) return null;
    if (!admin) return fail(403, "FORBIDDEN", "Forbidden");
    const seg = path.split("/").filter(Boolean); // api admin retirements ...
    if (seg.length === 3) {
      if (method === "GET") {
        const rows = retirements
          .filter((r) => (!query.get("planKey") || r.planKey === query.get("planKey")) && (!query.get("status") || r.status === query.get("status")))
          .map((r) => ({ id: r.id, planKey: r.planKey, status: r.status, startedAt: r.startedAt, pending: counts(r).pending, total: r.total }));
        return ok(rows.reverse());
      }
      if (method === "POST") return start(body);
    }
    if (seg[3] === "coverage" && method === "GET") {
      const keys = (query.get("successors") ?? "").split(",").filter(Boolean);
      const c = coverageFor(query.get("planKey") ?? "", keys);
      return c ? ok(c) : fail(404, "NOT_FOUND", "No such plan.");
    }
    if (seg[3] === "notices" && seg[4] === "preview" && method === "GET") return noticePreview(query);
    const r = retirements.find((x) => x.id === Number(seg[3]));
    if (!r) return fail(404, "NOT_FOUND", `No retirement ${seg[3]}.`);
    if (seg.length === 4 && method === "GET") return ok(detail(r));
    if (seg[4] === "items" && seg.length === 5 && method === "GET") {
      let rows = r.items;
      if (query.get("status")) rows = rows.filter((x) => x.status === query.get("status"));
      if (query.get("interval")) rows = rows.filter((x) => x.interval === query.get("interval"));
      if (query.get("successor")) rows = rows.filter((x) => x.successorName === query.get("successor"));
      const size = Number(query.get("size") ?? 25);
      const page = Number(query.get("page") ?? 0);
      return ok({ total: rows.length, page, size, items: rows.slice(page * size, page * size + size) });
    }
    if (seg[4] === "items" && seg.length === 7 && method === "POST") {
      const it = r.items.find((x) => x.id === Number(seg[5]));
      if (!it) return fail(404, "NOT_FOUND", "No such row.");
      if (seg[6] === "resend") {
        it.lastNoticeDays = it.lastNoticeDays ?? 60;
        return ok({ ok: true });
      }
      if (seg[6] === "exclude") {
        if (!body.reason || body.reason.trim().length < 10) return fail(422, "REASON_REQUIRED", "A reason of at least 10 characters is required.");
        it.status = "EXCLUDED";
        return ok({ ok: true });
      }
    }
    if (seg[4] === "cancel" && method === "POST") {
      if (!body.reason || body.reason.trim().length < REASON_MIN) return fail(422, "REASON_REQUIRED", `A reason of at least ${REASON_MIN} characters is required.`);
      if (body.confirmPlanKey !== r.planKey) return fail(422, "CONFIRM_MISMATCH", "Type the plan key to confirm.");
      if (!detail(r).canCancel) return fail(409, "RETIREMENT_ACTED", "A subscriber has already acted, so this retirement can no longer be cancelled.");
      r.status = "CANCELLED";
      setStatus(r.planKey, "PUBLISHED");
      return ok(detail(r));
    }
    if (seg[4] === "close" && method === "POST") {
      if (!detail(r).canClose) return fail(409, "RETIREMENT_OPEN", "Subscribers are still pending.");
      r.status = "COMPLETED";
      setStatus(r.planKey, "RETIRED");
      return ok(detail(r));
    }
    return fail(404, "NOT_FOUND", "No such route.");
  }

  return { handle };
}
