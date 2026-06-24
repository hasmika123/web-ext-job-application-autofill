// Tests for the GA4 Measurement Protocol analytics module (Task 6.1): JAF.analytics.
// Pure logic exercised with an injected fetch + an in-memory store (no real network).
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow();
load(w, "src/lib/analytics.js");
const create = w.JAF.analytics.create;

// In-memory store shim (get(k)->Promise, set(k,v)->Promise), optionally seeded.
function memStore(seed) {
  const m = Object.assign({}, seed);
  return { _m: m, get: (k) => Promise.resolve(m[k]), set: (k, v) => { m[k] = v; return Promise.resolve(true); } };
}
// Recording fetch.
function recFetch() {
  const calls = [];
  const fn = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, status: 204 }); };
  fn.calls = calls;
  return fn;
}

(async function run() {
  /* ---- unconfigured (empty ids) → no-op, no fetch ---- */
  {
    const f = recFetch();
    const a = create({ fetch: f, store: memStore(), config: { measurementId: "", apiSecret: "" } });
    const r = await a.track("autofill", { ats: "workday" });
    eq("unconfigured: not sent", r, { sent: false, reason: "unconfigured" });
    ok("unconfigured: fetch not called", f.calls.length === 0);
  }

  /* ---- opted out → no-op even when configured ---- */
  {
    const f = recFetch();
    const a = create({ fetch: f, store: memStore(), config: { measurementId: "G-X", apiSecret: "s", enabled: false } });
    const r = await a.track("autofill", {});
    eq("opted-out: not sent", r, { sent: false, reason: "opted-out" });
    ok("opted-out: fetch not called", f.calls.length === 0);
  }

  /* ---- configured + enabled → one POST with the right URL + body ---- */
  {
    const f = recFetch();
    const store = memStore();
    const a = create({ fetch: f, store, endpoint: "https://ga.test/mp/collect", config: { measurementId: "G-ABC", apiSecret: "secret123" } });
    const r = await a.track("autofill", { ats: "workday" });
    eq("configured: sent", r, { sent: true });
    ok("configured: one fetch", f.calls.length === 1);
    const c = f.calls[0];
    ok("url has measurement_id", c.url.includes("measurement_id=G-ABC"), c.url);
    ok("url has api_secret", c.url.includes("api_secret=secret123"), c.url);
    ok("method POST", c.opts.method === "POST");
    const body = JSON.parse(c.opts.body);
    ok("body has client_id", typeof body.client_id === "string" && body.client_id.length > 0);
    eq("event name", body.events[0].name, "autofill");
    eq("event param ats", body.events[0].params.ats, "workday");
    ok("engagement_time_msec present", body.events[0].params.engagement_time_msec === 1);
  }

  /* ---- client_id is generated once and persisted ---- */
  {
    const f = recFetch();
    const store = memStore();
    const a = create({ fetch: f, store, config: { measurementId: "G-ABC", apiSecret: "s" } });
    await a.track("e1", {});
    await a.track("e2", {});
    const id1 = JSON.parse(f.calls[0].opts.body).client_id;
    const id2 = JSON.parse(f.calls[1].opts.body).client_id;
    eq("client_id stable across calls", id1, id2);
    eq("client_id persisted in store", store._m.gaClientId, id1);
  }

  /* ---- sanitize: keep scalars, truncate strings, drop objects (PII guard) ---- */
  {
    const a = create({ store: memStore() });
    const s = a._sanitize({ n: 3, b: true, str: "x".repeat(200), obj: { secret: "resume text" }, arr: [1, 2], nil: null });
    ok("keeps number", s.n === 3);
    ok("keeps boolean", s.b === true);
    ok("truncates string to 100", s.str.length === 100);
    ok("drops object", !("obj" in s));
    ok("drops array", !("arr" in s));
    ok("drops null", !("nil" in s));
  }

  /* ---- settings-driven config: opt-out + ids read from the store ---- */
  {
    const f = recFetch();
    const store = memStore({ settings: { gaMeasurementId: "G-S", gaApiSecret: "k", analyticsOptOut: true } });
    const a = create({ fetch: f, store }); // no override → reads settings
    const r = await a.track("autofill", {});
    eq("settings opt-out respected", r.reason, "opted-out");
    ok("settings opt-out: no fetch", f.calls.length === 0);

    const f2 = recFetch();
    const store2 = memStore({ settings: { gaMeasurementId: "G-S", gaApiSecret: "k" } }); // opt-in (default)
    const a2 = create({ fetch: f2, store: store2 });
    const r2 = await a2.track("autofill", {});
    eq("settings opt-in sent", r2, { sent: true });
    ok("settings ids used in url", f2.calls[0].url.includes("measurement_id=G-S"));
  }

  /* ---- fetch failure is swallowed (never throws) ---- */
  {
    const failing = () => Promise.reject(new Error("network down"));
    const a = create({ fetch: failing, store: memStore(), config: { measurementId: "G", apiSecret: "s" } });
    const r = await a.track("autofill", {});
    ok("fetch failure → sent:false", r.sent === false);
    ok("fetch failure → reason carried", String(r.reason).includes("network down"), r.reason);
  }

  console.log(`[analytics] ${pass} passed, ${fail} failed`);
  if (fail) { console.log(fails.join("\n")); process.exit(1); }
  console.log("[analytics] All green.");
})();
