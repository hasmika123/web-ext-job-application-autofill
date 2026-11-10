/* smartrecruiters.js — SmartRecruiters job pages (jobs.smartrecruiters.com/<Company>/<id>)
 *
 * CAPTURE-ONLY: this is a job READER, not a fill adapter. It registers on
 * JAF.jobReaders (consulted by job-capture when no fill adapter matches), never on
 * JAF.adapters — so Fill on SmartRecruiters keeps running on the generic scanner and
 * fill telemetry still reports it as an ATS with no dedicated adapter.
 *
 * The posting page publishes no JSON-LD, but it does carry schema.org JobPosting
 * MICRODATA (captured from a real ServiceNow posting): <main itemtype=".../JobPosting">
 * with itemprop title / hiringOrganization > name / jobLocation > address /
 * description (company description + responsibilities + qualifications + incentives).
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.jobReaders = JAF.jobReaders || [];
  const B = JAF.adapterBase;

  function posting(doc) {
    return doc && doc.querySelector ? doc.querySelector('[itemscope][itemtype$="schema.org/JobPosting"]') : null;
  }
  function metaProp(scope, prop) {
    const el = scope && scope.querySelector('meta[itemprop="' + prop + '"]');
    const v = el && (el.getAttribute("content") || "").trim();
    return v || undefined;
  }

  const smartrecruiters = {
    id: "smartrecruiters",
    matches({ doc, loc } = {}) {
      let host = (loc && loc.hostname) || "";
      if (!host && loc && loc.href) { try { host = new URL(loc.href).hostname; } catch (e) {} }
      host = host.toLowerCase();
      return /(^|\.)smartrecruiters\.com$/.test(host) && !!posting(doc);
    },
    // /<Company>/<numeric id>[-slug] — the numeric id is the stable posting id.
    captureJob({ doc, loc } = {}) {
      const m = ((loc && loc.pathname) || "").match(/^\/[^/]+\/(\d+)/);
      const out = { atsPlatform: "smartrecruiters", externalJobId: m ? m[1] : null };
      const jp = posting(doc);
      if (!jp) return out;
      const role = B.blockText(jp.querySelector('[itemprop="title"]'));
      if (role) out.role = role;
      const company = metaProp(jp.querySelector('[itemprop="hiringOrganization"]'), "name");
      if (company) out.company = company;
      const addr = jp.querySelector('[itemprop="jobLocation"] [itemprop="address"]');
      const where = ["addressLocality", "addressRegion", "addressCountry"].map((p) => metaProp(addr, p)).filter(Boolean);
      if (where.length) out.location = where.join(", ");
      const desc = B.blockText(jp.querySelector('[itemprop="description"]'));
      if (desc) out.jobDescription = desc;
      return out;
    },
  };

  JAF.jobReaders.push(smartrecruiters);
})();
