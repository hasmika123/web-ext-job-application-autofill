/* workday.js — Workday (*.myworkdayjobs.com / *.myworkday.com). The hardest ATS.
 *
 *  Workday gives inputs meaningless ids (input-15, GUIDs) and hides the real
 *  field meaning in data-automation-id on the input OR a wrapping element.
 *  Those tokens vary between tenants, so we match the automation-id CHAIN by
 *  substring rather than by exact id, and lean on base.scanGeneric as backup.
 *
 *  This adapter covers two very different Workday steps:
 *   1. "My Information"  — name / email / phone / address (plain text inputs).
 *   2. "My Experience"   — repeating Work Experience blocks (title, company,
 *      location, dates, description), plus Websites, Education and Skills.
 *
 *  What we DON'T drive: custom dropdowns / typeaheads (country, state,
 *  phone-type, degree, field-of-study, skills). Typing into a Workday typeahead
 *  does NOT commit a selection — the listbox must be clicked — so we flag those
 *  as "needs manual selection" with the value to enter, instead of silently
 *  filling text that won't stick.
 *
 *  The flow is multi-step; we fill the current step. Re-run after advancing.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  // data-automation-id chain (self + ancestors), lowercased.
  function autoChain(el) {
    const ids = [];
    let n = el, hops = 0;
    while (n && n.getAttribute && hops < 6) {
      const a = n.getAttribute("data-automation-id");
      if (a) ids.push(a);
      n = n.parentElement; hops++;
    }
    return ids.join(" ").toLowerCase();
  }

  function textInputs(root) {
    return Array.from((root || document).querySelectorAll("input, textarea")).filter((el) => {
      if (!B.isFillable(el)) return false;
      const t = (el.type || "text").toLowerCase();
      return t === "text" || t === "email" || t === "tel" || t === "url" || t === "number" || el.tagName === "TEXTAREA";
    });
  }
  function findInput(test, root) { return textInputs(root).find((el) => test(autoChain(el), el)) || null; }
  function allInputs(test, root) { return textInputs(root).filter((el) => test(autoChain(el), el)); }

  // "Jan 2020" / "2020-01" / "01/2020" / "2020" -> {month:1-12|null, year:'YYYY'|null}
  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  function parseMonthYear(s) {
    if (!s) return { month: null, year: null };
    s = String(s).toLowerCase();
    let year = (s.match(/\b(19|20)\d{2}\b/) || [])[0] || null;
    let month = null;
    const mName = MONTHS.findIndex((m) => s.includes(m));
    if (mName >= 0) month = mName + 1;
    if (!month) {
      const mNum = s.match(/\b(0?[1-9]|1[0-2])[\/\-\.](?:\d{2,4})\b/) || s.match(/\b(?:\d{2,4})[\/\-\.](0?[1-9]|1[0-2])\b/);
      if (mNum) month = parseInt(mNum[1], 10);
    }
    return { month, year };
  }

  const workday = {
    id: "workday",
    label: "Workday",
    matches() {
      return /myworkdayjobs\.com$|myworkday\.com$/.test(location.hostname) ||
        !!document.querySelector('[data-automation-id]');
    },

    plan(values) {
      const f = F();
      const items = [];
      const seen = new Set();
      const add = (el, field, value, label, kind) => {
        if (!el || seen.has(el) || value === undefined || value === "") return;
        seen.add(el);
        items.push({ el, field, value, label: label || autoChain(el) || field, kind: kind || B.elKind(el) });
      };

      // ---- Step 1: My Information (bio) ----
      add(findInput((c) => c.includes("firstname") && c.includes("preferred")), f.preferredName, values[f.preferredName]);
      add(findInput((c) => c.includes("firstname") && !c.includes("preferred")), f.firstName, values[f.firstName]);
      add(findInput((c) => c.includes("lastname") && !c.includes("preferred")), f.lastName, values[f.lastName]);
      add(findInput((c) => c.includes("email") && !c.includes("verify") && !c.includes("confirm")), f.email, values[f.email]);
      add(findInput((c) => c.includes("phone") && !c.includes("device") && !c.includes("type") && !c.includes("extension") && !c.includes("code")), f.phone, values[f.phone]);
      add(findInput((c) => c.includes("addressline1") || c.includes("addline1") || (c.includes("address") && c.includes("line 1"))), f.addressLine1, values[f.addressLine1]);
      add(findInput((c) => c.includes("addressline2") || c.includes("addline2") || (c.includes("address") && c.includes("line 2"))), f.addressLine2, values[f.addressLine2]);
      add(findInput((c) => c.includes("city") || c.includes("municipality")), f.city, values[f.city]);
      add(findInput((c) => c.includes("postal") || c.includes("zip")), f.postalCode, values[f.postalCode]);

      // ---- Step 2: My Experience — Work Experience blocks ----
      const exps = values.__experience || [];
      const blocks = experienceBlocks();
      for (let i = 0; i < blocks.length; i++) {
        const exp = exps[i];
        if (!exp) break;
        const blk = blocks[i];
        const n = i + 1;
        add(findInput((c) => c.includes("jobtitle") || c.includes("job title"), blk), `Exp ${n} · Title`, exp.title, `Exp ${n} · Title`, "text");
        add(findInput((c) => c.includes("company") || c.includes("employer"), blk), `Exp ${n} · Company`, exp.company, `Exp ${n} · Company`, "text");
        add(findInput((c) => c.includes("location"), blk), `Exp ${n} · Location`, exp.location, `Exp ${n} · Location`, "text");
        const desc = Array.isArray(exp.bullets) && exp.bullets.length ? exp.bullets.join("\n") : (exp.description || "");
        add(findInput((c) => c.includes("roledescription") || c.includes("description"), blk), `Exp ${n} · Description`, desc, `Exp ${n} · Description`, "textarea");
        // "I currently work here" checkbox
        const cur = Array.from(blk.querySelectorAll('input[type="checkbox"]'))
          .find((el) => autoChain(el).includes("current") || B.labelText(el).toLowerCase().includes("current"));
        if (cur && exp.current) add(cur, `Exp ${n} · Current role`, "yes", `Exp ${n} · Current role`, "boolean");
        // dates (split month / year spinbutton inputs)
        const start = parseMonthYear(exp.startDate);
        const end = parseMonthYear(exp.endDate);
        const dateInputs = (chainHas) => allInputs((c) => c.includes(chainHas), blk);
        const monthInputs = dateInputs("month");
        const yearInputs = dateInputs("year");
        // first month/year = start, second = end (Workday renders From then To)
        if (start.month && monthInputs[0]) add(monthInputs[0], `Exp ${n} · Start month`, String(start.month), `Exp ${n} · Start month`, "text");
        if (start.year && yearInputs[0]) add(yearInputs[0], `Exp ${n} · Start year`, start.year, `Exp ${n} · Start year`, "text");
        if (!exp.current && end.month && monthInputs[1]) add(monthInputs[1], `Exp ${n} · End month`, String(end.month), `Exp ${n} · End month`, "text");
        if (!exp.current && end.year && yearInputs[1]) add(yearInputs[1], `Exp ${n} · End year`, end.year, `Exp ${n} · End year`, "text");
      }
      // more resume roles than blocks on the page → tell the user to add rows.
      if (exps.length > blocks.length && (blocks.length > 0 || hasSection(/work experience/i, "workexperience"))) {
        items.push({ el: null, field: "More work experience", value:
          `${exps.length - blocks.length} more role(s) in this resume — click "Add Another" in Work Experience, then re-run Dossier.`,
          kind: "info", label: "More work experience" });
      }

      // ---- Websites / social URLs (plain text inputs) ----
      const webEls = allInputs((c) => c.includes("webaddress") || c.includes("website") || c.includes("url"));
      const links = [values[f.linkedin], values[f.github], values[f.website]].filter(Boolean);
      // only auto-assign by position when the inputs are unlabeled generic web fields
      let li = 0;
      for (const el of webEls) {
        const lbl = B.labelText(el).toLowerCase();
        if (lbl.includes("linkedin") && values[f.linkedin]) { add(el, f.linkedin, values[f.linkedin]); continue; }
        if (lbl.includes("github") && values[f.github]) { add(el, f.github, values[f.github]); continue; }
        if ((lbl.includes("portfolio") || lbl.includes("website") || lbl.includes("personal")) && values[f.website]) { add(el, f.website, values[f.website]); continue; }
        if (li < links.length) { add(el, "Website", links[li], `Website ${li + 1}`, "text"); li++; }
      }

      // ---- Custom widgets we can't drive: flag manual with the value ----
      // Country / State on My Information.
      pushManualWidget(items, values, f.country, "Country", (c) => c.includes("countryregion") && !c.includes("subdivision"));
      pushManualWidget(items, values, f.state, "State / Province", (c) => c.includes("subdivision") || c.includes("countryregionregion"));
      // Skills typeahead.
      const skillsArr = values.__skillsArray || [];
      if (skillsArr.length && hasSection(/skills/i, "skill")) {
        items.push({ el: null, field: "Skills", value: skillsArr.slice(0, 30).join(", "), kind: "manual",
          label: "Skills", note: "Workday skills field is a typeahead — type each and pick from the list." });
      }
      // Education (school / degree / field are typeaheads or dropdowns).
      const edu = values.__education || [];
      if (edu.length && hasSection(/education/i, "education")) {
        edu.slice(0, 6).forEach((e, i) => {
          const parts = [e.school, e.degree, e.field].filter(Boolean).join(" · ");
          if (parts) items.push({ el: null, field: `Education ${i + 1}`, value: parts, kind: "manual",
            label: `Education ${i + 1}`, note: "Workday education fields are dropdowns/typeaheads — enter these manually." });
        });
      }

      return items;
    },

    fileInput() {
      // Resume upload uses a custom button; the underlying input is often hidden.
      return document.querySelector('input[type="file"]');
    },
  };

  // Find each Work Experience entry block: the smallest ancestor of a job-title
  // input that also contains a company (or description) input.
  function experienceBlocks() {
    const titles = textInputs().filter((el) => {
      const c = autoChain(el); return c.includes("jobtitle") || c.includes("job title");
    });
    const blocks = [];
    for (const t of titles) {
      let blk = t.parentElement, hops = 0;
      while (blk && hops < 6) {
        const hasCompany = Array.from(blk.querySelectorAll("input, textarea"))
          .some((el) => { const c = autoChain(el); return c.includes("company") || c.includes("description"); });
        if (hasCompany) break;
        blk = blk.parentElement; hops++;
      }
      blocks.push(blk || t.parentElement || document);
    }
    return blocks;
  }

  function pushManualWidget(items, values, field, friendly, test) {
    if (values[field] === undefined || values[field] === "") return;
    const el = Array.from(document.querySelectorAll('[data-automation-id]')).find((node) => {
      const c = autoChain(node);
      return test(c) && (node.matches('button,[role="button"],[role="listbox"],[role="combobox"],[aria-haspopup]') || node.querySelector('button,[role="combobox"]'));
    });
    if (el) items.push({ el, field, value: values[field], label: friendly, kind: "manual",
      note: "Workday dropdown — open it and pick this value yourself." });
  }

  function hasSection(reText, autoSub) {
    if (Array.from(document.querySelectorAll('[data-automation-id]')).some((n) =>
      (n.getAttribute("data-automation-id") || "").toLowerCase().includes(autoSub))) return true;
    const heads = document.querySelectorAll("h1,h2,h3,h4,legend,label,div,span");
    for (const h of heads) { if (reText.test(h.textContent || "") && (h.textContent || "").length < 60) return true; }
    return false;
  }

  JAF.adapters.push(workday);
})();
