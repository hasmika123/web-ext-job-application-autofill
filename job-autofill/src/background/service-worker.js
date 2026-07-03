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
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const origin = (sender && sender.origin) || "";
  const allowed = /^https:\/\/(www\.|app\.)?kiwiply\.com$/.test(origin) || origin === "http://localhost:3000";
  if (!allowed) return;
  if (!msg || msg.type !== "KIWIPLY_CONNECT") return;
  const t = (msg && msg.tokens) || {};
  if (!t.access || !t.refresh) { sendResponse({ ok: false, reason: "missing-tokens" }); return; }
  (async () => {
    // Ensure the API base is set, then store the session via the shared token store.
    const settings = (await sGet("settings")) || {};
    if (!settings.apiBaseUrl) { settings.apiBaseUrl = "https://api.kiwiply.com"; await sSet("settings", settings); }
    await self.JAF.tracking.chromeTokenStore().set({ access: t.access, refresh: t.refresh, username: t.username || "" });
    track("extension_connected", {});
    sendResponse({ ok: true });
  })().catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
  return true; // async
});

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
