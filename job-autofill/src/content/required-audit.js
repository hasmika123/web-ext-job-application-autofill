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

  function rootOf(el) {
    try { return el && typeof el.getRootNode === "function" ? el.getRootNode() : document; } catch (e) { return document; }
  }

  function allControls(root, selector) {
    const B = JAF.adapterBase;
    if (B && B.deepQueryAll) return B.deepQueryAll(root || document, selector);
    return Array.from((root || document).querySelectorAll ? (root || document).querySelectorAll(selector) : []);
  }

  // Human-visible label texts for a control (aria-label, <label for>, wrapping label, a radio
  // group's question). Falls back to a minimal version when the adapter base isn't loaded.
  function labelTexts(el) {
    const B = JAF.adapterBase;
    if (B && B.labelParts) return B.labelParts(el).filter((p) => p.tier === LABEL_TIER).map((p) => p.text);
    const out = [];
    if (el.getAttribute && el.getAttribute("aria-label")) out.push(el.getAttribute("aria-label"));
    if (el.id) {
      const root = rootOf(el);
      const l = root.querySelector && Array.from(root.querySelectorAll("label")).find((label) => label.getAttribute("for") === el.id);
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
    const root = rootOf(el);
    if (!el.name) return [el];
    return allControls(root, 'input[type="radio"]').filter((r) => r.name === el.name && r.form === el.form);
  }

  /** Is this required control still empty? For a radio, whether its whole group has no pick. */
  function isStillEmpty(el) {
    if (!el) return false;
    const type = typeOf(el);
    if (type === "radio") return !radioGroup(el).some((r) => r.checked);
    if (type === "checkbox") return !el.checked;
    if (type === "file") return !el.files || !el.files.length;
    // A react-select combobox keeps its input empty and shows the chosen option in the control next to it (new Greenhouse boards).
    if (el.getAttribute && el.getAttribute("role") === "combobox" && el.closest) {
      const ctl = el.closest('[class*="__control"]');
      const shown = ctl && ctl.querySelector('[class*="single-value"],[class*="singleValue"],[class*="multi-value"],[class*="multiValue"]');
      if (shown && String(shown.textContent || "").trim()) return false;
    }
    // A Workday multiselect prompt clears its search box once an item is picked and shows the pick as a pill beside it.
    if (el.closest) {
      const ms = el.closest('[data-automation-id="multiSelectContainer"],[data-uxi-widget-type="multiselect"]');
      if (ms && ms.querySelector('[data-automation-id="selectedItem"]')) return false;
    }
    return String(el.value || "").trim() === ""; // text-like, textarea, select on its placeholder
  }

  // A Workday dropdown is a button that names itself required ("Country Select One Required") and shows "Select One" until picked.
  function emptyRequiredPrompts(doc) {
    return allControls(doc, 'button[aria-haspopup="listbox"][aria-label$="Required"]').filter((b) => {
      if (!visible(b)) return false;
      const shown = String(b.textContent || "").replace(/\s+/g, " ").trim();
      return !shown || /^select one$/i.test(shown);
    });
  }

  // React-select/Greenhouse can keep more than one required native input inside
  // one visual control (the searchable combobox plus a form-value input). They
  // represent one answer, so the audit must report one gap, not one per input.
  function duplicateControlKey(el) {
    if (!el || !el.closest) return null;
    try {
      const control = el.closest('[class*="__control"],[data-automation-id="select"],[data-uxi-widget-type="select"]');
      if (control && control.querySelector && control.querySelector('[role="combobox"]')) return control;
      const labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
      if (labelledBy) return "aria-labelledby:" + labelledBy;
    } catch (e) {}
    return null;
  }

  // Greenhouse's React-select required mirror is a validation sentinel, not a second
  // user-facing field. It is required, untabbable, aria-hidden, and sits beside the
  // visible combobox rather than inside its .select__control.
  function isSyntheticRequiredMirror(el) {
    const type = typeOf(el);
    if (!el || (type && type !== "text") || !el.closest) return false;
    if (el.getAttribute("aria-hidden") !== "true" || el.getAttribute("tabindex") !== "-1") return false;
    if (!/requiredInput/i.test(String(el.className || ""))) return false;
    const select = el.closest(".select,.select__container");
    return !!(select && select.querySelector && select.querySelector('[role="combobox"]'));
  }

  function representative(a, b) {
    const score = (el) => {
      const labels = labelTexts(el);
      const named = labels.length ? 1000 : 0;
      const combo = el.getAttribute && el.getAttribute("role") === "combobox" ? 100 : 0;
      return named + combo + Math.min(200, labels.join(" ").length);
    };
    return score(b) > score(a) ? b : a;
  }

  /** Required controls that are visible and still empty. A radio group counts once. */
  function findRequiredEmpty(doc) {
    doc = doc || document;
    const out = emptyRequiredPrompts(doc);
    const groupsSeen = new Set();
    const controlEntries = [];
    const controlGroups = new Map();
    for (const el of allControls(doc, "input, select, textarea")) {
      const type = typeOf(el);
      if (SKIP_TYPES.has(type)) continue;
      if (isSyntheticRequiredMirror(el)) continue;

      if (type === "radio") {
        const group = radioGroup(el);
        const key = group[0] || el;
        if (groupsSeen.has(key)) continue;
        groupsSeen.add(key);
        if (!group.some(isRequired) || !group.some(visible)) continue;
        if (isStillEmpty(el)) out.push(el);
        continue;
      }

      if (!visible(el) || !isRequired(el)) continue;
      const key = duplicateControlKey(el);
      if (key) {
        let entry = controlGroups.get(key);
        if (!entry) {
          entry = { controls: [], representative: el };
          controlGroups.set(key, entry);
          controlEntries.push(entry);
        }
        entry.controls.push(el);
        entry.representative = representative(entry.representative, el);
      } else if (isStillEmpty(el)) {
        controlEntries.push({ controls: [el], representative: el });
      }
    }
    for (const entry of controlEntries) {
      if (entry.controls.every(isStillEmpty)) out.push(entry.representative);
    }
    return out;
  }

  /** What to call the field in the list the user sees: its label, without the asterisk. */
  function describe(el) {
    const clean = (t) => String(t || "").replace(/\(?\s*\*+\s*\)?\s*$/, "").replace(/\s+/g, " ").trim();
    // For a radio/checkbox group the user needs the QUESTION ("Are you authorised to work here?"),
    // not the option whose label happens to come first ("Yes").
    const B = JAF.adapterBase;
    const question = (typeOf(el) === "radio" || typeOf(el) === "checkbox") && B && B.groupPrompt
      ? clean(B.groupPrompt(el))
      : "";
    const fromLabel = question || labelTexts(el).map(clean).find(Boolean);
    const text = fromLabel || clean(el.getAttribute && el.getAttribute("placeholder")) || "A required field";
    return text.length > 60 ? text.slice(0, 59) + "…" : text;
  }

  JAF.requiredAudit = { findRequiredEmpty, isRequired, isStillEmpty, describe };
})();
