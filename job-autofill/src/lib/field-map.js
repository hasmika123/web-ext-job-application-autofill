/* field-map.js — PURE core of the AI field mapper (SW-safe, no DOM, no network).
 *
 * The deterministic rules miss long-tail fields whose labels contain none of the
 * known keywords. The mapper batches those labels into ONE model call ("map each
 * label to a canonical key or unknown") and the result is cached per host+label,
 * so any given page costs at most one call EVER (per device).
 *
 * This file is only the prompt builder + the tolerant response parser, shared by
 * the service worker (which owns the model call) and the jsdom tests. The DOM
 * half lives in src/content/field-mapper.js. Attaches to JAF.fieldMap on
 * globalThis (service worker) or window (content script).
 */
(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const JAF = (root.JAF = root.JAF || {});

  // Canonical keys the model may map to. Mirrors JAF.schema.FIELDS MINUS the
  // SENSITIVE demographic keys (gender/race/ethnicity/veteran/disability are
  // never LLM-mapped — the deterministic rules own those). Bundled copy because
  // the service worker doesn't load schema.js.
  const MAPPABLE = [
    "firstName", "lastName", "fullName", "preferredName", "email", "phone",
    "addressLine1", "addressLine2", "city", "state", "postalCode", "country",
    "linkedin", "github", "website", "authorizedToWork", "requireSponsorship",
    "summary", "skills", "coverLetter",
  ];

  function buildMapPrompt(labels) {
    const lines = (labels || []).map((l, i) => (i + 1) + ". " + String(l == null ? "" : l).replace(/\s+/g, " ").trim().slice(0, 160));
    return (
      "Task: map each numbered job-application form field label to EXACTLY ONE key from this vocabulary, "
      + 'or "unknown" if none fits.\n'
      + "Vocabulary: " + MAPPABLE.join(", ") + "\n\n"
      + "Fields:\n" + lines.join("\n") + "\n\n"
      + 'Reply with ONLY a JSON object mapping each number to a key, like {"1":"firstName","2":"unknown"} — no prose, no markdown.'
    );
  }

  // Tolerant parse — the server AI path rides through a drafting-shaped prompt, so
  // the reply may wrap the JSON in prose or a ```json fence. Find the first {...}
  // block, JSON.parse it, and keep only entries whose value is in the vocabulary
  // ("unknown" → "" so the caller can negative-cache it). Returns null when no
  // valid JSON object is found (the caller then caches NOTHING and stays silent).
  function parseMapResponse(text, count) {
    const m = String(text == null ? "" : text).match(/\{[\s\S]*?\}/);
    if (!m) return null;
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { return null; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out = {};
    Object.keys(obj).forEach((k) => {
      const i = parseInt(k, 10);
      if (!(i >= 1) || (count && i > count)) return;
      const v = String(obj[k] == null ? "" : obj[k]).trim();
      if (MAPPABLE.indexOf(v) !== -1) out[i] = v;
      else if (/^unknown$/i.test(v)) out[i] = "";
    });
    return out;
  }

  // --- option matcher (shared by the SW's JAF_PICK handler + tests) ----------
  // The model answers a constrained screening question; the fill is only ever an
  // option the page actually offers, matched here — hallucination-proof by
  // construction. Word-boundary matching keeps tiny options ("No") from hitting
  // inside words ("know"); an ambiguous or UNSURE reply returns null (no fill).
  function matchOption(answer, options) {
    const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const a = norm(answer);
    if (!a || /^unsure[.!]?$/i.test(a)) return null;
    const opts = (options || []).filter((o) => norm(o));
    for (const o of opts) if (norm(o) === a) return o;              // exact wins
    const unique = (matches) => (matches.length === 1 ? matches[0] : null);
    // a verbose reply CONTAINING exactly one option (server path may add prose)
    const inAnswer = opts.filter((o) => new RegExp("\\b" + escRe(norm(o)) + "\\b").test(a));
    if (inAnswer.length) return unique(inAnswer);
    // a terse reply contained in exactly one option ("3-5" → "3-5 years")
    const inOption = a.length >= 2 ? opts.filter((o) => new RegExp("\\b" + escRe(a) + "\\b").test(norm(o))) : [];
    return unique(inOption);
  }

  JAF.fieldMap = { MAPPABLE, buildMapPrompt, parseMapResponse, matchOption };
})();
