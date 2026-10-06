/* fill-telemetry.js — what one autofill run reports (Phase 10.1). JAF.fillTelemetry
 *
 * COUNTS ONLY. Fields found, filled, failed, required left empty — never a value, never a
 * label, and never the page's hostname: the ATS is reduced to a fixed family ("workday",
 * "icims", … or "other") HERE, in the content script, so a company's careers domain never even
 * reaches the service worker. The server enforces the same vocabulary again rather than
 * trusting this file.
 *
 * Why the family and not the adapter: the five hosts with no adapter (iCIMS, Taleo,
 * SmartRecruiters, BambooHR, Jobvite) all run on the generic scanner, and they are exactly the
 * ones 10.4 has to choose between. The adapter id is reported too, so the panel can say how
 * much of an ATS's traffic had no dedicated adapter at all.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  // [registrable domain, family]. Order doesn't matter: a host matches a domain exactly or as a
  // subdomain of it, and no domain here is a suffix of another.
  const FAMILIES = [
    ["myworkdayjobs.com", "workday"],
    ["myworkday.com", "workday"],
    ["workday.com", "workday"],
    ["greenhouse.io", "greenhouse"],
    ["lever.co", "lever"],
    ["ashbyhq.com", "ashby"],
    ["workable.com", "workable"],
    ["icims.com", "icims"],
    ["taleo.net", "taleo"],
    ["smartrecruiters.com", "smartrecruiters"],
    ["bamboohr.com", "bamboohr"],
    ["jobvite.com", "jobvite"],
    ["indeed.com", "indeed"],
    ["successfactors.com", "successfactors"],
    ["successfactors.eu", "successfactors"],
    ["sapsf.com", "successfactors"],
    ["oraclecloud.com", "oracle"],
    ["linkedin.com", "linkedin"],
  ];

  const ADAPTERS = new Set(["generic", "greenhouse", "lever", "ashby", "workable", "workday", "indeed"]);
  const MAX = 500;

  /** The ATS family for a hostname, or "other". Never returns the hostname itself. */
  function atsFamily(hostname) {
    const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
    for (const [domain, family] of FAMILIES) {
      if (h === domain || h.endsWith("." + domain)) return family;
    }
    return "other";
  }

  function adapterId(id) {
    return ADAPTERS.has(id) ? id : "other";
  }

  function count(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX);
  }

  // A random UUID, generated here so a later "the user corrected a field" signal can name the
  // fill without waiting for the server's round trip. Random, so it identifies a fill, not a user.
  function newFillId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /** The event, ready to send. Everything is a family name, an adapter id, or a small integer. */
  function buildEvent(p) {
    p = p || {};
    const found = count(p.found);
    return {
      id: String(p.id || ""),
      ats: atsFamily(p.hostname),
      adapter: adapterId(p.adapter),
      fieldsFound: found,
      fieldsFilled: Math.min(count(p.filled), found),
      fieldsFailed: Math.min(count(p.failed), found),
      requiredLeftEmpty: count(p.requiredLeftEmpty),
    };
  }

  JAF.fillTelemetry = { atsFamily, adapterId, newFillId, buildEvent, FAMILIES };
})();
