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
    return t.createKiwiplyProvider({
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

  // PULL: server -> local cache. Profile (one bio) + resumes (matched by serverId). A resume
  // that has a serverId but is no longer on the server was deleted on the web, so it is removed
  // here too — before this, it lingered in the drawer's picker until the extension was
  // reinstalled (found in the pre-launch review, 2026-09-22). Local-only resumes (no serverId
  // yet: an on-the-fly upload still waiting to push) are never touched. Returns a small summary.
  async function pullAll(provider, storage) {
    storage = storage || JAF.storage;
    const out = { bio: null, resumeCount: 0 };

    const bio = await provider.pullProfile();
    if (bio) {
      await storage.saveBio(bio);
      out.bio = bio;
    }

    const serverResumes = await provider.listResumes();
    // Only a real array is an answer. listResumes throws on failure, so an empty array means the
    // account genuinely has no resumes — and pruning then is correct, not a hazard.
    if (Array.isArray(serverResumes)) {
      const local = await storage.getResumes();
      const byServerId = {};
      local.forEach((r) => { if (r.serverId != null) byServerId[r.serverId] = r; });
      const onServer = new Set();
      for (const sr of serverResumes) {
        const existing = sr.serverId != null ? byServerId[sr.serverId] : null;
        await storage.saveResume(mergeResume(existing, sr));
        if (sr.serverId != null) onServer.add(String(sr.serverId));
        out.resumeCount++;
      }
      const gone = local.filter((r) => r.serverId != null && !onServer.has(String(r.serverId)));
      for (const r of gone) await storage.deleteResume(r.id); // also drops its stored file
      out.pruned = gone.length;
      if (gone.length) {
        // Don't leave the picker preselecting a resume that no longer exists.
        const s = await storage.getSettings();
        if (gone.some((r) => r.id === s.lastResumeId)) {
          s.lastResumeId = "";
          await storage.saveSettings(s);
        }
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

  // Phase 11.3 — the cheap check the alarm, the window-focus handler and the drawer all run.
  // GET the server's profile fingerprint (11.2), compare it with the one we last pulled under,
  // and pull ONLY on a mismatch or a first run. This replaces the drawer's old 90 s time
  // throttle: the throttle guessed at staleness, this asks.
  //
  // A failed check means NO pull and the stored version is left alone — being offline must
  // neither thrash the mirror nor destroy the marker that records what we already hold. A
  // server that answers without a version (older API, odd proxy) is treated as "unknown", so
  // we pull: having the data is the safe side of that trade.
  //
  // Pure data layer, like everything else here — the caller decides whether to tell anyone a
  // pull happened (the SW broadcasts KIWIPLY_MIRROR_UPDATED; the drawer just repaints).
  // Returns { pulled, version, reason }.
  async function checkAndPull(provider, storage, settings) {
    storage = storage || JAF.storage;
    if (!settings) settings = await storage.getSettings();

    let version = null;
    let plan = null;
    try {
      const answer = typeof provider.profileVersion === "function" ? await provider.profileVersion() : null;
      // Tolerates the pre-12.3 shape (a bare version string) as well as { version, plan }.
      if (typeof answer === "string") version = answer;
      else if (answer) { version = answer.version || null; plan = answer.plan || null; }
    } catch (e) {
      return { pulled: false, version: null, plan: null, reason: "check-failed" };
    }

    const known = settings.__profileVersion;
    if (version && known && version === known) {
      // Unchanged profile, but the PLAN can still have moved (an upgrade changes no bio or
      // resume), so it is recorded on every answered check rather than only alongside a pull.
      await storePlan(storage, plan);
      return { pulled: false, version, plan, reason: "unchanged" };
    }

    // Throws on a failed pull, deliberately: the version is only stamped below, so a caller
    // that swallows the error still re-checks next time instead of believing it is current.
    await pullAll(provider, storage);
    const s = await storage.getSettings();
    s.__profileVersion = version || null;
    s.__lastPull = Date.now();
    if (plan) s.plan = plan;
    await storage.saveSettings(s);
    return { pulled: true, version, plan, reason: known ? "changed" : "first-run" };
  }

  // Record the plan (12.3) without disturbing anything else. Display only — every gated call is
  // still refused server-side, so a stale value here costs a wrong badge, never wrong access.
  // A null plan (older server, or a field the response omitted) leaves the last known one alone.
  async function storePlan(storage, plan) {
    if (!plan) return;
    const s = await storage.getSettings();
    if (s.plan === plan) return;
    s.plan = plan;
    await storage.saveSettings(s);
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

  JAF.sync = { providerFromSettings, pullAll, pushBio, pushResume, pushAll, syncNow, syncFieldCache, mergeResume, checkAndPull };
})();
