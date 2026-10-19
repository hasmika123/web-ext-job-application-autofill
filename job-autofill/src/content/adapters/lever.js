/* lever.js — Lever hosted applications (jobs.lever.co/<company>/<id>/apply) */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  const lever = {
    id: "lever",
    label: "Lever",
    matches() {
      return location.hostname === "jobs.lever.co" ||
        !!document.querySelector('form[action*="lever"], .application-form, input[name="resume"]');
    },
    plan(values) {
      const f = F();
      const byName = {
        name: f.fullName, email: f.email, phone: f.phone, org: null,
        // Lever's "Current location" is an async autocomplete input[name=location];
        // seed it with the user's city (BUG-2 — it was previously missed entirely).
        location: f.city,
        "urls[LinkedIn]": f.linkedin, "urls[GitHub]": f.github,
        "urls[Portfolio]": f.website, "urls[Other]": f.website,
      };
      const items = [];
      Object.entries(byName).forEach(([name, field]) => {
        if (!field) return;
        const el = document.querySelector('input[name="' + name + '"], textarea[name="' + name + '"]');
        if (el && B.isFillable(el) && values[field] !== undefined)
          items.push({ el, field, value: values[field], label: name, kind: B.elKind(el) });
      });
      return items;
    },
    fileInput() {
      return document.querySelector('input[name="resume"], input[type="file"]');
    },
    // jobs.lever.co/<company>/<postingId>[/apply] — the postingId is a stable UUID.
    // Descriptive fields are read from the page (markup captured from a real Rover
    // posting + its /apply page): the header (.posting-header h2 + .location) and the
    // logo alt ("<Company> logo") are on both; the description sections
    // ([data-qa=job-description], the posting-requirements lists, closing text) are on
    // the posting page only — /apply carries just a truncated <meta> description.
    captureJob({ doc, loc } = {}) {
      const segs = ((loc && loc.pathname) || "").split("/").filter(Boolean);
      const id = segs[1] && !/^apply$/i.test(segs[1]) ? segs[1] : null;
      const out = { atsPlatform: "lever", externalJobId: id };
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d || !d.querySelector) return out;
      const role = B.blockText(d.querySelector(".posting-header h2"));
      if (role) out.role = role;
      const where = B.blockText(d.querySelector(".posting-header .posting-categories .location"));
      if (where) out.location = where;
      const logo = d.querySelector(".main-header-logo img[alt]");
      let company = logo && logo.getAttribute("alt").replace(/\s*logo\s*$/i, "").trim();
      if (!company && role && (d.title || "").endsWith(" - " + role)) company = d.title.slice(0, -(role.length + 3)).trim();
      if (company) out.company = company;
      const sections = Array.from(d.querySelectorAll(".section-wrapper:not(.accent-section) > .section.page-centered"))
        .filter((s) => !s.matches('.last-section-apply, .application-form, [data-qa="ai-disclaimer"]'));
      const desc = B.blockText(sections);
      if (desc) out.jobDescription = desc;
      return out;
    },
  };

  JAF.adapters.push(lever);
})();
