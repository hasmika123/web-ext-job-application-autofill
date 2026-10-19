/* prepare-batch.js — JAF.prepareBatch   ("Prepare selected openings", roadmap X12.9 / E7.x)
 *
 * A consultant ticks several assigned openings on the web and presses "Prepare selected". The web
 * hands this extension a job list (KIWIPLY_PREPARE_BATCH, contract v1: job-autofill/ARCHITECTURE.md
 * "Prepare batch"); the extension opens one tab per job, runs the normal fill pipeline in each with
 * the consultant's OWN profile, flags what it could not fill and then WAITS for the consultant.
 *
 * Hard rules this module encodes (CLAUDE.md, ADR-010, E1):
 *   - NOTHING is submitted. No code here clicks, submits or dispatches events on a page: it opens
 *     tabs (chrome.tabs.create), sends the normal JAF_FILL review-overlay request to a content
 *     script, and reports status. The consultant reviews, completes and presses Submit themselves.
 *   - Attestation / consent / legal boxes are never touched (the filler's guarded plan decides what is
 *     fillable; this module adds no field of its own).
 *   - A sign-in wall, a CAPTCHA or an unsupported page is NEVER worked around: the tab just waits in
 *     NEEDS_INPUT with a plain reason.
 *   - Only an ENTERPRISE CONSULTANT session of the named organization may start a batch. A marketer
 *     session never does (marketers never fill, never read a profile).
 *   - Events to the server carry a state and a short fixed phrase, never page content or answers.
 *
 * Pure of chrome.* and fetch: everything the module touches arrives through `deps`, so the node
 * suite drives it with fakes. Attaches to globalThis.JAF (loaded by the service worker).
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  // ---- the contract ------------------------------------------------------------------------
  const MSG_BATCH = "KIWIPLY_PREPARE_BATCH";
  const MSG_ACK = "KIWIPLY_PREPARE_ACK";
  const CONTRACT_VERSION = 1;
  const MAX_JOBS = 10;
  const MAX_CONCURRENT = 5;       // tabs the batch keeps in play at once
  const OPEN_DELAY_MS = 1500;     // pause between two tab opens (never "all at once")
  const MAX_ATTEMPTS = 3;         // prepare attempts per job (one per page load, never in a loop)
  const RETRY_GAP_MS = 5000;      // minimum gap between two attempts on the same tab
  const ACK_BUDGET_MS = 2800;     // the web waits 3 s for the ACK
  const ROLE_REFRESH_MS = 2000;   // the part of that budget a role lookup may take
  const OUTBOX_MAX = 100;
  const OUTBOX_TRIES = 5;
  const DETAIL_MAX = 200;

  const EVENTS = ["OPENED", "PREFILLED", "NEEDS_INPUT", "SUBMIT_DETECTED", "CLOSED", "FAILED"];
  // A job's state is one of the events, or QUEUED before its tab exists.
  const FINAL_STATES = ["SUBMIT_DETECTED", "CLOSED", "FAILED"];
  const ACTIVE_STATES = ["OPENED", "PREFILLED", "NEEDS_INPUT"]; // a tab is open and the consultant is on it

  const SESSION_RE = /^[A-Za-z0-9_-]{1,80}$/;
  const MATCH_RE = /^[A-Za-z0-9_-]{1,64}$/;

  // Fixed phrases: the ONLY free-ish text that leaves the device as `detail` (<= 200 chars).
  const REASON = {
    signin: "Sign-in required",
    captcha: "Verification (CAPTCHA) needs you",
    noForm: "No application form found on this page yet",
    unsupported: "Kiwiply can't run on this site automatically",
    profileEmpty: "Your Kiwiply profile is empty",
    fillFailed: "The fill panel could not open",
    tabFailed: "The tab could not be opened",
    stopped: "Batch stopped before this tab opened",
  };
  // What the consultant reads in the drawer / banner for those reasons.
  const REASON_HELP = {
    [REASON.signin]: "Sign in to the site on this tab, then reload it.",
    [REASON.captcha]: "Complete the verification on this tab yourself.",
    [REASON.noForm]: "Open the application form on this tab, then click the Kiwiply icon.",
    [REASON.unsupported]: "Click the Kiwiply icon on this tab to fill it yourself.",
    [REASON.profileEmpty]: "Complete your profile on the Kiwiply web app first.",
  };

  function posInt(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
  function text(v, max) {
    if (typeof v !== "string") return "";
    return v.replace(/\s+/g, " ").trim().slice(0, max);
  }

  // ---- dev-build allowances, read from the manifest ---------------------------------------
  // A development build (wxt.config.ts, WXT_DEV_TENANT_ORIGINS / WXT_DEV_ATS_ORIGINS) may list local http
  // origins on *.localhost: tenant pages that may send a batch, and stand-in ATS pages the batch may open.
  // The rules below read those entries from the manifest, so a store build (which has none) keeps the
  // https-only rules unchanged. Only "http://[*.]<name>.localhost[:port]/*" patterns count.
  function manifestPatterns(pick) {
    try {
      const m = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
      return (m && pick(m)) || [];
    } catch (e) { return []; }
  }
  function devLocalPatternMatches(pattern, origin) {
    const m = /^http:\/\/(\*\.)?([a-z0-9.-]*localhost)(?::(\d+))?\/\*$/i.exec(String(pattern || ""));
    if (!m) return false;
    let u;
    try { u = new URL(origin); } catch (e) { return false; }
    if (u.protocol !== "http:") return false;
    if ((u.port || "80") !== (m[3] || "80")) return false;
    const host = u.hostname.toLowerCase();
    const want = m[2].toLowerCase();
    // Bare "localhost" is the dev API or web server, never a stand-in page: only named *.localhost hosts count.
    if (want === "localhost") return !!m[1] && host.endsWith(".localhost");
    return m[1] ? host === want || host.endsWith("." + want) : host === want;
  }
  function devAtsOriginAllowed(origin) {
    return manifestPatterns((m) => m.host_permissions).some((p) => devLocalPatternMatches(p, origin));
  }
  function devTenantOriginAllowed(origin) {
    return manifestPatterns((m) => m.externally_connectable && m.externally_connectable.matches).some((p) => devLocalPatternMatches(p, origin));
  }

  // ---- URL rules ---------------------------------------------------------------------------
  // https only; no credentials in the address; a real public hostname (no localhost, no IP literal).
  // Exception: a dev build's local stand-in ATS origins (above).
  function cleanUrl(raw) {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2000) return { error: "bad-url" };
    let u;
    try { u = new URL(raw.trim()); } catch (e) { return { error: "bad-url" }; }
    if (u.protocol === "http:") {
      if (u.username || u.password || !devAtsOriginAllowed(u.origin)) return { error: "http-url" };
      return { url: u.href };
    }
    if (u.protocol !== "https:") return { error: "bad-url" };
    if (u.username || u.password) return { error: "bad-url" };
    const host = u.hostname.toLowerCase();
    if (!host || host.indexOf(".") === -1 || /^\[.*\]$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /(^|\.)localhost$/.test(host)) return { error: "bad-url" };
    return { url: u.href };
  }
  function urlIdentity(href) {
    const W = JAF.workspace;
    const k = W && W.urlKey ? W.urlKey(href) : "";
    return k || href;
  }

  // ---- 1. validation -------------------------------------------------------------------------
  // -> { ignore:true } for anything that is not this message type (the listener stays silent),
  //    { ok:false, reason, sessionId? } for a refusal, { ok:true, batch } otherwise.
  function validate(msg) {
    if (!msg || typeof msg !== "object" || msg.type !== MSG_BATCH) return { ok: false, ignore: true };
    // The contract says a string; a positive integer (the API's session id as the web received it) is accepted as its decimal string.
    const rawSession = typeof msg.sessionId === "number" && Number.isInteger(msg.sessionId) && msg.sessionId > 0 ? String(msg.sessionId) : msg.sessionId;
    const sessionId = typeof rawSession === "string" && SESSION_RE.test(rawSession) ? rawSession : null;
    const fail = (reason) => ({ ok: false, reason, sessionId: sessionId || undefined });
    if (msg.version !== CONTRACT_VERSION) return fail("unsupported-version");
    if (!sessionId) return fail("bad-session");
    const orgId = posInt(msg.orgId);
    if (!orgId) return fail("bad-org");
    let apiOrigin = null;
    if (msg.apiBase != null && msg.apiBase !== "") {
      try { apiOrigin = new URL(String(msg.apiBase)).origin; } catch (e) { return fail("bad-api-base"); }
    }
    if (!Array.isArray(msg.jobs) || !msg.jobs.length) return fail("no-jobs");
    if (msg.jobs.length > MAX_JOBS) return fail("too-many-jobs");
    const jobs = [];
    const seenMatch = new Set();
    const seenUrl = new Set();
    for (const j of msg.jobs) {
      if (!j || typeof j !== "object") return fail("bad-job");
      const m = typeof j.matchId === "number" ? (Number.isInteger(j.matchId) && j.matchId > 0 ? j.matchId : null)
        : (typeof j.matchId === "string" && MATCH_RE.test(j.matchId) ? j.matchId : null);
      if (m == null) return fail("bad-job");
      const c = cleanUrl(j.url);
      if (c.error) return fail(c.error);
      const mk = String(m);
      const uk = urlIdentity(c.url);
      if (seenMatch.has(mk) || seenUrl.has(uk)) continue; // dedupe: the first one wins
      seenMatch.add(mk);
      seenUrl.add(uk);
      jobs.push({ matchId: m, url: c.url, title: text(j.title, 200), company: text(j.company, 200) });
    }
    return { ok: true, batch: { sessionId, orgId, apiOrigin, jobs } };
  }

  // ---- 2. who may start a batch -------------------------------------------------------------
  // The session record (trackingAuth): an ENTERPRISE account of exactly this org.
  function checkSession(orgId, session) {
    const s = session && typeof session === "object" ? session : {};
    if (!s.access) return "not-connected";
    if (s.kind !== "ENTERPRISE") return "wrong-account-kind";
    if (Number(s.orgId) !== Number(orgId)) return "wrong-org";
    return null;
  }
  // The role flags last seen on GET /api/profile/version (modeOf, never a guess). `account` null /
  // unknown -> "unknown" so the caller can refresh once before refusing.
  function checkRole(orgId, account) {
    const W = JAF.workspace;
    if (!account || !W) return "unknown";
    const mode = W.modeOf(account);
    if (mode.kind === "marketer") return "marketer-session";
    if (mode.kind !== "consultant") return mode.kind === "personal" ? "wrong-account-kind" : "not-a-consultant";
    if (Number(mode.org.orgId) !== Number(orgId)) return "wrong-org";
    return null;
  }

  // Origins that may send a batch: the exact web origins the connect handoff trusts, plus tenant hosts
  // (*.kiwiply.com), plus a dev build's local tenant hosts. Custom tenant domains cannot be listed in a
  // manifest — see ARCHITECTURE.md.
  const TENANT_SUFFIX = ".kiwiply.com";
  function tenantOriginAllowed(origin) {
    try {
      const u = new URL(origin);
      if (u.protocol === "https:" && !u.port && u.hostname.toLowerCase().endsWith(TENANT_SUFFIX)) return true;
    } catch (e) { return false; }
    return devTenantOriginAllowed(origin);
  }

  function ack(sessionId, accepted, reason) {
    const a = { type: MSG_ACK, accepted: !!accepted };
    if (sessionId) a.sessionId = sessionId;
    if (reason && !accepted) a.reason = reason;
    return a;
  }

  function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
      Promise.resolve(promise).then(
        (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } },
      );
    });
  }

  // ---- 3. the receiver (validation + ACK) -------------------------------------------------
  // deps: { originAllowed(origin) -> bool, readSession() -> trackingAuth, readSettings() -> settings,
  //         saveSettings(s), getProvider() -> provider|null, controller, now() }
  function createReceiver(deps) {
    async function resolveRole(orgId) {
      const settings = (await deps.readSettings()) || {};
      const session = (await deps.readSession()) || {};
      const local = JAF.workspace.accountFromLocal(session, settings.account);
      let why = local.known ? checkRole(orgId, local.account) : "unknown";
      if (why === null) return { ok: true, settings };
      // Cached flags can be stale in either direction: ask the server once before refusing.
      try {
        const provider = await deps.getProvider();
        if (provider && provider.getAccount) {
          const fresh = await withTimeout(provider.getAccount(), ROLE_REFRESH_MS, null);
          if (fresh) {
            settings.account = fresh;
            try { await deps.saveSettings(settings); } catch (e) { /* the cache is a convenience */ }
            why = checkRole(orgId, fresh);
            if (why === null) return { ok: true, settings };
          }
        }
      } catch (e) { /* offline: decide from what we know */ }
      return { ok: false, reason: why === "unknown" ? "role-unknown" : why };
    }

    // Returns the ACK object, or null when the message is not ours (stay silent).
    async function receive(msg, origin) {
      const v = validate(msg);
      if (v.ignore) return null;
      let late = false;
      const work = (async () => {
        if (!deps.originAllowed(origin)) return ack(v.sessionId, false, "untrusted-origin");
        if (!v.ok) return ack(v.sessionId, false, v.reason);
        const b = v.batch;
        const session = (await deps.readSession()) || {};
        const sessionWhy = checkSession(b.orgId, session);
        if (sessionWhy) return ack(b.sessionId, false, sessionWhy);
        const role = await resolveRole(b.orgId);
        if (!role.ok) return ack(b.sessionId, false, role.reason);
        // The extension talks to ITS configured API only; a page that names another one is refused
        // rather than trusted (events would otherwise land in an environment the page doesn't mean).
        if (b.apiOrigin) {
          let mine = "";
          try { mine = new URL(String(role.settings.apiBaseUrl || "")).origin; } catch (e) { mine = ""; }
          if (mine !== b.apiOrigin) return ack(b.sessionId, false, "api-mismatch");
        }
        if (late) return ack(b.sessionId, false, "timeout");
        const started = await deps.controller.start(b, { userId: posInt(session.userId) });
        if (!started.ok) return ack(b.sessionId, false, started.reason);
        return ack(b.sessionId, true);
      })();
      const result = await withTimeout(work, ACK_BUDGET_MS, "timeout");
      if (result === "timeout") { late = true; return ack(v.sessionId, false, "timeout"); }
      return result;
    }
    return { receive, resolveRole };
  }

  // ---- 4. the batch controller ---------------------------------------------------------------
  // deps: {
  //   tabs: { create({url,active}) -> {id}, get(id) -> tab|null }          (chrome.tabs, promisified)
  //   storage: { get(key), set(key, value), remove(key) }                  (chrome.storage.local)
  //   index:   { get() -> {orgId}|null, set(v|null) }                      (chrome.storage.session)
  //   readSession() -> trackingAuth,   getProvider() -> provider|null
  //   prepareTab(tabId, job, batch) -> { outcome: READY|NEEDS_INPUT|FAILED, reason? }
  //   now(), wait(ms)
  // }
  // State lives in storage under `ws:<orgId>:prepareBatch`: the `ws:` prefix is the account-bound
  // partition, so a sign-out or an account switch (JAF.storage.clearAccountData) deletes it with the rest.
  function stateKey(orgId) { return "ws:" + orgId + ":prepareBatch"; }

  function createController(deps) {
    const now = deps.now || (() => Date.now());
    const wait = deps.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
    let chain = Promise.resolve();
    let pumping = false;
    let pumpP = Promise.resolve();
    let flushing = false;
    let flushAgain = false;
    let flushP = Promise.resolve();
    // All read-modify-write goes through one queue: tab events arrive concurrently.
    function serial(fn) {
      const run = chain.then(fn, fn);
      chain = run.then(() => undefined, () => undefined);
      return run;
    }

    const isActive = (j) => ACTIVE_STATES.indexOf(j.state) !== -1;
    const isFinal = (j) => FINAL_STATES.indexOf(j.state) !== -1;

    async function loadActive() {
      const idx = await deps.index.get();
      if (!idx || !posInt(idx.orgId)) return null;
      const st = await deps.storage.get(stateKey(idx.orgId));
      if (!st || st.orgId !== idx.orgId) { await deps.index.set(null); return null; }
      return st;
    }
    async function save(st) { await deps.storage.set(stateKey(st.orgId), st); }

    // The state belongs to the account that started it; anything else is dropped (account switch).
    async function loadOwned() {
      const st = await loadActive();
      if (!st) return null;
      const session = (await deps.readSession()) || {};
      const sameUser = !st.userId || !session.userId || Number(session.userId) === Number(st.userId);
      if (!session.access || session.kind !== "ENTERPRISE" || Number(session.orgId) !== st.orgId || !sameUser) {
        await deps.storage.remove(stateKey(st.orgId));
        await deps.index.set(null);
        return null;
      }
      return st;
    }

    function report(st, job, event, detail) {
      if (EVENTS.indexOf(event) === -1) return;
      st.outbox = st.outbox || [];
      st.seq = (st.seq || 0) + 1;
      const item = { seq: st.seq, matchId: job.matchId, event };
      const d = text(detail, DETAIL_MAX);
      if (d) item.detail = d;
      st.outbox.push(item);
      if (st.outbox.length > OUTBOX_MAX) st.outbox.splice(0, st.outbox.length - OUTBOX_MAX);
    }

    // Move a job to `state` once. A final state is never left; the same state is a no-op.
    function transition(st, job, state, detail) {
      if (job.state === state || isFinal(job.state)) return false;
      job.state = state;
      job.reason = detail ? text(detail, DETAIL_MAX) : "";
      job.updatedAt = now();
      report(st, job, state, detail);
      return true;
    }

    async function openJob(st, job) {
      st.lastOpenAt = now();
      try {
        const tab = await deps.tabs.create({ url: job.url, active: false });
        if (!tab || tab.id == null) throw new Error("no-tab");
        job.tabId = tab.id;
        job.attempts = 0;
        job.state = "QUEUED"; // so transition() reports OPENED
        transition(st, job, "OPENED");
      } catch (e) {
        job.state = "QUEUED";
        transition(st, job, "FAILED", REASON.tabFailed);
      }
      await save(st);
    }

    // Open queued jobs one at a time, paced, never above the cap. A second caller returns at once.
    function pump() {
      if (pumping) return pumpP;
      pumping = true;
      pumpP = pumpLoop();
      return pumpP;
    }
    async function pumpLoop() {
      try {
        for (;;) {
          const opened = await serial(async () => {
            const st = await loadOwned();
            if (!st || st.stopped) return false;
            const next = st.jobs.find((j) => j.state === "QUEUED");
            if (!next || st.jobs.filter(isActive).length >= MAX_CONCURRENT) return false;
            await openJob(st, next);
            return true;
          });
          if (!opened) break;
          flush();
          await wait(OPEN_DELAY_MS);
        }
      } catch (e) { /* opening is best effort; the next tab event pumps again */ }
      finally { pumping = false; }
    }

    async function start(batch, who) {
      const result = await serial(async () => {
        const existing = await loadOwned();
        if (existing && existing.sessionId === batch.sessionId) return { ok: true, duplicate: true };
        if (existing && !existing.stopped && existing.jobs.some((j) => j.state === "QUEUED" || isActive(j))) {
          return { ok: false, reason: "batch-in-progress" };
        }
        const st = {
          v: 1, sessionId: batch.sessionId, orgId: batch.orgId, userId: (who && who.userId) || null,
          createdAt: now(), stopped: false, lastOpenAt: 0, seq: 0, outbox: [],
          jobs: batch.jobs.map((j) => ({ matchId: j.matchId, url: j.url, title: j.title, company: j.company, state: "QUEUED", tabId: null, attempts: 0, reason: "" })),
        };
        await save(st);
        await deps.index.set({ orgId: st.orgId });
        return { ok: true };
      });
      if (result.ok && !result.duplicate) pump();
      return result;
    }

    // ---- tab and page events ----
    const jobOfTab = (st, tabId) => (tabId == null ? null : st.jobs.find((j) => j.tabId === tabId) || null);

    async function onTabUpdated(tabId, changeInfo) {
      if (!changeInfo || changeInfo.status !== "complete") return;
      let todo = null;
      await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return;
        const job = jobOfTab(st, tabId);
        if (!job || (job.state !== "OPENED" && job.state !== "NEEDS_INPUT") || job.filled) return;
        if ((job.attempts || 0) >= MAX_ATTEMPTS) return;
        if (job.lastAttemptAt && now() - job.lastAttemptAt < RETRY_GAP_MS) return;
        job.attempts = (job.attempts || 0) + 1;
        job.lastAttemptAt = now();
        await save(st);
        todo = { job: { matchId: job.matchId, url: job.url }, batch: { sessionId: st.sessionId, orgId: st.orgId } };
      });
      if (!todo) return;
      let res;
      try { res = await deps.prepareTab(tabId, todo.job, todo.batch); }
      catch (e) { res = { outcome: "FAILED", reason: REASON.fillFailed }; }
      await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return;
        const job = jobOfTab(st, tabId);
        if (!job) return;
        if (res && res.outcome === "NEEDS_INPUT") transition(st, job, "NEEDS_INPUT", res.reason);
        else if (res && res.outcome === "FAILED") transition(st, job, "FAILED", res.reason || REASON.fillFailed);
        else if (job.state === "NEEDS_INPUT" && !job.filled) transition(st, job, "OPENED", "Ready for review"); // the wall is gone; waiting for the consultant again
        await save(st);
      });
      flush();
    }

    // The content script reports progress of the review overlay: filled once (with how many required
    // fields remain), and again when that number changes. Counts only.
    async function onProgress(tabId, info) {
      await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return;
        const job = jobOfTab(st, tabId);
        const b = info && info.batch;
        if (!job || !b || b.sessionId !== st.sessionId || String(b.matchId) !== String(job.matchId)) return;
        if (info.phase === "gaps" && !job.filled) return; // before any fill there is nothing to compare
        if (info.phase === "filled") job.filled = true;
        const gaps = Math.max(0, Math.min(999, Math.floor(Number(info.gaps) || 0)));
        if (gaps > 0) transition(st, job, "NEEDS_INPUT", gaps + " required field" + (gaps === 1 ? "" : "s") + " need your input");
        else transition(st, job, "PREFILLED", "Filled; waiting for your review");
        await save(st);
      });
      flush();
    }

    async function onSubmitDetected(tabId) {
      await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return;
        const job = jobOfTab(st, tabId);
        if (!job) return;
        if (transition(st, job, "SUBMIT_DETECTED")) await save(st);
      });
      flush();
      pump(); // a submitted tab no longer counts against the cap
    }

    // A navigation to a confirmation page ("thank you") on a batch tab. The webNavigation listener only
    // calls this for a success-looking URL; landing back on the job's own address is not a submission.
    async function onSuccessNavigation(tabId, url) {
      const bare = (u) => String(u || "").split("#")[0];
      await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return;
        const job = jobOfTab(st, tabId);
        if (!job || bare(url) === bare(job.url)) return;
        if (transition(st, job, "SUBMIT_DETECTED")) await save(st);
      });
      flush();
      pump();
    }

    async function onTabRemoved(tabId) {
      let changed = false;
      await serial(async () => {
        const st = await loadOwned();
        if (!st) return;
        const job = jobOfTab(st, tabId);
        if (!job) return;
        const wasState = job.state;
        job.tabId = null;
        if (!st.stopped) {
          if (wasState === "SUBMIT_DETECTED") report(st, job, "CLOSED");
          else transition(st, job, "CLOSED");
          job.closed = true;
        }
        await save(st);
        changed = true;
      });
      if (changed) { flush(); pump(); }
    }

    // After a browser restart or a worker restart: forget tabs that no longer exist.
    async function reconcile() {
      await serial(async () => {
        const st = await loadOwned();
        if (!st) return;
        let dirty = false;
        for (const job of st.jobs) {
          if (job.tabId == null) continue;
          let tab = null;
          try { tab = await deps.tabs.get(job.tabId); } catch (e) { tab = null; }
          if (tab) continue;
          job.tabId = null;
          if (!st.stopped) {
            if (job.state === "SUBMIT_DETECTED") report(st, job, "CLOSED"); else transition(st, job, "CLOSED");
            job.closed = true;
          }
          dirty = true;
        }
        if (dirty) await save(st);
      });
      flush();
      pump();
    }

    // ---- consultant actions from the drawer ----
    async function openNext() {
      const res = await serial(async () => {
        const st = await loadOwned();
        if (!st || st.stopped) return { ok: false, reason: "no-batch" };
        const next = st.jobs.find((j) => j.state === "QUEUED");
        if (!next) return { ok: false, reason: "none-queued" };
        if (st.jobs.filter(isActive).length >= MAX_CONCURRENT) return { ok: false, reason: "at-capacity" };
        await openJob(st, next);
        return { ok: true };
      });
      flush();
      return res;
    }

    // Stop managing the batch: nothing more is opened, queued jobs are dropped, tabs the consultant
    // has open are left exactly as they are (closing them could lose typed answers). The state stays
    // (so the drawer can say "Stopped" and unsent events can still go out) until dismissed.
    async function stop() {
      const res = await serial(async () => {
        const st = await loadOwned();
        if (!st) return { ok: false, reason: "no-batch" };
        if (!st.stopped) {
          for (const job of st.jobs) if (job.state === "QUEUED") transition(st, job, "CLOSED", REASON.stopped);
          st.stopped = true;
          await save(st);
        }
        return { ok: true };
      });
      flush();
      return res;
    }

    async function dismiss() {
      return serial(async () => {
        const idx = await deps.index.get();
        const st = await loadActive();
        if (st) { await deps.storage.remove(stateKey(st.orgId)); }
        else if (idx && idx.orgId) await deps.storage.remove(stateKey(idx.orgId));
        await deps.index.set(null);
        return { ok: true };
      });
    }

    // ---- event delivery: best effort, in order, never aggressive, never blocks the fill ----
    function flush() {
      if (flushing) { flushAgain = true; return flushP; }
      flushing = true;
      flushP = (async () => {
        try {
          do {
            flushAgain = false;
            await flushOnce();
          } while (flushAgain);
        } finally { flushing = false; }
      })();
      return flushP;
    }
    async function flushOnce() {
      try {
        const st = await serial(() => loadOwned());
        if (!st || !st.outbox || !st.outbox.length) return;
        const provider = await deps.getProvider();
        if (!provider || !provider.reportPrepareEvent) return;
        const sent = [];
        const dropped = [];
        const failed = [];
        for (const item of st.outbox.slice()) {
          try {
            await provider.reportPrepareEvent(st.orgId, st.sessionId, { matchId: item.matchId, event: item.event, detail: item.detail });
            sent.push(item.seq);
          } catch (e) {
            const status = e && e.status;
            // A refusal that retrying cannot fix (4xx other than auth/timeout/rate-limit): drop it.
            if (status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) dropped.push(item.seq);
            else failed.push(item.seq);
            break; // keep order, do not hammer a failing server
          }
        }
        await serial(async () => {
          const cur = await deps.storage.get(stateKey(st.orgId));
          if (!cur || cur.sessionId !== st.sessionId) return;
          cur.outbox = (cur.outbox || []).filter((i) => sent.indexOf(i.seq) === -1 && dropped.indexOf(i.seq) === -1);
          for (const i of cur.outbox) if (failed.indexOf(i.seq) !== -1) i.tries = (i.tries || 0) + 1;
          cur.outbox = cur.outbox.filter((i) => (i.tries || 0) < OUTBOX_TRIES);
          await deps.storage.set(stateKey(st.orgId), cur);
        });
      } catch (e) { /* delivery is best effort */ }
    }

    // What the drawer shows.
    async function status() {
      const st = await serial(() => loadOwned());
      return st ? summarize(st) : null;
    }

    // Resolves when every started open/flush has settled (tests; also handy for "wait for quiet").
    async function idle() {
      for (let i = 0; i < 5; i++) { await pumpP; await flushP; await chain; }
    }

    return { start, onTabUpdated, onProgress, onSubmitDetected, onSuccessNavigation, onTabRemoved, reconcile, openNext, stop, dismiss, flush, status, pump, idle };
  }

  // Counts for the overview: waiting (queued or opened and not yet filled) / filled / needs input /
  // submitted / closed / failed.
  function summarize(st) {
    const jobs = (st.jobs || []).map((j) => ({
      matchId: j.matchId, title: j.title, company: j.company, state: j.state, reason: j.reason || "",
      help: REASON_HELP[j.reason] || "", tabOpen: j.tabId != null,
    }));
    const n = (f) => jobs.filter(f).length;
    return {
      sessionId: st.sessionId, orgId: st.orgId, stopped: !!st.stopped, jobs,
      counts: {
        total: jobs.length,
        waiting: n((j) => j.state === "QUEUED" || j.state === "OPENED"),
        filled: n((j) => j.state === "PREFILLED"),
        needsInput: n((j) => j.state === "NEEDS_INPUT"),
        submitted: n((j) => j.state === "SUBMIT_DETECTED"),
        closed: n((j) => j.state === "CLOSED"),
        failed: n((j) => j.state === "FAILED"),
        queued: n((j) => j.state === "QUEUED"),
        active: n((j) => ACTIVE_STATES.indexOf(j.state) !== -1),
      },
      done: jobs.every((j) => FINAL_STATES.indexOf(j.state) !== -1),
    };
  }

  // ---- 5. preparing one tab (the normal pipeline, run for a background tab) -----------------
  // deps: {
  //   inject(tabId)                      make sure the content script runs (throws if the site is not allowed)
  //   scanFrames(tabId) -> [{frameId, adapter, fieldCount}]
  //   sendTo(tabId, msg, frameId) -> response
  //   loadMirror() -> { bio, resume, file }   the consultant's own mirrored profile (file = {name,type,base64}|null)
  //   wait(ms)
  // }
  function createPreparer(deps) {
    const wait = deps.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
    function formFrames(frames) {
      return frames
        .filter((f) => f.adapter !== "generic" || f.fieldCount >= 2)
        .sort((a, b) => (b.adapter !== "generic" ? 1000 : 0) + b.fieldCount - ((a.adapter !== "generic" ? 1000 : 0) + a.fieldCount));
    }
    // A form that has actually rendered: a known site with at least one field, or two fields anywhere. Ashby and other single-page
    // apps match their adapter by URL before React has drawn the form, so the adapter alone does not mean the fields are there yet.
    function rendered(frames) {
      return frames.some((f) => f.fieldCount >= (f.adapter !== "generic" ? 1 : 2));
    }
    async function prepare(tabId, job, batch) {
      const info = { sessionId: batch.sessionId, matchId: job.matchId };
      try { await deps.inject(tabId); }
      catch (e) { return { outcome: "NEEDS_INPUT", reason: REASON.unsupported }; }

      // Up to three looks, 3 s apart, until the form's fields are on the page (single-page apps render late). If a known site still
      // shows no fields after that, it is filled anyway, as before (its fields may be ones the scan does not count).
      let top = null;
      let frames = [];
      for (let i = 0; i < 3; i++) {
        top = await deps.sendTo(tabId, { type: "JAF_BATCH_CHECK", batch: info }, 0).catch(() => null);
        frames = await deps.scanFrames(tabId).catch(() => []);
        if ((top && (top.kind === "captcha" || top.kind === "signin")) || rendered(frames)) break;
        if (i < 2) await wait(3000);
      }
      const kind = top && top.kind;
      if (kind === "captcha") return { outcome: "NEEDS_INPUT", reason: REASON.captcha };
      if (kind === "signin") return { outcome: "NEEDS_INPUT", reason: REASON.signin };
      const forms = formFrames(frames);
      if (!forms.length) return { outcome: "NEEDS_INPUT", reason: REASON.noForm };

      const m = (await deps.loadMirror()) || {};
      const bio = m.bio || null;
      if (!bio || !(bio.firstName || bio.lastName || bio.email)) return { outcome: "NEEDS_INPUT", reason: REASON.profileEmpty };
      const resp = await deps.sendTo(tabId, {
        type: "JAF_BATCH_FILL",
        bio, resume: m.resume || null, file: m.file || null,
        // autoAdvance is forced off: a batch tab never presses Next/Continue on its own.
        options: { autoAdvance: false, autoAddRows: true, resume: m.resumeRef || null, batch: info },
      }, forms[0].frameId).catch(() => null);
      if (!resp || !resp.ok) return { outcome: "FAILED", reason: REASON.fillFailed };
      return { outcome: "READY" };
    }
    return { prepare };
  }

  JAF.prepareBatch = {
    MSG_BATCH, MSG_ACK, CONTRACT_VERSION, MAX_JOBS, MAX_CONCURRENT, OPEN_DELAY_MS, MAX_ATTEMPTS, RETRY_GAP_MS,
    ACK_BUDGET_MS, OUTBOX_TRIES, EVENTS, FINAL_STATES, ACTIVE_STATES, REASON, REASON_HELP, DETAIL_MAX,
    validate, cleanUrl, checkSession, checkRole, tenantOriginAllowed, devAtsOriginAllowed, devTenantOriginAllowed, ack,
    createReceiver, createController, createPreparer, summarize, stateKey,
  };
})();
