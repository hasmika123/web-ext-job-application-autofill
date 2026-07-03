/* job-capture.js — JAF.jobCapture
 *
 * Reads the current job page and returns a canonical JobCapture DTO for the tracker:
 *   { company, role, location, jobUrl, externalJobId, atsPlatform, jobDescription,
 *     salary, salaryParsed, jobType, jobMode, sources }
 *
 * Extractor chain (the ROADMAP order):
 *   1. schema.org/JobPosting JSON-LD  — standardized across most ATS/boards, so it
 *      wins for the descriptive fields (title/company/location/description).
 *   2. adapter.captureJob({loc})      — per-site, AUTHORITATIVE for externalJobId +
 *      atsPlatform (both derived from the public URL shape, not tenant DOM).
 *   3. generic <meta>/heuristics      — og:* + <title> + canonical, the final fallback.
 *
 * Every captured field is provenance-tagged in `sources` (field → "jsonld" | "adapter"
 * | "board" | "generic" | "text"), so callers can tell a structured-data hit from a
 * heuristic one. `salaryParsed` carries the queryable numbers
 * ({ min, max, currency, period }) alongside the display string when derivable.
 *
 * Pure reads — no network, no DOM mutation, no auto-anything. Attaches to window.JAF
 * so it loads in the content script and popup alike. The fields are merged per-field
 * (first non-empty wins, in the priority each field calls for), so a page that only
 * has og:tags still yields a usable capture.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  const MAX_DESC = 20000; // keep the full JD (Teal-style) but cap pathological pages.

  function str(v) {
    if (v == null) return undefined;
    const s = String(v).replace(/\s+/g, " ").trim();
    return s || undefined;
  }

  // Strip HTML tags + decode the handful of entities ATS descriptions actually use.
  function htmlToText(html) {
    if (html == null) return undefined;
    let s = String(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return undefined;
    return s.length > MAX_DESC ? s.slice(0, MAX_DESC) : s;
  }

  // ---- salary (schema.org baseSalary/estimatedSalary + a conservative text fallback) ----
  const CUR_SYMBOL = {
    USD: "$", CAD: "C$", AUD: "A$", NZD: "NZ$", GBP: "£", EUR: "€", INR: "₹",
    JPY: "¥", CNY: "¥", CHF: "CHF ", SEK: "kr ", BRL: "R$", MXN: "MX$", SGD: "S$", ZAR: "R",
  };
  const UNIT_SUFFIX = {
    YEAR: "/yr", ANNUAL: "/yr", HOUR: "/hr", HOURLY: "/hr", MONTH: "/mo", MONTHLY: "/mo",
    WEEK: "/wk", WEEKLY: "/wk", DAY: "/day", DAILY: "/day",
  };

  function fmtNum(n) {
    const x = Number(String(n).replace(/[, ]/g, ""));
    if (!isFinite(x) || x <= 0) return undefined;
    return Math.round(x).toLocaleString("en-US");
  }
  function curSymbol(c) {
    if (!c) return "";
    const s = String(c).trim();
    const up = s.toUpperCase();
    if (CUR_SYMBOL[up]) return CUR_SYMBOL[up];
    if (/^[^\w\s]{1,3}$/.test(s)) return s;        // already a symbol ($, £, €)
    if (/^[A-Z]{3}$/.test(up)) return up + " ";    // unknown ISO code → "SEK 1,000"
    return "";
  }
  function unitSuffix(u) {
    if (!u) return "";
    return UNIT_SUFFIX[String(u).toUpperCase().replace(/[^A-Z]/g, "")] || "";
  }

  // ---- structured salary --------------------------------------------------
  // The board can only filter/sort on numbers, so alongside the display string we
  // derive { min?, max?, currency?, period? } (period ∈ YEAR|MONTH|WEEK|DAY|HOUR).
  // Same conservatism as the display path: derived only from a strong signal
  // (schema.org amounts or an already-matched salary string), never guessed.
  const SYMBOL_CUR = {
    "$": "USD", "C$": "CAD", "A$": "AUD", "NZ$": "NZD", "£": "GBP", "€": "EUR",
    "₹": "INR", "MX$": "MXN", "S$": "SGD", "R$": "BRL",
  };

  function unitPeriod(u) {
    if (!u) return undefined;
    const k = String(u).toUpperCase().replace(/[^A-Z]/g, "");
    if (/^(YEAR|ANNUAL|YR)/.test(k)) return "YEAR";
    if (/^(HOUR|HR)/.test(k)) return "HOUR";
    if (/^(MONTH|MO)/.test(k)) return "MONTH";
    if (/^(WEEK|WK)/.test(k)) return "WEEK";
    if (/^(DAY|DAILY)/.test(k)) return "DAY";
    return undefined;
  }

  function numVal(n) {
    const x = Number(String(n).replace(/[, ]/g, ""));
    return isFinite(x) && x > 0 ? x : undefined;
  }

  function isoCurrency(c) {
    if (!c) return undefined;
    const s = String(c).trim();
    const up = s.toUpperCase();
    if (/^[A-Z]{3}$/.test(up)) return up;
    return SYMBOL_CUR[s] || SYMBOL_CUR[up] || undefined;
  }

  // schema.org MonetaryAmount → structured numbers. Walks the same shapes as
  // moneyAmount (value / minValue+maxValue / nested MonetaryAmount.value).
  function moneyParsed(m) {
    if (m == null) return undefined;
    if (Array.isArray(m)) { for (const x of m) { const r = moneyParsed(x); if (r) return r; } return undefined; }
    if (typeof m === "number" || typeof m === "string") return parseSalaryText(str(m)); // pre-formatted
    if (typeof m !== "object") return undefined;
    const currency = isoCurrency(m.currency || m.currencyCode || m.salaryCurrency);
    let min, max, unit = m.unitText || m.unitCode;
    const v = m.value;
    if (v && typeof v === "object") {
      unit = v.unitText || v.unitCode || unit;
      if (v.minValue != null || v.maxValue != null) { min = v.minValue; max = v.maxValue; }
      else if (v.value != null) min = v.value;
    } else if (v != null) {
      min = v;
    } else if (m.minValue != null || m.maxValue != null) {
      min = m.minValue; max = m.maxValue;
    }
    min = min != null ? numVal(min) : undefined;
    max = max != null ? numVal(max) : undefined;
    if (min == null && max == null) return undefined;
    if (min != null && max != null && max < min) { const t = min; min = max; max = t; }
    const out = {};
    if (min != null) out.min = min;
    if (max != null) out.max = max;
    const period = unitPeriod(unit);
    if (currency) out.currency = currency;
    if (period) out.period = period;
    return out;
  }

  // Parse an already-captured salary STRING ("$120,000 – $150,000/yr", "£45k",
  // "$25–$30 per hour") into structured numbers. Only runs on text the salary
  // extractors matched (or a schema.org pre-formatted string) — never a raw page.
  function parseSalaryText(s) {
    const t = str(s);
    if (!t) return undefined;
    const cur = t.match(/C\$|A\$|NZ\$|MX\$|S\$|R\$|[$£€₹]|\b(USD|GBP|EUR|CAD|AUD|INR|NZD|SGD|BRL|MXN|ZAR|CHF|SEK|JPY|CNY)\b/i);
    const currency = cur ? isoCurrency(cur[0]) : undefined;
    let period;
    if (/(?:per|\/|an?)\s?(?:year|annum|yr)\b|annually/i.test(t)) period = "YEAR";
    else if (/(?:per|\/|an?)\s?(?:hour|hr)\b|hourly/i.test(t)) period = "HOUR";
    else if (/(?:per|\/|a)\s?(?:month|mo)\b|monthly/i.test(t)) period = "MONTH";
    else if (/(?:per|\/|a)\s?(?:week|wk)\b|weekly/i.test(t)) period = "WEEK";
    else if (/(?:per|\/|a)\s?day\b|daily/i.test(t)) period = "DAY";
    const nums = [];
    const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kK]\b)?/g;
    let m;
    while ((m = re.exec(t)) && nums.length < 2) {
      let x = numVal(m[1]);
      if (x == null) continue;
      if (m[2]) x *= 1000;
      nums.push(x);
    }
    if (!nums.length || (!currency && !period)) return undefined; // number alone = too weak
    let min = nums[0], max = nums[1];
    if (max != null && max < min) { const x = min; min = max; max = x; }
    const out = { min };
    if (max != null) out.max = max;
    if (currency) out.currency = currency;
    if (period) out.period = period;
    return out;
  }

  // A schema.org MonetaryAmount (baseSalary/estimatedSalary) → "$120,000 – $150,000/yr".
  function moneyAmount(m) {
    if (m == null) return undefined;
    if (Array.isArray(m)) { for (const x of m) { const r = moneyAmount(x); if (r) return r; } return undefined; }
    if (typeof m === "number" || typeof m === "string") {
      const s = str(m);
      return s && /\d/.test(s) ? s : undefined; // a pre-formatted string like "$120k–$150k/yr"
    }
    if (typeof m !== "object") return undefined;
    const currency = m.currency || m.currencyCode || m.salaryCurrency;
    let min, max, unit = m.unitText || m.unitCode;
    const v = m.value;
    if (v && typeof v === "object") {
      unit = v.unitText || v.unitCode || unit;
      if (v.minValue != null || v.maxValue != null) { min = v.minValue; max = v.maxValue; }
      else if (v.value != null) min = v.value;
    } else if (v != null) {
      min = v;
    } else if (m.minValue != null || m.maxValue != null) {
      min = m.minValue; max = m.maxValue;
    }
    const sym = curSymbol(currency);
    const nmin = min != null ? fmtNum(min) : undefined;
    const nmax = max != null ? fmtNum(max) : undefined;
    if (!nmin && !nmax) return undefined;
    const range = nmin && nmax && nmin !== nmax ? sym + nmin + " – " + sym + nmax : sym + (nmin || nmax);
    return (range + unitSuffix(unit)) || undefined;
  }

  function cleanSalary(s) {
    return str(
      String(s)
        .replace(/\s+/g, " ")
        .replace(/\s*[-–—]\s*/g, "–") // normalize hyphen/dash ranges
        .replace(/\s+to\s+/gi, "–")   // "80,000 to 95,000" → "80,000–95,000"
        .trim(),
    );
  }

  // Conservative visible-text fallback for pages that show a salary but publish no JSON-LD amount.
  // Anchored near a salary keyword (to avoid matching funding/revenue money), or — with no keyword —
  // only a clear currency RANGE that carries a pay period. Never a bare number. (Dossier rule: we
  // capture a strong signal, we don't guess.)
  function salaryFromText(text) {
    if (!text) return undefined;
    const t = String(text).replace(/\s+/g, " ").slice(0, 20000);
    const CUR = "[$£€₹]|USD|GBP|EUR|CAD|AUD|C\\$|A\\$";
    const BIG = "\\d{2,3}(?:,\\d{3})+|\\d{2,3}(?:\\.\\d+)?\\s?[kK]|\\d{4,6}"; // annual-ish (thousands)
    const SMALL = "\\d{1,3}(?:\\.\\d{1,2})?"; // hourly-ish (e.g. 25, 25.50)
    const PERIOD = "(?:\\s?(?:per|/|an?)\\s?(?:year|annum|yr|hour|hr|month|mo|week|wk))";
    const HOUR = "(?:\\s?(?:per|/|an?)\\s?(?:hour|hr))";

    // Hourly wages use small numbers, so they must ALWAYS carry the hour period (else "$25 fee"
    // would match). Checked first — it's the most specific, period-gated pattern.
    const HOURLY = new RegExp(
      "(?:" + CUR + ")\\s?(?:" + SMALL + ")(?:\\s?(?:-|–|—|to)\\s?(?:(?:" + CUR + ")\\s?)?(?:" + SMALL + "))?" + HOUR,
      "i",
    );
    const hm = t.match(HOURLY);
    if (hm) return cleanSalary(hm[0]);

    // Annual/large amounts (thousands), anchored near a salary keyword.
    const BIGRANGE = new RegExp(
      "(?:" + CUR + ")\\s?(?:" + BIG + ")(?:\\s?(?:-|–|—|to)\\s?(?:(?:" + CUR + ")\\s?)?(?:" + BIG + "))?" + PERIOD + "?",
      "i",
    );
    const KW = /salary|salaries|compensation|\bcomp\b|\bpay\b|pay range|pay rate|wage|\bOTE\b|remuneration/i;
    const kw = t.search(KW);
    if (kw !== -1) {
      const m = t.slice(Math.max(0, kw - 20), kw + 160).match(BIGRANGE);
      if (m) return cleanSalary(m[0]);
    }
    // No keyword nearby → require a currency range WITH a pay period, anywhere.
    const STRICT = new RegExp(
      "(?:" + CUR + ")\\s?(?:" + BIG + ")\\s?(?:-|–|—|to)\\s?(?:(?:" + CUR + ")\\s?)?(?:" + BIG + ")" + PERIOD,
      "i",
    );
    const m2 = t.match(STRICT);
    return m2 ? cleanSalary(m2[0]) : undefined;
  }

  // ---- 1. schema.org/JobPosting JSON-LD ----------------------------------
  function typeIsJobPosting(t) {
    return t === "JobPosting" || (Array.isArray(t) && t.indexOf("JobPosting") !== -1);
  }

  // A JSON-LD payload may be a single object, an array, or wrap nodes in @graph.
  function findJobPosting(data) {
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data)) {
      for (const node of data) {
        const hit = findJobPosting(node);
        if (hit) return hit;
      }
      return null;
    }
    if (typeIsJobPosting(data["@type"])) return data;
    if (Array.isArray(data["@graph"])) return findJobPosting(data["@graph"]);
    return null;
  }

  function orgName(org) {
    if (!org) return undefined;
    if (typeof org === "string") return str(org);
    if (Array.isArray(org)) return orgName(org[0]);
    return str(org.name);
  }

  function addressPart(v) {
    if (!v) return undefined;
    return typeof v === "string" ? str(v) : str(v.name);
  }

  function jobLocationText(jl) {
    if (!jl) return undefined;
    if (Array.isArray(jl)) return jobLocationText(jl[0]);
    if (typeof jl === "string") return str(jl);
    const addr = jl.address || jl;
    if (typeof addr === "string") return str(addr);
    if (!addr || typeof addr !== "object") return undefined;
    const parts = [addr.addressLocality, addr.addressRegion, addressPart(addr.addressCountry)]
      .map(addressPart)
      .filter(Boolean);
    return parts.length ? parts.join(", ") : undefined;
  }

  function identifierValue(id) {
    if (!id) return undefined;
    if (typeof id === "string" || typeof id === "number") return str(id);
    if (Array.isArray(id)) return identifierValue(id[0]);
    return str(id.value);
  }

  // schema.org employmentType (FULL_TIME/PART_TIME/CONTRACTOR/TEMPORARY/INTERN/…; may be an
  // array or comma-joined) → our strict JobType enum name. Anything non-empty that doesn't map
  // to a named value becomes OTHER (the backend rejects unknown enum names). Undefined = absent.
  function employmentTypeToJobType(v) {
    if (Array.isArray(v)) { for (const x of v) { const r = employmentTypeToJobType(x); if (r) return r; } return undefined; }
    const s = str(v);
    if (!s) return undefined;
    const k = s.toUpperCase().replace(/[^A-Z]/g, "");
    if (/FULLTIME/.test(k)) return "FULL_TIME";
    if (/PARTTIME/.test(k)) return "PART_TIME";
    if (/CONTRACT/.test(k)) return "CONTRACT"; // CONTRACTOR / CONTRACT
    if (/INTERN/.test(k)) return "INTERNSHIP"; // INTERN / INTERNSHIP
    if (/TEMP/.test(k)) return "TEMPORARY";
    return "OTHER";
  }

  // Workplace mode → our strict JobMode enum name. schema.org only reliably signals REMOTE
  // (jobLocationType == "TELECOMMUTE"); beyond that we read a clear hybrid/remote cue from the
  // location text. We never guess ON_SITE. Undefined = absent.
  function jobModeFrom(locationType, locationText) {
    const lt = str(locationType);
    if (lt && /TELECOMMUTE|REMOTE/i.test(lt)) return "REMOTE";
    const t = str(locationText);
    if (t) {
      if (/\bhybrid\b/i.test(t)) return "HYBRID";
      if (/\bremote\b|work from home|\bwfh\b/i.test(t)) return "REMOTE";
    }
    return undefined;
  }

  // Employment type from the DESCRIPTION text — conservative: exactly ONE type keyword
  // in the whole text wins; two different types ("full-time or part-time", a full-time
  // JD that mentions the internship program) = ambiguous = no call. Dossier rule: we
  // capture a strong signal, we don't guess.
  function jobTypeFromText(text) {
    const t = str(text);
    if (!t) return undefined;
    const hits = [];
    if (/\bfull[\s-]?time\b/i.test(t)) hits.push("FULL_TIME");
    if (/\bpart[\s-]?time\b/i.test(t)) hits.push("PART_TIME");
    if (/\binternship\b|\bintern\b/i.test(t)) hits.push("INTERNSHIP");
    if (/\bcontract(?:or)?\s+(?:role|position|basis|opportunity)\b|\bc2c\b|\bcorp[\s-]?to[\s-]?corp\b/i.test(t)) hits.push("CONTRACT");
    if (/\btemporary\s+(?:role|position|assignment)\b/i.test(t)) hits.push("TEMPORARY");
    return hits.length === 1 ? hits[0] : undefined;
  }

  // Workplace mode from the DESCRIPTION text — only unambiguous phrasings. Plain
  // "hybrid"/"onsite" words are NOT enough here (a JD can say "hybrid cloud" or
  // "onsite interviews"); the word must be bound to work/role/location phrasing.
  function jobModeFromText(text) {
    const t = str(text);
    if (!t) return undefined;
    if (/\bhybrid\s+(?:work(?:ing|place)?|role|position|schedule|model|arrangement|environment|setup)\b|\b(?:work(?:place)?|location|schedule|model)\s*:?\s*hybrid\b/i.test(t)) return "HYBRID";
    if (/\b(?:fully|100%)\s*remote\b|\bremote[\s-](?:first|only|position|role|job|work)\b|\bwork(?:ing)?\s+from\s+home\b|\bwfh\b|\b(?:position|role|job)\s+is\s+remote\b|\blocation\s*:?\s*remote\b/i.test(t)) return "REMOTE";
    if (/\b(?:fully|100%)\s*on[\s-]?site\b|\bon[\s-]?site\s+(?:only|position|role|requirement)\b|\b(?:work(?:place)?|location)\s*:?\s*on[\s-]?site\b/i.test(t)) return "ON_SITE";
    return undefined;
  }

  function fromJsonLd(doc) {
    const out = {};
    if (!doc || !doc.querySelectorAll) return out;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent); } catch (e) { continue; }
      const jp = findJobPosting(data);
      if (!jp) continue;
      out.role = str(jp.title);
      out.company = orgName(jp.hiringOrganization);
      out.location = jobLocationText(jp.jobLocation || jp.applicantLocationRequirements);
      out.jobDescription = htmlToText(jp.description);
      out.externalJobId = identifierValue(jp.identifier);
      out.salary = moneyAmount(jp.baseSalary) || moneyAmount(jp.estimatedSalary);
      out.salaryParsed = moneyParsed(jp.baseSalary) || moneyParsed(jp.estimatedSalary);
      out.jobType = employmentTypeToJobType(jp.employmentType);
      out.jobLocationType = str(jp.jobLocationType); // raw; resolved to jobMode in captureJob
      break; // first JobPosting on the page wins
    }
    return out;
  }

  // ---- 3. generic <meta> / heuristics ------------------------------------
  function metaContent(doc, sel) {
    const el = doc && doc.querySelector ? doc.querySelector(sel) : null;
    return el ? str(el.getAttribute("content")) : undefined;
  }

  function stripHash(url) {
    return url ? String(url).split("#")[0] : undefined;
  }

  function fromGeneric(doc, loc) {
    const out = {};
    if (doc && doc.querySelector) {
      out.role = metaContent(doc, 'meta[property="og:title"]') || str(doc.title);
      out.company = metaContent(doc, 'meta[property="og:site_name"]');
      out.jobDescription =
        metaContent(doc, 'meta[name="description"]') || metaContent(doc, 'meta[property="og:description"]');
      const canon = doc.querySelector('link[rel="canonical"]');
      out.jobUrl = stripHash((canon && canon.href) || metaContent(doc, 'meta[property="og:url"]'));
    }
    if (!out.jobUrl && loc && loc.href) out.jobUrl = stripHash(loc.href);
    return out;
  }

  // ---- 2b. job-board recognition (URL shape, not DOM) --------------------
  // LinkedIn / Indeed / Dice aren't ATS we fill, so they have no adapter — but their
  // public URLs carry a stable job id and the site is obvious from the host. Deriving
  // {atsPlatform, externalJobId} from the URL (NOT tenant DOM) tags the saved entry with
  // its source and lets re-saving the same posting UPSERT instead of duplicating. The
  // descriptive fields still come from JSON-LD/og, which these boards all publish.
  function boardCapture(loc) {
    const out = {};
    if (!loc || !loc.href) return out;
    let host = "", path = "", params;
    try {
      const u = new URL(loc.href);
      host = u.hostname.replace(/^www\./, "").toLowerCase();
      path = u.pathname;
      params = u.searchParams;
    } catch (e) {
      return out;
    }
    const is = (h) => host === h || host.endsWith("." + h);
    const get = (k) => (params && params.get(k)) || undefined;

    if (is("linkedin.com")) {
      out.atsPlatform = "linkedin";
      const m = path.match(/\/jobs\/view\/(\d+)/);
      out.externalJobId = (m && m[1]) || get("currentJobId");
    } else if (is("indeed.com")) {
      out.atsPlatform = "indeed";
      out.externalJobId = get("jk") || get("vjk");
    } else if (is("dice.com")) {
      out.atsPlatform = "dice";
      const m = path.match(/\/job-?detail\/([0-9a-z-]+)/i) || path.match(/\/jobs\/detail\/([0-9a-z-]+)/i);
      out.externalJobId = m && m[1];
    } else if (/^google\.[a-z][a-z.]+$/.test(host) && path === "/search" && ((get("ibp") || "").indexOf("jobs") !== -1 || get("udm") === "8")) {
      // The Google Jobs widget (search?…ibp=htl;jobs or udm=8). Best-effort only: it's an
      // aggregator panel with no per-job JSON-LD and no stable per-job URL — htidocid is
      // the closest thing to a job token. Descriptive fields will usually be thin; the
      // real posting (click "Apply on …") captures far better. We still tag the source.
      out.atsPlatform = "google";
      out.externalJobId = get("htidocid");
    }
    if (!out.externalJobId) delete out.externalJobId; // keep merge "first non-empty" clean
    return out;
  }

  // ---- adapter detection (page context) ----------------------------------
  function detectAdapter() {
    const list = JAF.adapters || [];
    for (const a of list) {
      if (!a || a.id === "generic") continue;
      try { if (a.matches()) return a; } catch (e) { /* a flaky matcher shouldn't break capture */ }
    }
    return null;
  }

  // ---- job-page signal (soft validation) ---------------------------------
  // Does this page carry a STRONG signal that it's a job posting / application, as opposed
  // to just any site? Used to warn (never hard-block) before Save/Fill. A signal is any of:
  //   • a fillable-ATS adapter matches (Workday/Greenhouse/Lever/Ashby/Workable/Indeed…),
  //   • the page publishes a schema.org/JobPosting (JSON-LD), or
  //   • it's a recognized job board (LinkedIn/Indeed/Dice/Google Jobs — by URL shape).
  // Deliberately ignores the weak og:title/<title> fallback so a generic page isn't a "job".
  function hasJsonLdJobPosting(doc) {
    if (!doc || !doc.querySelectorAll) return false;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent); } catch (e) { continue; }
      if (findJobPosting(data)) return true;
    }
    return false;
  }

  function hasJobSignal(opts) {
    opts = opts || {};
    const doc = opts.doc || (typeof document !== "undefined" ? document : null);
    const loc = opts.loc || (typeof location !== "undefined" ? location : {});
    const adapter = opts.adapter !== undefined ? opts.adapter : detectAdapter();
    if (adapter) return true;
    if (hasJsonLdJobPosting(doc)) return true;
    if (boardCapture(loc).atsPlatform) return true;
    return false;
  }

  // ---- merge + public entry ----------------------------------------------
  function pick(field, sources) {
    for (const s of sources) {
      const v = s && s[field];
      if (v != null && String(v).trim() !== "") return v;
    }
    return undefined;
  }

  /**
   * Capture the current page (or an injected doc/loc/adapter, for tests/popup).
   * Returns a canonical JobCapture; absent fields are simply omitted (undefined).
   * `sources` tags every present field with where it came from
   * ("jsonld" | "adapter" | "board" | "generic" | "text") — a confidence signal for
   * callers (structured data > URL shape > meta tags > text heuristics).
   */
  function captureJob(opts) {
    opts = opts || {};
    const doc = opts.doc || (typeof document !== "undefined" ? document : null);
    const loc = opts.loc || (typeof location !== "undefined" ? location : {});
    const adapter = opts.adapter !== undefined ? opts.adapter : detectAdapter();

    const jsonld = fromJsonLd(doc);
    let acap = {};
    try {
      if (adapter && typeof adapter.captureJob === "function") acap = adapter.captureJob({ doc, loc }) || {};
    } catch (e) {
      acap = {};
    }
    const boards = boardCapture(loc);
    const generic = fromGeneric(doc, loc);

    // Per-field merge with provenance: first non-empty wins, and `sources[field]`
    // remembers which extractor supplied it.
    const sources = {};
    function take(field, list) {
      for (const pair of list) {
        const v = pair[1] && pair[1][field];
        if (v != null && String(v).trim() !== "") { sources[field] = pair[0]; return v; }
      }
      return undefined;
    }
    const J = ["jsonld", jsonld], A = ["adapter", acap], B = ["board", boards], G = ["generic", generic];

    // Salary: the JSON-LD amount (or an adapter, if any) wins; else scan the page text.
    let salary = take("salary", [J, A, G]);
    if (!salary) {
      const bodyText = doc && doc.body ? doc.body.textContent || "" : "";
      salary = salaryFromText(bodyText || jsonld.jobDescription);
      if (salary) sources.salary = "text";
    }
    // Structured salary: schema.org numbers when we have them, else parse the matched string.
    let salaryParsed = sources.salary === "jsonld" ? jsonld.salaryParsed : undefined;
    if (!salaryParsed && salary) salaryParsed = parseSalaryText(salary);
    if (salaryParsed && !sources.salaryParsed) sources.salaryParsed = sources.salary;

    const location = take("location", [J, A, G]);
    const jobDescription = take("jobDescription", [J, A, G]);

    // Job metadata → strict enum names (JobType/JobMode); still omitted when there is
    // no confident signal, but the DESCRIPTION text is now scanned (conservatively)
    // before giving up — a posting that says "full-time" / "fully remote" in the body
    // no longer yields null.
    let jobType = take("jobType", [J, A]);
    if (!jobType) {
      jobType = jobTypeFromText(jobDescription);
      if (jobType) sources.jobType = "text";
    }
    let jobMode = take("jobMode", [A]);
    if (!jobMode) {
      jobMode = jobModeFrom(jsonld.jobLocationType, undefined);
      if (jobMode) sources.jobMode = "jsonld";
    }
    if (!jobMode) {
      jobMode = jobModeFrom(undefined, location) || jobModeFromText(jobDescription);
      if (jobMode) sources.jobMode = "text";
    }

    return {
      // Descriptive fields: JSON-LD first, then adapter, then generic.
      company: take("company", [J, A, G]),
      role: take("role", [J, A, G]),
      location: location,
      jobType: jobType,
      jobMode: jobMode,
      jobDescription: jobDescription,
      salary: salary,
      salaryParsed: salaryParsed,
      // Identity: a filled-ATS adapter is authoritative; then the URL-shape board id;
      // then the JSON-LD identifier. (Board id beats JSON-LD's, which can be an internal
      // requisition number — the URL id is what the user sees and what dedups.)
      externalJobId: take("externalJobId", [A, B, J, G]),
      atsPlatform: acap.atsPlatform || boards.atsPlatform || null,
      jobUrl: take("jobUrl", [A, G]) || stripHash(loc && loc.href),
      sources: sources,
    };
  }

  JAF.jobCapture = {
    captureJob,
    detectAdapter,
    hasJobSignal,
    // exposed for tests
    fromJsonLd,
    fromGeneric,
    boardCapture,
    findJobPosting,
    hasJsonLdJobPosting,
    htmlToText,
    moneyAmount,
    moneyParsed,
    parseSalaryText,
    salaryFromText,
    employmentTypeToJobType,
    jobModeFrom,
    jobTypeFromText,
    jobModeFromText,
  };
})();
