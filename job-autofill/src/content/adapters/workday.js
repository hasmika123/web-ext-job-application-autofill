/* workday.js — Workday adapter. BEHAVIOR lives here; all selector DATA comes from
 * the versioned ruleset (JAF.rules.site("workday")), so tenant/markup changes are
 * fixed by updating the ruleset, not by editing this file. See src/config/rules.js.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  JAF.adapters = JAF.adapters || [];
  const B = JAF.adapterBase;
  const F = () => JAF.schema.FIELDS;
  const R = () => JAF.rules.site("workday");          // active selector data
  const M = (c, rule) => JAF.rules.match(c, rule);    // shared predicate

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
  function fieldEls(root) {
    const trigs = Array.from((root || document).querySelectorAll(
      '[role="combobox"],[aria-haspopup="listbox"],button[aria-haspopup],[role="button"][aria-haspopup]'
    )).filter(B.isVisible);
    const seen = new Set(); const out = [];
    for (const el of textInputs(root).concat(trigs)) { if (!seen.has(el)) { seen.add(el); out.push(el); } }
    return out;
  }
  function findInput(rule, root) { return textInputs(root).find((el) => M(autoChain(el), rule)) || null; }
  function allInputsChain(sub, root) { return textInputs(root).filter((el) => autoChain(el).includes(sub)); }
  function findField(rule, root, extra) { return fieldEls(root).find((el) => M(autoChain(el), rule) && (!extra || extra(el))) || null; }

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

  function blockOf(anchor, siblings) {
    let blk = anchor.parentElement, hops = 0;
    while (blk && hops < 6) {
      const has = Array.from(blk.querySelectorAll('input,textarea,button,[role="combobox"]'))
        .some((el) => { const c = autoChain(el); return el !== anchor && siblings.some((k) => c.includes(k)); });
      if (has) break;
      blk = blk.parentElement; hops++;
    }
    return blk || anchor.parentElement || document;
  }
  function blocksFor(cfg) {
    return fieldEls().filter((e) => M(autoChain(e), cfg.anchor)).map((a) => blockOf(a, cfg.siblings));
  }
  function webInputs() { const r = R().websites; return textInputs().filter((el) => M(autoChain(el), r)); }

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
      const r = R();
      const items = [];
      const seen = new Set();
      const add = (el, field, value, label, kind, alts) => {
        if (!el || seen.has(el) || value === undefined || value === null || value === "") return;
        seen.add(el);
        items.push({ el, field, value, label: label || field, kind: kind || kindOf(el), alts: alts || [] });
      };
      const addIn = (blk, rule, value, label) => { const el = findField(rule, blk); add(el, label, value, label); };
      const addQuestion = (field, qrule, label) => {
        if (!qrule) return;
        const val = values[field];
        if (val === undefined || val === "") return;
        let el = fieldEls().find((e) => M(autoChain(e), qrule) && (B.isCustomDropdown(e) || e.tagName === "SELECT"));
        if (el) { add(el, field, val, label, el.tagName === "SELECT" ? "select" : "combo", yesNoAlts(val)); return; }
        if (qrule.yesNo) {
          const radio = Array.from(document.querySelectorAll('input[type="radio"]'))
            .find((e) => M(autoChain(e), qrule) || M((B.labelText(e) || "").toLowerCase(), qrule));
          if (radio) add(radio, field, val, label, "boolean");
        }
      };

      // ---- My Information (bio) ----
      add(findInput(r.fields.preferredName), f.preferredName, values[f.preferredName]);
      add(findInput(r.fields.firstName), f.firstName, values[f.firstName]);
      add(findInput(r.fields.lastName), f.lastName, values[f.lastName]);
      add(findInput(r.fields.email), f.email, values[f.email]);
      add(findInput(r.fields.phone), f.phone, values[f.phone]);
      add(findInput(r.fields.addressLine1), f.addressLine1, values[f.addressLine1]);
      add(findInput(r.fields.addressLine2), f.addressLine2, values[f.addressLine2]);
      add(findInput(r.fields.city), f.city, values[f.city]);
      add(findInput(r.fields.postalCode), f.postalCode, values[f.postalCode]);
      {
        const cc = JAF.schema.countryCandidates(values[f.country]);
        add(findField(r.fields.country, null, B.isCustomDropdown), f.country, cc[0], "Country", "combo", cc.slice(1));
        const sc = JAF.schema.stateCandidates(values[f.state]);
        add(findField(r.fields.state, null, B.isCustomDropdown), f.state, sc[0], "State / Province", "combo", sc.slice(1));
      }
      // ---- Work eligibility & EEO ----
      addQuestion(f.authorizedToWork, r.questions.authorizedToWork, "Authorized to work");
      addQuestion(f.requireSponsorship, r.questions.requireSponsorship, "Needs sponsorship");
      addQuestion(f.gender, r.questions.gender, "Gender");
      addQuestion(f.ethnicity, r.questions.ethnicity, "Hispanic / Latino");
      addQuestion(f.race, r.questions.race, "Race");
      addQuestion(f.veteranStatus, r.questions.veteranStatus, "Veteran status");
      addQuestion(f.disabilityStatus, r.questions.disabilityStatus, "Disability status");

      // ---- Work Experience blocks ----
      const exps = values.__experience || [];
      const expBlocks = blocksFor(r.exp);
      for (let i = 0; i < expBlocks.length && i < exps.length; i++) {
        const exp = exps[i], blk = expBlocks[i], n = i + 1;
        addIn(blk, r.exp.title, exp.title, `Exp ${n} · Title`);
        addIn(blk, r.exp.company, exp.company, `Exp ${n} · Company`);
        addIn(blk, r.exp.location, exp.location, `Exp ${n} · Location`);
        const desc = Array.isArray(exp.bullets) && exp.bullets.length ? exp.bullets.map((b) => "• " + b).join("\n") : (exp.description || "");
        addIn(blk, r.exp.description, desc, `Exp ${n} · Description`);
        const cur = Array.from(blk.querySelectorAll('input[type="checkbox"]'))
          .find((el) => (r.exp.currentText || ["current"]).some((k) => autoChain(el).includes(k) || (B.labelText(el) || "").toLowerCase().includes(k)));
        if (cur && exp.current) add(cur, `Exp ${n} · Current role`, "yes", `Exp ${n} · Current role`, "boolean");
        const s = parseMonthYear(exp.startDate), e = parseMonthYear(exp.endDate);
        const months = allInputsChain("month", blk), years = allInputsChain("year", blk);
        if (s.month && months[0]) add(months[0], `Exp ${n} · Start month`, String(s.month), `Exp ${n} · Start month`, "text");
        if (s.year && years[0]) add(years[0], `Exp ${n} · Start year`, s.year, `Exp ${n} · Start year`, "text");
        if (!exp.current && e.month && months[1]) add(months[1], `Exp ${n} · End month`, String(e.month), `Exp ${n} · End month`, "text");
        if (!exp.current && e.year && years[1]) add(years[1], `Exp ${n} · End year`, e.year, `Exp ${n} · End year`, "text");
      }
      addMoreNote(items, exps.length, expBlocks.length, "Work Experience", r.sections.experience);

      // ---- Education blocks ----
      const edu = values.__education || [];
      const eduBlocks = blocksFor(r.edu);
      for (let i = 0; i < eduBlocks.length && i < edu.length; i++) {
        const ed = edu[i], blk = eduBlocks[i], n = i + 1;
        addIn(blk, r.edu.school, ed.school, `Edu ${n} · School`);
        addIn(blk, r.edu.degree, ed.degree, `Edu ${n} · Degree`);
        addIn(blk, r.edu.field, ed.field, `Edu ${n} · Field of study`);
        const es = parseMonthYear(ed.startDate || ""), ee = parseMonthYear(ed.endDate || ed.gradDate || "");
        const eMonths = allInputsChain("month", blk), eYears = allInputsChain("year", blk);
        if (es.month && eMonths[0]) add(eMonths[0], `Edu ${n} · Start month`, String(es.month), `Edu ${n} · Start month`, "text");
        if (ee.month && eMonths[1]) add(eMonths[1], `Edu ${n} · End month`, String(ee.month), `Edu ${n} · End month`, "text");
        if (eYears.length >= 2) {
          if (es.year) add(eYears[0], `Edu ${n} · Start year`, es.year, `Edu ${n} · Start year`, "text");
          if (ee.year) add(eYears[1], `Edu ${n} · End year`, ee.year, `Edu ${n} · End year`, "text");
        } else if (ee.year && eYears[0]) {
          add(eYears[0], `Edu ${n} · Year`, ee.year, `Edu ${n} · Year`, "text");
        }
      }
      addMoreNote(items, edu.length, eduBlocks.length, "Education", r.sections.education);

      // ---- Languages ----
      const langs = values.__languages || [];
      const langBlocks = blocksFor(r.lang);
      for (let i = 0; i < langBlocks.length && i < langs.length; i++) {
        const lg = langs[i], blk = langBlocks[i], n = i + 1;
        addIn(blk, r.lang.language, lg.name || lg, `Lang ${n} · Language`);
        if (lg.proficiency) addIn(blk, r.lang.proficiency, lg.proficiency, `Lang ${n} · Proficiency`);
      }
      addMoreNote(items, langs.length, langBlocks.length, "Languages", r.sections.language);

      // ---- Websites / social URLs ----
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
      const skillsEl = findField(r.fields.skills, null, (e) => B.isCustomDropdown(e) || e.tagName === "INPUT");
      if (skillsEl && skillsArr.length) add(skillsEl, "Skills", skillsArr.slice(0, 20), "Skills", "combo-multi");

      return items;
    },

    fileInput() { return document.querySelector('input[type="file"]'); },

    async ensureRows(values) {
      const r = R();
      const sections = [
        { need: (values.__experience || []).length, count: () => blocksFor(r.exp).length, cfg: r.sections.experience },
        { need: (values.__education || []).length, count: () => blocksFor(r.edu).length, cfg: r.sections.education },
        { need: (values.__languages || []).length, count: () => blocksFor(r.lang).length, cfg: r.sections.language },
        { need: values.__webCount || 0, count: () => webInputs().length, cfg: r.sections.website },
      ];
      for (const sec of sections) {
        if (!sec.need || !sec.cfg) continue;
        let count = sec.count(), guard = 0;
        while (count < sec.need && guard < sec.need + 3) {
          const btn = addButtonFor(sec.cfg);
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
      const r = R().next;
      const node = Array.from(document.querySelectorAll('[data-automation-id]')).find((n) => {
        const id = (n.getAttribute("data-automation-id") || "").toLowerCase();
        const isBtn = n.matches('button,[role="button"]') || n.querySelector("button");
        if (!isBtn || !B.isVisible(n)) return false;
        return M(id, r);
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
  function sectionContainer(cfg) {
    const autoSub = cfg.auto, textRe = new RegExp(cfg.text, "i");
    let el = Array.from(document.querySelectorAll('[data-automation-id]'))
      .find((n) => (n.getAttribute("data-automation-id") || "").toLowerCase().includes(autoSub));
    if (el) return el.closest('[data-automation-id*="ection" i]') || el.parentElement || el;
    const heads = Array.from(document.querySelectorAll("h1,h2,h3,h4,legend,label,div,span"))
      .filter((h) => textRe.test(h.textContent || "") && (h.textContent || "").length < 60);
    if (heads.length) { let p = heads[0]; for (let i = 0; i < 4 && p.parentElement; i++) p = p.parentElement; return p; }
    return null;
  }
  function addButtonFor(cfg) {
    const textRe = new RegExp(cfg.text, "i");
    const excludeRe = cfg.exclude ? new RegExp(cfg.exclude, "i") : null;
    const btns = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(B.isVisible);
    let b = btns.find((x) => { const c = autoChain(x); return c.includes("add") && c.includes(cfg.auto); });
    if (b) return b;
    const section = sectionContainer(cfg);
    return btns.find((x) => {
      const t = (x.innerText || x.textContent || x.getAttribute("aria-label") || "").trim();
      if (!/^add\b/i.test(t)) return false;
      if (excludeRe && excludeRe.test(t)) return false;
      if (section && section.contains(x)) return true;
      return textRe.test(t) || /another/i.test(t);
    }) || null;
  }
  function addMoreNote(items, need, have, name, cfg) {
    if (need > have && (have > 0 || (cfg && sectionContainer(cfg)))) {
      items.push({ el: null, field: "More " + name, kind: "info", label: "More " + name,
        value: `${need - have} more ${name} entr${need - have === 1 ? "y" : "ies"} in this resume — click "Add" in ${name}, then re-run Dossier.` });
    }
  }

  JAF.adapters.push(workday);
})();
