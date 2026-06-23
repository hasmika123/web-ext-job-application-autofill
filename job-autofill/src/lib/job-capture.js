/* job-capture.js — JAF.jobCapture
 *
 * Reads the current job page and returns a canonical JobCapture DTO for the tracker:
 *   { company, role, location, jobUrl, externalJobId, atsPlatform, jobDescription }
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
    const generic = fromGeneric(doc, loc);

    return {
      // Descriptive fields: JSON-LD first, then adapter, then generic.
      company: pick("company", [jsonld, acap, generic]),
      role: pick("role", [jsonld, acap, generic]),
      location: pick("location", [jsonld, acap, generic]),
      jobDescription: pick("jobDescription", [jsonld, acap, generic]),
      // Identity: the adapter (public URL shape) is authoritative; JSON-LD identifier next.
      externalJobId: pick("externalJobId", [acap, jsonld, generic]),
      atsPlatform: acap.atsPlatform || null,
      jobUrl: pick("jobUrl", [acap, generic]) || stripHash(loc && loc.href),
    };
  }

  JAF.jobCapture = {
    captureJob,
    detectAdapter,
    // exposed for tests
    fromJsonLd,
    fromGeneric,
    findJobPosting,
    htmlToText,
  };
})();
