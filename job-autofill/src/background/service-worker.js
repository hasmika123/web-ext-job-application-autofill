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
importScripts("../lib/tracking.js", "../lib/sync.js", "../lib/app-tracking.js");

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
  }
});

const ANSWER_KEY = "answerCache";
const normQ = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").replace(/[\s?:.!,;-]+$/g, "").trim();

function sGet(k) { return new Promise((res) => chrome.storage.local.get(k, (o) => res(o && o[k]))); }
function sSet(k, v) { return new Promise((res) => chrome.storage.local.set({ [k]: v }, () => res(true))); }

async function getCached(q) { const c = (await sGet(ANSWER_KEY)) || {}; return c[normQ(q)] || null; }
async function putCached(q, a) { const c = (await sGet(ANSWER_KEY)) || {}; c[normQ(q)] = a; await sSet(ANSWER_KEY, c); }

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
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
    } catch (e) { return { error: String((e && e.message) || e) }; }
    if (!res.ok) { const t = await res.text().catch(() => ""); return { error: "API " + res.status + ": " + t.slice(0, 160) }; }
    const data = await res.json();
    const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (answer) await putCached(question, answer);
    return { answer };
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "JAF_DRAFT") return;
  draftAnswer(msg.question, msg.context).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
  return true; // async
});

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
  delete pend[tabId];
  await sSet(PENDING_KEY, pend);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (msg.type === "JAF_LOG_FILL") {
    logFill(msg.capture, msg.resume, tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // async
  }
  if (msg.type === "JAF_SUBMIT_DETECTED") {
    confirmForTab(tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // async
  }
  if (msg.type === "JAF_SAVE_JOB") {
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
