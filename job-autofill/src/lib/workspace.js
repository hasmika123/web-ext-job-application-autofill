/* workspace.js — JAF.workspace   (Release 1 / WP5, docs/enterprise-v2/60 §6)
 *
 * Pure logic for the org workspaces in the drawer. No DOM, no chrome.*, no fetch: network goes
 * through the TrackingProvider seam (tracking.js), storage through JAF.storage.
 *
 *   • which account is connected (personal / enterprise) and what its roles may see   (modeOf)
 *   • marketer: trimming a job capture to the facts we send        (trimCapture, buildSavePayload)
 *   • consultant: matching the page to an assigned job             (urlKey, matchOpportunity)
 *
 * Hard rules this module encodes (CLAUDE.md / ADR-010):
 *   - A marketer-only session gets a FACADE (`marketerFacade`) that can list the consultants it may
 *     assign to and save a trimmed capture — and nothing else. It cannot read a bio, resume, answer
 *     or profile, and there is no fill/submit surface.
 *   - Nothing here clicks, submits or fills. The consultant fills with their OWN profile through
 *     the normal flow; "I applied" only reports a fact the consultant states.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  const BOARDS = ["linkedin", "indeed", "dice", "google"];
  const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"];
  const PAY_PERIODS = ["HOUR", "YEAR", "MONTH"];
  const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
  const KEY_INFO_MAX = 1000;
  const MAX_CONSULTANTS = 20;

  function str(v) {
    if (v == null) return undefined;
    const s = String(v).replace(/\s+/g, " ").trim();
    return s || undefined;
  }

  // ---- the connected account (separate enterprise accounts, docs/enterprise-v2/19 §6) -------
  // The extension is connected to ONE account at a time, personal OR enterprise; there is no
  // Personal/<Org> choice any more. `account` is what GET /api/profile/version says about the
  // connected account: { kind: "PERSONAL"|"ENTERPRISE", orgId, name, consultant, marketer }.
  const KINDS = ["PERSONAL", "ENTERPRISE"];
  const ENT_LOGIN = /^ent#/i; // the synthetic login of an enterprise account — never shown to a person

  function personalAccount() {
    return { kind: "PERSONAL", orgId: null, name: null, consultant: false, marketer: false };
  }

  // What the drawer offers for the account:
  //   personal   — today's drawer, byte for byte (also a missing / unreadable account)
  //   marketer   — enterprise with marketer && !consultant: ONLY "Save for consultant…"
  //   consultant — enterprise with consultant (marketer or not): normal fill + the Jobs tab
  //   org        — enterprise with neither role flag: behaves like personal
  function modeOf(account) {
    const a = account && typeof account === "object" ? account : null;
    if (!a || a.kind !== "ENTERPRISE") return { kind: "personal", org: null };
    const orgId = Number(a.orgId);
    if (!Number.isFinite(orgId) || orgId <= 0) return { kind: "personal", org: null };
    const org = { orgId, name: str(a.name) || "Organization", consultant: a.consultant === true, marketer: a.marketer === true };
    if (org.marketer && !org.consultant) return { kind: "marketer", org };
    if (org.consultant) return { kind: "consultant", org };
    return { kind: "org", org };
  }

  // The account chip: `Personal`, or `<OrgName> · Enterprise`, with the email beneath. `auth` is the
  // stored session record (trackingAuth). Never the login: an enterprise login is synthetic
  // (`ent#<orgId>#…`) and a personal one is only a last-resort label for a session from before
  // the email was handed over.
  function accountChip(auth) {
    const a = auth || {};
    const enterprise = a.kind === "ENTERPRISE";
    const email = str(a.email);
    const login = str(a.username);
    const safeLogin = login && !ENT_LOGIN.test(login) ? login : undefined;
    return {
      kind: enterprise ? "ENTERPRISE" : "PERSONAL",
      title: enterprise ? (str(a.orgName) || "Organization") + " · Enterprise" : "Personal",
      subtitle: email || (enterprise ? "" : safeLogin || ""),
    };
  }

  // Offline-safe local read of "which account is this, and what may it do". `known` is false
  // when an enterprise session has no cached role flags yet: the caller must then wait for the
  // server before reading any profile data (a marketer-only session never reads a profile).
  function accountFromLocal(auth, cached) {
    const a = auth || {};
    const c = cached && typeof cached === "object" ? cached : null;
    if (a.kind === "PERSONAL") return { account: personalAccount(), known: true };
    if (a.kind === "ENTERPRISE") {
      if (c && c.kind === "ENTERPRISE" && Number(c.orgId) === Number(a.orgId)) return { account: c, known: true };
      return { account: { kind: "ENTERPRISE", orgId: Number(a.orgId) || null, name: str(a.orgName) || null, consultant: false, marketer: false }, known: false };
    }
    // A session from before accounts carried a kind: trust what the server last said, else personal.
    return { account: c && KINDS.indexOf(c.kind) !== -1 ? c : personalAccount(), known: true };
  }

  // Surfaces per mode. The marketer row is the contract: no fill, no profile/bio/resume/answers.
  function surfacesOf(kind) {
    switch (kind) {
      case "marketer": return { fill: false, profile: false, resumes: false, jobsTab: false, saveForConsultant: true };
      case "consultant": return { fill: true, profile: true, resumes: true, jobsTab: true, saveForConsultant: false };
      default: return { fill: true, profile: true, resumes: true, jobsTab: false, saveForConsultant: false };
    }
  }

  // ---- URL keys (mirrors the server rules, docs/enterprise-v2/60 §2 `UrlKeys`) --------------
  // key = lower-cased scheme + host (no "www.") + NON-default port + path (dot segments resolved, trailing
  // slashes dropped, case kept) + query without tracking parameters (original order/case kept), no
  // fragment, capped at 1000. Path and query are percent-encoded the way the URL parser does (space ->
  // %20, "Señor" -> "Se%C3%B1or") and, on top, the characters some parser versions leave raw — a double
  // quote, < > ` ^ | { } and a backslash — are ALWAYS encoded, so the Java side (which parses by hand) can
  // produce the identical key. Existing %XX sequences are never touched.
  // `currentJobId` is NOT tracking: it is the job identity on LinkedIn collection URLs, so it stays.
  // Golden cases (key AND sha-256 hash): test/fixtures/url-keys.json, run by this suite and by the
  // server's UrlKeysTest.
  const TRACKING = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gh_src", "source", "src", "ref", "referrer",
    "lever-source", "lever-origin", "trk", "trackingid", "refid", "from", "iis", "iisn",
  ];
  const URL_KEY_MAX = 1000;

  // The characters that must be percent-encoded in the key's path and query (see above). After the URL
  // parser ran, the only ones left are the ASCII ones listed here; encodeURIComponent encodes them all.
  const UNSAFE = /[\u0000-\u0020\u007f-\uffff"<>`^|{}\\]/g;
  function encodeUnsafe(s) {
    return s.replace(UNSAFE, (ch) => { try { return encodeURIComponent(ch); } catch (e) { return "%EF%BF%BD"; } });
  }

  function urlKey(link) {
    if (link == null) return "";
    let u;
    try { u = new URL(String(link).trim()); } catch (e) { return ""; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host) return "";
    const path = encodeUnsafe(u.pathname.replace(/\/+$/, ""));
    let q = "";
    if (u.search && u.search.length > 1) {
      for (const part of u.search.slice(1).split("&")) {
        if (!part) continue;
        const k = part.split("=", 1)[0].toLowerCase();
        if (TRACKING.indexOf(k) !== -1 || k.indexOf("utm_") === 0) continue;
        q += (q ? "&" : "?") + encodeUnsafe(part);
      }
    }
    const key = u.protocol + "//" + host + (u.port ? ":" + u.port : "") + path + q;
    return key.length > URL_KEY_MAX ? key.slice(0, URL_KEY_MAX) : key;
  }

  // Which assigned job (if any) is the page the user is on? Identity first — (atsPlatform,
  // externalJobId) — then the normalised URL. `ctx` = { atsPlatform, externalJobId, urls:[…] }
  // (the capture's jobUrl and the tab's own URL). Never matches on company/title: that is only a
  // server-side *suggestion* the consultant confirms.
  function matchOpportunity(jobs, ctx) {
    ctx = ctx || {};
    const list = Array.isArray(jobs) ? jobs : [];
    const ats = str(ctx.atsPlatform) && String(ctx.atsPlatform).toLowerCase();
    const ext = str(ctx.externalJobId);
    if (ats && ext) {
      const hit = list.find((j) => j && j.atsPlatform && j.externalJobId &&
        String(j.atsPlatform).toLowerCase() === ats && String(j.externalJobId) === ext);
      if (hit) return { job: hit, by: "id" };
    }
    const keys = (Array.isArray(ctx.urls) ? ctx.urls : []).map(urlKey).filter(Boolean);
    if (keys.length) {
      const hit = list.find((j) => j && j.jobUrl && keys.indexOf(urlKey(j.jobUrl)) !== -1);
      if (hit) return { job: hit, by: "url" };
    }
    return null;
  }

  // Auto-detection of "submitted" exists only where the extension fills (contract §0.2). Elsewhere —
  // LinkedIn Easy Apply, Dice native apply, an unknown site — the consultant says so with "I applied".
  function needsManualApplied(atsPlatform) {
    const a = atsPlatform ? String(atsPlatform).toLowerCase() : "";
    return !a || BOARDS.indexOf(a) !== -1;
  }
  const MANUAL_APPLIED_COPY = "Press I applied after you submit.";

  // ---- marketer: trim the capture ------------------------------------------------------------
  function isoDate(v) {
    const s = str(v);
    if (!s) return undefined;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : undefined;
  }
  function whole(n) {
    const x = Number(n);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : undefined;
  }

  // A LinkedIn collection / search URL names the job only through ?currentJobId=; the consultant
  // should land on the job itself, so send the canonical view URL (the id is the identity anyway).
  function canonicalJobUrl(capture) {
    const url = str(capture.jobUrl);
    const ats = capture.atsPlatform ? String(capture.atsPlatform).toLowerCase() : "";
    const id = str(capture.externalJobId);
    if (url && ats === "linkedin" && id && /^\d+$/.test(id)) {
      try {
        const u = new URL(url);
        if (!/\/jobs\/view\/\d+/.test(u.pathname)) return "https://www.linkedin.com/jobs/view/" + id + "/";
      } catch (e) { /* keep url as is */ }
    }
    return url;
  }

  // JobCapture -> the facts a marketer sends. The job description is DROPPED (the server must never
  // receive or store it: contract §6). Nothing is guessed: a field the page did not give stays absent.
  // BOARD RULE: on LinkedIn/Indeed/Dice/Google a company that only came from the page's og:site_name
  // is the BOARD's name ("LinkedIn"), not the employer — it is blanked for the marketer to type.
  function trimCapture(capture) {
    const c = capture || {};
    const ats = c.atsPlatform ? String(c.atsPlatform).toLowerCase() : "";
    const out = {};
    const put = (k, v) => { if (v !== undefined && v !== "") out[k] = v; };

    put("title", str(c.role));
    let company = str(c.company);
    const provenance = c.sources && c.sources.company;
    if (BOARDS.indexOf(ats) !== -1 && provenance === "generic") company = undefined;
    put("company", company);
    put("location", str(c.location));
    const mode = str(c.jobMode) && String(c.jobMode).toUpperCase().replace(/[^A-Z]/g, "");
    put("workMode", mode && WORK_MODES.indexOf(mode) !== -1 ? mode : undefined);
    const type = str(c.jobType);
    put("employmentType", type && type.length <= 20 ? type : undefined);

    put("payLabel", str(c.salary) ? str(c.salary).slice(0, 80) : undefined);
    const sp = c.salaryParsed;
    if (sp && PAY_PERIODS.indexOf(sp.period) !== -1) {
      const min = whole(sp.min), max = whole(sp.max);
      if (min !== undefined || max !== undefined) {
        put("payMin", min);
        put("payMax", max);
        put("payPeriod", sp.period);
      }
    }
    put("jobUrl", canonicalJobUrl(c));
    put("externalJobId", str(c.externalJobId));
    put("atsPlatform", str(c.atsPlatform));
    put("postedOn", isoDate(c.postedOn || c.datePosted));
    return out;
  }

  // What the form must still ask the marketer for.
  function missingFields(trimmed) {
    const t = trimmed || {};
    return ["title", "company"].filter((k) => !str(t[k]));
  }

  // trimmed capture + the marketer's form -> the POST body. Edits to title/company/location win.
  function buildSavePayload(trimmed, form) {
    const f = form || {};
    const body = Object.assign({}, trimmed || {});
    for (const k of ["title", "company", "location"]) {
      if (f[k] !== undefined) {
        const v = str(f[k]);
        if (v) body[k] = v; else delete body[k];
      }
    }
    body.keyInfo = String(f.keyInfo == null ? "" : f.keyInfo).trim();
    if (f.priority) body.priority = f.priority;
    if (f.dueOn) body.dueOn = f.dueOn;
    body.consultantIds = (Array.isArray(f.consultantIds) ? f.consultantIds : []).map(Number);
    delete body.jobDescription; // belt and braces: never part of the body
    return body;
  }

  // The server's rules, checked before sending so the marketer gets a precise message offline-fast.
  function validateSave(body) {
    const b = body || {};
    const problems = [];
    const len = (v) => (v == null ? 0 : String(v).length);
    if (!len(b.title) || len(b.title) > 300) problems.push("Add a job title (up to 300 characters).");
    if (!len(b.company) || len(b.company) > 200) problems.push("Add the company (up to 200 characters).");
    if (!b.keyInfo || !String(b.keyInfo).trim()) problems.push("Add a note for the consultant.");
    else if (String(b.keyInfo).length > KEY_INFO_MAX) problems.push("The note is limited to " + KEY_INFO_MAX + " characters.");
    const ids = Array.isArray(b.consultantIds) ? b.consultantIds : [];
    if (!ids.length) problems.push("Pick at least one consultant.");
    else if (ids.length > MAX_CONSULTANTS) problems.push("Pick up to " + MAX_CONSULTANTS + " consultants.");
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) problems.push("Pick consultants from the list.");
    let urlOk = false;
    try {
      const u = new URL(String(b.jobUrl || ""));
      urlOk = u.protocol === "https:" && String(b.jobUrl).length <= 1000 && !/^(localhost|\[.*\]|\d{1,3}(\.\d{1,3}){3})$/i.test(u.hostname);
    } catch (e) { /* invalid */ }
    if (!urlOk) problems.push("This page's address can't be saved (it must be a public https link).");
    if (b.priority && PRIORITIES.indexOf(b.priority) === -1) problems.push("Priority must be Low, Medium or High.");
    if (b.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueOn)) problems.push("Due date must be a date.");
    return problems;
  }

  // The ONLY handle a marketer-only drawer session gets. By construction it cannot reach
  // pullProfile / listResumes / profile suggestions / AI / application tracking.
  function marketerFacade(provider, orgId) {
    return Object.freeze({
      orgId,
      listConsultants: (q) => provider.listMarketerConsultants(orgId, q),
      save: (body, idempotencyKey) => provider.saveForConsultant(orgId, body, idempotencyKey),
    });
  }

  function newIdempotencyKey() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    throw new Error("crypto.randomUUID is unavailable"); // never fall back to a guessable key
  }

  // One marketer save: validate -> POST with a fresh Idempotency-Key. `key` may be reused by the
  // caller to retry the SAME save safely (a new form submission mints a new key).
  async function marketerSave(facade, trimmed, form, key) {
    const body = buildSavePayload(trimmed, form);
    const problems = validateSave(body);
    if (problems.length) return { ok: false, problems };
    const res = await facade.save(body, key || newIdempotencyKey());
    return { ok: true, result: res, summary: describeSaveResult(res, form && form.names) };
  }

  const REASON_COPY = { CONSULTANT_INACTIVE: "isn't active right now", NOT_IN_SCOPE: "isn't one of your consultants" };

  // created / already existed / reason, per consultant.
  function describeSaveResult(res, names) {
    const results = (res && Array.isArray(res.results)) ? res.results : [];
    const nameOf = (id) => (names && names[id]) || "Consultant " + id;
    const created = results.filter((r) => !r.reason && !r.existing);
    const existing = results.filter((r) => !r.reason && r.existing);
    const skipped = results.filter((r) => r.reason);
    const lines = [];
    if (created.length) lines.push("Sent to " + created.map((r) => nameOf(r.consultantId)).join(", ") + ".");
    if (existing.length) lines.push("Already assigned to " + existing.map((r) => nameOf(r.consultantId)).join(", ") + ".");
    for (const r of skipped) lines.push(nameOf(r.consultantId) + " " + (REASON_COPY[r.reason] || "was skipped") + ".");
    const variant = created.length ? "success" : (existing.length && !skipped.length ? "success" : "error");
    const title = created.length ? "Saved for consultant" : existing.length && !skipped.length ? "Already saved" : "Nothing was saved";
    return { variant, title, description: lines.join(" ") };
  }

  function describeSaveError(e) {
    const code = e && e.code;
    const status = e && e.status;
    if (status === 422 || code === "SENSITIVE_CONTENT") return "The note looks like it contains sensitive details (such as an ID or card number). Remove them and try again.";
    if (status === 409 || code === "JOB_NOT_OPEN") return "This job is closed, so it can't be assigned.";
    if (status === 400) return (e && e.message) || "Some details were rejected. Check the form and try again.";
    if (status === 401) return "Your session expired. Sign in again on kiwiply.com.";
    if (status === 403 || status === 404) return "You can't assign jobs in this workspace.";
    if (status === 0) return "Couldn't reach Kiwiply. Check your connection.";
    return "Couldn't save this job. Please try again.";
  }

  // ---- consultant: assigned jobs (fetch + cache) ---------------------------------------------
  const CACHE_NAME = "assignedJobs";

  // Fresh list from the server (and cached under `ws:<orgId>:assignedJobs`); on any failure the last
  // cached list, flagged stale — the drawer should still show something offline.
  async function loadAssignedJobs(provider, storage, orgId) {
    try {
      const items = await provider.assignedJobs(orgId);
      try { await storage.saveWorkspaceCache(orgId, CACHE_NAME, { ts: Date.now(), items }); } catch (e) { /* cache is best-effort */ }
      return { items, stale: false };
    } catch (e) {
      let cached = null;
      try { cached = await storage.getWorkspaceCache(orgId, CACHE_NAME); } catch (e2) { /* none */ }
      if (cached && Array.isArray(cached.items)) return { items: cached.items, stale: true, error: e };
      throw e;
    }
  }

  JAF.workspace = {
    BOARDS, modeOf, surfacesOf, accountChip, accountFromLocal, personalAccount,
    urlKey, matchOpportunity, needsManualApplied, MANUAL_APPLIED_COPY,
    trimCapture, missingFields, buildSavePayload, validateSave,
    marketerFacade, marketerSave, newIdempotencyKey, describeSaveResult, describeSaveError,
    loadAssignedJobs, CACHE_NAME, URL_KEY_MAX, KEY_INFO_MAX, MAX_CONSULTANTS,
  };
})();
