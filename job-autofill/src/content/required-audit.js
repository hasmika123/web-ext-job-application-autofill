/* required-audit.js — which REQUIRED fields on the page are still empty. JAF.requiredAudit
 *
 * Phase 10.1 counts these after every fill; Phase 10.2 shows the user the list ("2 required
 * fields still need you") and jumps to each one. Same scan for both, so the number an admin
 * sees and the list a user sees can never disagree.
 *
 * A control is REQUIRED when it says so (`required`, aria-required="true") or when its label is
 * marked with a trailing asterisk — the most common way a form says "required" visually, and the
 * one some ATSs use without any attribute at all. A radio group counts once.
 *
 * Native controls only (input/select/textarea). Custom widgets with no native control behind
 * them are not seen yet; this under-counts rather than guesses.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});
  const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);
  const LABEL_TIER = 200; // adapterBase's TIER.LABEL — human-visible label text, not ids or names

  // Human-visible label texts for a control (aria-label, <label for>, wrapping label, a radio
  // group's question). Falls back to a minimal version when the adapter base isn't loaded.
  function labelTexts(el) {
    const B = JAF.adapterBase;
    if (B && B.labelParts) return B.labelParts(el).filter((p) => p.tier === LABEL_TIER).map((p) => p.text);
    const out = [];
    if (el.getAttribute && el.getAttribute("aria-label")) out.push(el.getAttribute("aria-label"));
    if (el.id) {
      const l = document.querySelector('label[for="' + String(el.id).replace(/"/g, '\\"') + '"]');
      if (l) out.push(l.textContent);
    }
    const wrap = el.closest && el.closest("label");
    if (wrap) out.push(wrap.textContent);
    return out.map((t) => String(t || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // "Phone *", "Phone*", "Phone (*)" — the visual required marker. Only a TRAILING asterisk:
  // one mid-label ("*Only if applicable") is a footnote marker, not a requirement.
  function labelMarksRequired(el) {
    return labelTexts(el).some((t) => /\*\s*\)?\s*$/.test(t));
  }

  function isRequired(el) {
    if (!el) return false;
    if (el.required || el.hasAttribute("required") || el.getAttribute("aria-required") === "true") return true;
    return labelMarksRequired(el);
  }

  function visible(el) {
    const B = JAF.adapterBase;
    if (B && B.isVisible) return B.isVisible(el);
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return r.width > 0 || r.height > 0;
  }

  function typeOf(el) {
    return String(el.getAttribute("type") || "").toLowerCase();
  }

  function radioGroup(el) {
    const doc = el.ownerDocument || document;
    if (!el.name) return [el];
    return Array.from(doc.querySelectorAll('input[type="radio"]')).filter((r) => r.name === el.name && r.form === el.form);
  }

  /** Is this required control still empty? For a radio, whether its whole group has no pick. */
  function isStillEmpty(el) {
    if (!el) return false;
    const type = typeOf(el);
    if (type === "radio") return !radioGroup(el).some((r) => r.checked);
    if (type === "checkbox") return !el.checked;
    if (type === "file") return !el.files || !el.files.length;
    return String(el.value || "").trim() === ""; // text-like, textarea, select on its placeholder
  }

  /** Required controls that are visible and still empty. A radio group counts once. */
  function findRequiredEmpty(doc) {
    doc = doc || document;
    const out = [];
    const groupsSeen = new Set();
    for (const el of doc.querySelectorAll("input, select, textarea")) {
      const type = typeOf(el);
      if (SKIP_TYPES.has(type)) continue;

      if (type === "radio") {
        const group = radioGroup(el);
        const key = el.name ? el.name + "|" + (el.form ? Array.prototype.indexOf.call(doc.forms, el.form) : -1) : null;
        if (key && groupsSeen.has(key)) continue;
        if (key) groupsSeen.add(key);
        if (!group.some(isRequired) || !group.some(visible)) continue;
        if (isStillEmpty(el)) out.push(el);
        continue;
      }

      if (!visible(el) || !isRequired(el)) continue;
      if (isStillEmpty(el)) out.push(el);
    }
    return out;
  }

  /** What to call the field in the list the user sees: its label, without the asterisk. */
  function describe(el) {
    const clean = (t) => String(t || "").replace(/\(?\s*\*+\s*\)?\s*$/, "").replace(/\s+/g, " ").trim();
    // For a radio group the user needs the QUESTION ("Are you authorised to work here?"), not the
    // option whose label happens to come first ("Yes").
    const B = JAF.adapterBase;
    const question = typeOf(el) === "radio" && B && B.groupPrompt ? clean(B.groupPrompt(el)) : "";
    const fromLabel = question || labelTexts(el).map(clean).find(Boolean);
    const text = fromLabel || clean(el.getAttribute && el.getAttribute("placeholder")) || "A required field";
    return text.length > 60 ? text.slice(0, 59) + "…" : text;
  }

  JAF.requiredAudit = { findRequiredEmpty, isRequired, isStillEmpty, describe };
})();
