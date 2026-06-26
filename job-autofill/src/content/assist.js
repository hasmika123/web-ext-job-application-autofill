/* assist.js — optional AI layer for the part deterministic matching can't do:
 * open-ended screening questions ("Why do you want this role?", "Describe…").
 * Finds those boxes, asks the service worker to draft an answer (cached + reused
 * per identical question), and returns review items the user approves like any
 * other field. Never auto-submits. window.JAF.assist
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const B = () => JAF.adapterBase;

  const QUESTION_RE = /\b(why|describe|tell us|how (would|do|did)|what (makes|are|is|would)|cover letter|in your own words|additional information|please (explain|describe|share)|reason|motivat|interest in|excites you|qualifies you)\b/i;

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

  function draftViaSW(question, context) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "JAF_DRAFT", question, context }, (resp) => {
          if (chrome.runtime.lastError) return resolve({ error: String(chrome.runtime.lastError.message) });
          resolve(resp || {});
        });
      } catch (e) { resolve({ error: String(e) }); }
    });
  }

  // Returns review items to append to the plan.
  async function run(plannedItems, values) {
    let qs;
    try { qs = collectOpenQuestions((plannedItems || []).map((i) => i.el).filter(Boolean)); } catch (e) { return []; }
    if (!qs.length) return [];
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
    if (disabled && !items.length) {
      items.push({ el: null, kind: "info", field: "Open questions",
        value: `${qs.length} open-ended question${qs.length > 1 ? "s" : ""} found (e.g. "${truncate(qs[0].question, 50)}"). Turn on AI drafting in Settings to auto-draft answers.` });
    }
    return items;
  }

  // `draft` is exposed so the review overlay can regenerate a single answer on demand.
  JAF.assist = { run, draft: draftViaSW, collectOpenQuestions, buildContext };
})();
