/* service-worker.js — install hook + the answer-drafting backend + the application
 * tracker (Phase 3.2).
 *
 *  Drafting runs here (not in the content script) so it isn't blocked by a page's
 *  Content-Security-Policy and the API key never travels through page world.
 *  Answers are cached by normalized question text and REUSED when the same
 *  question appears again — the user writes/approves an answer once.
 *
 *  Application tracking also lives here: submission detection needs webNavigation
 *  (background-only) and must survive the post-submit navigation that tears down the
 *  page's content script. The tracking/sync/app-tracking libs attach to globalThis.JAF.
 */
// The tracking/sync/app-tracking/analytics libs are loaded by the WXT background
// entrypoint (`entrypoints/background.ts`) as ES side-effect imports BEFORE this file
// runs — they attach to globalThis.JAF, so `self.JAF.*` below is available. (Under WXT
// the background is bundled into one file; classic `importScripts` is no longer used.)

// Fire-and-forget analytics. NEVER pass PII — coarse params only (see analytics.js).
function track(name, params) {
  try { return self.JAF && self.JAF.analytics ? self.JAF.analytics.track(name, params) : Promise.resolve(); }
  catch (e) { return Promise.resolve(); }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Onboard on the web app: sign in / sign up there and connect the extension.
    chrome.tabs.create({ url: "https://kiwiply.com/connect" });
  }
  track(details.reason === "install" ? "extension_install" : "extension_update", { reason: details.reason });
});

const ANSWER_KEY = "answerCache";
const normQ = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").replace(/[\s?:.!,;-]+$/g, "").trim();

function sGet(k) { return new Promise((res) => chrome.storage.local.get(k, (o) => res(o && o[k]))); }
function sSet(k, v) { return new Promise((res) => chrome.storage.local.set({ [k]: v }, () => res(true))); }

async function getCached(q) { const c = (await sGet(ANSWER_KEY)) || {}; return c[normQ(q)] || null; }
async function putCached(q, a) { const c = (await sGet(ANSWER_KEY)) || {}; c[normQ(q)] = a; await sSet(ANSWER_KEY, c); }

// One Anthropic messages call (BYO key). Returns { answer } or { error }.
async function callAnthropic(apiKey, system, user, maxTokens) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (e) { return { error: String((e && e.message) || e) }; }
  if (!res.ok) { const t = await res.text().catch(() => ""); return { error: "API " + res.status + ": " + t.slice(0, 160) }; }
  const data = await res.json();
  const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return { answer };
}

async function draftAnswer(question, context) {
  const settings = (await sGet("settings")) || {};
  const cached = await getCached(question);             // reuse identical question
  if (cached) return { answer: cached, cached: true };

  // 1. Bring-your-own key → direct to Anthropic (takes priority; key never leaves the device).
  if (settings.llmEnabled && settings.apiKey) {
    const system =
      "You write concise, professional, first-person answers to job application questions, " +
      "grounded ONLY in the candidate background provided. 2-4 sentences. No preamble, no markdown, " +
      "no placeholders, and do not invent employers or facts not present in the background.";
    const user = "Question:\n" + question + "\n\nCandidate background:\n" + (context || "").slice(0, 6000) + "\n\nWrite the answer:";
    const r = await callAnthropic(settings.apiKey, system, user, 400);
    if (r.error) return r;
    if (r.answer) await putCached(question, r.answer);
    return { answer: r.answer };
  }

  // 2. Dossier server-side AI (opt-in + explicit consent + signed in). Metered on the
  //    server's key; the key never reaches the extension. See /api/ai/draft.
  if (settings.serverAiEnabled && settings.serverAiConsent && settings.apiBaseUrl && self.JAF && self.JAF.sync) {
    try {
      const provider = self.JAF.sync.providerFromSettings(settings, self.JAF.tracking.chromeTokenStore());
      if (await provider.isAuthenticated()) {
        const r = (await provider.aiDraft({ question, context, consent: true })) || {};
        if (r.answer) { await putCached(question, r.answer); return { answer: r.answer }; }
        if (r.quotaExceeded) return { error: `Monthly AI limit reached (${r.used}/${r.quota}). Add your own key for unlimited drafting.` };
        // disabled / consentRequired / empty → fall through to "off".
      }
    } catch (e) { return { error: String((e && e.message) || e) }; }
  }

  return { disabled: true };
}

function draftOutcome(r) {
  if (!r) return "error";
  if (r.cached) return "cached";
  if (r.answer) return "drafted";
  if (r.disabled) return "disabled";
  if (r.error) return "error";
  return "other";
}

// --- AI option pick (JAF_PICK) --------------------------------------------------
// Constrained screening question: the model answers, but the FILL is only ever an
// option the page itself offers — fieldMap.matchOption validates the reply against
// the literal list (ambiguous/UNSURE ⇒ no answer). Cached per question+options.
const PICK_KEY = "pickCache";
const pickCacheKey = (q, options) => normQ(q) + "::" + (options || []).map(normQ).join("|").slice(0, 400);

async function pickAnswer(question, options, context) {
  const F = self.JAF && self.JAF.fieldMap;
  if (!F) return { error: "field-map core not loaded" };
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o == null ? "" : o).slice(0, 80)).filter(Boolean).slice(0, 30);
  if (!question || opts.length < 2) return { error: "bad-question" };
  const cache = (await sGet(PICK_KEY)) || {};
  const ck = pickCacheKey(question, opts);
  if (cache[ck] && opts.indexOf(cache[ck]) !== -1) return { answer: cache[ck], cached: true };

  const settings = (await sGet("settings")) || {};
  const instruction =
    "Screening question from a job application:\n" + question +
    "\n\nOptions (choose ONE):\n" + opts.map((o) => "- " + o).join("\n") +
    "\n\nCandidate background:\n" + (context || "").slice(0, 6000) +
    "\n\nReply with EXACTLY one option from the list, verbatim, and nothing else. " +
    "If the background does not clearly determine the answer, reply UNSURE.";

  let raw = null;
  if (settings.llmEnabled && settings.apiKey) {
    const system =
      "You answer job-application screening questions by choosing from a fixed option list, " +
      "based ONLY on the candidate background. Reply with exactly one option verbatim, or UNSURE. " +
      "Never guess about demographics, legal status, or facts absent from the background.";
    const r = await callAnthropic(settings.apiKey, system, instruction, 100);
    if (r.error) return r;
    raw = r.answer;
  } else if (settings.serverAiEnabled && settings.serverAiConsent && settings.apiBaseUrl && self.JAF && self.JAF.sync) {
    try {
      const provider = self.JAF.sync.providerFromSettings(settings, self.JAF.tracking.chromeTokenStore());
      if (!(await provider.isAuthenticated())) return { disabled: true };
      const r = (await provider.aiDraft({ question: instruction, context: "", consent: true })) || {};
      if (r.quotaExceeded) return { error: "quota" };
      raw = r.answer || null;
    } catch (e) { return { error: String((e && e.message) || e) }; }
  } else {
    return { disabled: true };
  }

  const answer = raw ? F.matchOption(raw, opts) : null;
  if (!answer) return { unsure: true };
  cache[ck] = answer;
  await sSet(PICK_KEY, cache);
  return { answer };
}

// --- AI field mapping (JAF_MAP_FIELDS) -----------------------------------------
// One batched call: map form-field LABELS (no user values) to the canonical
// vocabulary. Same consent gates as drafting: BYO key first, else the opt-in
// server AI, else {disabled}. The content side (field-mapper.js) caches results
// per host+label, so a page costs at most one call ever per device.
async function mapFields(labels) {
  const F = self.JAF && self.JAF.fieldMap;
  if (!F) return { error: "field-map core not loaded" };
  const list = (Array.isArray(labels) ? labels : []).slice(0, 20).map((l) => String(l == null ? "" : l).slice(0, 160));
  if (!list.length) return { mappings: {} };
  const settings = (await sGet("settings")) || {};
  const prompt = F.buildMapPrompt(list);

  // 1. BYO key → a dedicated JSON-only system prompt.
  if (settings.llmEnabled && settings.apiKey) {
    const system =
      "You map job-application form field labels to a fixed vocabulary of canonical keys. " +
      "Reply with ONLY the requested JSON object — no prose, no markdown.";
    const r = await callAnthropic(settings.apiKey, system, prompt, 300);
    if (r.error) return r;
    const mappings = F.parseMapResponse(r.answer, list.length);
    return mappings ? { mappings } : { error: "unparseable" };
  }

  // 2. Server AI rides the drafting endpoint (its system prompt is drafting-shaped,
  //    so the parse must stay tolerant — parseMapResponse digs the JSON out of prose).
  if (settings.serverAiEnabled && settings.serverAiConsent && settings.apiBaseUrl && self.JAF && self.JAF.sync) {
    try {
      const provider = self.JAF.sync.providerFromSettings(settings, self.JAF.tracking.chromeTokenStore());
      if (await provider.isAuthenticated()) {
        const r = (await provider.aiDraft({ question: prompt, context: "", consent: true })) || {};
        if (r.answer) {
          const mappings = F.parseMapResponse(r.answer, list.length);
          return mappings ? { mappings } : { error: "unparseable" };
        }
        if (r.quotaExceeded) return { error: "quota" };
      }
    } catch (e) { return { error: String((e && e.message) || e) }; }
  }

  return { disabled: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== "JAF_DRAFT" && msg.type !== "JAF_MAP_FIELDS" && msg.type !== "JAF_PICK")) return;
  if (msg.type === "JAF_PICK") {
    pickAnswer(msg.question, msg.options, msg.context)
      .then((r) => { track("answer_pick", { outcome: r.answer ? (r.cached ? "cached" : "picked") : draftOutcome(r) }); sendResponse(r); })
      .catch((e) => { track("answer_pick", { outcome: "error" }); sendResponse({ error: String(e) }); });
    return true; // async
  }
  if (msg.type === "JAF_MAP_FIELDS") {
    mapFields(msg.labels)
      .then((r) => { track("field_map", { outcome: r.mappings ? "mapped" : draftOutcome(r), n: msg.labels ? msg.labels.length : 0 }); sendResponse(r); })
      .catch((e) => { track("field_map", { outcome: "error" }); sendResponse({ error: String(e) }); });
    return true; // async
  }
  draftAnswer(msg.question, msg.context)
    .then((r) => { track("answer_draft", { outcome: draftOutcome(r) }); sendResponse(r); })
    .catch((e) => { track("answer_draft", { outcome: "error" }); sendResponse({ error: String(e) }); });
  return true; // async
});

// --- Web-app connect handoff (externally_connectable) -------------------------
// kiwiply.com's /connect page hands the extension a session after the user signs in on
// the web — single sign-in, no separate login in the extension. We only accept the
// handoff from our own web origins.
//
// The accept-list is DERIVED from the manifest's `externally_connectable.matches` rather
// than hardcoded. Chrome already enforces those matches; re-checking here is defence in
// depth, and deriving it keeps ONE source of truth — a dev-only origin (localhost:3000,
// added by wxt.config.ts in dev builds) can never outlive the manifest entry that allows it.
function connectOriginAllowed(origin) {
  if (!origin) return false;
  const target = /^(https?):\/\/(.+)$/.exec(origin);
  if (!target) return false;
  let matches = [];
  try {
    const ec = chrome.runtime.getManifest().externally_connectable;
    matches = (ec && ec.matches) || [];
  } catch (_) {
    return false;
  }
  return matches.some((pattern) => {
    const m = /^(https?):\/\/(\*\.)?([^/*]+)\//.exec(pattern);
    if (!m || m[1] !== target[1]) return false;
    const host = m[3];
    // `*.example.com` covers sub.example.com and example.com itself (Chrome's semantics).
    return m[2] ? target[2] === host || target[2].endsWith("." + host) : target[2] === host;
  });
}

// A MessageSender's origin: `sender.origin` on Chrome, derived from `sender.url` on Firefox,
// which doesn't populate `origin` for content scripts.
function senderOrigin(sender) {
  if (!sender) return "";
  if (sender.origin) return sender.origin;
  try { return new URL(sender.url).origin; } catch (_) { return ""; }
}

// Shared by both handoff paths below. Returns the response to send back.
async function acceptConnectSession(tokens) {
  const t = tokens || {};
  if (!t.access || !t.refresh) return { ok: false, reason: "missing-tokens" };
  try {
    // Ensure the API base is set, then store the session via the shared token store.
    const settings = (await sGet("settings")) || {};
    if (!settings.apiBaseUrl) { settings.apiBaseUrl = "https://api.kiwiply.com"; await sSet("settings", settings); }
    await self.JAF.tracking.chromeTokenStore().set({ access: t.access, refresh: t.refresh, username: t.username || "" });
    track("extension_connected", {});
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

// --- Web → extension change signal (Phase 11.1) --------------------------------
// The web app tells us the moment the profile/resumes changed or the user signed out,
// over the SAME origin-gated channel as the connect handoff (web/src/lib/extension-signal.ts).
// Before this, the mirror only refreshed when the drawer opened, throttled to 90 s, and a
// web sign-out never reached the extension at all.
//
//   { type: "KIWIPLY_SYNC", event: "changed" }   → pull the mirror now
//   { type: "KIWIPLY_SYNC", event: "signedOut" } → revoke (best-effort) + drop the session
const SYNC = "KIWIPLY_SYNC";

// Tell an open drawer to repaint from the fresh mirror. With no drawer there is no receiver,
// which Chrome reports through lastError rather than throwing — read it or the console fills
// with "Unchecked runtime.lastError" on every sync.
function broadcastMirrorUpdated() {
  try {
    chrome.runtime.sendMessage({ type: "KIWIPLY_MIRROR_UPDATED" }, () => { void chrome.runtime.lastError; });
  } catch (e) { /* no receiver, or messaging unavailable */ }
}

async function handleSyncSignal(event) {
  const J = self.JAF || {};
  if (event === "signedOut") {
    // Mirrors options/actions.ts signOut(): revoke server-side if we can, then clear locally
    // regardless — the local clear is the part that must not fail.
    try {
      const settings = (await sGet("settings")) || {};
      const provider = J.sync.providerFromSettings(settings, J.tracking.chromeTokenStore());
      if (provider && provider.logout) await provider.logout();
    } catch (e) { /* best-effort revoke */ }
    try { await J.tracking.chromeTokenStore().clear(); } catch (e) { return { ok: false, reason: "clear-failed" }; }
    track("extension_disconnected", { source: "web" });
    return { ok: true };
  }
  if (event === "changed") {
    try {
      const settings = (await sGet("settings")) || {};
      const provider = J.sync.providerFromSettings(settings, J.tracking.chromeTokenStore());
      if (!(await provider.isAuthenticated())) return { ok: false, reason: "not-connected" };
      // Pull unconditionally: the web just told us it changed something, so asking for the
      // version first would be a round-trip to learn what we already know.
      await J.sync.pullAll(provider, J.storage);
      // But DO record the version we just pulled under, or the next scheduled check (11.3)
      // would see a stale marker and pull the very same data again.
      let version = null;
      try { version = await provider.profileVersion(); } catch (e) { /* older server / offline */ }
      const s2 = (await sGet("settings")) || {};
      s2.__profileVersion = version || null;
      s2.__lastPull = Date.now();
      await sSet("settings", s2);
      broadcastMirrorUpdated();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }
  return { ok: false, reason: "unknown-event" };
}

// Everything the web app may send us, once the origin gate has passed. Returns a promise
// for a response, or null when the message isn't one of ours (so the listener stays quiet).
function routeWebMessage(msg) {
  if (!msg) return null;
  if (msg.type === "KIWIPLY_CONNECT") return acceptConnectSession(msg.tokens);
  if (msg.type === SYNC) return handleSyncSignal(msg.event);
  return null;
}

// Path 1 — Chrome: the web page messages the extension directly (externally_connectable).
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!connectOriginAllowed(senderOrigin(sender))) return;
  const p = routeWebMessage(msg);
  if (!p) return;
  p.then(sendResponse);
  return true; // async
});

// Path 2 — Firefox: there is no externally_connectable (https://bugzil.la/1319168), so the page
// posts to itself and the connect-relay content script forwards it here as an ordinary internal
// message. The sender is then one of OUR content scripts, and the origin gate is the same one —
// a content script on an ATS page cannot hand over a session or fake a sync signal, only one
// running on an origin the accept-list allows.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== "KIWIPLY_CONNECT" && msg.type !== SYNC)) return;
  if (!sender || !sender.tab) return;           // must come from a page, not another extension page
  if (!connectOriginAllowed(senderOrigin(sender))) return;
  const p = routeWebMessage(msg);
  if (!p) return;
  p.then(sendResponse);
  return true; // async
});

// --- Scheduled + focus-driven version checks (Phase 11.3) ----------------------
// The 11.1 signal only fires while a kiwiply.com tab is open. These two cover everything
// else: a change made on another device, or on the web with the extension's browser closed.
// Both run the same cheap check — GET the profile version (11.2) and pull only if it moved.
const SYNC_ALARM = "kiwiply-sync";
const SYNC_ALARM_MINUTES = 15;
// A guard, NOT the old throttle: it bounds how often we spend a round-trip asking, while the
// pull itself is already gated on the answer. Refocusing the browser repeatedly is common.
const FOCUS_CHECK_MS = 60 * 1000;
let lastFocusCheck = 0;

function ensureSyncAlarm() {
  try { chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_ALARM_MINUTES }); } catch (e) {}
}

// Ask the server whether anything changed; pull and tell the drawer only if it did.
// Every exit is a reason rather than a throw — this runs unattended on a timer.
async function runVersionCheck(source) {
  const J = self.JAF || {};
  try {
    const settings = (await sGet("settings")) || {};
    if (!settings.apiBaseUrl) return { ok: false, reason: "not-configured" };
    const provider = J.sync.providerFromSettings(settings, J.tracking.chromeTokenStore());
    if (!(await provider.isAuthenticated())) return { ok: false, reason: "not-connected" };
    const r = (await J.sync.checkAndPull(provider, J.storage, settings)) || {};
    if (r.pulled) {
      broadcastMirrorUpdated();
      track("mirror_pulled", { source });
    }
    return { ok: true, pulled: !!r.pulled, reason: r.reason, source };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

// MV3 tears the worker down when idle, so the alarm is what wakes it; re-create it on both
// install/update and browser start, since alarms don't survive an extension update.
chrome.runtime.onInstalled.addListener(ensureSyncAlarm);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(ensureSyncAlarm);
if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === SYNC_ALARM) runVersionCheck("alarm");
  });
}

// Coming back to the browser is the moment a stale mirror is about to be used. Guarded so
// alt-tabbing doesn't spray requests. (chrome.windows is absent in some contexts.)
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return; // focus left the browser entirely
    const now = Date.now();
    if (now - lastFocusCheck < FOCUS_CHECK_MS) return;
    lastFocusCheck = now;
    runVersionCheck("focus");
  });
}

// --- AI job-detail enrichment (Phase 3.6) --------------------------------------
// Opt-in via its OWN toggle (settings.jobAiEnabled, default OFF). Fills only the gaps
// the deterministic capture chain left (jobType / jobMode / structured salary) from
// the posting's PUBLIC description text — never profile or resume data — and never
// overrides a field the page stated. Same two-tier model chain as drafting: BYO key
// first, else the opt-in server AI. Cached per posting so a job costs at most one
// call ever; best-effort throughout (a failure just returns the capture unchanged).
const ENRICH_KEY = "enrichCache";
const ENRICH_MAX = 40;

async function enrichCapture(capture) {
  const E = self.JAF && self.JAF.jobEnrich;
  if (!E || !capture) return capture;
  try {
    const settings = (await sGet("settings")) || {};
    if (!settings.jobAiEnabled) return capture;
    if (!E.needsEnrichment(capture)) return capture;
    const key = E.cacheKey(capture);
    const cache = (await sGet(ENRICH_KEY)) || {};
    if (cache[key]) {
      track("job_enrich", { outcome: "cached" });
      return E.applyEnrichment(capture, cache[key].parsed);
    }

    const prompt = E.buildEnrichPrompt(capture);
    let raw = null;
    if (settings.llmEnabled && settings.apiKey) {
      const system =
        "You extract structured facts from job postings. Reply with ONLY the requested JSON object — " +
        "no prose, no markdown. Use null for anything the text does not explicitly state; never infer or guess.";
      const r = await callAnthropic(settings.apiKey, system, prompt, 200);
      if (r.error || !r.answer) { track("job_enrich", { outcome: "error" }); return capture; }
      raw = r.answer;
    } else if (settings.serverAiEnabled && settings.serverAiConsent && settings.apiBaseUrl && self.JAF.sync) {
      const provider = self.JAF.sync.providerFromSettings(settings, self.JAF.tracking.chromeTokenStore());
      if (!(await provider.isAuthenticated())) return capture;
      const r = (await provider.aiDraft({ question: prompt, context: "", consent: true })) || {};
      if (!r.answer) { track("job_enrich", { outcome: r.quotaExceeded ? "quota" : "disabled" }); return capture; }
      raw = r.answer;
    } else {
      return capture; // toggle is on but no AI backend is available
    }

    const parsed = E.parseEnrichResponse(raw);
    if (!parsed) { track("job_enrich", { outcome: "unparseable" }); return capture; }
    cache[key] = { parsed, ts: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > ENRICH_MAX) {
      keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
        .slice(0, keys.length - ENRICH_MAX)
        .forEach((k) => delete cache[k]);
    }
    await sSet(ENRICH_KEY, cache);
    track("job_enrich", { outcome: "enriched" });
    return E.applyEnrichment(capture, parsed);
  } catch (e) {
    return capture; // enrichment must never block tracking
  }
}

// --- Application tracking (Phase 3.2) -----------------------------------------
// On fill: upsert a DRAFT (dedup server-side on externalJobId/jobUrl). On a detected
// submission: flip that DRAFT to APPLIED. Both are best-effort and silent — if the
// user isn't signed in or hasn't configured a backend, tracking simply no-ops.
const PENDING_KEY = "trackingPending";       // { [tabId]: {serverId, externalJobId, jobUrl, ts} }
const CONFIRM_WINDOW_MS = 30 * 60 * 1000;    // only confirm a fill within 30 min of logging it

async function trackingProvider() {
  const settings = (await sGet("settings")) || {};
  if (!settings.apiBaseUrl) return null;
  const provider = self.JAF.sync.providerFromSettings(settings, self.JAF.tracking.chromeTokenStore());
  try { if (!(await provider.isAuthenticated())) return null; } catch (e) { return null; }
  return provider;
}

async function pendGet() { return (await sGet(PENDING_KEY)) || {}; }

async function logFill(capture, resume, tabId) {
  const provider = await trackingProvider();
  if (!provider) return; // not configured / not signed in
  capture = await enrichCapture(capture); // opt-in gap-fill; no-op unless enabled
  let saved;
  try { saved = await self.JAF.appTracking.pushDraft(provider, capture, resume); } catch (e) { return; }
  if (saved && saved.serverId != null && tabId != null) {
    const pend = await pendGet();
    pend[tabId] = { serverId: saved.serverId, externalJobId: saved.externalJobId || null, jobUrl: saved.jobUrl || null, ts: Date.now() };
    await sSet(PENDING_KEY, pend);
  }
}

async function saveJob(capture) {
  const provider = await trackingProvider();
  if (!provider) return { ok: false, reason: "not-signed-in" };
  capture = await enrichCapture(capture); // opt-in gap-fill; no-op unless enabled
  try {
    const saved = await self.JAF.appTracking.pushSaved(provider, capture);
    return { ok: true, serverId: saved && saved.serverId, status: saved && saved.status };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

async function confirmForTab(tabId) {
  if (tabId == null) return;
  const pend = await pendGet();
  const p = pend[tabId];
  if (!p) return;
  if (Date.now() - (p.ts || 0) > CONFIRM_WINDOW_MS) { delete pend[tabId]; await sSet(PENDING_KEY, pend); return; }
  const provider = await trackingProvider();
  if (!provider) return;
  try { await self.JAF.appTracking.confirmSubmission(provider, p.serverId, new Date().toISOString()); } catch (e) { return; }
  track("application_submitted", {});
  delete pend[tabId];
  await sSet(PENDING_KEY, pend);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (msg.type === "JAF_LOG_FILL") {
    track("autofill", { ats: (msg.capture && msg.capture.atsPlatform) || "unknown" });
    logFill(msg.capture, msg.resume, tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // async
  }
  if (msg.type === "JAF_SUBMIT_DETECTED") {
    confirmForTab(tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // async
  }
  if (msg.type === "JAF_SAVE_JOB") {
    track("save_job", { ats: (msg.capture && msg.capture.atsPlatform) || "unknown" });
    saveJob(msg.capture).then(sendResponse).catch((e) => sendResponse({ ok: false, reason: String(e) }));
    return true; // async
  }
});

// Redirect to a "thank you" / confirmation page on a tracked tab = a submission.
chrome.webNavigation.onCompleted.addListener(async (d) => {
  if (d.frameId !== 0) return; // top frame only
  const pend = await pendGet();
  const p = pend[d.tabId];
  if (!p) return;
  // Ignore navigations that land back on the same job page (not a confirmation).
  if (p.jobUrl && d.url && d.url.split("#")[0] === p.jobUrl.split("#")[0]) return;
  if (!self.JAF.appTracking.isSuccessUrl(d.url)) return;
  await confirmForTab(d.tabId);
});

// Forget a tab's pending entry when it closes.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pend = await pendGet();
  if (pend[tabId]) { delete pend[tabId]; await sSet(PENDING_KEY, pend); }
});
