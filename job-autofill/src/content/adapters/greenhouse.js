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
    captureJob({ loc } = {}) {
      const path = (loc && loc.pathname) || "";
      const m = path.match(/\/jobs\/(\d+)/);
      let gh = null;
      try { gh = new URLSearchParams((loc && loc.search) || "").get("gh_jid"); } catch (e) {}
      return { atsPlatform: "greenhouse", externalJobId: (m && m[1]) || gh || null };
    },
  };

  JAF.adapters.push(greenhouse);
})();
