/* field-cache.js — local, per-profile memory of the user's field answers.
 *
 * When the user corrects a filled value or picks a custom-dropdown option, we
 * persist `{ profileId, fieldKey, contextHash, value }` and prefer that value on
 * the next fill. Local-first, no auto-submit. The row shape mirrors the server
 * `field_cache` table so the sync in lib/sync.js needs no migration. Attaches to
 * window.JAF.fieldCache.
 *
 * Storage lives in `chrome.storage.local` under one key, NOT in IndexedDB: a
 * content script's IndexedDB belongs to the PAGE's origin, so answers learned on
 * greenhouse.io were invisible both to every other ATS host and to the drawer
 * (an extension-origin iframe) that has to push them to the server. The
 * chrome.storage area is one store shared by every extension context. Entries
 * written by the old per-origin IndexedDB are drained into it once per origin.
 *
 *   store key = `${profileId}::${fieldKey}::${contextHash}`
 *   entry     = { profileId, fieldKey, contextHash, value, hitCount, updatedAt }
 *
 * Each answer is stored TWICE: once under this host, and once under a host-agnostic
 * twin (`contextHash("", label)`) so the same question on a different ATS reuses it.
 * Reads try the host-scoped row first, so a deliberate site-specific answer always
 * beats the carried-over one.
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
  // don't bleed across unrelated questions.
  function contextHash(host, label) {
    return hash(slug(host) + "|" + slug(label));
  }

  // Every answer is ALSO stored under a host-agnostic twin, so the same question
  // on a different ATS reuses it: "Are you legally authorized to work in the US?"
  // is one question whether Greenhouse or Lever is asking. The host-scoped entry
  // stays the primary key and always wins, so a site-specific answer is never
  // overridden by the general one — the twin is only consulted on a miss.
  const GLOBAL_HOST = "";
  function globalContextHash(label) {
    return contextHash(GLOBAL_HOST, label);
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

  // The real backend: ONE `chrome.storage.local` key holding a { storeKey: entry }
  // map, shared by every extension context (the content script on any ATS host,
  // the drawer iframe, the service worker). Entries are tiny and number in the
  // hundreds, so a whole-map read-modify-write is cheap; writes are serialized
  // through `chain` because two fills committing at once would otherwise
  // read-then-clobber each other.
  const CHROME_KEY = "fieldCache";
  function chromeStore(area) {
    const A = area || chrome.storage.local;
    let chain = Promise.resolve();
    const readAll = () =>
      new Promise((resolve) => {
        try {
          A.get(CHROME_KEY, (o) => resolve((o && o[CHROME_KEY]) || {}));
        } catch (e) { resolve({}); }
      });
    const writeAll = (map) =>
      new Promise((resolve) => {
        const patch = {};
        patch[CHROME_KEY] = map;
        try { A.set(patch, () => resolve()); } catch (e) { resolve(); }
      });
    // Queue a read-modify-write so concurrent puts compose instead of racing.
    const mutate = (fn) => {
      chain = chain.then(async () => {
        const map = await readAll();
        const next = fn(map);
        if (next !== false) await writeAll(map);
      }).catch(() => {});
      return chain;
    };
    return {
      get: (k) => readAll().then((m) => m[k] || null).catch(() => null),
      put: (k, v) => mutate((m) => { m[k] = v; }),
      all: () => readAll().then((m) => Object.keys(m).map((k) => m[k])).catch(() => []),
      _readAll: readAll,
    };
  }

  function hasChromeStorage() {
    try {
      return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
    } catch (e) { return false; }
  }

  function defaultStore() {
    if (hasChromeStorage()) return chromeStore();
    try {
      if (typeof indexedDB !== "undefined" && indexedDB) return idbStore();
    } catch (e) {}
    return memoryStore();
  }

  // One-time drain of the pre-chrome.storage IndexedDB rows. The flag lives in the
  // LEGACY store, not in chrome.storage: the old DB is per-origin, so each ATS host
  // still holding rows has to drain its own exactly once. Best-effort and silent —
  // a failure just means those answers get re-learned.
  const DRAINED_KEY = "__drained";
  async function migrateLegacy(target, legacy) {
    try {
      if (!target || !legacy) return 0;
      if (await legacy.get(DRAINED_KEY)) return 0;
      const rows = (await legacy.all()) || [];
      let n = 0;
      for (const e of rows) {
        if (!e || !e.fieldKey || !e.contextHash || e.value == null || e.value === "") continue;
        const k = storeKey(e.profileId || "default", e.fieldKey, e.contextHash);
        const prev = await target.get(k);
        // The shared store already holds this answer from another host; keep the newer.
        if (prev && (Number(prev.updatedAt) || 0) >= (Number(e.updatedAt) || 0)) continue;
        await target.put(k, e);
        n++;
      }
      await legacy.put(DRAINED_KEY, { drained: true, at: Date.now() });
      return n;
    } catch (e) { return 0; }
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
    // The host-agnostic twin of keyOf — the same question asked by any other ATS.
    function globalKeyOf(item) {
      return storeKey(profileId, fieldKeyFor(item), globalContextHash(item.label || ""));
    }

    // Read one key, bumping hitCount so ranking has something to rank by. Bumping
    // is value-neutral, so a failed write here changes nothing the caller sees.
    async function readKey(k) {
      const e = await store.get(k);
      if (!e || e.value == null || e.value === "") return null;
      try { await store.put(k, Object.assign({}, e, { hitCount: (e.hitCount || 0) + 1 })); } catch (x) {}
      return e.value;
    }

    // Read: the learned value for this item plus WHERE it came from — "site" for an
    // answer learned on this host, "global" for one carried over from another ATS.
    // The host-scoped entry always wins, so a deliberate site-specific answer is
    // never overridden by the general one.
    async function lookup(item) {
      if (!item) return { value: null, scope: null };
      const onSite = await readKey(keyOf(item));
      if (onSite != null) return { value: onSite, scope: "site" };
      const anywhere = await readKey(globalKeyOf(item));
      if (anywhere != null) return { value: anywhere, scope: "global" };
      return { value: null, scope: null };
    }

    // Read: the learned value for this item, or null.
    async function get(item) {
      return (await lookup(item)).value;
    }

    // Write (last-write-wins): persist the user's chosen/corrected value, both under
    // this host and under the host-agnostic twin that makes it reusable on the next
    // ATS. Two rows rather than one shared row because they diverge the moment the
    // user gives a different answer here than they gave elsewhere.
    async function remember(item, value) {
      if (!item || value == null || value === "") return false;
      const fieldKey = fieldKeyFor(item);
      const label = item.label || "";
      const now = Date.now();
      const write = async (k, ctxHash) => {
        const prev = await store.get(k);
        await store.put(k, {
          profileId,
          fieldKey,
          contextHash: ctxHash,
          value: String(value),
          hitCount: prev ? (prev.hitCount || 0) : 0,
          updatedAt: now,
        });
      };
      await write(keyOf(item), contextHash(host, label));
      await write(globalKeyOf(item), globalContextHash(label));
      return true;
    }

    // Read path: override item values with learned answers before the overlay
    // shows them, so the cached choice is what the user reviews and fills.
    async function preferCached(items) {
      if (!Array.isArray(items)) return items;
      for (const item of items) {
        if (!item || item.kind === "info" || item.kind === "file") continue;
        const { value: cached, scope } = await lookup(item);
        if (cached == null || cached === "") continue;
        // Any hit means the user confirmed this field before — the overlay trusts
        // it (keeps the row checked) even when the DOM match was low-confidence.
        item.cached = true;
        // A "global" hit is this user's own answer to the same question on a
        // DIFFERENT ATS. Flagged so the overlay can say where it came from; still
        // reviewed and still never auto-submitted.
        if (scope === "global") item.cachedCrossSite = true;
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
      get, lookup, remember, preferCached, watch, setProfile, keyOf, globalKeyOf,
      committedValueOf, contextHash, fieldKeyFor, exportAll, importEntries, _store: store,
    };
  }

  const api = create();
  api.create = create;
  api.slug = slug;
  api.hash = hash;
  api.contextHash = contextHash;
  api.globalContextHash = globalContextHash;
  api.fieldKeyFor = fieldKeyFor;
  api.committedValueOf = committedValueOf;
  api.memoryStore = memoryStore;
  api.chromeStore = chromeStore;
  api.migrateLegacy = migrateLegacy;
  JAF.fieldCache = api;

  // Fire-and-forget: pull this origin's old IndexedDB answers into the shared store.
  if (hasChromeStorage()) {
    try {
      if (typeof indexedDB !== "undefined" && indexedDB) migrateLegacy(api._store, idbStore());
    } catch (e) {}
  }
})();
