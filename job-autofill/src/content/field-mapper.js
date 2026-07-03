/* field-mapper.js — the DOM half of the AI field mapper. window.JAF.fieldMapper
 *
 * After the deterministic plan is built, collect the fillable, labeled elements
 * NOTHING claimed, resolve each label from a local host+label cache, and send
 * only the novel ones to the service worker in ONE batched JAF_MAP_FIELDS
 * message. The SW asks the model (BYO key or the opt-in server AI — the same
 * consent gates as answer drafting; when both are off this is a silent no-op)
 * to map each label to a canonical field. Mapped fields become normal review
 * items (AI badge, user unchecks anything wrong). Only LABELS leave the page —
 * never the user's values. Results (including "unknown") are cached, so a page
 * costs at most one model call ever.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const B = () => JAF.adapterBase;

  const CACHE_KEY = "fieldMapCache";
  const MAX_FIELDS = 20;         // per-page batch cap: keeps the prompt tiny
  const MAX_CACHE = 3000;        // safety cap; drop the whole map if it balloons

  function pageHost() { return ((typeof location !== "undefined" && location.hostname) || "").toLowerCase(); }
  function keyFor(label) { return JAF.fieldCache.contextHash(pageHost(), label); }

  function cacheGet() {
    return new Promise((res) => {
      try { chrome.storage.local.get(CACHE_KEY, (o) => res((o && o[CACHE_KEY]) || {})); }
      catch (e) { res({}); }
    });
  }
  function cachePut(map) {
    return new Promise((res) => {
      try {
        if (Object.keys(map).length > MAX_CACHE) map = {};
        chrome.storage.local.set({ [CACHE_KEY]: map }, () => res(true));
      } catch (e) { res(false); }
    });
  }

  // Fillable, labeled elements the plan did not claim. Radio/checkbox groups and
  // file inputs are out of scope (choice questions + attachments have their own
  // paths), and password fields are never touched.
  function collectUnmatched(plannedItems) {
    const taken = new Set((plannedItems || []).map((i) => i.el).filter(Boolean));
    const out = [];
    const els = B().deepQueryAll(document, "input, textarea, select, [contenteditable='true']");
    for (const el of els) {
      if (taken.has(el) || !B().isFillable(el)) continue;
      if (el.type === "file" || el.type === "radio" || el.type === "checkbox" || el.type === "password") continue;
      const label = (B().labelText(el) || "").replace(/\s+/g, " ").trim();
      if (label.length < 3 || label.length > 160) continue;
      out.push({ el, label, kind: B().elKind(el) });
      if (out.length >= MAX_FIELDS) break;
    }
    return out;
  }

  function mapViaSW(labels) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "JAF_MAP_FIELDS", labels }, (resp) => {
          if (chrome.runtime.lastError) return resolve({ error: String(chrome.runtime.lastError.message) });
          resolve(resp || {});
        });
      } catch (e) { resolve({ error: String(e) }); }
    });
  }

  // A mapping only becomes a plan item when the user actually HAS that value.
  function itemFor(cand, field, values) {
    if (!field || values[field] === undefined || values[field] === "") return null;
    return { el: cand.el, field, value: values[field], label: cand.label, kind: cand.kind, aiMapped: true };
  }

  // Returns extra plan items for fields the deterministic rules missed.
  async function run(plannedItems, values) {
    let cands;
    try { cands = collectUnmatched(plannedItems); } catch (e) { return []; }
    if (!cands.length) return [];
    const cache = await cacheGet();
    const items = [];
    const novel = [];
    for (const c of cands) {
      const k = keyFor(c.label);
      if (cache[k] !== undefined) {              // hit: a field name, or "" = known-unknown
        const it = itemFor(c, cache[k], values);
        if (it) items.push(it);
      } else novel.push(c);
    }
    if (novel.length) {
      const r = await mapViaSW(novel.map((c) => c.label));
      if (r && r.mappings) {
        let dirty = false;
        novel.forEach((c, idx) => {
          const field = r.mappings[idx + 1];       // 1-based; "" = model said unknown
          if (field === undefined) return;         // model skipped it — don't cache, retry next time
          cache[keyFor(c.label)] = field;
          dirty = true;
          const it = itemFor(c, field, values);
          if (it) items.push(it);
        });
        if (dirty) await cachePut(cache);
      }
      // disabled / error / unparseable → silent no-op (rules already did their best)
    }
    return items;
  }

  JAF.fieldMapper = { run, collectUnmatched, CACHE_KEY };
})();
