/* workday.js — Workday (*.myworkdayjobs.com / *.myworkday.com). The hardest ATS.
 *
 *  Matching: Workday gives inputs meaningless ids and hides meaning in
 *  data-automation-id on the input or a wrapping element, varying by tenant —
 *  so we match the automation-id CHAIN by substring, and fall back to scanGeneric.
 *
 *  Covers: My Information (name/contact/address) and My Experience (repeating
 *  Work Experience, Education, Languages and Websites blocks, plus Skills).
 *
 *  Repeating sections: ensureRows() clicks each section's "Add" button to create
 *  enough blocks for the resume before filling. Dropdowns (country, state,
 *  degree, language, proficiency, skills) are driven by base.selectCustom — it
 *  opens the prompt, filters, and clicks the option. If a value can't be matched
 *  the field is reported so you can set it by hand. Free-text fields (titles,
 *  company, role description, URLs, dates) fill directly.
 *
 *  Multi-step: fills the current step; re-run after advancing.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;

  function autoChain(el) {
    const ids = []; let n = el, hops = 0;
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
  // inputs/textareas + dropdown triggers (for fields that may be either), deduped
  function fieldEls(root) {
    const trigs = Array.from((root || document).querySelectorAll(
      '[role="combobox"],[aria-haspopup="listbox"],button[aria-haspopup],[role="button"][aria-haspopup]'
    )).filter(B.isVisible);
    const seen = new Set();
    const out = [];
    for (const el of textInputs(root).concat(trigs)) { if (!seen.has(el)) { seen.add(el); out.push(el); } }
    return out;
  }
  function findInput(test, root) { return textInputs(root).find((el) => test(autoChain(el), el)) || null; }
  function allInputs(test, root) { return textInputs(root).filter((el) => test(autoChain(el), el)); }
  function findField(test, root) { return fieldEls(root).find((el) => test(autoChain(el), el)) || null; }

  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  function parseMonthYear(s) {
    if (!s) return { month: null, year: null };
    s = String(s).toLowerCase();
    const year = (s.match(/\b(19|20)\d{2}\b/) || [])[0] || null;
    let month = null;
    const mName = MONTHS.findIndex((m) => s.includes(m));
    if (mName >= 0) month = mName + 1;
    if (!month) {
      const mNum = s.match(/\b(0?[1-9]|1[0-2])[\/\-\.](?:\d{2,4})\b/) || s.match(/\b(?:\d{2,4})[\/\-\.](0?[1-9]|1[0-2])\b/);
      if (mNum) month = parseInt(mNum[1], 10);
    }
    return { month, year };
  }

  // ---- entry-block helpers (generic across repeating sections) ----
  function blockOf(anchor, siblingKeywords) {
    let blk = anchor.parentElement, hops = 0;
    while (blk && hops < 6) {
      const has = Array.from(blk.querySelectorAll('input,textarea,button,[role="combobox"]'))
        .some((el) => { const c = autoChain(el); return el !== anchor && siblingKeywords.some((k) => c.includes(k)); });
      if (has) break;
      blk = blk.parentElement; hops++;
    }
    return blk || anchor.parentElement || document;
  }
  function experienceBlocks() {
    return fieldEls().filter((e) => { const c = autoChain(e); return c.includes("jobtitle") || c.includes("job title"); })
      .map((a) => blockOf(a, ["company", "description", "location", "employer"]));
  }
  function educationBlocks() {
    return fieldEls().filter((e) => { const c = autoChain(e); return c.includes("school") || c.includes("institution") || c.includes("university"); })
      .map((a) => blockOf(a, ["degree", "fieldofstudy", "field of study", "gradyear"]));
  }
  function languageBlocks() {
    return fieldEls().filter((e) => { const c = autoChain(e); return c.includes("language") && !c.includes("proficiency"); })
      .map((a) => blockOf(a, ["proficiency", "ability", "fluency", "comprehension"]));
  }
  function webInputs() { return allInputs((c) => c.includes("webaddress") || c.includes("web address") || c.includes("websiteurl")); }

  function kindOf(el) {
    if (el.tagName === "SELECT") return "select";
    if (B.isCustomDropdown(el)) return "combo";
    if (el.tagName === "TEXTAREA") return "textarea";
    return "text";
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
      const add = (el, field, value, label, kind, alts) => {
        if (!el || seen.has(el) || value === undefined || value === null || value === "") return;
        seen.add(el);
        items.push({ el, field, value, label: label || field, kind: kind || kindOf(el), alts: alts || [] });
      };
      const addIn = (blk, test, value, label) => { const el = findField(test, blk); add(el, label, value, label); };
      // EEO / Yes-No / category questions: dropdown, native select, or radio group.
      const addQuestion = (field, keywords, label, yesNo) => {
        const val = values[field];
        if (val === undefined || val === "") return;
        const has = (c) => keywords.some((k) => c.includes(k));
        let el = fieldEls().find((e) => has(autoChain(e)) && (B.isCustomDropdown(e) || e.tagName === "SELECT"));
        if (el) { add(el, field, val, label, el.tagName === "SELECT" ? "select" : "combo", yesNoAlts(val)); return; }
        if (yesNo) { // only drive a radio group for Yes/No questions, never category ones
          const radio = Array.from(document.querySelectorAll('input[type="radio"]')).find((e) => has(autoChain(e)) || has((B.labelText(e) || "").toLowerCase()));
          if (radio) add(radio, field, val, label, "boolean");
        }
      };

      // ---- My Information (bio) ----
      add(findInput((c) => c.includes("firstname") && c.includes("preferred")), f.preferredName, values[f.preferredName]);
      add(findInput((c) => c.includes("firstname") && !c.includes("preferred")), f.firstName, values[f.firstName]);
      add(findInput((c) => c.includes("lastname") && !c.includes("preferred")), f.lastName, values[f.lastName]);
      add(findInput((c) => c.includes("email") && !c.includes("verify") && !c.includes("confirm")), f.email, values[f.email]);
      add(findInput((c) => c.includes("phone") && !c.includes("device") && !c.includes("type") && !c.includes("extension") && !c.includes("code")), f.phone, values[f.phone]);
      add(findInput((c) => c.includes("addressline1") || c.includes("addline1") || (c.includes("address") && c.includes("line 1"))), f.addressLine1, values[f.addressLine1]);
      add(findInput((c) => c.includes("addressline2") || c.includes("addline2") || (c.includes("address") && c.includes("line 2"))), f.addressLine2, values[f.addressLine2]);
      add(findInput((c) => c.includes("city") || c.includes("municipality")), f.city, values[f.city]);
      add(findInput((c) => c.includes("postal") || c.includes("zip")), f.postalCode, values[f.postalCode]);
      // Country / State — dropdowns we drive (country first so state can load).
      // We pass full + abbreviated candidates so "GA" matches an option "Georgia".
      {
        const cc = JAF.schema.countryCandidates(values[f.country]);
        add(findField((c, e) => c.includes("countryregion") && !c.includes("subdivision") && B.isCustomDropdown(e)), f.country, cc[0], "Country", "combo", cc.slice(1));
        const sc = JAF.schema.stateCandidates(values[f.state]);
        add(findField((c, e) => (c.includes("subdivision") || c.includes("countryregionregion") || c.includes("state") || c.includes("province")) && B.isCustomDropdown(e)), f.state, sc[0], "State / Province", "combo", sc.slice(1));
      }
      // ---- Work eligibility & EEO (Application Questions / Voluntary Disclosures) ----
      addQuestion(f.authorizedToWork, ["authorizedtowork", "legallyauthorized", "righttowork", "workauthoriz", "eligibletowork", "authorizationtowork"], "Authorized to work", true);
      addQuestion(f.requireSponsorship, ["sponsorship", "requirevisa", "visasponsor", "needvisa", "immigration"], "Needs sponsorship", true);
      addQuestion(f.gender, ["gender", "_sex", "gender-identity"], "Gender", false);
      addQuestion(f.ethnicity, ["hispanic", "latino", "ethnicity"], "Hispanic / Latino", false);
      addQuestion(f.race, ["race", "ethnicbackground", "ethnicity-race"], "Race", false);
      addQuestion(f.veteranStatus, ["veteran", "military", "protectedveteran"], "Veteran status", false);
      addQuestion(f.disabilityStatus, ["disability", "disabled"], "Disability status", false);

      // ---- Work Experience blocks ----
      const exps = values.__experience || [];
      const expBlocks = experienceBlocks();
      for (let i = 0; i < expBlocks.length && i < exps.length; i++) {
        const exp = exps[i], blk = expBlocks[i], n = i + 1;
        addIn(blk, (c) => c.includes("jobtitle") || c.includes("job title"), exp.title, `Exp ${n} · Title`);
        addIn(blk, (c) => c.includes("company") || c.includes("employer"), exp.company, `Exp ${n} · Company`);
        addIn(blk, (c) => c.includes("location"), exp.location, `Exp ${n} · Location`);
        const desc = Array.isArray(exp.bullets) && exp.bullets.length ? exp.bullets.join("\n") : (exp.description || "");
        addIn(blk, (c) => c.includes("roledescription") || c.includes("description"), desc, `Exp ${n} · Description`);
        const cur = Array.from(blk.querySelectorAll('input[type="checkbox"]'))
          .find((el) => autoChain(el).includes("current") || (B.labelText(el) || "").toLowerCase().includes("current"));
        if (cur && exp.current) add(cur, `Exp ${n} · Current role`, "yes", `Exp ${n} · Current role`, "boolean");
        const s = parseMonthYear(exp.startDate), e = parseMonthYear(exp.endDate);
        const months = allInputs((c) => c.includes("month"), blk), years = allInputs((c) => c.includes("year"), blk);
        if (s.month && months[0]) add(months[0], `Exp ${n} · Start month`, String(s.month), `Exp ${n} · Start month`, "text");
        if (s.year && years[0]) add(years[0], `Exp ${n} · Start year`, s.year, `Exp ${n} · Start year`, "text");
        if (!exp.current && e.month && months[1]) add(months[1], `Exp ${n} · End month`, String(e.month), `Exp ${n} · End month`, "text");
        if (!exp.current && e.year && years[1]) add(years[1], `Exp ${n} · End year`, e.year, `Exp ${n} · End year`, "text");
      }
      addMoreNote(items, exps.length, expBlocks.length, "Work Experience", /work experience/i, "workexperience");

      // ---- Education blocks (school/degree/field often dropdowns) ----
      const edu = values.__education || [];
      const eduBlocks = educationBlocks();
      for (let i = 0; i < eduBlocks.length && i < edu.length; i++) {
        const ed = edu[i], blk = eduBlocks[i], n = i + 1;
        addIn(blk, (c) => c.includes("school") || c.includes("institution") || c.includes("university"), ed.school, `Edu ${n} · School`);
        addIn(blk, (c) => c.includes("degree"), ed.degree, `Edu ${n} · Degree`);
        addIn(blk, (c) => c.includes("fieldofstudy") || c.includes("field of study") || c.includes("major"), ed.field, `Edu ${n} · Field of study`);
        const ey = parseMonthYear(ed.endDate || ed.gradDate || "");
        const yrs = allInputs((c) => c.includes("year"), blk);
        if (ey.year && yrs[0]) add(yrs[0], `Edu ${n} · Year`, ey.year, `Edu ${n} · Year`, "text");
      }
      addMoreNote(items, edu.length, eduBlocks.length, "Education", /education/i, "education");

      // ---- Languages (name + proficiency dropdowns) ----
      const langs = values.__languages || [];
      const langBlocks = languageBlocks();
      for (let i = 0; i < langBlocks.length && i < langs.length; i++) {
        const lg = langs[i], blk = langBlocks[i], n = i + 1;
        addIn(blk, (c) => c.includes("language") && !c.includes("proficiency"), lg.name || lg, `Lang ${n} · Language`);
        if (lg.proficiency) addIn(blk, (c) => c.includes("proficiency") || c.includes("ability") || c.includes("fluency"), lg.proficiency, `Lang ${n} · Proficiency`);
      }
      addMoreNote(items, langs.length, langBlocks.length, "Languages", /languages?/i, "language");

      // ---- Websites / social URLs (plain text) ----
      const links = [values[f.linkedin], values[f.github], values[f.website]].filter(Boolean);
      let li = 0;
      for (const el of webInputs()) {
        const lbl = (B.labelText(el) || "").toLowerCase();
        if (lbl.includes("linkedin") && values[f.linkedin]) { add(el, f.linkedin, values[f.linkedin]); continue; }
        if (lbl.includes("github") && values[f.github]) { add(el, f.github, values[f.github]); continue; }
        if ((lbl.includes("portfolio") || lbl.includes("website") || lbl.includes("personal")) && values[f.website]) { add(el, f.website, values[f.website]); continue; }
        if (li < links.length) { add(el, "Website", links[li], `Website ${li + 1}`, "text"); li++; }
      }

      // ---- Skills (multiselect typeahead) ----
      const skillsArr = values.__skillsArray || [];
      const skillsEl = findField((c, e) => c.includes("skill") && (B.isCustomDropdown(e) || e.tagName === "INPUT"));
      if (skillsEl && skillsArr.length) add(skillsEl, "Skills", skillsArr.slice(0, 20), "Skills", "combo-multi");

      return items;
    },

    fileInput() { return document.querySelector('input[type="file"]'); },

    async ensureRows(values) {
      const sections = [
        { need: (values.__experience || []).length, count: () => experienceBlocks().length, auto: "workexperience", re: /work experience/i, excl: /address|education|skill|website|language|certification|referen/i },
        { need: (values.__education || []).length, count: () => educationBlocks().length, auto: "education", re: /education/i, excl: /address|experience|skill|website|language|certification|referen/i },
        { need: (values.__languages || []).length, count: () => languageBlocks().length, auto: "language", re: /languages?/i, excl: /address|experience|skill|website|education|certification|referen/i },
        { need: values.__webCount || 0, count: () => webInputs().length, auto: "website", re: /websites?/i, excl: /address|experience|skill|education|language|certification|referen/i },
      ];
      for (const sec of sections) {
        if (!sec.need) continue;
        let count = sec.count(), guard = 0;
        while (count < sec.need && guard < sec.need + 3) {
          const btn = addButtonFor(sec.auto, sec.re, sec.excl);
          if (!btn || !B.isVisible(btn)) break;
          btn.click();
          await B.waitFor(() => sec.count() > count, 2500);
          const now = sec.count();
          if (now <= count) break;
          count = now; guard++;
        }
      }
    },

    nextButton() {
      const node = Array.from(document.querySelectorAll('[data-automation-id]')).find((n) => {
        const id = (n.getAttribute("data-automation-id") || "").toLowerCase();
        const isBtn = n.matches('button,[role="button"]') || n.querySelector("button");
        if (!isBtn || !B.isVisible(n)) return false;
        return (id.includes("next") || id.includes("continue")) && !id.includes("submit") && !id.includes("previous") && !id.includes("back");
      });
      if (node) return node.matches('button,[role="button"]') ? node : node.querySelector("button");
      return B.findNextButton();
    },
  };

  function yesNoAlts(v) {
    const t = String(v).trim().toLowerCase();
    if (/^y(es)?$/.test(t)) return ["Yes", "Y"];
    if (/^n(o)?$/.test(t)) return ["No", "N"];
    return [];
  }

  function sectionContainer(autoSub, textRe) {
    let el = Array.from(document.querySelectorAll('[data-automation-id]'))
      .find((n) => (n.getAttribute("data-automation-id") || "").toLowerCase().includes(autoSub));
    if (el) return el.closest('[data-automation-id*="ection" i]') || el.parentElement || el;
    const heads = Array.from(document.querySelectorAll("h1,h2,h3,h4,legend,label,div,span"))
      .filter((h) => textRe.test(h.textContent || "") && (h.textContent || "").length < 60);
    if (heads.length) { let p = heads[0]; for (let i = 0; i < 4 && p.parentElement; i++) p = p.parentElement; return p; }
    return null;
  }
  function addButtonFor(autoSub, textRe, excludeRe) {
    const btns = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(B.isVisible);
    let b = btns.find((x) => { const c = autoChain(x); return c.includes("add") && c.includes(autoSub); });
    if (b) return b;
    const section = sectionContainer(autoSub, textRe);
    return btns.find((x) => {
      const t = (x.innerText || x.textContent || x.getAttribute("aria-label") || "").trim();
      if (!/^add\b/i.test(t)) return false;
      if (excludeRe && excludeRe.test(t)) return false;
      if (section && section.contains(x)) return true;
      return textRe.test(t) || /another/i.test(t);
    }) || null;
  }
  function addMoreNote(items, need, have, name, textRe, autoSub) {
    if (need > have && (have > 0 || sectionContainer(autoSub, textRe))) {
      items.push({ el: null, field: "More " + name, kind: "info", label: "More " + name,
        value: `${need - have} more ${name} entr${need - have === 1 ? "y" : "ies"} in this resume — click "Add" in ${name}, then re-run Dossier.` });
    }
  }

  JAF.adapters.push(workday);
})();
