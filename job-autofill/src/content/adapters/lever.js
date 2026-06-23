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
    captureJob({ loc } = {}) {
      const segs = ((loc && loc.pathname) || "").split("/").filter(Boolean);
      const id = segs[1] && !/^apply$/i.test(segs[1]) ? segs[1] : null;
      return { atsPlatform: "lever", externalJobId: id };
    },
  };

  JAF.adapters.push(lever);
})();
