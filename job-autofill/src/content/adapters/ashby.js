/* ashby.js — Ashby hosted applications (jobs.ashbyhq.com). React app;
 * fields are labelled, so we lean on the label scanner plus a few known names. */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  const ashby = {
    id: "ashby",
    label: "Ashby",
    matches() {
      return location.hostname === "jobs.ashbyhq.com" ||
        !!document.querySelector('[class*="ashby"], form[class*="Application"]');
    },
    plan(values) {
      const f = F();
      const items = [];
      const claimed = new Set();
      // Ashby's single legal-name field is `_systemfield_name` labeled "Legal First and
      // Last Name" — a FULL name. Claim it as fullName FIRST, so the generic scanner
      // (which would grab it as lastName from the "…last name" substring) can't win.
      const nameEl = document.querySelector('input[name="_systemfield_name"]');
      if (nameEl && B.isFillable(nameEl) && values[f.fullName] !== undefined) {
        items.push({ el: nameEl, field: f.fullName, value: values[f.fullName], label: "name", kind: "text" });
        claimed.add(nameEl);
      }
      // Ashby labels are explicit; reuse the generic scanner scoped to the form.
      const form = document.querySelector("form") || document;
      for (const c of B.scanGeneric(form)) {
        if (claimed.has(c.el) || values[c.field] === undefined) continue;
        items.push({ el: c.el, field: c.field, value: values[c.field], label: c.label, kind: c.kind });
      }
      return items;
    },
    fileInput() {
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return fileInputs.find((i) => /resume|cv/i.test(B.labelText(i))) || fileInputs[0] || null;
    },
    // jobs.ashbyhq.com/<company>/<jobId>[/application] — jobId is a stable UUID.
    captureJob({ loc } = {}) {
      const segs = ((loc && loc.pathname) || "").split("/").filter(Boolean);
      const id = segs[1] && !/^application$/i.test(segs[1]) ? segs[1] : null;
      return { atsPlatform: "ashby", externalJobId: id };
    },
  };

  JAF.adapters.push(ashby);
})();
