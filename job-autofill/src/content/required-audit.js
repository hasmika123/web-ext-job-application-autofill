/* required-audit.js — which REQUIRED fields on the page are still empty. JAF.requiredAudit
 *
 * Phase 10.1 counts these after every fill ("the fill left 3 required fields for you") — the
 * failure a user actually feels, which is why the admin panel ranks ATS by it. Phase 10.2 will
 * use the same scan to show the user the list and jump to each one.
 *
 * Native controls only for now: `required` or aria-required="true" on input/select/textarea.
 * Custom widgets that mark "required" only with a * in their label (some Workday dropdowns) are
 * NOT counted yet, so this under-counts rather than guesses; it is consistent over time, which
 * is what a ranking needs. Adapter-specific hooks can widen it in 10.2.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});
  const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

  function isRequired(el) {
    return !!(el && (el.required || el.hasAttribute("required") || el.getAttribute("aria-required") === "true"));
  }

  function visible(el) {
    const B = JAF.adapterBase;
    if (B && B.isVisible) return B.isVisible(el);
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return r.width > 0 || r.height > 0;
  }

  function sameGroup(doc, radio) {
    const all = doc.querySelectorAll('input[type="radio"]');
    return Array.from(all).filter((r) => r.name === radio.name && r.form === radio.form);
  }

  /** Required controls that are visible and still empty. A radio group counts once. */
  function findRequiredEmpty(doc) {
    doc = doc || document;
    const out = [];
    const groupsSeen = new Set();
    for (const el of doc.querySelectorAll("input, select, textarea")) {
      const type = String(el.getAttribute("type") || "").toLowerCase();
      if (SKIP_TYPES.has(type)) continue;

      if (type === "radio") {
        // A group is required if any member says so; it's empty if no member is checked.
        const group = el.name ? sameGroup(doc, el) : [el];
        const key = el.name ? el.name + "|" + (el.form ? Array.prototype.indexOf.call(doc.forms, el.form) : -1) : null;
        if (key && groupsSeen.has(key)) continue;
        if (key) groupsSeen.add(key);
        if (!group.some(isRequired) || !group.some(visible)) continue;
        if (!group.some((r) => r.checked)) out.push(el);
        continue;
      }

      if (!isRequired(el) || !visible(el)) continue;
      if (type === "checkbox") {
        if (!el.checked) out.push(el);
      } else if (type === "file") {
        if (!el.files || !el.files.length) out.push(el);
      } else if (String(el.value || "").trim() === "") {
        out.push(el); // text-like, textarea, and a select still on its empty placeholder option
      }
    }
    return out;
  }

  JAF.requiredAudit = { findRequiredEmpty, isRequired };
})();
