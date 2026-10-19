/* greenhouse.js — Greenhouse classic (boards.greenhouse.io), new
 * (job-boards.greenhouse.io), and embedded forms (#grnhse_app). */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  function q(sel) { return document.querySelector(sel); }

  const greenhouse = {
    id: "greenhouse",
    label: "Greenhouse",
    matches() {
      return /greenhouse\.io$/.test(location.hostname) ||
        !!document.querySelector("#grnhse_app, #application_form, [data-mapped='true'][id^='first_name']") ||
        /greenhouse/i.test(document.documentElement.innerHTML.slice(0, 4000));
    },
    plan(values) {
      const f = F();
      // classic ids first, then new aria-based fields fall through to generic.
      const map = [
        ["#first_name", f.firstName],
        ["#last_name", f.lastName],
        ["#email", f.email],
        ["#phone", f.phone],
        ["#auto_complete_input", null], // location autocomplete (skip; ambiguous)
        ["#job_application_location", f.city],
      ];
      const items = [];
      for (const [sel, field] of map) {
        if (!field) continue;
        const el = q(sel);
        if (el && B.isFillable(el) && values[field] !== undefined)
          items.push({ el, field, value: values[field], label: field, kind: B.elKind(el) });
      }
      // links: Greenhouse new uses labelled inputs -> let generic catch them, but
      // also try common name patterns here.
      [["linkedin", f.linkedin], ["website", f.website], ["github", f.github]].forEach(([k, field]) => {
        const el = document.querySelector('input[name*="' + k + '" i], input[id*="' + k + '" i]');
        if (el && B.isFillable(el) && values[field] !== undefined && !items.find((i) => i.el === el))
          items.push({ el, field, value: values[field], label: field, kind: B.elKind(el) });
      });
      return items;
    },
    fileInput() {
      return q("#resume") || q("input[type=file][name*='resume' i]") ||
        document.querySelector('input[type="file"]');
    },
    // boards/job-boards.greenhouse.io/<company>/jobs/<id>, or embedded ?gh_jid=<id>.
    // The new job-boards pages publish no JSON-LD and their meta description is just the
    // location, so the posting is read from the page (markup captured from a real Figma
    // posting): .job__title h1, .job__location, .job__description (pay ranges included),
    // company from "<title>Job Application for <role> at <company>" or the logo's alt.
    captureJob({ doc, loc } = {}) {
      const path = (loc && loc.pathname) || "";
      const m = path.match(/\/jobs\/(\d+)/);
      let gh = null;
      try { gh = new URLSearchParams((loc && loc.search) || "").get("gh_jid"); } catch (e) {}
      const out = { atsPlatform: "greenhouse", externalJobId: (m && m[1]) || gh || null };
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d || !d.querySelector) return out;
      const text = (sel) => B.blockText(d.querySelector(sel));
      const role = text(".job__title h1");
      if (role) out.role = role;
      const where = text(".job__location");
      if (where) out.location = where;
      const desc = text(".job__description");
      if (desc) out.jobDescription = desc;
      const t = (d.title || "").match(/^Job Application for .+ at (.+)$/);
      const logo = d.querySelector(".job-post-container .image-container img[alt]");
      const company = (t && t[1].trim()) || (logo && logo.getAttribute("alt").replace(/\s*logo\s*$/i, "").trim());
      if (company) out.company = company;
      return out;
    },
  };

  JAF.adapters.push(greenhouse);
})();
