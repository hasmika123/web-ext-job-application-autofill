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
  const normTxt = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  // The prompt a control is answering: its group's heading/legend/label text.
  // Starts ABOVE the control so the control's own id/placeholder ("Select One")
  // is never mistaken for the question.
  function promptText(el) {
    try {
      const own = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      let p = el.parentElement, hops = 0, fallback = "";
      while (p && hops < 8) {
        const aid = ((p.getAttribute && p.getAttribute("data-automation-id")) || "").toLowerCase();
        const isGroup = (p.matches && p.matches('fieldset,[role="group"],[role="radiogroup"]')) ||
          /formfield|questionitem|questionnaire|selfident|disclosure|eeo|voluntary/.test(aid);
        if (isGroup) {
          const lab = p.querySelector && p.querySelector('legend,label,h2,h3,h4,[role="heading"]');
          if (lab && lab.textContent && lab.textContent.trim().length > 2) return lab.textContent;
          if (!fallback) {
            const t = (p.textContent || "").replace(/\s+/g, " ").trim();
            const stripped = own ? t.toLowerCase().split(own).join(" ").trim() : t;
            if (stripped.replace(/select one|select\.\.\.|choose one/ig, "").trim().length > 4) fallback = t.slice(0, 240);
          }
        }
        p = p.parentElement; hops++;
      }
      return fallback;
    } catch (e) { return ""; }
  }
  // Everything that identifies what a control is asking, normalized for matching.
  function questionContext(el) {
    return normTxt([autoChain(el), B.labelText(el) || "", promptText(el)].join(" "));
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
        // Match the control whose QUESTION PROMPT (not just its id) fits the rule.
        const el = fieldEls().find((e) => !seen.has(e) && (B.isCustomDropdown(e) || e.tagName === "SELECT") && M(questionContext(e), qrule));
        if (el) { add(el, field, val, label, el.tagName === "SELECT" ? "select" : "combo", optionAlts(field, val)); return; }
        if (qrule.yesNo) {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter((e) => !seen.has(e) && B.isVisible(e));
          const group = radios.filter((e) => M(questionContext(e), qrule));
          if (group.length) {
            const wantYes = /^y(es)?$|^true$/i.test(String(val).trim());
            const pick = group.find((e) => {
              const t = ((B.labelText(e) || "") + " " + (e.value || "")).toLowerCase();
              return wantYes ? /\byes\b|^y$|\btrue\b/.test(t) : /\bno\b|^n$|\bfalse\b/.test(t);
            }) || group[0];
            add(pick, field, val, label, "boolean");
          }
        }
      };

      // ---- My Information (bio) ----
      add(findInput(r.fields.preferredName), f.preferredName, values[f.preferredName]);
      add(findInput(r.fields.firstName), f.firstName, values[f.firstName]);
      add(findInput(r.fields.lastName), f.lastName, values[f.lastName]);
      // A single combined "Name" field (e.g. the Self-Identify form) — filled after
      // first/last so split-name pages always prefer those.
      add(findInput(r.fields.fullName), f.fullName, values[f.fullName], "Name");
      add(findInput(r.fields.email), f.email, values[f.email]);
      add(findInput(r.fields.phone), f.phone, values[f.phone]);
      add(findInput(r.fields.addressLine1), f.addressLine1, values[f.addressLine1]);
      add(findInput(r.fields.addressLine2), f.addressLine2, values[f.addressLine2]);
      add(findInput(r.fields.city), f.city, values[f.city]);
      add(findInput(r.fields.postalCode), f.postalCode, values[f.postalCode]);
      {
        const pickDrop = (e) => B.isCustomDropdown(e) || e.tagName === "INPUT" || e.tagName === "SELECT";
        const cc = JAF.schema.countryCandidates(values[f.country]);
        const cEl = findField(r.fields.country, null, pickDrop);
        if (cEl) add(cEl, f.country, cc[0], "Country", kindOf(cEl), cc.slice(1));
        const sc = JAF.schema.stateCandidates(values[f.state]);
        const sEl = findField(r.fields.state, null, pickDrop);
        if (sEl) add(sEl, f.state, sc[0], "State / Province", kindOf(sEl), sc.slice(1));
      }
      // ---- Work eligibility & EEO ----
      addQuestion(f.authorizedToWork, r.questions.authorizedToWork, "Authorized to work");
      addQuestion(f.requireSponsorship, r.questions.requireSponsorship, "Needs sponsorship");
      addQuestion(f.gender, r.questions.gender, "Gender");
      addQuestion(f.ethnicity, r.questions.ethnicity, "Hispanic / Latino");
      addQuestion(f.race, r.questions.race, "Race");
      addQuestion(f.veteranStatus, r.questions.veteranStatus, "Veteran status");
      addQuestion(f.disabilityStatus, r.questions.disabilityStatus, "Disability status");

      // ---- Self-Identification of Disability (CC-305) ----
      // A standalone form with its own Name / Date / Language fields and a
      // "check one box" disability question (checkboxes, not a dropdown) — none of
      // which the bio/EEO matchers above handle.
      {
        const disChecks = Array.from(document.querySelectorAll('input[type="checkbox"]'))
          .filter((cb) => B.isVisible(cb) && /disabilit|do not (want|wish) to answer/i.test(B.labelText(cb)));
        const onForm = disChecks.length >= 2 || !!document.querySelector('[data-automation-id*="disabilityform" i],[data-automation-id*="selfidentif" i]');
        if (onForm) {
          // Date signed = today. Workday renders this as a 3-part spinbutton group
          // (Month/Day/Year), not one text input — fill each section.
          const now = new Date();
          const dWrap = Array.from(document.querySelectorAll("[data-automation-id]"))
            .find((n) => /datesignedon|datesigned|signaturedate/i.test(n.getAttribute("data-automation-id") || ""));
          const dScope = dWrap || document;
          const dParts = [["datesectionmonth", now.getMonth() + 1], ["datesectionday", now.getDate()], ["datesectionyear", now.getFullYear()]];
          let dAny = false;
          dParts.forEach(([sub, val]) => {
            const el = Array.from(dScope.querySelectorAll("input")).find((i) => (i.getAttribute("data-automation-id") || "").toLowerCase().includes(sub));
            if (el && B.isVisible(el)) { add(el, "Date", String(val), "Date (today)", "text"); dAny = true; }
          });
          if (!dAny) { const dEl = findInput(r.fields.dateSigned); if (dEl) add(dEl, "Date", todayMDY(), "Date (today)", "text"); }
          // The form's own Language selector defaults to English.
          const langEl = fieldEls().find((e) => !seen.has(e) && (B.isCustomDropdown(e) || e.tagName === "SELECT") && /language/i.test(questionContext(e)));
          if (langEl) add(langEl, "Form language", "English", "Form language", langEl.tagName === "SELECT" ? "select" : "combo", ["English"]);
          // Tick the checkbox matching the saved disability answer.
          const dv = values[f.disabilityStatus];
          if (dv && disChecks.length) {
            const pick = pickDisabilityCheckbox(disChecks, dv, B.labelText);
            if (pick) add(pick, "Disability status", "yes", "Disability status", "boolean");
          }
        }
      }

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
        // Resumes often store degree + field together ("B.S. in Computer Science").
        // Split so the Degree control gets the credential and Field of Study gets
        // the subject when a separate field value wasn't parsed.
        const degVal = ed.degree ? String(ed.degree).replace(/\s+in\s+.*/i, "").trim() : ed.degree;
        let fieldVal = ed.field;
        if (!fieldVal && ed.degree && /\sin\s/i.test(ed.degree)) fieldVal = String(ed.degree).replace(/^.*?\sin\s+/i, "").trim();
        const degEl = findField(r.edu.degree, blk);
        if (degEl) add(degEl, `Edu ${n} · Degree`, degVal, `Edu ${n} · Degree`, kindOf(degEl), degreeAlts(degVal));
        addIn(blk, r.edu.field, fieldVal, `Edu ${n} · Field of study`);
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
  // Expand a free-text degree ("BS", "Bachelor's", "Bachelor of Science") into the
  // verbose option labels Workday tenants use ("Bachelor of Science (BS)"), tried in
  // order by selectCustom until one matches the dropdown.
  function degreeAlts(v) {
    if (!v) return [];
    const t = String(v).toLowerCase().replace(/[.’']/g, "");
    const out = [];
    const push = (...a) => a.forEach((x) => { if (!out.includes(x)) out.push(x); });
    if (/\b(ph\s?d|doctor of philosophy|doctorate)\b/.test(t)) push("Doctor of Philosophy (PhD)", "Doctorate");
    if (/\b(jd|juris doctor)\b/.test(t)) push("Juris Doctor (JD)");
    if (/\b(md|doctor of medicine)\b/.test(t)) push("Doctor of Medicine (MD)");
    if (/\b(mba|master.* of business)\b/.test(t)) push("Masters of Business Administration (MBA)", "Master of Business Administration");
    if (/\b(ms|msc|master.* of science)\b/.test(t)) push("Masters of Science (MS)", "Master of Science");
    if (/\b(ma|master.* of arts)\b/.test(t)) push("Masters of Arts (MA)", "Master of Arts");
    if (/\bmaster/.test(t)) push("Masters of Science (MS)", "Masters of Arts (MA)", "Master");
    if (/\b(bs|bsc|bachelor.* of science)\b/.test(t)) push("Bachelor of Science (BS)", "Bachelor of Science");
    if (/\b(ba|bachelor.* of arts)\b/.test(t)) push("Bachelor of Arts (BA)", "Bachelor of Arts");
    if (/\bbachelor/.test(t)) push("Bachelor of Science (BS)", "Bachelor of Arts (BA)", "Bachelor");
    if (/\b(aa|associate.* of arts)\b/.test(t)) push("Associate of Arts (AA)");
    if (/\b(as|associate.* of science)\b/.test(t)) push("Associate of Science (AS)");
    if (/\bassociate/.test(t)) push("Associate of Science (AS)", "Associate of Arts (AA)");
    if (/\b(ged|general equivalency)\b/.test(t)) push("General Equivalency Diploma (GED)");
    if (/high school/.test(t)) push("High School (High School)", "High School");
    return out;
  }
  // Today's date as MM/DD/YYYY for signature/date-signed fields.
  function todayMDY() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  }
  // Pick the disability self-ID checkbox matching the saved answer by intent —
  // decline / yes / no — so "No, I do not have a disability…" never trips on the
  // bare word "no" inside "I do not want to answer".
  function pickDisabilityCheckbox(checks, val, labelOf) {
    const t = String(val).toLowerCase();
    const decline = t.includes("prefer") || t.includes("wish") || t.includes("not to answer") || t.includes("do not want") || t.includes("don't want");
    const yes = !decline && (/^yes\b/.test(t) || (t.includes("have a disability") && !/do not|don't|not have/.test(t)));
    const test = decline
      ? (l) => /do ?n.t want|do ?n.t wish|not to answer|prefer not|decline/i.test(l)
      : yes
        ? (l) => /^yes\b|i have a disability|have had one/i.test(l)
        : (l) => /^no\b|do not have|do ?n.t have|not have a disab|have not had/i.test(l);
    return checks.find((cb) => test(String(labelOf(cb) || "").trim())) || null;
  }
  function optionAlts(field, val) {
    const yn = yesNoAlts(val); if (yn.length) return yn;
    const FI = JAF.schema.FIELDS, t = String(val).toLowerCase(), alts = [];
    if (field === FI.veteranStatus) {
      // "not a veteran" / "not a protected veteran" / "no" all mean the non-veteran
      // option. Put "I am not a veteran" FIRST so it wins before a substring like
      // "not a protected veteran" can match "...JUST NOT A PROTECTED VETERAN".
      if (t.includes("not") || /^no\b/.test(t)) alts.push("I am not a veteran", "I am not a protected veteran", "Not a Protected Veteran", "No");
      else if (t.includes("identify") || t.includes("one or more") || t.includes("am a veteran") || /^yes\b/.test(t)) alts.push("I identify as one or more of the classifications of protected veterans listed above", "I identify as one or more of the classifications of a protected veteran", "Yes");
      if (t.includes("prefer") || t.includes("wish") || t.includes("decline") || t.includes("not to answer")) alts.push("I do not wish to self-identify", "I don't wish to answer", "Prefer not to say");
    } else if (field === FI.disabilityStatus) {
      if (/^no\b/.test(t) || t.includes("do not have") || t.includes("don't have")) alts.push("No, I don't have a disability", "No", "I do not have a disability");
      else if (/^yes\b/.test(t) || t.includes("have a disability")) alts.push("Yes, I have a disability", "Yes");
      if (t.includes("prefer") || t.includes("wish") || t.includes("not to answer")) alts.push("I do not wish to answer", "Prefer not to say");
    } else if (field === FI.ethnicity) {
      // Negative FIRST: "Not Hispanic or Latino" must not trip the "hispanic" test.
      if (/^no\b/.test(t) || t.includes("not hispanic") || t.includes("not latino") || t === "false") alts.push("No", "Not Hispanic or Latino");
      else if (/^yes\b/.test(t) || t.includes("hispanic") || t.includes("latino") || t === "true") alts.push("Yes", "Hispanic or Latino");
      if (t.includes("prefer") || t.includes("wish") || t.includes("decline")) alts.push("Prefer not to say", "Decline to self identify");
    }
    return alts;
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
  const btnText = (x) => (x.innerText || x.textContent || x.getAttribute("aria-label") || "").trim();
  // Does an "Add" button sit under a heading naming this section?
  function nearHeading(el, textRe, excludeRe) {
    let node = el, hops = 0;
    while (node && hops < 9) {
      let sib = node.previousElementSibling, scans = 0;
      while (sib && scans < 6) {
        const tx = (sib.textContent || "").slice(0, 90);
        if (textRe.test(tx) && !(excludeRe && excludeRe.test(tx))) return true;
        sib = sib.previousElementSibling; scans++;
      }
      node = node.parentElement; hops++;
    }
    return false;
  }
  function addButtonFor(cfg) {
    const textRe = new RegExp(cfg.text, "i");
    const excludeRe = cfg.exclude ? new RegExp(cfg.exclude, "i") : null;
    const btns = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(B.isVisible);
    const isAdd = (x) => /^add\b/i.test(btnText(x)) && !(excludeRe && excludeRe.test(btnText(x)));
    // 1) automation-id chain carries "add" + the section keyword
    let b = btns.find((x) => { const c = autoChain(x); return c.includes("add") && (c.includes(cfg.auto) || textRe.test(c)); });
    if (b) return b;
    // 2) the button text itself names the section ("Add Education", "Add Another Degree")
    b = btns.find((x) => isAdd(x) && (textRe.test(btnText(x)) || /another/i.test(btnText(x)) && textRe.test(autoChain(x))));
    if (b) return b;
    // 3) an Add button whose nearest preceding heading names the section. This is
    //    the reliable signal when every section's Add shares a generic id+text
    //    (Workday: data-automation-id="add-button", text just "Add"). It must run
    //    BEFORE the container strategy, which otherwise resolves every section to
    //    the first page-level Add button (e.g. Education -> Work Experience's Add).
    b = btns.find((x) => isAdd(x) && nearHeading(x, textRe, excludeRe));
    if (b) return b;
    // 4) an Add button inside the section container — but only if that container
    //    holds EXACTLY ONE Add button. A container holding several means we
    //    overshot to a common ancestor and can't tell the sections apart.
    const section = sectionContainer(cfg);
    if (section) {
      const inside = btns.filter((x) => section.contains(x) && isAdd(x));
      if (inside.length === 1) return inside[0];
    }
    // 5) last resort: a single lone "Add" button when this is the only addable section visible
    const lone = btns.filter((x) => /^add\b/i.test(btnText(x)));
    if (lone.length === 1 && !(excludeRe && excludeRe.test(btnText(lone[0])))) return lone[0];
    return null;
  }
  function addMoreNote(items, need, have, name, cfg) {
    if (need > have && (have > 0 || (cfg && sectionContainer(cfg)))) {
      items.push({ el: null, field: "More " + name, kind: "info", label: "More " + name,
        value: `${need - have} more ${name} entr${need - have === 1 ? "y" : "ies"} in this resume — click "Add" in ${name}, then re-run Dossier.` });
    }
  }

  JAF.adapters.push(workday);

  // Exposed for unit tests only (section Add-button resolution).
  JAF.__wdInternals = { addButtonFor, sectionContainer, nearHeading };
})();
