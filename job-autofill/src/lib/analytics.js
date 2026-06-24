/* analytics.js — JAF.analytics (Phase 6.1)
 *
 * Anonymous usage analytics for the extension via the **GA4 Measurement Protocol**.
 * gtag.js and any remote code are banned under MV3, so the Measurement Protocol
 * (POST /mp/collect with measurement_id + api_secret) is the only supported path,
 * and it runs from the **service worker** (importScripts → globalThis.JAF), never a
 * page. Events are sent IMMEDIATELY, one POST per event — the SW dies after ~30s idle,
 * so nothing is batched in memory.
 *
 * Privacy: events carry NO PII. Callers pass only coarse params (e.g. an ATS slug like
 * "workday", a boolean, a count); `sanitize()` keeps scalars, truncates strings, and
 * drops objects so a caller can't accidentally ship resume/answer/email text. A random
 * client_id (not the user's identity) is stored locally. Users can opt out (Settings),
 * and the extension PRIVACY.md discloses this.
 *
 * No telemetry key ships in the committed bundle (CLAUDE.md): the measurement id +
 * api secret default to "" here and are supplied at packaging/config time (or via
 * settings.gaMeasurementId / settings.gaApiSecret). Until BOTH are set, every call no-ops.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  // Filled at package/config time — intentionally empty in source (no key in the bundle).
  const DEFAULT_MEASUREMENT_ID = "";
  const DEFAULT_API_SECRET = "";
  // Master switch, SEPARATE from the ids so a build can ship with credentials staged but
  // analytics still dark. Default off; CI flips it true at inject time only when the
  // ANALYTICS_ENABLED repo variable says so. A dev/publisher install can override per-device
  // with settings.gaEnabled (true/false) without rebuilding.
  const DEFAULT_ANALYTICS_ENABLED = false;
  const COLLECT_ENDPOINT = "https://www.google-analytics.com/mp/collect";
  const CLIENT_ID_KEY = "gaClientId";

  function uuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Default storage shim over chrome.storage.local (get(k)->Promise, set(k,v)->Promise).
  function chromeStore() {
    const local = globalThis.chrome && globalThis.chrome.storage && globalThis.chrome.storage.local;
    return {
      get: (k) => new Promise((res) => (local ? local.get(k, (o) => res(o && o[k])) : res(undefined))),
      set: (k, v) => new Promise((res) => (local ? local.set({ [k]: v }, () => res(true)) : res(false))),
    };
  }

  // Keep only safe scalars; truncate strings; drop nested objects (PII guard).
  function sanitize(params) {
    const out = {};
    if (!params) return out;
    for (const k of Object.keys(params)) {
      const v = params[k];
      if (v == null) continue;
      if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else if (typeof v === "string") out[k] = v.slice(0, 100);
      // objects/arrays/functions are intentionally dropped.
    }
    return out;
  }

  function create(deps) {
    deps = deps || {};
    const _fetch = deps.fetch || (typeof fetch !== "undefined" ? (u, o) => fetch(u, o) : null);
    const store = deps.store || chromeStore();
    const endpoint = deps.endpoint || COLLECT_ENDPOINT;
    const override = deps.config || null; // {measurementId, apiSecret, enabled} for tests

    async function resolveConfig() {
      if (override) return Object.assign({ enabled: true }, override);
      const settings = (await store.get("settings")) || {};
      // Master = build-time default, overridable per-device by settings.gaEnabled.
      const master = typeof settings.gaEnabled === "boolean" ? settings.gaEnabled : DEFAULT_ANALYTICS_ENABLED;
      return {
        measurementId: settings.gaMeasurementId || DEFAULT_MEASUREMENT_ID,
        apiSecret: settings.gaApiSecret || DEFAULT_API_SECRET,
        // Active only when the master switch is on AND the user hasn't opted out.
        enabled: master && !settings.analyticsOptOut,
      };
    }

    function isConfigured(cfg) {
      return !!(cfg && cfg.measurementId && cfg.apiSecret);
    }

    async function clientId() {
      let id = await store.get(CLIENT_ID_KEY);
      if (!id) { id = uuid(); await store.set(CLIENT_ID_KEY, id); }
      return id;
    }

    function payload(cid, name, params) {
      return {
        client_id: cid,
        events: [{ name: String(name), params: Object.assign({ engagement_time_msec: 1 }, sanitize(params)) }],
      };
    }

    // Fire ONE event immediately. Resolves (never throws) with {sent, reason?} so callers
    // can fire-and-forget. No-ops when disabled (master off / opted out) or unconfigured.
    async function track(name, params) {
      try {
        if (!name || !_fetch) return { sent: false, reason: "no-op" };
        const cfg = await resolveConfig();
        if (!cfg.enabled) return { sent: false, reason: "disabled" };
        if (!isConfigured(cfg)) return { sent: false, reason: "unconfigured" };
        const cid = await clientId();
        const url =
          endpoint +
          "?measurement_id=" + encodeURIComponent(cfg.measurementId) +
          "&api_secret=" + encodeURIComponent(cfg.apiSecret);
        await _fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload(cid, name, params)),
          keepalive: true,
        });
        return { sent: true };
      } catch (e) {
        return { sent: false, reason: String((e && e.message) || e) };
      }
    }

    return { track, clientId, resolveConfig, isConfigured, _payload: payload, _sanitize: sanitize };
  }

  JAF.analytics = create();
  JAF.analytics.create = create; // factory exposed for tests / self-hosted configs
})();
