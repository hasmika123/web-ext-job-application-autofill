/* profile-learn.js — Tier C of the self-building profile (Phase 10.3d). JAF.profileLearn
 *
 * After a fill, watch the page's PROFILE questions — the canonical fields the profile could hold
 * — and report what the user commits there, so the web can offer it back as a suggested profile
 * value ("we learned 3 things about you — keep these?"). Two kinds of answer are learned:
 *   - a profile field the fill had NOTHING for (the profile is blank there): the scan still finds
 *     the question, and whatever the user types or picks is the answer;
 *   - a field we DID fill that the user then changed: a candidate change to the profile.
 *
 * Nothing here writes the profile. The server keeps each answer as a SUGGESTION, applies every
 * rule (which keys, when a change is worth offering, dismissed-never-returns), and the user
 * decides on the web. Only high-confidence label matches are watched — a guess about which
 * question a box answers must never become a suggestion.
 *
 * Never learned: EEO / demographic answers (only ever set on the web), resume-level text, file
 * inputs, checkboxes (a tick means different things on different forms). The page address never
 * leaves the device either: it goes to the service worker, which turns it into a salted hash
 * that only says "same application or a different one".
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  // Mirrors the server's ProfileSuggestionService.SUGGESTIBLE (the server enforces it anyway).
  const LEARNABLE = new Set([
    "firstName", "lastName", "preferredName", "email", "phone",
    "addressLine1", "addressLine2", "city", "state", "postalCode", "country",
    "linkedin", "github", "website", "authorizedToWork", "requireSponsorship",
    "desiredSalary", "noticePeriod", "earliestStartDate", "workPreference", "willingToRelocate", "referralSource",
  ]);
  // Answered Yes/No on the profile, however the page words its options.
  const YESNO = new Set(["authorizedToWork", "requireSponsorship", "willingToRelocate"]);
  const MAX_LEN = 300;
  const FLUSH_MS = 1500;

  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

  /** The profile value an answer stands for, or "" when it can't be one. */
  function normalize(field, raw) {
    const v = clean(raw);
    if (!v || v.length > MAX_LEN) return "";
    if (YESNO.has(field)) {
      // "Yes, I am authorized" is a Yes; "I prefer not to say" is not a profile value.
      if (/^yes\b/i.test(v)) return "Yes";
      if (/^no\b/i.test(v)) return "No";
      return "";
    }
    return v;
  }

  function radiosOf(el) {
    if (!el.name) return [el];
    const scope = el.form || el.ownerDocument || document;
    return Array.from(scope.querySelectorAll('input[type="radio"]')).filter((r) => r.name === el.name);
  }

  /** What the user has committed in this control, as text they'd recognise. */
  function valueOf(el) {
    if (!el) return "";
    if (el.type === "radio") {
      const picked = radiosOf(el).find((r) => r.checked);
      if (!picked) return "";
      const B = JAF.adapterBase;
      const wrap = picked.closest && picked.closest("label");
      const byFor = picked.id && document.querySelector('label[for="' + String(picked.id).replace(/"/g, '\\"') + '"]');
      return clean((wrap && wrap.textContent) || (byFor && byFor.textContent) || picked.value || (B && B.labelText(picked)));
    }
    if (el.type === "checkbox" || el.type === "file") return "";
    return JAF.fieldCache ? JAF.fieldCache.committedValueOf(el) : clean(el.value);
  }

  /**
   * Start watching. `planned` = the fill's items ({el, field}); `send(answers)` receives
   * `[{fieldKey, value}]` batches. Returns `{ stop, flush }`. One watcher per page — a new fill
   * replaces the previous one, so a re-fill never double-reports.
   */
  function start(opts) {
    opts = opts || {};
    if (active) active.stop();
    const B = JAF.adapterBase;
    const send = typeof opts.send === "function" ? opts.send : () => {};
    const targets = new Map(); // el -> { field, baseline }
    const planned = (opts.planned || []).filter((i) => i && i.el && LEARNABLE.has(i.field));
    const plannedFields = new Set(planned.map((i) => i.field));

    // Fields we filled (or offered): a later change is a candidate change to the profile.
    for (const i of planned) targets.set(i.el, { field: i.field, baseline: valueOf(i.el) });

    // Profile questions the fill had no value for: the user's answer fills a blank profile field.
    if (B && B.scanGeneric) {
      let found = [];
      try { found = B.scanGeneric(document); } catch (e) { found = []; }
      for (const c of found) {
        if (!LEARNABLE.has(c.field) || plannedFields.has(c.field) || c.confidence !== "high" || targets.has(c.el)) continue;
        targets.set(c.el, { field: c.field, baseline: valueOf(c.el) });
      }
    }

    const pending = new Map(); // field -> value, waiting for the next flush
    const sent = new Map();    // field -> value last sent, so a re-commit isn't re-sent
    let timer = null;

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      const answers = [];
      for (const [field, value] of pending) {
        if (sent.get(field) === value) continue;
        sent.set(field, value);
        answers.push({ fieldKey: field, value });
      }
      pending.clear();
      if (answers.length) { try { send(answers); } catch (e) { /* learning must never break a page */ } }
    }

    function targetFor(el) {
      if (!el) return null;
      if (targets.has(el)) return { el, rec: targets.get(el) };
      // A radio group is watched through whichever radio the scan returned.
      if (el.type === "radio") {
        for (const r of radiosOf(el)) if (targets.has(r)) return { el: r, rec: targets.get(r) };
      }
      return null;
    }

    function onCommit(e) {
      const t = targetFor(e.target);
      if (!t) return;
      const value = normalize(t.rec.field, valueOf(t.el));
      if (!value || same(value, normalize(t.rec.field, t.rec.baseline))) {
        pending.delete(t.rec.field); // changed back: nothing to learn
        return;
      }
      pending.set(t.rec.field, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_MS);
    }

    document.addEventListener("change", onCommit, true);
    document.addEventListener("focusout", onCommit, true); // custom dropdowns commit on blur
    window.addEventListener("pagehide", flush);

    const handle = {
      flush,
      stop() {
        flush();
        document.removeEventListener("change", onCommit, true);
        document.removeEventListener("focusout", onCommit, true);
        window.removeEventListener("pagehide", flush);
        if (active === handle) active = null;
      },
      watching: () => Array.from(targets.values()).map((r) => r.field),
    };
    active = handle;
    return handle;
  }

  let active = null;

  JAF.profileLearn = { start, normalize, LEARNABLE };
})();
