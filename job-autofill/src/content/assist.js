/* assist.js — optional AI layer for the part deterministic matching can't do:
 * open-ended screening questions ("Why do you want this role?", "Describe…") and
 * CONSTRAINED ones (a select/radio group asking "Years of experience with X?").
 * Finds those, asks the service worker to draft an answer / pick an option
 * (cached + reused per identical question), and returns review items the user
 * approves like any other field. A pick is only ever an option the page offers
 * (the SW matches the reply against the literal list). Demographic/EEO questions
 * are NEVER AI-answered. Never auto-submits. window.JAF.assist
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const B = () => JAF.adapterBase;

  const QUESTION_RE = /\b(why|describe|tell us|how (would|do|did)|what (makes|are|is|would)|cover letter|in your own words|additional information|please (explain|describe|share)|reason|motivat|interest in|excites you|qualifies you)\b/i;
  // Constrained screeners worth an AI pick (select/radio with a fixed option list).
  const SCREEN_RE = /\b(years? of (relevant )?experience|how many years|salary|compensation|pay (range|expectation)|notice period|relocat|commut|remote|hybrid|on-?site|start date|availab|how did you (hear|find)|referr|willing to|currently (work|employed)|previously (work|employed)|worked (at|for)|18 years|driver'?s licen[cs]e|shift|travel|education level|highest (degree|level)|proficien|skill level)\b/i;
  // Demographic / self-ID prompts an AI must never answer. The deterministic EEO
  // rules fill these from the user's OWN saved answers; absent those, stay silent.
  const EEO_RE = /\b(gender|sex\b|race|racial|ethnic|latino|latinx|hispanic|veteran|military|disab|sexual orientation|lgbtq?|pronoun|transgender|self.?identif)\b/i;

  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function buildContext(values) {
    const parts = [];
    if (values.summary) parts.push("Summary: " + values.summary);
    if (values.skills) parts.push("Skills: " + values.skills);
    const exp = values.__experience || [];
    if (exp.length) {
      parts.push("Experience:");
      exp.slice(0, 4).forEach((e) => {
        const head = [e.title, e.company].filter(Boolean).join(" at ");
        const bullet = (e.bullets && e.bullets[0]) ? " — " + e.bullets[0] : "";
        if (head) parts.push("- " + head + bullet);
      });
    }
    const edu = values.__education || [];
    if (edu.length) parts.push("Education: " + edu.slice(0, 2).map((e) => [e.degree, e.field, e.school].filter(Boolean).join(" ")).join("; "));
    return parts.join("\n");
  }

  // Open-ended boxes (textareas, contenteditable) not already in the plan and
  // whose label reads like a question.
  function collectOpenQuestions(plannedEls) {
    const taken = new Set(plannedEls);
    const out = [];
    const els = Array.from(document.querySelectorAll("textarea, [contenteditable=true]"));
    for (const el of els) {
      if (taken.has(el) || !B().isFillable(el)) continue;
      const label = (B().labelText(el) || "").trim();
      if (!label || label.length > 240) continue;
      if (!(QUESTION_RE.test(label) || /\?\s*$/.test(label))) continue;
      out.push({ el, question: label });
    }
    return out;
  }

  // Constrained questions: native <select>s and radio groups the plan didn't
  // claim, whose label reads like a screener and is NOT demographic. Custom
  // JS dropdowns are out of scope here — their options don't exist in the DOM
  // until opened, and opening every combo to read them is intrusive.
  function selectOptions(sel) {
    return Array.from(sel.options || [])
      .map((o) => String(o.text || "").replace(/\s+/g, " ").trim())
      .filter((t) => t && t.length <= 80 && !/^(select|choose|please select|--|-)/i.test(t));
  }
  function optionLabel(radio) {
    const wrap = radio.closest && radio.closest("label");
    if (wrap) return String(wrap.textContent || "").replace(/\s+/g, " ").trim();
    if (radio.id) {
      const l = document.querySelector('label[for="' + B().cssEscape(radio.id) + '"]');
      if (l) return String(l.textContent || "").replace(/\s+/g, " ").trim();
    }
    return String(radio.value || "").trim();
  }
  function isScreener(label) {
    return !!label && label.length <= 240 && !EEO_RE.test(label) &&
      (SCREEN_RE.test(label) || QUESTION_RE.test(label) || /\?\s*$/.test(label));
  }
  function collectChoiceQuestions(plannedEls) {
    const taken = new Set(plannedEls);
    const out = [];
    // native selects
    for (const sel of B().deepQueryAll(document, "select")) {
      if (taken.has(sel) || !B().isFillable(sel)) continue;
      const label = (B().labelText(sel) || "").trim();
      if (!isScreener(label)) continue;
      const options = selectOptions(sel);
      if (options.length < 2 || options.length > 30) continue;
      out.push({ el: sel, kind: "select", question: label, options });
    }
    // radio groups (grouped by name)
    const groups = {};
    for (const r of B().deepQueryAll(document, 'input[type="radio"]')) {
      if (taken.has(r) || !B().isFillable(r) || !r.name) continue;
      (groups[r.name] = groups[r.name] || []).push(r);
    }
    for (const name of Object.keys(groups)) {
      const radios = groups[name];
      if (radios.length < 2 || radios.length > 12) continue;
      if (radios.some((r) => r.checked)) continue;               // already answered
      const question = (B().groupPrompt(radios[0]) || "").replace(/\s+/g, " ").trim();
      if (!isScreener(question)) continue;
      const opts = radios.map((r) => ({ el: r, text: optionLabel(r) })).filter((o) => o.text && o.text.length <= 80);
      if (opts.length < 2) continue;
      out.push({ kind: "radio", question, options: opts.map((o) => o.text), radios: opts });
    }
    return out;
  }

  function sendSW(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return resolve({ error: String(chrome.runtime.lastError.message) });
          resolve(resp || {});
        });
      } catch (e) { resolve({ error: String(e) }); }
    });
  }
  function draftViaSW(question, context) { return sendSW({ type: "JAF_DRAFT", question, context }); }
  function pickViaSW(question, options, context) { return sendSW({ type: "JAF_PICK", question, options, context }); }

  // Returns review items to append to the plan.
  async function run(plannedItems, values) {
    const plannedEls = (plannedItems || []).map((i) => i.el).filter(Boolean);
    let qs = [], cqs = [];
    try { qs = collectOpenQuestions(plannedEls); } catch (e) {}
    try { cqs = collectChoiceQuestions(plannedEls); } catch (e) {}
    if (!qs.length && !cqs.length) return [];
    const ctx = buildContext(values);
    const items = [];
    let disabled = false;
    for (const q of qs.slice(0, 6)) {
      const r = await draftViaSW(q.question, ctx);
      if (r && r.answer) {
        // Keep question + context on the item so the overlay can regenerate the draft.
        items.push({ el: q.el, field: "AI: " + truncate(q.question, 40), value: r.answer, kind: "textarea", label: "AI draft · " + truncate(q.question, 38), assisted: true, question: q.question, context: ctx });
      } else if (r && r.disabled) { disabled = true; }
    }
    // Constrained picks: the value is ALWAYS one of the page's own options.
    for (const q of cqs.slice(0, 6)) {
      const r = await pickViaSW(q.question, q.options, ctx);
      if (r && r.disabled) { disabled = true; continue; }
      if (!r || !r.answer) continue;
      const common = { field: "AI: " + truncate(q.question, 40), label: "AI pick · " + truncate(q.question, 38), assisted: true, question: q.question, options: q.options, context: ctx };
      if (q.kind === "select") {
        items.push(Object.assign({ el: q.el, kind: "select", value: r.answer }, common));
      } else {
        const hit = q.radios.find((o) => o.text === r.answer);
        // keep the option→element list so a regenerated pick can re-point `el`
        if (hit) items.push(Object.assign({ el: hit.el, kind: "choice", value: r.answer, choices: q.radios }, common));
      }
    }
    if (disabled && !items.length && qs.length) {
      items.push({ el: null, kind: "info", field: "Open questions",
        value: `${qs.length} open-ended question${qs.length > 1 ? "s" : ""} found (e.g. "${truncate(qs[0].question, 50)}"). Turn on AI drafting in Settings to auto-draft answers.` });
    }
    return items;
  }

  // `draft`/`pick` are exposed so the review overlay can regenerate one answer on demand.
  JAF.assist = { run, draft: draftViaSW, pick: pickViaSW, collectOpenQuestions, collectChoiceQuestions, buildContext };
})();
