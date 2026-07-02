/* app-tracking.js — JAF.appTracking
 *
 * Pure orchestration for the self-populating tracker (Phase 3.2): turn a JobCapture
 * into a DRAFT application, recognize a submission, and flip the entry to APPLIED.
 * No DOM mutation and no direct fetch — all network goes through a TrackingProvider
 * (see tracking.js). Loaded BOTH in content scripts (window.JAF) and the service
 * worker (importScripts), so it attaches to globalThis.JAF and never touches
 * `window`/`document` at module scope.
 *
 * Submission detection is intentionally CONSERVATIVE: a missed detection is recovered
 * by the web board's "Did you submit?" nudge (3.4), whereas a wrongly-APPLIED entry is
 * worse. So we only flip a DRAFT we created, on a recent same-tab signal, and we match
 * strong post-submit confirmation cues — never tenant-specific markup (the dossier rule).
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  function nonEmpty(v) { return v != null && String(v).trim() !== ""; }

  // --- submission heuristics ----------------------------------------------
  // URL path/hash cues for a post-submit confirmation page.
  const SUCCESS_URL =
    /(?:^|\/)(?:thanks|thank[-_ ]?you|thankyou|confirmation|confirmed|application[-_ ]?(?:complete[d]?|received|success|submitted|confirmation)|post[-_ ]?apply|submitted|success|complete[d]?)(?:\/|$|\?|#|-)/i;

  function isSuccessUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return SUCCESS_URL.test(u.pathname) || SUCCESS_URL.test(u.hash || "");
    } catch (e) {
      return SUCCESS_URL.test(String(url));
    }
  }

  // Strong, past-tense confirmation copy. Deliberately specific to avoid matching a
  // form's own "Submit application" button text.
  const SUCCESS_COPY = [
    /\bthank(?:s| you)\b[^.]{0,40}\bappl(?:y|ying|ication)/i,
    /\bapplication\b[^.]{0,30}\b(?:submitted|received|complete|completed|sent)\b/i,
    /\b(?:we(?:'| ha)?ve|successfully)\b[^.]{0,30}\breceived\b[^.]{0,25}\bapplication\b/i,
    /\byour application (?:has been|was)\b[^.]{0,20}\b(?:submitted|received|sent)\b/i,
    /\b(?:successfully|application)\b[^.]{0,10}\b(?:submitted|applied)\b/i,
  ];

  function hasSuccessSignal(doc) {
    const body = doc && doc.body;
    if (!body) return false;
    const text = (body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20000);
    if (!text) return false;
    return SUCCESS_COPY.some((re) => re.test(text));
  }

  // --- application assembly ------------------------------------------------
  // company + roleTitle are required server-side, so fall back to the URL host / a
  // generic label rather than dropping the entry (pinned 3.2: log on EVERY fill).
  function buildApplication(capture, resume, status) {
    capture = capture || {};
    let host = "";
    try { host = capture.jobUrl ? new URL(capture.jobUrl).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    const app = {
      company: nonEmpty(capture.company) ? capture.company : (host || "Unknown company"),
      roleTitle: nonEmpty(capture.role) ? capture.role : "Application",
      jobUrl: capture.jobUrl,
      location: capture.location,
      externalJobId: capture.externalJobId,
      atsPlatform: capture.atsPlatform,
      jobDescription: capture.jobDescription,
      status: status || "DRAFT",
      source: "extension",
    };
    // Salary range if the capture chain found one (schema.org baseSalary / a clear text range).
    // Only sent when present so the DTO stays clean for backends that don't store it yet.
    if (nonEmpty(capture.salary)) app.salary = capture.salary;
    if (resume && resume.serverId != null) app.resumeId = resume.serverId;
    return app;
  }

  function buildApplicationDraft(capture, resume) {
    return buildApplication(capture, resume, "DRAFT");
  }

  // --- provider-backed actions (best-effort callers wrap in try/catch) -----
  // Auto-log the DRAFT. A stale/unsynced resume link (the picked resume's serverId
  // doesn't resolve on this backend) must not lose the whole entry: on a 4xx that the
  // resume link could explain, retry once WITHOUT the link. The backend stays strict.
  async function pushDraft(provider, capture, resume) {
    const app = buildApplicationDraft(capture, resume);
    try {
      return await provider.pushApplication(app);
    } catch (e) {
      const linkMayBeBad = app.resumeId != null && e && (e.status === 404 || e.status === 400);
      if (!linkMayBeBad) throw e;
      const noLink = Object.assign({}, app);
      delete noLink.resumeId;
      return provider.pushApplication(noLink);
    }
  }

  // Save-a-job (Phase 3.3): a SAVED bookmark entry from the capture chain, no resume
  // attached. Upserts like everything else (dedup on externalJobId/jobUrl).
  async function pushSaved(provider, capture) {
    return provider.pushApplication(buildApplication(capture, null, "SAVED"));
  }

  async function confirmSubmission(provider, serverId, appliedAtIso) {
    return provider.updateApplication(serverId, {
      status: "APPLIED",
      submissionConfirmed: true,
      appliedAt: appliedAtIso,
    });
  }

  JAF.appTracking = {
    isSuccessUrl,
    hasSuccessSignal,
    buildApplication,
    buildApplicationDraft,
    pushDraft,
    pushSaved,
    confirmSubmission,
    // exposed for tests
    SUCCESS_URL,
    SUCCESS_COPY,
  };
})();
