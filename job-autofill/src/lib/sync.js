/* sync.js — bridges the local store and the backend via JAF.tracking. JAF.sync
 *
 * Model (ROADMAP): the server is the source of truth; the local store is an
 * offline cache / write buffer. On login we PULL profile + resumes into the local
 * store; on local change we PUSH up. All network goes through a TrackingProvider
 * (see tracking.js) — this module never calls fetch() itself.
 *
 * Pure data layer (no DOM). Attaches to globalThis.JAF so popup/options/SW can use it.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  // Build a provider configured from saved settings (endpoint) + a token store.
  function providerFromSettings(settings, tokenStore) {
    const t = JAF.tracking;
    return t.createDossierProvider({
      baseUrl: (settings && settings.apiBaseUrl) || "",
      tokenStore: tokenStore || t.chromeTokenStore(),
    });
  }

  // Merge a server resume onto its local twin (matched by serverId), preserving
  // the local id and any local-only fields (e.g. IndexedDB file linkage).
  function mergeResume(existing, server) {
    const base = existing || (JAF.schema ? JAF.schema.emptyResume() : { id: "res_" + Math.random().toString(36).slice(2, 10) });
    const merged = Object.assign({}, base, server);
    merged.id = base.id; // never let the server overwrite the local id
    merged.serverId = server.serverId;
    return merged;
  }

  // PULL: server -> local cache. Profile (one bio) + resumes (matched by serverId,
  // never deleting local-only resumes). Returns a small summary.
  async function pullAll(provider, storage) {
    storage = storage || JAF.storage;
    const out = { bio: null, resumeCount: 0 };

    const bio = await provider.pullProfile();
    if (bio) {
      await storage.saveBio(bio);
      out.bio = bio;
    }

    const serverResumes = await provider.listResumes();
    if (Array.isArray(serverResumes) && serverResumes.length) {
      const local = await storage.getResumes();
      const byServerId = {};
      local.forEach((r) => { if (r.serverId != null) byServerId[r.serverId] = r; });
      for (const sr of serverResumes) {
        const existing = sr.serverId != null ? byServerId[sr.serverId] : null;
        await storage.saveResume(mergeResume(existing, sr));
        out.resumeCount++;
      }
    }
    return out;
  }

  // PUSH: local bio -> server.
  async function pushBio(provider, storage) {
    storage = storage || JAF.storage;
    const bio = await storage.getBio();
    return provider.pushProfile(bio);
  }

  // PUSH one resume; record the server id back onto the local resume so future
  // pushes update (PUT) instead of duplicating (POST).
  async function pushResume(provider, storage, resume) {
    storage = storage || JAF.storage;
    const saved = await provider.pushResume(resume);
    if (saved && saved.serverId != null && saved.serverId !== resume.serverId) {
      await storage.saveResume(Object.assign({}, resume, { serverId: saved.serverId }));
    }
    return saved;
  }

  // PUSH everything currently in the local store.
  async function pushAll(provider, storage) {
    storage = storage || JAF.storage;
    await pushBio(provider, storage);
    const resumes = await storage.getResumes();
    for (const r of resumes) await pushResume(provider, storage, r);
    return { resumeCount: resumes.length };
  }

  // Field cache (Phase 4): push the local learned answers up, then merge the
  // server's authoritative set back into the local store. Needs a JAF.fieldCache
  // instance (the cache lives in IndexedDB, not chrome.storage). Best-effort.
  async function syncFieldCache(provider, cache) {
    if (!cache || typeof cache.exportAll !== "function" || typeof provider.syncFieldCache !== "function") {
      return { count: 0 };
    }
    const local = await cache.exportAll();
    const merged = await provider.syncFieldCache(local);
    const count = await cache.importEntries(merged);
    return { count };
  }

  // Convenience for "Sync now": push local changes up, then pull authoritative
  // server state back down. Pass a field-cache instance to also sync learned answers.
  async function syncNow(provider, storage, cache) {
    storage = storage || JAF.storage;
    await pushAll(provider, storage);
    const out = await pullAll(provider, storage);
    if (cache) {
      try { out.fieldCache = await syncFieldCache(provider, cache); } catch (e) { /* best-effort, offline-friendly */ }
    }
    return out;
  }

  JAF.sync = { providerFromSettings, pullAll, pushBio, pushResume, pushAll, syncNow, syncFieldCache, mergeResume };
})();
