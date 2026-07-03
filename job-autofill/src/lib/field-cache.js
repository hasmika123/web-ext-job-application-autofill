/* field-cache.js — local, per-profile memory of the user's field answers.
 *
 * When the user corrects a filled value or picks a custom-dropdown option, we
 * persist `{ profileId, fieldKey, contextHash, value }` and prefer that value on
 * the next fill. Fully local (IndexedDB), no network, no auto-submit. The row
 * shape mirrors the future server `field_cache` table so Phase 4 can sync it
 * without a migration. Attaches to window.JAF.fieldCache.
 *
 *   store key = `${profileId}::${fieldKey}::${contextHash}`
 *   entry     = { profileId, fieldKey, contextHash, value, hitCount, updatedAt }
 *
 * Exposes `JAF.fieldCache` (a default singleton used by the filler) plus
 * `JAF.fieldCache.create(opts)` and the pure helpers for isolated unit tests.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  // ---- pure helpers (no DOM, no async) -----------------------------------
  // Normalize any label/value/host to a stable token so trivial differences
  // (case, spacing, punctuation) don't fragment the cache.
  function slug(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // FNV-1a 32-bit -> base36. Small, dependency-free, good enough to bucket a
  // question's context; collisions only ever conflate two contexts, never leak.
  function hash(s) {
    let h = 0x811c9dc5;
    const str = String(s == null ? "" : s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  // A given field can appear in many question contexts (a "Yes/No" combo asks
  // different things). Bucket by host + the visible label so learned answers
  // don't bleed across unrelated questions or sites.
  function contextHash(host, label) {
    return hash(slug(host) + "|" + slug(label));
  }

  // The canonical field is the primary key; fall back to a slug of the label
  // for free-form questions that have no canonical field.
  function fieldKeyFor(item) {
    return (item && (item.field || slug(item.label))) || "field";
  }

  function storeKey(profileId, fieldKey, ctxHash) {
    return profileId + "::" + fieldKey + "::" + ctxHash;
  }

  // What value does an element currently hold, from the user's point of view?
  function isPlaceholder(s) {
    return !s || /^(select one|select\.{2,}|select an?\b|choose|search|please select|--)/i.test(s);
  }
  function committedValueOf(el) {
    if (!el) return "";
    if (el.tagName === "SELECT") {
      const o = el.options && el.options[el.selectedIndex];
      const t = o ? (o.text || o.value) : el.value;
      return String(t || "").trim();
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const v = String(el.value || "").trim();
      if (v) return v;
      // combobox triggers carry their chosen label in surrounding text
      const cont = el.closest && el.closest('[class*="control"],[class*="select"],[role="combobox"]');
      const ct = cont ? String(cont.innerText || cont.textContent || "").trim() : "";
      return isPlaceholder(ct) ? "" : ct;
    }
    const t = String(el.innerText || el.textContent || "").trim();
    return isPlaceholder(t) ? "" : t;
  }

  // ---- store backends ----------------------------------------------------
  // Contract: { get(key)->Promise<entry|null>, put(key,entry)->Promise, all()->Promise<entry[]> }

  function memoryStore(backing) {
    const map = backing || new Map();
    return {
      get: (k) => Promise.resolve(map.has(k) ? map.get(k) : null),
      put: (k, v) => { map.set(k, v); return Promise.resolve(); },
      all: () => Promise.resolve(Array.from(map.values())),
      _map: map,
    };
  }

  function idbStore() {
    const DB_NAME = "dossier-fieldcache";
    const STORE = "entries";
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const tx = (mode, fn) =>
      open().then(
        (db) =>
          new Promise((resolve, reject) => {
            const t = db.transaction(STORE, mode);
            const os = t.objectStore(STORE);
            const r = fn(os);
            t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
            t.onerror = () => reject(t.error);
          })
      );
    return {
      get: (k) => tx("readonly", (os) => os.get(k)).then((v) => v || null).catch(() => null),
      put: (k, v) => tx("readwrite", (os) => os.put(v, k)).then(() => undefined).catch(() => undefined),
      all: () =>
        tx("readonly", (os) => os.getAll && os.getAll()).then((v) => v || []).catch(() => []),
    };
  }

  function defaultStore() {
    try {
      if (typeof indexedDB !== "undefined" && indexedDB) return idbStore();
    } catch (e) {}
    return memoryStore();
  }

  // ---- the cache instance ------------------------------------------------
  function create(opts) {
    opts = opts || {};
    const store = opts.store || defaultStore();
    let profileId = slug(opts.profileId || "default") || "default";
    let host = opts.host;
    if (host == null) host = (typeof location !== "undefined" && location.hostname) || "";
    const bound = (typeof WeakSet !== "undefined") ? new WeakSet() : { has: () => false, add: () => {} };

    function setProfile(id) { profileId = slug(id || "default") || "default"; }
    function keyOf(item) {
      return storeKey(profileId, fieldKeyFor(item), contextHash(host, item.label || ""));
    }

    // Read: the learned value for this item, or null. Bumps hitCount so Phase 4
    // can rank by it; ranking is value-neutral so a failed read changes nothing.
    async function get(item) {
      if (!item) return null;
      const k = keyOf(item);
      const e = await store.get(k);
      if (!e || e.value == null || e.value === "") return null;
      try { await store.put(k, Object.assign({}, e, { hitCount: (e.hitCount || 0) + 1 })); } catch (x) {}
      return e.value;
    }

    // Write (last-write-wins): persist the user's chosen/corrected value.
    async function remember(item, value) {
      if (!item || value == null || value === "") return false;
      const k = keyOf(item);
      const prev = await store.get(k);
      const entry = {
        profileId,
        fieldKey: fieldKeyFor(item),
        contextHash: contextHash(host, item.label || ""),
        value: String(value),
        hitCount: prev ? (prev.hitCount || 0) : 0,
        updatedAt: Date.now(),
      };
      await store.put(k, entry);
      return true;
    }

    // Read path: override item values with learned answers before the overlay
    // shows them, so the cached choice is what the user reviews and fills.
    async function preferCached(items) {
      if (!Array.isArray(items)) return items;
      for (const item of items) {
        if (!item || item.kind === "info" || item.kind === "file") continue;
        const cached = await get(item);
        if (cached == null || cached === "") continue;
        // Any hit means the user confirmed this field before — the overlay trusts
        // it (keeps the row checked) even when the DOM match was low-confidence.
        item.cached = true;
        if (String(cached) === String(item.value)) continue;
        // keep the originally-planned value as a fallback for combos
        if (item.value != null && item.value !== "") {
          item.alts = (item.alts || []).slice();
          if (!item.alts.includes(item.value)) item.alts.unshift(item.value);
        }
        item.value = cached;
        item.cached = true;
      }
      return items;
    }

    // Write path: learn from corrections. After we fill an element, watch it;
    // if the user changes it (typing or picking a custom-dropdown option), the
    // committed value is persisted for next time. One listener per element.
    function watch(item) {
      const el = item && item.el;
      if (!el || !el.addEventListener || bound.has(el)) return;
      bound.add(el);
      const onChange = () => {
        const v = committedValueOf(el);
        if (v) remember(item, v);
      };
      el.addEventListener("change", onChange, true);
      // custom dropdowns commit on blur without a reliable 'change'
      el.addEventListener("blur", onChange, true);
    }

    // ---- Phase 4 cloud sync ------------------------------------------------
    // Export the current profile's entries for pushing to the server, and merge a
    // server-returned set back in (last-write-wins by updatedAt; hitCount = max), so
    // learned answers follow the user across devices. updatedAt is epoch ms locally;
    // the tracking layer converts to/from the server's ISO Instant.
    async function exportAll() {
      const all = await store.all();
      return (all || []).filter((e) => e && e.profileId === profileId);
    }
    async function importEntries(entries) {
      if (!Array.isArray(entries)) return 0;
      let n = 0;
      for (const e of entries) {
        if (!e || !e.fieldKey || !e.contextHash || e.value == null || e.value === "") continue;
        const k = storeKey(profileId, e.fieldKey, e.contextHash);
        const prev = await store.get(k);
        const incomingUpdated = Number(e.updatedAt) || 0;
        const prevUpdated = prev ? Number(prev.updatedAt) || 0 : 0;
        await store.put(k, {
          profileId,
          fieldKey: e.fieldKey,
          contextHash: e.contextHash,
          value: prev && prevUpdated > incomingUpdated ? prev.value : String(e.value),
          hitCount: Math.max(prev ? prev.hitCount || 0 : 0, e.hitCount || 0),
          updatedAt: Math.max(prevUpdated, incomingUpdated),
        });
        n++;
      }
      return n;
    }

    return {
      get, remember, preferCached, watch, setProfile, keyOf,
      committedValueOf, contextHash, fieldKeyFor, exportAll, importEntries, _store: store,
    };
  }

  const api = create();
  api.create = create;
  api.slug = slug;
  api.hash = hash;
  api.contextHash = contextHash;
  api.fieldKeyFor = fieldKeyFor;
  api.committedValueOf = committedValueOf;
  api.memoryStore = memoryStore;
  JAF.fieldCache = api;
})();
