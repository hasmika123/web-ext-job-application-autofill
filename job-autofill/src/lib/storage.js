/* storage.js — persistence layer.
 *  - chrome.storage.local : bio profile, resume metadata, settings (small JSON)
 *  - IndexedDB            : original resume file bytes (can be large, 50 files)
 * Attaches to window.JAF.storage. Used by popup, options, and the worker.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});
  const KEYS = { bio: "bio", resumes: "resumes", settings: "settings" };
  const DB_NAME = "dossier";
  const STORE = "files";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(key, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbDel(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Empty the resume-file store. Only resume bytes (and the short-lived upload handoff) live
  // there, so on sign-out the whole store goes rather than walking resume ids that may already
  // be out of sync with it.
  async function idbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  const get = (k) => new Promise((res) => chrome.storage.local.get(k, (o) => res(o[k])));
  const set = (obj) => new Promise((res) => chrome.storage.local.set(obj, () => res(true)));

  async function getBio() {
    const b = await get(KEYS.bio);
    return b || (JAF.schema ? JAF.schema.emptyBio() : {});
  }
  const saveBio = (bio) => set({ [KEYS.bio]: bio });

  async function getResumes() {
    return (await get(KEYS.resumes)) || [];
  }
  async function saveResume(resume) {
    const list = await getResumes();
    const i = list.findIndex((r) => r.id === resume.id);
    resume.updatedAt = Date.now();
    if (i >= 0) list[i] = resume;
    else list.push(resume);
    await set({ [KEYS.resumes]: list });
    return resume;
  }
  async function deleteResume(id) {
    const list = (await getResumes()).filter((r) => r.id !== id);
    await set({ [KEYS.resumes]: list });
    await idbDel(id).catch(() => {});
    return true;
  }
  async function getResume(id) {
    return (await getResumes()).find((r) => r.id === id) || null;
  }

  // file helpers — store/retrieve/remove the original resume bytes keyed by resume id
  // (also used with a temp key for the popup → review-page upload handoff in Phase 3b).
  const saveResumeFile = (id, blob) => idbPut(id, blob);
  const getResumeFile = (id) => idbGet(id);
  const deleteResumeFile = (id) => idbDel(id);

  async function getSettings() {
    const defaults = { llmEnabled: false, apiKey: "", jobAiEnabled: false, lastResumeId: "", autoAdvance: false, autoAddRows: true, apiBaseUrl: "https://api.kiwiply.com" };
    return Object.assign(defaults, (await get(KEYS.settings)) || {});
  }
  const saveSettings = (s) => set({ [KEYS.settings]: s });

  // Everything on this device that belongs to the signed-in ACCOUNT rather than to the device.
  // Owners, so a new key gets added here when it is added there:
  //   bio, resumes          this module (the pulled mirror)
  //   fieldCache            field-cache.js — answers learned while applying (salary, visa, …)
  //   answerCache, pickCache  service-worker.js — AI drafts and screening picks
  //   trackingPending       service-worker.js — application ids awaiting submit detection; left
  //                         behind, they would be attributed to whoever connects next
  // Deliberately NOT here: trackingAuth (the caller clears the session), and device settings —
  // the BYO API key, auto-advance, theme, fieldMapCache/enrichCache (label and job-page caches,
  // nothing personal), and the analytics client id.
  const ACCOUNT_KEYS = ["bio", "resumes", "fieldCache", "answerCache", "pickCache", "trackingPending"];
  // Settings that describe WHOSE mirror this is, rather than how the device behaves.
  const ACCOUNT_SETTINGS = ["plan", "__profileVersion", "__lastPull", "lastResumeId"];

  // Sign-out means this browser forgets the account. Before this, sign-out dropped only the
  // tokens: the drawer kept the previous user's profile and resumes (and would autofill with
  // them), and on a shared computer the next person inherited all of it. Found in the
  // pre-launch review, 2026-09-22. The server copy is untouched — reconnecting pulls it back.
  async function clearAccountData() {
    await new Promise((res) => chrome.storage.local.remove(ACCOUNT_KEYS, () => res(true)));
    try { await idbClear(); } catch (e) { /* no IndexedDB in this context — nothing stored there */ }
    const s = (await get(KEYS.settings)) || {};
    for (const k of ACCOUNT_SETTINGS) delete s[k];
    await set({ [KEYS.settings]: s });
    return true;
  }

  async function estimateUsage() {
    return new Promise((res) => {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((e) => res(e)).catch(() => res(null));
      } else res(null);
    });
  }

  JAF.storage = {
    getBio, saveBio, getResumes, getResume, saveResume, deleteResume,
    saveResumeFile, getResumeFile, deleteResumeFile, getSettings, saveSettings, estimateUsage,
    clearAccountData, ACCOUNT_KEYS, ACCOUNT_SETTINGS,
  };
})();
