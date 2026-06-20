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
      // Ashby labels are explicit; reuse the generic scanner scoped to the form.
      const form = document.querySelector("form") || document;
      const found = B.scanGeneric(form);
      const items = [];
      for (const c of found) {
        if (values[c.field] === undefined) continue;
        items.push({ el: c.el, field: c.field, value: values[c.field], label: c.label, kind: c.kind });
      }
      // Ashby commonly uses _systemfield_name for the full name.
      const nameEl = document.querySelector('input[name="_systemfield_name"]');
      if (nameEl && values[f.fullName] && !items.find((i) => i.el === nameEl))
        items.push({ el: nameEl, field: f.fullName, value: values[f.fullName], label: "name", kind: "text" });
      return items;
    },
    fileInput() {
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return fileInputs.find((i) => /resume|cv/i.test(B.labelText(i))) || fileInputs[0] || null;
    },
  };

  JAF.adapters.push(ashby);
})();
