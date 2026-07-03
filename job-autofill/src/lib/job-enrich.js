/* job-enrich.js — PURE core of the opt-in AI job-detail enrichment (SW-safe, no DOM,
 * no network).
 *
 * The capture chain (job-capture.js) is deterministic and conservative on purpose, so
 * postings that state their job type / workplace / salary only in prose can still come
 * back with gaps. When the user turns ON "AI job-detail enrichment" (its own toggle,
 * default OFF), the service worker sends the posting's PUBLIC description text — never
 * profile/resume data — to the same AI the user already chose for drafting (own key
 * first, else the opt-in server AI) and fills ONLY the gaps. Deterministic extraction
 * always wins: AI never overrides a field the page stated. Fields it adds are tagged
 * `sources[field] = "ai"` so the provenance stays honest.
 *
 * This file is only the gap detector + prompt builder + tolerant response validator +
 * merge; the model call, gating, and cache live in the service worker (which owns the
 * network). Attaches to JAF.jobEnrich on globalThis (service worker) or window (tests).
 */
(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const JAF = (root.JAF = root.JAF || {});

  const JOB_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY", "OTHER"];
  const JOB_MODES = ["REMOTE", "HYBRID", "ON_SITE"];
  const PERIODS = ["YEAR", "MONTH", "WEEK", "DAY", "HOUR"];
  const MIN_DESC = 200;   // below this there's no prose to extract from
  const DESC_SLICE = 6000;

  function desc(capture) {
    return String((capture && capture.jobDescription) || "").replace(/\s+/g, " ").trim();
  }

  // Which enrichable fields did the deterministic chain leave empty?
  function missingFields(capture) {
    capture = capture || {};
    const out = [];
    if (!capture.jobType) out.push("jobType");
    if (!capture.jobMode) out.push("jobMode");
    if (!capture.salary && !capture.salaryParsed) out.push("salary");
    return out;
  }

  function needsEnrichment(capture) {
    return desc(capture).length >= MIN_DESC && missingFields(capture).length > 0;
  }

  function buildEnrichPrompt(capture) {
    return (
      "Task: extract facts from the job posting text below. Reply with ONLY a JSON object — "
      + "no prose, no markdown — with exactly these keys:\n"
      + '{"jobType": ..., "jobMode": ..., "salaryMin": ..., "salaryMax": ..., "salaryCurrency": ..., "salaryPeriod": ...}\n'
      + "Rules: use null for anything the text does not EXPLICITLY state — never infer or guess.\n"
      + "jobType: one of " + JOB_TYPES.join(", ") + ", or null.\n"
      + "jobMode: one of " + JOB_MODES.join(", ") + ", or null.\n"
      + "salaryMin/salaryMax: plain numbers as stated (expand 120k to 120000); "
      + "salaryCurrency: a 3-letter ISO code; salaryPeriod: one of " + PERIODS.join(", ")
      + ". All four null unless the text states pay for THIS role.\n\n"
      + "Job posting text:\n" + desc(capture).slice(0, DESC_SLICE)
    );
  }

  function num(v) {
    const x = Number(v);
    return isFinite(x) && x > 0 ? x : undefined;
  }

  // Tolerant parse + strict validation — the server AI path rides through a
  // drafting-shaped prompt, so the reply may wrap the JSON in prose or a fence.
  // Anything that fails enum/number validation is dropped, never coerced into a
  // fill. Returns null when no valid JSON object is found.
  function parseEnrichResponse(text) {
    const m = String(text == null ? "" : text).match(/\{[\s\S]*?\}/);
    if (!m) return null;
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { return null; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out = {};
    const type = String(obj.jobType || "").toUpperCase();
    if (JOB_TYPES.indexOf(type) !== -1) out.jobType = type;
    const mode = String(obj.jobMode || "").toUpperCase().replace(/[^A-Z_]/g, "");
    if (JOB_MODES.indexOf(mode) !== -1) out.jobMode = mode;
    let min = num(obj.salaryMin), max = num(obj.salaryMax);
    if (min != null && max != null && max < min) { const t = min; min = max; max = t; }
    if (min != null) out.salaryMin = min;
    if (max != null) out.salaryMax = max;
    const cur = String(obj.salaryCurrency || "").toUpperCase();
    if (/^[A-Z]{3}$/.test(cur)) out.salaryCurrency = cur;
    const per = String(obj.salaryPeriod || "").toUpperCase();
    if (PERIODS.indexOf(per) !== -1) out.salaryPeriod = per;
    return out;
  }

  // Minimal display formatter for an AI-derived salary (mirrors job-capture's style).
  const SYM = { USD: "$", CAD: "C$", AUD: "A$", NZD: "NZ$", GBP: "£", EUR: "€", INR: "₹" };
  const SUF = { YEAR: "/yr", HOUR: "/hr", MONTH: "/mo", WEEK: "/wk", DAY: "/day" };
  function fmtSalary(p) {
    const sym = SYM[p.currency] || (p.currency ? p.currency + " " : "");
    const n = (x) => Math.round(x).toLocaleString("en-US");
    const min = p.min, max = p.max;
    if (min == null && max == null) return undefined;
    const range = min != null && max != null && min !== max ? sym + n(min) + " – " + sym + n(max) : sym + n(min != null ? min : max);
    return range + (SUF[p.period] || "");
  }

  // Merge the validated AI answer into the capture — ONLY into fields the
  // deterministic chain left empty; each filled field is provenance-tagged "ai".
  function applyEnrichment(capture, parsed) {
    if (!capture || !parsed) return capture;
    const out = Object.assign({}, capture);
    const sources = Object.assign({}, capture.sources || {});
    if (!out.jobType && parsed.jobType) { out.jobType = parsed.jobType; sources.jobType = "ai"; }
    if (!out.jobMode && parsed.jobMode) { out.jobMode = parsed.jobMode; sources.jobMode = "ai"; }
    if (!out.salary && !out.salaryParsed && (parsed.salaryMin != null || parsed.salaryMax != null)) {
      const sp = {};
      if (parsed.salaryMin != null) sp.min = parsed.salaryMin;
      if (parsed.salaryMax != null) sp.max = parsed.salaryMax;
      if (parsed.salaryCurrency) sp.currency = parsed.salaryCurrency;
      if (parsed.salaryPeriod) sp.period = parsed.salaryPeriod;
      out.salaryParsed = sp;
      out.salary = fmtSalary(sp);
      sources.salary = "ai";
      sources.salaryParsed = "ai";
    }
    out.sources = sources;
    return out;
  }

  // Stable per-posting cache key: identity (platform + id/url) + a hash of the
  // description slice, so an edited posting re-enriches but a revisit doesn't.
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function cacheKey(capture) {
    capture = capture || {};
    const id = capture.externalJobId || capture.jobUrl || "";
    return (capture.atsPlatform || "") + "|" + id + "|" + hash(desc(capture).slice(0, DESC_SLICE));
  }

  JAF.jobEnrich = {
    JOB_TYPES, JOB_MODES, PERIODS,
    missingFields, needsEnrichment, buildEnrichPrompt, parseEnrichResponse,
    applyEnrichment, cacheKey,
    // exposed for tests
    fmtSalary,
  };
})();
