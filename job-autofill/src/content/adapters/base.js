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

  // A value that answers a yes/no control. Anything else ("Hybrid", "Female") must never be
  // coerced to "No" — it either names one of the group's options or it doesn't fit.
  const YESNO_RE = /^(yes|no|true|false|1|0)$/i;

  // A radio group whose options are choices, not Yes/No: pick the option the value names.
  // Exact label first, then a prefix either way ("On-site" ↔ "On-site (5 days a week)"), with
  // a length floor so a two-letter answer can't match a long option by accident.
  function setChoiceGroup(container, value) {
    const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
    const want = norm(value);
    if (!want) return false;
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    const named = radios.map((r) => ({ r, t: norm(labelText(r)) || norm(r.value) }));
    const hit = named.find((x) => x.t === want)
      || named.find((x) => x.t.startsWith(want) && want.length >= 4)
      || named.find((x) => want.startsWith(x.t) && x.t.length >= 4);
    if (!hit) return false;
    hit.r.click();
    return hit.r.checked;
  }

  // <input type="number"> rejects "$120,000" outright, leaving the field empty. Take the first
  // number, honouring a "k" suffix; a range keeps its lower bound.
  function numericValue(v) {
    const m = String(v == null ? "" : v).match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i);
    if (!m) return "";
    const n = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    return isFinite(n) ? String(n) : "";
  }

  // <input type="date"> needs YYYY-MM-DD. Anything that isn't a real date ("Immediately",
  // "2 weeks") is left for the user rather than guessed.
  function isoDate(v) {
    const t = String(v == null ? "" : v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    if (!/\b\d{4}\b/.test(t)) return "";
    const d = new Date(t);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // Yes/No radio groups: find the radio whose label matches the desired answer.
  function setBooleanGroup(container, truthy) {
    const want = truthy ? "yes" : "no";
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    for (const r of radios) {
      // The option's OWN words first ("Yes" / "NO"): labelText also carries the group's question and any data-qa words
      // (Lever: "multiple choice Yes Do you require…"), which never start with yes/no.
      const wrap = r.closest && r.closest("label");
      const own = String((wrap && wrap.textContent) || r.value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const lbl = own || labelText(r).toLowerCase();
      if (lbl === want || lbl.startsWith(want) || labelText(r).toLowerCase() === want) {
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

  // Associated labels live in the same tree as the field. A document-level
  // lookup cannot see IDs or labels inside an open shadow root.
  function elementRoot(el) {
    try {
      const root = el && el.getRootNode && el.getRootNode();
      return root && root.querySelector ? root : document;
    } catch (e) { return document; }
  }
  function rootElementById(el, id) {
    const root = elementRoot(el);
    try {
      return root.getElementById ? root.getElementById(id) : root.querySelector("#" + cssEscape(id));
    } catch (e) { return null; }
  }
  function rootQuerySelector(el, selector) {
    try { return elementRoot(el).querySelector(selector); } catch (e) { return null; }
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

  // Readable text of a rich-text block (a job description) for job capture. Unlike
  // textContent, text nodes are joined with a space, so "<p>a</p><p>b</p>" and list
  // items don't run together. Scripts/styles are skipped; capped like JSON-LD text.
  const BLOCK_TEXT_MAX = 20000;
  function blockText(els) {
    const list = (Array.isArray(els) ? els : [els]).filter(Boolean);
    const parts = [];
    (function walk(nodes) {
      for (const n of nodes) {
        if (n.nodeType === 3) parts.push(n.nodeValue);
        else if (n.nodeType === 1 && !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/i.test(n.tagName)) walk(n.childNodes);
      }
    })(list);
    const s = parts.join(" ").replace(/[\s ]+/g, " ").trim();
    if (!s) return undefined;
    return s.length > BLOCK_TEXT_MAX ? s.slice(0, BLOCK_TEXT_MAX) : s;
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
          const t = glb.split(/\s+/).map((id) => { const n = rootElementById(p, id); return n ? n.textContent : ""; }).join(" ").replace(/\s+/g, " ").trim();
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

  // Label signal TIERS: where a label part came from decides how much a keyword
  // hit in it is worth. A hit in a data-automation-id or a real <label> is far
  // more trustworthy than one in a placeholder or a name attribute.
  const TIER = { AUTOCOMPLETE: 400, AUTOMATION: 300, LABEL: 200, META: 100 };

  // Every label signal for an element, as [{text, tier}] (strongest first).
  function labelParts(el) {
    const parts = [];
    const push = (text, tier) => {
      const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
      if (t) parts.push({ text: t, tier });
    };
    // 1) automation/test ids first — highest-signal on SPA-based ATSs.
    push(automationWords(el), TIER.AUTOMATION);
    // 2) ARIA.
    if (el.getAttribute) {
      push(el.getAttribute("aria-label"), TIER.LABEL);
      const lb = el.getAttribute("aria-labelledby");
      if (lb) lb.split(/\s+/).forEach((id) => { const n = rootElementById(el, id); if (n) push(n.textContent, TIER.LABEL); });
    }
    // 3) Associated <label for=…>.
    if (el.id) {
      const forLbl = rootQuerySelector(el, 'label[for="' + cssEscape(el.id) + '"]');
      if (forLbl) push(forLbl.textContent, TIER.LABEL);
    }
    // 4) Wrapping <label>.
    const wrap = el.closest && el.closest("label");
    if (wrap) push(wrap.textContent, TIER.LABEL);
    // 5) A <label> inside the field's automation container (Workday pattern).
    if (el.closest) {
      const cont = el.closest("[data-automation-id]");
      if (cont) {
        const lg = cont.querySelector("label, legend");
        if (lg && !lg.contains(el)) push(lg.textContent, TIER.LABEL);
      }
    }
    // 5b) Radio/checkbox: the group's QUESTION prompt, not the option's own Yes/No.
    if (el.type === "radio" || el.type === "checkbox") {
      const gp = groupPrompt(el);
      if (gp) push(gp, TIER.LABEL);
    }
    // 5c) Lever custom questions (name "cards[…][fieldN]"): the question sits in the card's .application-label, a SIBLING of the
    //     field's wrapper, so nothing above finds it and the field reads only "Type your response" (captured on jobs.lever.co/rover,
    //     2026-10-19). Used only when nothing above named the field.
    if (!parts.some((p) => p.tier === TIER.LABEL) && el.closest && el.type !== "radio" && el.type !== "checkbox") {
      const card = el.closest(".application-question");
      const lab = card && card.querySelector(".application-label");
      if (lab && !lab.contains(el)) push(lab.textContent, TIER.LABEL);
    }
    // 6) placeholder / name — weakest: often decorative or misleading.
    push(el.placeholder, TIER.META);
    if (el.name) push(el.name.replace(/[_\-\[\]]/g, " "), TIER.META);
    // 7) meaningful id only (skip framework-generated junk).
    if (el.id && !isGeneratedId(el.id)) push(humanize(el.id), TIER.META);
    return parts;
  }

  // Build the visible label for an element from every available signal.
  function labelText(el) {
    return labelParts(el).map((p) => p.text).join(" ").replace(/\s+/g, " ").trim();
  }

  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1"); }

  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "search") return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    if (r.width === 0 && r.height === 0) return false;
    return true;
  }

  // --- W3C `autocomplete` tokens → canonical fields --------------------------
  // A standardized, high-precision signal (autofill spec field names). Only real
  // field tokens are mapped — "on"/"off"/section-*/shipping prefixes are skipped by
  // scanning tokens from the END (the spec puts the field token last).
  const AC_FIELDS = {
    "given-name": "firstName", "family-name": "lastName", "name": "fullName",
    "nickname": "preferredName", "email": "email", "tel": "phone",
    "tel-national": "phone", "street-address": "addressLine1",
    "address-line1": "addressLine1", "address-line2": "addressLine2",
    "address-level2": "city", "address-level1": "state", "postal-code": "postalCode",
    "country-name": "country", "country": "country", "url": "website",
  };
  function autocompleteField(el) {
    const raw = el.getAttribute && el.getAttribute("autocomplete");
    if (!raw) return null;
    const tokens = raw.trim().toLowerCase().split(/\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (AC_FIELDS[tokens[i]]) return AC_FIELDS[tokens[i]];
    }
    return null;
  }
  // Hosts whose forms set `autocomplete` unreliably (data-driven via the ruleset —
  // Workday today). There the scanner falls back to keyword matching alone.
  function autocompleteTrusted() {
    let distrust = [];
    try {
      const rs = JAF.rules && JAF.rules.getActive && JAF.rules.getActive();
      distrust = (rs && rs.autocomplete && rs.autocomplete.distrust) || [];
    } catch (e) {}
    const host = ((typeof location !== "undefined" && location.hostname) || "").toLowerCase();
    return !distrust.some((d) => d && host.includes(d));
  }

  // Generic label-based scan: returns [{el, field, label, kind, score}]
  function scanGeneric(root) {
    root = root || document;
    const M = (JAF.rules && JAF.rules.getActive().generic) || JAF.schema.MATCHERS;
    const out = [];
    const trustAC = autocompleteTrusted();
    // deepQueryAll pierces open shadow roots (BUG-5: shadow-DOM ATS like SmartRecruiters).
    const els = deepQueryAll(root, "input, textarea, select, [contenteditable='true']");
    for (const el of els) {
      if (!isFillable(el)) continue;
      const parts = labelParts(el);
      const lbl = parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      const acField = trustAC ? autocompleteField(el) : null;
      if (!lbl && !acField) continue;
      let best = null;
      for (const m of M) {
        // neg words veto against the FULL combined label (any signal can disqualify).
        if (m.neg && m.neg.some((n) => {
          // Confirm-email exclusion must be backed by a human label, not a generated
          // id/name such as "verify-email" on an ordinary email control.
          if (m.field === "email" && /^(confirm|verify)$/.test(n)) {
            return parts.some((p) => p.tier >= TIER.LABEL && p.text.toLowerCase().includes(n));
          }
          return lbl.includes(n);
        })) continue;
        // Positive hits are scored PER SIGNAL TIER: automation-id > label/aria > placeholder/name.
        for (const p of parts) {
          const pt = p.text.toLowerCase();
          const hit = m.any.find((a) => pt.includes(a));
          if (!hit) continue;
          const score = p.tier + hit.length + (pt.trim() === hit ? 50 : 0);
          if (!best || score > best.score) best = { field: m.field, score, tier: p.tier };
        }
      }
      // Confirmation-email is too dangerous to infer from a generated id/name alone
      // (for example, an ordinary email input whose id happens to contain "verify").
      if (best && best.field === "confirmEmail" && best.tier < TIER.LABEL) best = null;
      // The autocomplete token outranks any keyword hit — EXCEPT when it says the
      // broad "website" and the label matched the more specific linkedin/github.
      const confirmEmailLabel = parts.some((p) => p.tier >= TIER.LABEL &&
        /\b(confirm|confirmation|verify|re-?enter|retype)\b/.test(p.text.toLowerCase()) &&
        /\b(e-?mail)\b/.test(p.text.toLowerCase()));
      if (acField && !(confirmEmailLabel && acField === "email") && !(acField === "website" && best && (best.field === "linkedin" || best.field === "github"))) {
        best = { field: acField, score: TIER.AUTOCOMPLETE, tier: TIER.AUTOCOMPLETE };
      }
      if (confirmEmailLabel && (!best || best.field === "email")) best = { field: "confirmEmail", score: TIER.LABEL + 20, tier: TIER.LABEL };
      // EEO/demographic fields are scanned like any other now (user decision: EEO is
      // always available, no opt-in). They only end up FILLED when the user actually
      // has that value (the adapter's plan gates on values[field]) and the user still
      // reviews/unchecks each one in the overlay before anything is written.
      if (best) {
        // A match backed only by placeholder/name/id is a GUESS: surfaced in the
        // overlay unchecked so the user opts in instead of un-noticing a wrong fill.
        const confidence = best.tier >= TIER.LABEL ? "high" : "low";
        out.push({ el, field: best.field, label: labelText(el), kind: elKind(el), score: best.score, confidence });
      }
    }
    // keep only the highest-scoring element per field — except a desired-pay question asked twice (Lever/Rover: "desired salary" AND
    // "desired total compensation"), where every one the label itself names takes the same answer.
    const byField = {};
    const extra = [];
    for (const c of out) {
      if (c.field === "desiredSalary" && c.confidence === "high" && byField[c.field] && byField[c.field].confidence === "high") {
        if (c.score > byField[c.field].score) { extra.push(byField[c.field]); byField[c.field] = c; } else extra.push(c);
        continue;
      }
      if (!byField[c.field] || c.score > byField[c.field].score) byField[c.field] = c;
    }
    return Object.values(byField).concat(extra);
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

  // `document.contains()` excludes elements inside a shadow tree even when the
  // host is connected to the page. Shadow-DOM ATS fields are valid fill targets
  // as long as their node is still connected to the document.
  function isAttached(el) {
    return !!el && (el.isConnected === true || document.contains(el));
  }

  // A planned element the page has since re-rendered (React forms remount their inputs while the
  // plan waits for AI drafts): find its replacement by id/name OR by the canonical field + label.
  // The latter is required by SmartRecruitters: its shadow form changes generated ids on every
  // validation pass, so an id-only lookup silently returns the detached node.
  function reattach(el, hint) {
    if (isAttached(el)) return el;
    if (!el) return el;
    const tag = String(el.tagName || "").toLowerCase();
    const selector = tag || "*";
    let candidates = [];
    try { candidates = deepQueryAll(document, selector); } catch (e) {}
    const sameTag = candidates.filter((candidate) => !tag || String(candidate.tagName || "").toLowerCase() === tag);
    const byId = el.id && sameTag.find((candidate) => candidate.id === el.id);
    if (byId) return byId;
    const byName = el.name && sameTag.find((candidate) => candidate.name === el.name);
    if (byName) return byName;

    const field = hint && hint.field;
    if (!field) return el;
    const wantedLabel = String((hint && hint.label) || "").toLowerCase().replace(/\s+/g, " ").trim();
    let mapped = [];
    try { mapped = scanGeneric(document).filter((item) => item.field === field && sameTag.includes(item.el)); } catch (e) {}
    if (!mapped.length) return el;
    mapped.sort((a, b) => {
      const score = (item) => {
        const label = String(item.label || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!wantedLabel || !label) return item.score || 0;
        if (label === wantedLabel) return 10000 + (item.score || 0);
        if (label.includes(wantedLabel) || wantedLabel.includes(label)) return 5000 + (item.score || 0);
        return item.score || 0;
      };
      return score(b) - score(a);
    });
    return mapped[0].el || el;
  }

  // Apply one planned fill item. Returns true on success.
  function applyItem(item, value) {
    const el = item.el = reattach(item.el, item);
    if (!isAttached(el)) return false;
    const kind = item.kind || elKind(el);
    try {
      if (kind === "select") return selectOption(el, value);
      if (kind === "boolean") {
        const grp = el.closest('[role="group"],fieldset,div') || document;
        if (!YESNO_RE.test(String(value).trim())) {
          // Not a yes/no answer: a radio group may offer it as an option; a checkbox can't.
          return el.type === "radio" ? setChoiceGroup(grp, value) : false;
        }
        const truthy = /^(yes|true|1)$/i.test(String(value).trim());
        if (el.type === "checkbox") {
          // Workday/React checkboxes ignore a programmatic `el.checked = …` (the box
          // gets focus but aria-checked stays false). A real click lets the framework
          // toggle and register it; fall back to a native set only if that didn't take.
          if (el.checked !== truthy) realClick(el);
          if (el.checked !== truthy) { el.checked = truthy; fire(el, "input"); fire(el, "change"); }
          return el.checked === truthy;
        }
        return setBooleanGroup(grp, truthy);
      }
      if (kind === "file") return false; // files handled separately
      if (el.type === "number") { value = numericValue(value); if (!value) return false; }
      if (el.type === "date") { value = isoDate(value); if (!value) return false; }
      return fillText(el, value);
    } catch (e) { return false; }
  }

  function attachmentParent(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    try {
      const root = el.getRootNode && el.getRootNode();
      return root && root.host ? root.host : null;
    } catch (e) { return null; }
  }

  function isDisplayNone(el) {
    if (!el) return false;
    try {
      if (el.hidden) return true;
      const inline = el.getAttribute && (el.getAttribute("style") || "");
      if (/\bdisplay\s*:\s*none\b|\bvisibility\s*:\s*hidden\b/i.test(inline)) return true;
      const css = window.getComputedStyle && window.getComputedStyle(el);
      return !!css && (css.display === "none" || css.visibility === "hidden");
    } catch (e) { return false; }
  }

  // ATS file widgets put the real input behind a visible drop zone. Keep this deliberately
  // structural: it covers the common data attributes without depending on a tenant's generated
  // class names, and it also works when the input lives in an open shadow root.
  function fileDropTarget(inputEl) {
    let node = inputEl;
    for (let hops = 0; node && hops < 12; hops++) {
      try {
        if (node.matches && node.matches(
          '[data-automation-id="file-upload-drop-zone"], [data-wd-file], [data-sr-file], ' +
          '[data-file-drop-zone], [data-testid*="drop" i], [class*="drop-zone" i], [class*="dropzone" i]'
        )) return node;
      } catch (e) {}
      node = attachmentParent(node);
    }
    return null;
  }

  function fileWidgetContainer(inputEl) {
    let node = inputEl;
    for (let hops = 0; node && hops < 12; hops++) {
      try {
        if (node.matches && node.matches('[data-wd-file], [data-sr-file], [data-file-upload-widget]')) return node;
      } catch (e) {}
      node = attachmentParent(node);
    }
    return null;
  }

  function fileListHas(fileList, expected) {
    if (!fileList || !fileList.length || !expected) return false;
    for (const actual of Array.from(fileList)) {
      if (actual && actual.name === expected.name && Number(actual.size) === Number(expected.size)) return true;
    }
    return false;
  }

  function fileUiHas(inputEl, fileName, target, widget) {
    const nodes = [target, widget];
    try { nodes.push(inputEl && inputEl.getRootNode && inputEl.getRootNode()); } catch (e) {}
    let node = inputEl;
    for (let hops = 0; node && hops < 8; hops++) {
      nodes.push(node);
      node = attachmentParent(node);
    }
    const ownUi = (candidate) => {
      let node = candidate;
      for (let hops = 0; node && hops < 12; hops++) {
        if (node.id === "__jaf_host" || node.id === "__kiwiply_batch_banner") return true;
        if (node.parentElement) node = node.parentElement;
        else {
          const root = node.getRootNode && node.getRootNode();
          node = root && root.host ? root.host : null;
        }
      }
      return false;
    };
    if (nodes.some((candidate) => candidate && !ownUi(candidate) && typeof candidate.textContent === "string" && candidate.textContent.includes(fileName))) return true;
    try {
      const all = deepQueryAll(inputEl.ownerDocument || document, "*");
      return all.some((candidate) => !ownUi(candidate) && typeof candidate.textContent === "string" && candidate.textContent.includes(fileName));
    } catch (e) { return false; }
  }

  function dispatchDrop(target, dataTransfer, type) {
    if (!target) return false;
    try {
      let event;
      if (typeof DragEvent === "function") {
        event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
      } else {
        event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { configurable: true, value: dataTransfer });
      }
      target.dispatchEvent(event);
      return true;
    } catch (e) { return false; }
  }

  async function attachFileDetailed(inputEl, blob, fileName) {
    if (!inputEl || String(inputEl.type || "").toLowerCase() !== "file") return { ok: false, reason: "no-file-input" };
    if (!blob) return { ok: false, reason: "no-file-data" };
    try {
      const file = new File([blob], fileName || "resume.pdf", { type: blob.type || "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const hidden = isDisplayNone(inputEl);
      const target = hidden ? (fileDropTarget(inputEl) || inputEl) : null;
      const widget = fileWidgetContainer(inputEl);
      let assigned = false;
      try {
        inputEl.files = dt.files;
        assigned = fileListHas(inputEl.files, file);
      } catch (e) {}

      // A hidden input is only the storage/control node. Drop the same payload on the visible
      // widget as well, because some ATS implementations listen exclusively to drag events.
      let dropped = false;
      if (target) {
        dispatchDrop(target, dt, "dragenter");
        dispatchDrop(target, dt, "dragover");
        dropped = dispatchDrop(target, dt, "drop");
      }
      try { fire(inputEl, "input"); fire(inputEl, "change"); } catch (e) {}
      // Let synchronous framework listeners commit their state before verification. This is still
      // one task turn and avoids claiming success before a React/Workday listener has run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (fileListHas(inputEl.files, file)) return { ok: true, method: target ? "drop" : "input" };

      // A few widgets replace the input's FileList and expose the accepted filename only in their
      // upload row. SmartRecruiters can render that row asynchronously, so wait for the explicit
      // UI evidence instead of reporting a false failure immediately after the drop event.
      const accepted = await observeFor(() => fileListHas(inputEl.files, file) || fileUiHas(inputEl, file.name, target, widget), 1200);
      if (accepted) return { ok: true, method: fileListHas(inputEl.files, file) ? "drop" : "drop-ui" };
      return {
        ok: false,
        reason: assigned || dropped ? "widget-rejected-file" : "file-assignment-failed",
        method: target ? "drop" : "input",
      };
    } catch (e) {
      return { ok: false, reason: "file-attach-error" };
    }
  }

  // Keep the original boolean seam for callers and third-party adapters; richer diagnostics stay
  // available to the filler and tests without leaking file metadata into telemetry.
  async function attachFile(inputEl, blob, fileName) {
    const result = await attachFileDetailed(inputEl, blob, fileName);
    return !!(result && result.ok);
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
  function lookupRoots(trigger) {
    const local = trigger ? elementRoot(trigger) : document;
    return local === document ? [document] : [local, document];
  }
  function deepElementById(root, id) {
    if (!root || !id) return null;
    try {
      const direct = root.getElementById && root.getElementById(id);
      if (direct) return direct;
    } catch (e) {}
    return deepQueryAll(root, "*").find((el) => el.id === id) || null;
  }
  // The popup actually opened by `trigger`. Workday triggers carry no aria-controls,
  // so we locate the open listbox structurally: the visible [role="listbox"] (or
  // Workday's option container) holding the MOST option nodes. Scoping to it keeps
  // unrelated widgets' option/pill nodes (e.g. a Country Phone Code multiselect's
  // selected "United States (+1)" pills) from polluting THIS dropdown's choices.
  function openListbox(trigger) {
    const id = trigger && (trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns"));
    const roots = lookupRoots(trigger);
    if (id) {
      for (const root of roots) {
        const el = deepElementById(root, id);
        if (el && isVisible(el)) return el;
      }
    }
    const boxes = [];
    const seen = new Set();
    for (const root of roots) {
      for (const b of deepQueryAll(root,
        '[role="listbox"],[data-automation-id="activeListContainer"],ul[data-automation-id="list"]')) {
        if (seen.has(b) || !isVisible(b) || b.getAttribute("data-automation-id") === "selectedItemList") continue;
        seen.add(b);
        boxes.push(b);
      }
    }
    if (!boxes.length) return null;
    // Prefer the visible listbox with the most option descendants (the open menu).
    let best = null, bestN = -1;
    for (const b of boxes) {
      const n = deepQueryAll(b, OPTION_SEL).length;
      if (n > bestN) { best = b; bestN = n; }
    }
    return bestN > 0 ? best : null;
  }
  function visibleOptions(scope) {
    const root = scope || document;
    return deepQueryAll(root, OPTION_SEL).filter((o) => isVisible(o) && (o.textContent || "").trim());
  }
  function findSearchBox(trigger) {
    const sel = 'input[data-automation-id="searchBox"],input[role="combobox"],[role="combobox"] input,input[type="search"],[role="dialog"] input';
    for (const root of lookupRoots(trigger)) {
      const hit = deepQueryAll(root, sel).find(isVisible);
      if (hit) return hit;
    }
    return null;
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
      // react-select (new Greenhouse boards): the chosen option shows in the CONTROL ("select__control" > "select__single-value"), a
      // sibling of the input's own "select__input-container", so the control is looked up first; the nearest "*select*" wrapper only
      // holds the empty input and made every successful pick look like a failure.
      const cont = trigger.closest('[class*="__control"]') || trigger.closest('[class*="control"],[class*="select"],[role="combobox"]') || trigger.parentElement;
      const ct = cont ? (cont.innerText || cont.textContent || "").trim() : "";
      return v || ct;
    }
    return (trigger.innerText || trigger.textContent || "").trim();
  }
  function isPlaceholder(s) { return !s || /^(select one|select\.{3}|select\.\.\.|select an?\b|choose|search|please select|--)/i.test(s); }
  function showsPlaceholder(trigger) { return isPlaceholder(committedValue(trigger)); }

  function valueMatchesChoice(actual, wanted) {
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const a = norm(actual), w = norm(wanted);
    return !!a && !!w && (a === w || a.startsWith(w + ",") || a.startsWith(w + " -"));
  }

  function selectedRadioValue(el) {
    const root = elementRoot(el);
    const name = String(el && el.name || "");
    const form = el && el.form;
    const radios = deepQueryAll(root, 'input[type="radio"]').filter((r) =>
      (!name || r.name === name) && (!form || r.form === form)
    );
    const picked = radios.find((r) => r.checked);
    if (!picked) return "";
    const wrap = picked.closest && picked.closest("label");
    return String(picked.value || (wrap && wrap.textContent) || "").trim();
  }

  function readCommittedValue(el, item) {
    if (!el) return "";
    const type = String(el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    if (item && item.choices && Array.isArray(item.choices)) {
      const picked = item.choices.find((choice) => choice && choice.el && choice.el.checked);
      return picked ? String(picked.value || picked.text || "").trim() : "";
    }
    if (type === "radio") return selectedRadioValue(el);
    if (type === "checkbox") return el.checked ? "true" : "false";
    if (type === "file") return el.files && el.files.length ? String(el.files[0].name || "") : "";
    if (el.tagName === "SELECT") {
      const option = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      return option ? String(option.text || option.value || "").trim() : String(el.value || "").trim();
    }
    if (item && (item.kind === "combo" || item.kind === "combo-multi") || el.getAttribute && el.getAttribute("role") === "combobox") {
      return committedValue(el);
    }
    if (el.isContentEditable) return String(el.textContent || "").trim();
    return typeof el.value === "string" ? el.value.trim() : String(el.textContent || "").trim();
  }

  function valuesMatch(actual, wanted, field) {
    if (Array.isArray(wanted)) return wanted.length > 0 && wanted.every((v) => valuesMatch(actual, v, field));
    const a = String(actual == null ? "" : actual).replace(/\s+/g, " ").trim().toLowerCase();
    const w = String(wanted == null ? "" : wanted).replace(/\s+/g, " ").trim().toLowerCase();
    if (!a || !w) return false;
    if (field === "phone") {
      const ad = a.replace(/\D/g, "");
      const wd = w.replace(/\D/g, "");
      return !!ad && !!wd && (ad === wd || ad.endsWith(wd) || wd.endsWith(ad));
    }
    if (/^(yes|true|1)$/.test(w)) return /^(yes|true|1)$/.test(a);
    if (/^(no|false|0)$/.test(w)) return /^(no|false|0)$/.test(a);
    return a === w || a.startsWith(w + ",") || a.startsWith(w + " -");
  }

  // Re-read the current page control after a fill. This is deliberately separate from the write
  // path: frameworks are allowed to replace a node or reject a value after input/change events.
  function verifyItem(item, wanted) {
    if (!item) return false;
    const el = item.el = reattach(item.el, item);
    if (!isAttached(el)) return false;
    try {
      if (el.getAttribute("aria-invalid") === "true") return false;
      if (el.validity && el.validity.valid === false) return false;
    } catch (e) {}
    const type = String(el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    if (type === "checkbox") {
      const want = /^(yes|true|1)$/i.test(String(wanted));
      return el.checked === want;
    }
    return valuesMatch(readCommittedValue(el, item), wanted, item.field);
  }

  // Typing into an autocomplete is not the same as selecting one of its options.
  // Require a standard post-selection signal for input-backed combos: the listbox
  // closed, the option became selected/active, or the control explicitly collapsed.
  function committedChoice(trigger, wanted, option) {
    if (trigger.tagName !== "INPUT") return !showsPlaceholder(trigger);
    if (!valueMatchesChoice(committedValue(trigger), wanted)) return false;
    if (trigger.getAttribute("aria-expanded") === "false") return true;
    if (option && option.getAttribute("aria-selected") === "true") return true;
    if (option && option.id && trigger.getAttribute("aria-activedescendant") === option.id) return true;
    const box = openListbox(trigger);
    return !box || visibleOptions(box).length === 0;
  }

  async function selectCustom(trigger, value, hint) {
    if (!trigger || value == null || value === "") return false;
    const want = String(value).trim();
    let active = reattach(trigger, hint);
    const openAndPick = async () => {
      active = reattach(active, hint);
      try { active.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {}
      if (active.tagName === "INPUT") {
        active.focus(); realClick(active);
        setNativeValue(active, want); fire(active, "input");
      } else {
        realClick(active);
        await observeFor(() => visibleOptions(openListbox(active)).length > 0, 2500);
        const search = findSearchBox(active);
        if (search) { search.focus(); setNativeValue(search, want); fire(search, "input"); fire(search, "keyup"); }
      }
      // Scope option lookups to the listbox THIS trigger opened (see openListbox).
      await observeFor(() => visibleOptions(openListbox(active)).length > 0, 900);
      const opt = bestOption(visibleOptions(openListbox(active)), want);
      if (!opt) { try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {} return false; }
      realClick(opt);
      // The option click can synchronously replace the input. Reattach before reading the
      // committed value; otherwise the detached input's old value makes a failed fill look good.
      return await observeFor(() => {
        const current = reattach(active, hint);
        if (current) active = current;
        const optionForCurrent = active === trigger ? opt : null;
        return committedChoice(active, want, optionForCurrent);
      }, 700);
    };
    // First attempt, then verify the control actually committed; retry once.
    let clicked = await openAndPick();
    if (clicked && !showsPlaceholder(active)) return true;
    if (!clicked && showsPlaceholder(active)) {
      // nothing landed at all — one retry
      clicked = await openAndPick();
    }
    // Success only if an option was chosen AND the trigger no longer shows a placeholder.
    return clicked && !showsPlaceholder(active);
  }

  // Async apply: drives combos; everything else delegates to the sync applyItem.
  async function applyItemAsync(item) {
    if (!item) return false;
    // "choice": click ONE specific radio/checkbox option (an AI pick that was
    // matched against the page's own option list — never free text).
    if (item.kind === "choice") {
      const el = item.el = reattach(item.el, item);
      if (!isAttached(el)) return false;
      realClick(el);
      if (!el.checked) { try { el.checked = true; fire(el, "input"); fire(el, "change"); } catch (e) {} }
      return el.checked === true;
    }
    if (item.kind === "combo") {
      item.el = reattach(item.el, item);
      const cands = [item.value].concat(item.alts || []).filter((v) => v != null && v !== "");
      for (const v of cands) {
        if (await selectCustom(item.el, v, item)) {
          item.el = reattach(item.el, item);
          return true;
        }
        item.el = reattach(item.el, item);
      }
      return false;
    }
    if (item.kind === "combo-multi") {
      const vals = Array.isArray(item.value) ? item.value : [item.value];
      let any = false;
      for (const v of vals) {
        const ok = await selectCustom(item.el, v, item);
        item.el = reattach(item.el, item);
        any = any || ok;
        await delay(160);
      }
      return any;
    }
    return applyItem(item, item.value);
  }

  JAF.adapterBase = {
    setNativeValue, fire, fillText, selectOption, setBooleanGroup, setChoiceGroup, numericValue, isoDate, labelText, labelParts, groupPrompt,
    cssEscape, isFillable, scanGeneric, deepQueryAll, blockText, elKind, applyItem, applyItemAsync, attachFile, attachFileDetailed, humanize,
    isVisible, findNextButton, isCustomDropdown, selectCustom, realClick, waitFor, delay,
    // exposed for unit tests (dropdown option scoping + matching + autocomplete)
    openListbox, visibleOptions, bestOption, autocompleteField, autocompleteTrusted, verifyItem,
  };
})();
