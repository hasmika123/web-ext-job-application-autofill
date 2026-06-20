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

  // file helpers — store/retrieve the original resume bytes keyed by resume id
  const saveResumeFile = (id, blob) => idbPut(id, blob);
  const getResumeFile = (id) => idbGet(id);

  async function getSettings() {
    const defaults = { llmEnabled: false, apiKey: "", includeEEO: false, lastResumeId: "", autoAdvance: false, autoAddRows: true, rulesUrl: "" };
    return Object.assign(defaults, (await get(KEYS.settings)) || {});
  }
  const saveSettings = (s) => set({ [KEYS.settings]: s });

  async function estimateUsage() {
    return new Promise((res) => {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((e) => res(e)).catch(() => res(null));
      } else res(null);
    });
  }

  JAF.storage = {
    getBio, saveBio, getResumes, getResume, saveResume, deleteResume,
    saveResumeFile, getResumeFile, getSettings, saveSettings, estimateUsage,
  };
})();
