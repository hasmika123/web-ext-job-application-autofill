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

  // querySelectorAll that pierces OPEN shadow roots. Some ATS (e.g. SmartRecruiters
  // "oneclick-ui") render the entire form inside web components, so a plain
  // document.querySelectorAll finds ZERO fields. Recurses into every element's
  // open shadowRoot (closed roots are unreachable by design). De-duped.
  function deepQueryAll(root, sel) {
    const out = [];
    const seen = new Set();
    (function scan(node) {
      if (!node || !node.querySelectorAll) return;
      for (const el of node.querySelectorAll(sel)) if (!seen.has(el)) { seen.add(el); out.push(el); }
      for (const host of node.querySelectorAll("*")) if (host.shadowRoot) scan(host.shadowRoot);
    })(root || document);
    return out;
  }

  // For a radio/checkbox, the meaningful label is the GROUP's question, not the
  // option's own "Yes"/"No". ATS render a Y/N question as a prompt block + a set of
  // options whose inputs aren't linked to the prompt via label[for]/aria — so
  // work-authorization / sponsorship get missed. Climb to the enclosing question
  // block and take its heading/legend/label/aria (Lever `.application-question`,
  // Workable field wrapper, plain <fieldset><legend>, [role=radiogroup]).
  function groupPrompt(el) {
    let p = el.parentElement, hops = 0, fallback = "";
    const wrapLbl = el.closest && el.closest("label");
    const own = String((wrapLbl ? wrapLbl.textContent : "") || el.value || "").replace(/\s+/g, " ").trim().toLowerCase();
    while (p && hops < 6) {
      const cls = (p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className) || "";
      const aid = (p.getAttribute && (p.getAttribute("data-automation-id") || "")) || "";
      const isGroup =
        (p.matches && p.matches('fieldset,[role="group"],[role="radiogroup"]')) ||
        /question|form-?field|form-?group|field-?wrapper/i.test(String(cls)) ||
        /question|formfield|questionnaire/i.test(aid);
      if (isGroup) {
        const gal = p.getAttribute && p.getAttribute("aria-label");
        if (gal && gal.trim().length > 2) return gal;
        const glb = p.getAttribute && p.getAttribute("aria-labelledby");
        if (glb) {
          const t = glb.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? n.textContent : ""; }).join(" ").replace(/\s+/g, " ").trim();
          if (t.length > 2) return t;
        }
        const lab = p.querySelector && p.querySelector('legend,[class*="question" i],[class*="label" i],label[id],h1,h2,h3,h4,[role="heading"]');
        if (lab && !lab.contains(el)) {
          const t = (lab.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length > 2) return t;
        }
        if (!fallback) {
          const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
          const stripped = own ? raw.toLowerCase().split(own).join(" ") : raw;
          if (stripped.replace(/\byes\b|\bno\b|select one|choose/gi, " ").trim().length > 4) fallback = raw.slice(0, 240);
        }
      }
      p = p.parentElement; hops++;
    }
    return fallback;
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
    // 5b) Radio/checkbox: the group's QUESTION prompt, not the option's own Yes/No.
    if (el.type === "radio" || el.type === "checkbox") {
      const gp = groupPrompt(el);
      if (gp) parts.push(gp);
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
    const M = (JAF.rules && JAF.rules.getActive().generic) || JAF.schema.MATCHERS;
    const out = [];
    // deepQueryAll pierces open shadow roots (BUG-5: shadow-DOM ATS like SmartRecruiters).
    const els = deepQueryAll(root, "input, textarea, select, [contenteditable='true']");
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
      // EEO/demographic fields are scanned like any other now (user decision: EEO is
      // always available, no opt-in). They only end up FILLED when the user actually
      // has that value (the adapter's plan gates on values[field]) and the user still
      // reviews/unchecks each one in the overlay before anything is written.
      if (best) {
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
    // Explicit custom dropdowns (Workday prompts, react-select, listbox combos)
    // are driven by selectCustom rather than typed into.
    if (el.matches && el.matches('[aria-haspopup="listbox"],[role="combobox"][aria-controls],[role="combobox"][aria-expanded]')) return "combo";
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
        if (el.type === "checkbox") {
          // Workday/React checkboxes ignore a programmatic `el.checked = …` (the box
          // gets focus but aria-checked stays false). A real click lets the framework
          // toggle and register it; fall back to a native set only if that didn't take.
          if (el.checked !== truthy) realClick(el);
          if (el.checked !== truthy) { el.checked = truthy; fire(el, "input"); fire(el, "change"); }
          return el.checked === truthy;
        }
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
    // Pierce shadow roots so the forward button is found on web-component ATS (BUG-5).
    const cands = deepQueryAll(scope, 'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]');
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

  /* ---------- custom dropdowns (Workday prompts, react-select, etc.) ----------
   * Native <select> is handled by selectOption. These are the JS widgets: a
   * trigger (button or combobox input) that opens a popup of [role=option]s you
   * must click. We open it, optionally type to filter, then click the best match.
   * Best-effort and tolerant: returns false (and closes the popup) on no match,
   * so the field can be reported instead of silently left wrong.
   */
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitFor(test, timeout) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function poll() {
        let ok = false; try { ok = test(); } catch (e) {}
        if (ok) return resolve(true);
        if (Date.now() - t0 >= timeout) return resolve(false);
        setTimeout(poll, 110);
      })();
    });
  }
  function realClick(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    try { el.focus && el.focus(); } catch (e) {}
    for (const t of ["pointerdown", "mousedown", "mouseup", "click"]) {
      try { el.dispatchEvent(new MouseEvent(t, o)); } catch (e) { if (t === "click" && el.click) el.click(); }
    }
  }
  const OPTION_SEL = '[role="option"],[data-automation-id="promptOption"],[data-automation-id="menuItem"],li[role="option"]';
  // The popup actually opened by `trigger`. Workday triggers carry no aria-controls,
  // so we locate the open listbox structurally: the visible [role="listbox"] (or
  // Workday's option container) holding the MOST option nodes. Scoping to it keeps
  // unrelated widgets' option/pill nodes (e.g. a Country Phone Code multiselect's
  // selected "United States (+1)" pills) from polluting THIS dropdown's choices.
  function openListbox(trigger) {
    const id = trigger && (trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns"));
    if (id) { const el = document.getElementById(id); if (el && isVisible(el)) return el; }
    const boxes = Array.from(document.querySelectorAll(
      '[role="listbox"],[data-automation-id="activeListContainer"],ul[data-automation-id="list"]'
    )).filter(isVisible);
    if (!boxes.length) return null;
    // Prefer the visible listbox with the most option descendants (the open menu).
    let best = null, bestN = -1;
    for (const b of boxes) {
      const n = b.querySelectorAll(OPTION_SEL).length;
      if (n > bestN) { best = b; bestN = n; }
    }
    return bestN > 0 ? best : null;
  }
  function visibleOptions(scope) {
    const root = scope || document;
    return Array.from(root.querySelectorAll(OPTION_SEL)).filter((o) => isVisible(o) && (o.textContent || "").trim());
  }
  function findSearchBox() {
    const sel = 'input[data-automation-id="searchBox"],input[role="combobox"],[role="combobox"] input,input[type="search"],[role="dialog"] input';
    return Array.from(document.querySelectorAll(sel)).find(isVisible) || null;
  }
  function bestOption(options, value) {
    const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
    // Drop a trailing parenthetical like "(+1)" so a country option
    // "United States of America (+1)" can still equal "United States of America".
    const stripParen = (s) => norm(s).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const w = norm(value);
    if (!w) return null;
    let exactNoParen = null, starts = null, incl = null;
    const lenOf = (o) => norm(o.innerText || o.textContent).length;
    for (const o of options) {
      const raw = o.innerText || o.textContent;
      const t = norm(raw);
      if (!t) continue;
      if (t === w) return o;                                   // exact wins outright
      if (!exactNoParen && stripParen(raw) === w) exactNoParen = o;
      // Among startsWith matches, keep the SHORTEST — so "United States" prefers
      // "United States of America" over "United States Minor Outlying Islands".
      if (t.startsWith(w) && (!starts || t.length < lenOf(starts))) starts = o;
      // Substring fallback, but guard against a tiny option text ("US") matching
      // a long desired value via w.includes(t).
      if (!incl && (t.includes(w) || (w.includes(t) && t.length >= 4))) incl = o;
    }
    return exactNoParen || starts || incl || null;
  }
  function isCustomDropdown(el) {
    if (!el) return false;
    if (el.tagName === "SELECT") return false; // native handled elsewhere
    if (el.matches && el.matches('[aria-haspopup="listbox"],[role="combobox"],[role="listbox"]')) return true;
    if (el.tagName === "BUTTON" && /select one|select\.{3}|select an?|choose/i.test(el.textContent || "")) return true;
    return false;
  }
  // Resolve as soon as `test()` is true via MutationObserver (faster + less racy
  // than fixed polling), falling back to a timeout.
  function observeFor(test, timeout) {
    return new Promise((resolve) => {
      try { if (test()) return resolve(true); } catch (e) {}
      let done = false;
      let obs = null;
      const finish = (v) => { if (done) return; done = true; if (obs) obs.disconnect(); resolve(v); };
      try {
        obs = new MutationObserver(() => { try { if (test()) finish(true); } catch (e) {} });
        obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      } catch (e) {}
      setTimeout(() => { let v = false; try { v = test(); } catch (e) {} finish(v); }, timeout);
    });
  }
  // What value does a dropdown trigger currently display?
  function committedValue(trigger) {
    if (trigger.tagName === "INPUT") {
      const v = (trigger.value || "").trim();
      const cont = trigger.closest('[class*="control"],[class*="select"],[role="combobox"]') || trigger.parentElement;
      const ct = cont ? (cont.innerText || cont.textContent || "").trim() : "";
      return v || ct;
    }
    return (trigger.innerText || trigger.textContent || "").trim();
  }
  function isPlaceholder(s) { return !s || /^(select one|select\.{3}|select\.\.\.|select an?\b|choose|search|please select|--)/i.test(s); }
  function showsPlaceholder(trigger) { return isPlaceholder(committedValue(trigger)); }

  async function selectCustom(trigger, value) {
    if (!trigger || value == null || value === "") return false;
    const want = String(value).trim();
    const openAndPick = async () => {
      try { trigger.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {}
      if (trigger.tagName === "INPUT") {
        trigger.focus(); realClick(trigger);
        setNativeValue(trigger, want); fire(trigger, "input");
      } else {
        realClick(trigger);
        await observeFor(() => visibleOptions(openListbox(trigger)).length > 0, 2500);
        const search = findSearchBox();
        if (search) { search.focus(); setNativeValue(search, want); fire(search, "input"); fire(search, "keyup"); }
      }
      // Scope option lookups to the listbox THIS trigger opened (see openListbox).
      await observeFor(() => visibleOptions(openListbox(trigger)).length > 0, 900);
      const opt = bestOption(visibleOptions(openListbox(trigger)), want);
      if (!opt) { try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {} return false; }
      realClick(opt);
      await observeFor(() => !showsPlaceholder(trigger) || visibleOptions().length === 0, 700);
      return true;
    };
    // First attempt, then verify the control actually committed; retry once.
    let clicked = await openAndPick();
    if (clicked && !showsPlaceholder(trigger)) return true;
    if (!clicked && showsPlaceholder(trigger)) {
      // nothing landed at all — one retry
      clicked = await openAndPick();
    }
    // Success only if an option was chosen AND the trigger no longer shows a placeholder.
    return clicked && !showsPlaceholder(trigger);
  }

  // Async apply: drives combos; everything else delegates to the sync applyItem.
  async function applyItemAsync(item) {
    if (!item) return false;
    if (item.kind === "combo") {
      const cands = [item.value].concat(item.alts || []).filter((v) => v != null && v !== "");
      for (const v of cands) { if (await selectCustom(item.el, v)) return true; }
      return false;
    }
    if (item.kind === "combo-multi") {
      const vals = Array.isArray(item.value) ? item.value : [item.value];
      let any = false;
      for (const v of vals) { const ok = await selectCustom(item.el, v); any = any || ok; await delay(160); }
      return any;
    }
    return applyItem(item, item.value);
  }

  JAF.adapterBase = {
    setNativeValue, fire, fillText, selectOption, setBooleanGroup, labelText, groupPrompt,
    cssEscape, isFillable, scanGeneric, deepQueryAll, elKind, applyItem, applyItemAsync, attachFile, humanize,
    isVisible, findNextButton, isCustomDropdown, selectCustom, realClick, waitFor, delay,
    // exposed for unit tests (dropdown option scoping + matching)
    openListbox, visibleOptions, bestOption,
  };
})();
