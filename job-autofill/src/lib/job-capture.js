/* job-capture.js — JAF.jobCapture
 *
 * Reads the current job page and returns a canonical JobCapture DTO for the tracker:
 *   { company, role, location, jobUrl, externalJobId, atsPlatform, jobDescription, salary }
 *
 * Extractor chain (the ROADMAP order):
 *   1. schema.org/JobPosting JSON-LD  — standardized across most ATS/boards, so it
 *      wins for the descriptive fields (title/company/location/description).
 *   2. adapter.captureJob({loc})      — per-site, AUTHORITATIVE for externalJobId +
 *      atsPlatform (both derived from the public URL shape, not tenant DOM).
 *   3. generic <meta>/heuristics      — og:* + <title> + canonical, the final fallback.
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
    const AMT = "\\d{2,3}(?:,\\d{3})+|\\d{2,3}(?:\\.\\d+)?\\s?[kK]|\\d{4,6}";
    const PERIOD = "(?:\\s?(?:per|/|a|an)\\s?(?:year|annum|yr|hour|hr|month|mo|week|wk))";
    const RANGE = new RegExp(
      "(?:" + CUR + ")\\s?(?:" + AMT + ")(?:\\s?(?:-|–|—|to)\\s?(?:(?:" + CUR + ")\\s?)?(?:" + AMT + "))?" + PERIOD + "?",
      "i",
    );
    const KW = /salary|salaries|compensation|\bcomp\b|\bpay\b|pay range|pay rate|wage|\bOTE\b|remuneration/i;
    const kw = t.search(KW);
    if (kw !== -1) {
      const m = t.slice(Math.max(0, kw - 20), kw + 160).match(RANGE);
      if (m) return cleanSalary(m[0]);
    }
    // No keyword nearby → require a currency range WITH a pay period, anywhere.
    const STRICT = new RegExp(
      "(?:" + CUR + ")\\s?(?:" + AMT + ")\\s?(?:-|–|—|to)\\s?(?:(?:" + CUR + ")\\s?)?(?:" + AMT + ")" + PERIOD,
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

    // Salary: the JSON-LD amount (or an adapter, if any) wins; else scan the page text.
    let salary = pick("salary", [jsonld, acap, generic]);
    if (!salary) {
      const bodyText = doc && doc.body ? doc.body.textContent || "" : "";
      salary = salaryFromText(bodyText || jsonld.jobDescription);
    }

    return {
      // Descriptive fields: JSON-LD first, then adapter, then generic.
      company: pick("company", [jsonld, acap, generic]),
      role: pick("role", [jsonld, acap, generic]),
      location: pick("location", [jsonld, acap, generic]),
      jobDescription: pick("jobDescription", [jsonld, acap, generic]),
      salary: salary,
      // Identity: a filled-ATS adapter is authoritative; then the URL-shape board id;
      // then the JSON-LD identifier. (Board id beats JSON-LD's, which can be an internal
      // requisition number — the URL id is what the user sees and what dedups.)
      externalJobId: pick("externalJobId", [acap, boards, jsonld, generic]),
      atsPlatform: acap.atsPlatform || boards.atsPlatform || null,
      jobUrl: pick("jobUrl", [acap, generic]) || stripHash(loc && loc.href),
    };
  }

  JAF.jobCapture = {
    captureJob,
    detectAdapter,
    // exposed for tests
    fromJsonLd,
    fromGeneric,
    boardCapture,
    findJobPosting,
    htmlToText,
    moneyAmount,
    salaryFromText,
  };
})();
