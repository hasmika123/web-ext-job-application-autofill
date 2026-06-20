/* base.js — shared DOM utilities for all adapters. window.JAF.adapterBase */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  // React/Vue controlled inputs ignore plain `el.value = x`; we must use the
  // native prototype setter and then dispatch input+change so frameworks notice.
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  function fillText(el, value) {
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      fire(el, "input");
      return true;
    }
    el.focus();
    setNativeValue(el, value);
    fire(el, "input");
    fire(el, "change");
    el.blur();
    return true;
  }

  // Choose an <option> by loose text/value match. Handles yes/no booleans.
  function selectOption(sel, value) {
    const want = String(value).trim().toLowerCase();
    const opts = Array.from(sel.options);
    let match =
      opts.find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want) ||
      opts.find((o) => o.text.trim().toLowerCase().includes(want) && want.length > 1) ||
      opts.find((o) => want.includes(o.text.trim().toLowerCase()) && o.text.trim().length > 1);
    if (!match && (want === "true" || want === "yes")) match = opts.find((o) => /^yes$/i.test(o.text.trim()));
    if (!match && (want === "false" || want === "no")) match = opts.find((o) => /^no$/i.test(o.text.trim()));
    if (!match) return false;
    sel.value = match.value;
    fire(sel, "input");
    fire(sel, "change");
    return true;
  }

  // Yes/No radio groups: find the radio whose label matches the desired answer.
  function setBooleanGroup(container, truthy) {
    const want = truthy ? "yes" : "no";
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    for (const r of radios) {
      const lbl = labelText(r).toLowerCase();
      if (lbl === want || lbl.startsWith(want)) {
        r.click();
        return true;
      }
    }
    return false;
  }

  // Turn a token like "legalNameSection_firstName" or "addressLine1" into
  // readable words ("legal name section first name", "address line 1") so the
  // keyword matchers can hit it. Workday/iCIMS hide meaning in these tokens.
  function humanize(s) {
    return String(s)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")   // camelCase boundary
      .replace(/([A-Za-z])(\d)/g, "$1 $2")        // letter|digit
      .replace(/(\d)([A-Za-z])/g, "$1 $2")        // digit|letter
      .replace(/[_\-\[\].]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Ids the page framework generated carry no meaning — don't pollute the label.
  function isGeneratedId(id) {
    if (!id) return true;
    if (/^(input|select|textarea|wd|react|radix|mui|ember|ext|gwt|headlessui|rc)[-_:]?\d+/i.test(id)) return true;
    if (/^:r[0-9a-z]+:?$/i.test(id)) return true;                 // React useId
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(id)) return true; // GUID
    if (/^[0-9a-f]{16,}$/i.test(id)) return true;                 // long hex blob
    return false;
  }

  // Collect data-automation-id from the element and its near ancestors. These
  // are the single most reliable label source on Workday and many other ATSs.
  function automationWords(el) {
    const ids = [];
    let n = el, hops = 0;
    while (n && n.getAttribute && hops < 6) {
      const a = n.getAttribute("data-automation-id") || n.getAttribute("data-testid") || n.getAttribute("data-qa");
      if (a) ids.push(a);
      n = n.parentElement; hops++;
    }
    return ids.map(humanize).join(" ");
  }

  // Build the visible label for an element from every available signal.
  function labelText(el) {
    const parts = [];
    // 1) automation/test ids first — highest-signal on SPA-based ATSs.
    const auto = automationWords(el);
    if (auto) parts.push(auto);
    // 2) ARIA.
    if (el.getAttribute) {
      const al = el.getAttribute("aria-label");
      if (al) parts.push(al);
      const lb = el.getAttribute("aria-labelledby");
      if (lb) lb.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    }
    // 3) Associated <label for=…>.
    if (el.id) {
      const forLbl = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (forLbl) parts.push(forLbl.textContent);
    }
    // 4) Wrapping <label>.
    const wrap = el.closest && el.closest("label");
    if (wrap) parts.push(wrap.textContent);
    // 5) A <label> inside the field's automation container (Workday pattern).
    if (el.closest) {
      const cont = el.closest("[data-automation-id]");
      if (cont) {
        const lg = cont.querySelector("label, legend");
        if (lg && !lg.contains(el)) parts.push(lg.textContent);
      }
    }
    // 6) placeholder / name.
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name.replace(/[_\-\[\]]/g, " "));
    // 7) meaningful id only (skip framework-generated junk).
    if (el.id && !isGeneratedId(el.id)) parts.push(humanize(el.id));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1"); }

  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "search") return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    if (r.width === 0 && r.height === 0) return false;
    return true;
  }

  // Generic label-based scan: returns [{el, field, label, kind, score}]
  function scanGeneric(root) {
    root = root || document;
    const M = JAF.schema.MATCHERS;
    const SENS = JAF.schema.SENSITIVE;
    const out = [];
    const els = Array.from(root.querySelectorAll("input, textarea, select, [contenteditable='true']"));
    const used = new Set();
    for (const el of els) {
      if (!isFillable(el)) continue;
      const lbl = labelText(el).toLowerCase();
      if (!lbl) continue;
      let best = null;
      for (const m of M) {
        if (m.neg && m.neg.some((n) => lbl.includes(n))) continue;
        const hit = m.any.find((a) => lbl.includes(a));
        if (hit) {
          const score = hit.length + (lbl.trim() === hit ? 50 : 0);
          if (!best || score > best.score) best = { field: m.field, score };
        }
      }
      if (best && !SENS.includes(best.field)) {
        out.push({ el, field: best.field, label: labelText(el), kind: elKind(el), score: best.score });
      }
    }
    // keep only the highest-scoring element per field
    const byField = {};
    for (const c of out) if (!byField[c.field] || c.score > byField[c.field].score) byField[c.field] = c;
    return Object.values(byField);
  }

  function elKind(el) {
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA" || el.isContentEditable) return "textarea";
    if (el.type === "radio" || el.type === "checkbox") return "boolean";
    if (el.type === "file") return "file";
    return "text";
  }

  // Apply one planned fill item. Returns true on success.
  function applyItem(item, value) {
    const el = item.el;
    if (!el || !document.contains(el)) return false;
    const kind = item.kind || elKind(el);
    try {
      if (kind === "select") return selectOption(el, value);
      if (kind === "boolean") {
        const truthy = /^(yes|true|1)$/i.test(String(value));
        if (el.type === "checkbox") { el.checked = truthy; fire(el, "input"); fire(el, "change"); return true; }
        const grp = el.closest('[role="group"],fieldset,div') || document;
        return setBooleanGroup(grp, truthy);
      }
      if (kind === "file") return false; // files handled separately
      return fillText(el, value);
    } catch (e) { return false; }
  }

  async function attachFile(inputEl, blob, fileName) {
    try {
      const file = new File([blob], fileName || "resume.pdf", { type: blob.type || "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      inputEl.files = dt.files;
      fire(inputEl, "input");
      fire(inputEl, "change");
      return true;
    } catch (e) { return false; }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return (r.width > 0 || r.height > 0);
  }

  // Find a "go to next step" button — and NEVER a final-submit button.
  // Matches Next / Continue / Save and Continue / Proceed; rejects anything that
  // looks like Submit / Apply / Finish / Send / Back / Cancel / Save-for-later.
  const NEXT_RE = /\b(next|continue|proceed|save\s*(and|&)\s*continue|save\s*(and|&)\s*next)\b/i;
  const BLOCK_RE = /\b(submit|apply|finish|complete|send|previous|back|cancel|save\s*(for|as)\s*(later|draft)|save\s*draft|review\s*and\s*submit)\b/i;
  function findNextButton(root) {
    const scope = root || document;
    const cands = Array.from(scope.querySelectorAll(
      'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]'
    ));
    // Prefer buttons sitting in a footer / navigation region (later in DOM).
    const matches = [];
    for (const el of cands) {
      if (!isVisible(el)) continue;
      const t = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "").trim();
      if (!t || t.length > 40) continue;
      if (BLOCK_RE.test(t)) continue;
      if (NEXT_RE.test(t)) matches.push(el);
    }
    // last match is usually the page's primary forward button.
    return matches.length ? matches[matches.length - 1] : null;
  }

  JAF.adapterBase = {
    setNativeValue, fire, fillText, selectOption, setBooleanGroup, labelText,
    cssEscape, isFillable, scanGeneric, elKind, applyItem, attachFile, humanize,
    isVisible, findNextButton,
  };
})();
