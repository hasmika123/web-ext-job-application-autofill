// Tests for the sync layer (Task 1.7): pull-on-login + push-on-change against a
// fake TrackingProvider, using the REAL local store (chrome.storage stubbed).
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function freshStore() {
  const w = makeWindow();
  load(w, "src/config/rules.js");
  load(w, "src/lib/rules-store.js");
  load(w, "src/lib/schema.js");
  load(w, "src/lib/storage.js");
  load(w, "src/lib/tracking.js");
  load(w, "src/lib/sync.js");
  return w;
}

// A fake provider that records pushes and returns scripted pulls.
function fakeProvider(cfg) {
  cfg = cfg || {};
  const rec = { pushedBio: undefined, pushedResumes: [] };
  let next = cfg.firstServerId || 100;
  return {
    rec,
    pullProfile: async () => (cfg.bio !== undefined ? cfg.bio : null),
    listResumes: async () => cfg.resumes || [],
    pushProfile: async (bio) => { rec.pushedBio = bio; return bio; },
    pushResume: async (r) => {
      rec.pushedResumes.push(r);
      return Object.assign({}, r, { serverId: r.serverId != null ? r.serverId : next++ });
    },
  };
}

(async function run() {
  /* ---- pull-on-login writes server data into the local cache ---- */
  {
    const w = freshStore();
    const S = w.JAF.storage, sync = w.JAF.sync;
    const provider = fakeProvider({ bio: { firstName: "Ada", email: "a@x.com" }, resumes: [{ serverId: 1, label: "Backend", skills: ["go"], status: "CONFIRMED" }] });
    const summary = await sync.pullAll(provider, S);
    const bio = await S.getBio();
    ok("pull: bio written to local store", bio.firstName === "Ada" && bio.email === "a@x.com");
    const resumes = await S.getResumes();
    ok("pull: resume written to local store", resumes.length === 1 && resumes[0].label === "Backend");
    ok("pull: resume keeps server id + content", resumes[0].serverId === 1 && Array.isArray(resumes[0].skills) && resumes[0].skills[0] === "go");
    ok("pull: new resume got a local id", typeof resumes[0].id === "string" && resumes[0].id.startsWith("res_"));
    ok("pull: summary counts", summary.bio && summary.resumeCount === 1);
  }

  /* ---- pull merges onto the existing local twin (keeps local id) ---- */
  {
    const w = freshStore();
    const S = w.JAF.storage, sync = w.JAF.sync, SCH = w.JAF.schema;
    const localR = Object.assign(SCH.emptyResume(), { id: "res_keepme", serverId: 7, label: "Old label", hasFile: true });
    await S.saveResume(localR);
    const provider = fakeProvider({ resumes: [{ serverId: 7, label: "New label", summary: "updated" }] });
    await sync.pullAll(provider, S);
    const resumes = await S.getResumes();
    ok("merge: single resume (no duplicate)", resumes.length === 1);
    ok("merge: preserved local id", resumes[0].id === "res_keepme");
    ok("merge: took server label", resumes[0].label === "New label");
    ok("merge: kept local-only field (hasFile)", resumes[0].hasFile === true);
  }

  /* ---- push bio on change ---- */
  {
    const w = freshStore();
    const S = w.JAF.storage, sync = w.JAF.sync;
    await S.saveBio({ firstName: "Grace", city: "Atlanta" });
    const provider = fakeProvider();
    await sync.pushBio(provider, S);
    ok("pushBio: sends the local bio", provider.rec.pushedBio && provider.rec.pushedBio.firstName === "Grace");
  }

  /* ---- push resume records the server id back locally ---- */
  {
    const w = freshStore();
    const S = w.JAF.storage, sync = w.JAF.sync, SCH = w.JAF.schema;
    const r = Object.assign(SCH.emptyResume(), { id: "res_new", label: "Fresh" });
    await S.saveResume(r);
    const provider = fakeProvider({ firstServerId: 55 });
    const saved = await sync.pushResume(provider, S, r);
    ok("pushResume: provider returned a serverId", saved.serverId === 55);
    const stored = (await S.getResumes()).find((x) => x.id === "res_new");
    ok("pushResume: serverId persisted on the local resume", stored.serverId === 55);
  }

  /* ---- pushAll pushes bio + every resume ---- */
  {
    const w = freshStore();
    const S = w.JAF.storage, sync = w.JAF.sync, SCH = w.JAF.schema;
    await S.saveBio({ firstName: "Ada" });
    await S.saveResume(Object.assign(SCH.emptyResume(), { id: "r1", label: "A" }));
    await S.saveResume(Object.assign(SCH.emptyResume(), { id: "r2", label: "B" }));
    const provider = fakeProvider();
    const res = await sync.pushAll(provider, S);
    ok("pushAll: bio pushed", provider.rec.pushedBio && provider.rec.pushedBio.firstName === "Ada");
    ok("pushAll: both resumes pushed", provider.rec.pushedResumes.length === 2 && res.resumeCount === 2);
  }

  /* ---- providerFromSettings wires the endpoint ---- */
  {
    const w = freshStore();
    const sync = w.JAF.sync, T = w.JAF.tracking;
    const p = sync.providerFromSettings({ apiBaseUrl: "https://api.test/" }, T.memoryTokenStore());
    ok("providerFromSettings: baseUrl wired", p.getBaseUrl() === "https://api.test");
  }

  /* ---- field-cache sync: export local -> provider -> import merged ---- */
  {
    const w = freshStore();
    const sync = w.JAF.sync;
    const cache = {
      exported: [{ fieldKey: "country", contextHash: "c", value: "US", hitCount: 2, updatedAt: 1 }],
      imported: null,
      exportAll: async function () { return this.exported; },
      importEntries: async function (entries) { this.imported = entries; return entries.length; },
    };
    const provider = Object.assign(fakeProvider(), {
      syncFieldCache: async (entries) => entries.concat([{ fieldKey: "gender", contextHash: "g", value: "F", hitCount: 5, updatedAt: 9 }]),
    });
    const r = await sync.syncFieldCache(provider, cache);
    ok("field-cache: exported local entries pushed + merged set imported", r.count === 2 && cache.imported.length === 2);
    ok("field-cache: merged set includes the server-only entry", cache.imported.some((e) => e.fieldKey === "gender"));

    // syncNow with a cache also runs the field-cache sync
    const S = w.JAF.storage;
    cache.imported = null;
    const out = await sync.syncNow(provider, S, cache);
    ok("syncNow: field cache synced when a cache is passed", out.fieldCache && out.fieldCache.count === 2 && cache.imported !== null);

    // syncNow without a cache leaves field cache untouched (back-compat)
    const out2 = await sync.syncNow(provider, S);
    ok("syncNow: no cache -> no field-cache result", out2.fieldCache === undefined);

    // a provider that can't sync field cache is a graceful no-op
    const noFC = await sync.syncFieldCache(fakeProvider(), cache);
    ok("field-cache: provider without syncFieldCache is a no-op", noFC.count === 0);
  }

  console.log(`\n[sync] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[sync] All green.");
})();
