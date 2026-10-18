// S7 — the extension client for SEPARATE enterprise accounts (docs/enterprise-v2/19 §2.5, §6).
//
// The extension is connected to ONE account at a time, personal or enterprise. Two accounts can
// share an email, so "the same account" is decided by the USER ID in the session the web hands
// over — never by email or login — and an account switch clears every account-bound cache first
// while leaving the device's own settings alone. This runs the REAL service worker, storage.js
// and tracking.js together against an in-memory chrome.storage, plus the pure account helpers
// and a few source-level pins (no workspace header, no synthetic login on screen).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const fails = [];
const tag = "[enterprise_accounts]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PROD_MATCHES = ["https://kiwiply.com/*", "https://www.kiwiply.com/*", "https://app.kiwiply.com/*"];

// A service worker booted against the real storage.js + tracking.js and a faithful in-memory
// chrome.storage.local (get by key / array / null, set, remove).
function boot(initial) {
  const store = Object.assign({}, initial || {});
  const external = [];
  const installed = [];
  const noop = { addListener() {} };
  const local = {
    get: (k, cb) => {
      let out;
      if (k == null) out = Object.assign({}, store);
      else { out = {}; for (const key of Array.isArray(k) ? k : [k]) if (key in store) out[key] = store[key]; }
      cb(JSON.parse(JSON.stringify(out)));
    },
    set: (o, cb) => { for (const k of Object.keys(o)) store[k] = JSON.parse(JSON.stringify(o[k])); cb && cb(); },
    remove: (k, cb) => { for (const key of Array.isArray(k) ? k : [k]) delete store[key]; cb && cb(); },
  };
  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches: PROD_MATCHES } }),
      onInstalled: { addListener: (fn) => installed.push(fn) },
      onStartup: noop,
      onMessage: noop,
      onMessageExternal: { addListener: (fn) => external.push(fn) },
      sendMessage: (m, cb) => { cb && cb(); },
    },
    storage: { local },
    webNavigation: { onCompleted: noop },
    tabs: { onRemoved: noop, sendMessage() {}, create() {} },
    alarms: { create() {}, onAlarm: noop },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: noop },
  };
  const sandbox = {
    chrome, console, setTimeout, clearTimeout, URL,
    crypto: globalThis.crypto, TextEncoder, btoa: globalThis.btoa,
    fetch: () => Promise.reject(new Error("no network in tests")),
    JAF: { analytics: { create: () => ({ track: () => Promise.resolve({ sent: false }) }) } },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["src/lib/storage.js", "src/lib/tracking.js", "src/lib/workspace.js", "src/background/service-worker.js"]) {
    vm.runInContext(read(f), sandbox, { filename: f });
  }
  return { store, external: external[0], installed, JAF: sandbox.JAF };
}

function connect(external, tokens) {
  return new Promise((resolve) => {
    let done = false;
    const ret = external({ type: "KIWIPLY_CONNECT", tokens }, { origin: "https://kiwiply.com" }, (r) => { done = true; resolve(r); });
    if (ret !== true && !done) resolve(null);
    else setTimeout(() => { if (!done) resolve(null); }, 100);
  });
}

// What a connected personal account (user 10) leaves on the device.
function personalDevice(over) {
  return Object.assign({
    trackingAuth: { access: "a0", refresh: "r0", kind: "PERSONAL", userId: 10, email: "sam@example.com", username: "sam" },
    learnedAnswersOwner: "uid:10",
    bio: { firstName: "Sam", email: "sam@example.com" },
    resumes: [{ id: "res_1", serverId: 7, label: "Backend" }],
    fieldCache: { k1: { value: "Yes, authorised to work" } },
    answerCache: { "why us": "Because" },
    pickCache: { "relocate::yes|no": "Yes" },
    trackingPending: { 12: { serverId: 99 } },
    "ws:5:assignedJobs": { ts: 1, items: [{ id: 7 }] },
    // the device itself
    fieldMapCache: { "first name": "firstName" },
    enrichCache: { "https://job": {} },
    gaClientId: "123.456",
    settings: {
      apiBaseUrl: "https://api.kiwiply.com", apiKey: "sk-byo", llmEnabled: true, autoAdvance: true, analyticsOptOut: true,
      plan: "PRO", __profileVersion: "v1", __lastPull: 1, lastResumeId: "res_1",
      account: { kind: "PERSONAL", orgId: null, name: null, consultant: false, marketer: false },
    },
  }, over || {});
}

const ACCOUNT_KEYS = ["bio", "resumes", "fieldCache", "answerCache", "pickCache", "trackingPending", "ws:5:assignedJobs"];
const noAccountData = (store) => ACCOUNT_KEYS.every((k) => !(k in store)) && ["plan", "__profileVersion", "__lastPull", "lastResumeId", "account"].every((k) => !(k in (store.settings || {})));
const deviceIntact = (store) =>
  store.settings && store.settings.apiKey === "sk-byo" && store.settings.autoAdvance === true && store.settings.llmEnabled === true &&
  store.settings.analyticsOptOut === true && store.settings.apiBaseUrl === "https://api.kiwiply.com" &&
  !!store.fieldMapCache && !!store.enrichCache && store.gaClientId === "123.456";

(async function run() {
  /* ================= the account chip + local read (pure) ================= */
  {
    const { JAF } = boot();
    const WS = JAF.workspace;
    eq("chip: personal", WS.accountChip({ kind: "PERSONAL", email: "sam@example.com" }), { kind: "PERSONAL", title: "Personal", subtitle: "sam@example.com" });
    eq("chip: enterprise reads '<Org> · Enterprise' with the email beneath", WS.accountChip({ kind: "ENTERPRISE", orgId: 5, orgName: "Acme", email: "sam@acme.com" }), { kind: "ENTERPRISE", title: "Acme · Enterprise", subtitle: "sam@acme.com" });
    eq("chip: a session from before accounts (no kind) is personal", WS.accountChip({ username: "sam" }).title, "Personal");
    eq("chip: an old personal session falls back to its login as a label", WS.accountChip({ username: "sam" }).subtitle, "sam");
    eq("chip: an enterprise account never falls back to a login", WS.accountChip({ kind: "ENTERPRISE", orgName: "Acme", username: "ent#5#sam" }).subtitle, "");
    eq("chip: a synthetic login is never shown, even on a personal-looking record", WS.accountChip({ username: "ent#5#sam" }).subtitle, "");
    eq("chip: an enterprise account with no org name still reads sensibly", WS.accountChip({ kind: "ENTERPRISE", email: "a@b.co" }).title, "Organization · Enterprise");
    ok("chip: no output ever contains ent#", !/ent#/i.test(JSON.stringify([
      WS.accountChip({ kind: "ENTERPRISE", orgName: "Acme", username: "ent#5#sam", email: "" }),
      WS.accountChip({ username: "ENT#9#x" }),
    ])));

    const cachedEnt = { kind: "ENTERPRISE", orgId: 5, name: "Acme", consultant: true, marketer: false };
    eq("local read: personal session -> personal, known", WS.accountFromLocal({ kind: "PERSONAL" }, cachedEnt), { account: WS.personalAccount(), known: true });
    eq("local read: enterprise session with its cached flags -> known", WS.accountFromLocal({ kind: "ENTERPRISE", orgId: 5 }, cachedEnt), { account: cachedEnt, known: true });
    eq("local read: enterprise session, cache for ANOTHER org -> unknown, flags off", WS.accountFromLocal({ kind: "ENTERPRISE", orgId: 6, orgName: "Beta" }, cachedEnt).known, false);
    eq("local read: enterprise session, no cache -> unknown, no roles assumed", WS.accountFromLocal({ kind: "ENTERPRISE", orgId: 5, orgName: "Acme" }, null),
      { account: { kind: "ENTERPRISE", orgId: 5, name: "Acme", consultant: false, marketer: false }, known: false });
    eq("local read: an old session (no kind) with no cache -> personal", WS.accountFromLocal({}, undefined), { account: WS.personalAccount(), known: true });
  }

  /* ================= switching A -> B clears every account-bound cache ================= */
  {
    // Personal account 10 -> enterprise account 11 that SHARES THE EMAIL.
    const { store, external } = boot(personalDevice());
    const r = await connect(external, { access: "a1", refresh: "r1", kind: "ENTERPRISE", orgId: 5, orgName: "Acme", email: "sam@example.com", userId: 11, username: "ent#5#sam" });
    ok("switch: connect accepted", r && r.ok === true, JSON.stringify(r));
    ok("switch: the previous account's data is gone (bio, resumes, answers, AI caches, ws:*, plan, account)", noAccountData(store), Object.keys(store).join(","));
    ok("switch: device settings and device caches are untouched", deviceIntact(store), JSON.stringify(store.settings));
    eq("switch: ONE session, replaced, carrying the new account", store.trackingAuth, { access: "a1", refresh: "r1", kind: "ENTERPRISE", userId: 11, email: "sam@example.com", orgId: 5, orgName: "Acme" });
    ok("switch: the synthetic login was never stored", !/ent#/.test(JSON.stringify(store)));
    eq("switch: learned answers now belong to the new user id", store.learnedAnswersOwner, "uid:11");
    ok("switch: exactly one session key exists", Object.keys(store).filter((k) => /auth|session|token/i.test(k)).join() === "trackingAuth");
  }
  {
    // Same email, different user id, both PERSONAL-shaped handoffs: ids still decide.
    const { store, external } = boot(personalDevice());
    await connect(external, { access: "a1", refresh: "r1", kind: "PERSONAL", userId: 99, email: "sam@example.com", username: "sam" });
    ok("same email, different user id: caches cleared", noAccountData(store));
    ok("same email, different user id: device settings kept", deviceIntact(store));
  }
  {
    // Enterprise -> personal (the other direction), same email again.
    const dev = personalDevice({
      trackingAuth: { access: "a0", refresh: "r0", kind: "ENTERPRISE", userId: 11, email: "sam@example.com", orgId: 5, orgName: "Acme" },
      learnedAnswersOwner: "uid:11",
    });
    dev.settings.account = { kind: "ENTERPRISE", orgId: 5, name: "Acme", consultant: true, marketer: false };
    const { store, external } = boot(dev);
    await connect(external, { access: "a1", refresh: "r1", kind: "PERSONAL", userId: 10, email: "sam@example.com", username: "sam" });
    ok("enterprise -> personal: caches cleared", noAccountData(store));
    eq("enterprise -> personal: the session is personal now and has no org", [store.trackingAuth.kind, store.trackingAuth.orgId, store.trackingAuth.orgName, store.trackingAuth.userId], ["PERSONAL", undefined, undefined, 10]);
  }
  {
    // Two organizations: same person, two enterprise accounts (user ids 11 and 12).
    const dev = personalDevice({ trackingAuth: { access: "a0", refresh: "r0", kind: "ENTERPRISE", userId: 11, email: "sam@x.com", orgId: 5, orgName: "Acme" }, learnedAnswersOwner: "uid:11" });
    const { store, external } = boot(dev);
    await connect(external, { access: "a1", refresh: "r1", kind: "ENTERPRISE", orgId: 6, orgName: "Beta", email: "sam@x.com", userId: 12 });
    ok("org A -> org B: caches cleared (incl. ws:5:*)", noAccountData(store));
    eq("org A -> org B: now Beta", [store.trackingAuth.orgId, store.trackingAuth.orgName], [6, "Beta"]);
  }
  {
    // Reconnecting the SAME user id keeps everything (a token refresh by another route, an updated email).
    const { store, external } = boot(personalDevice());
    await connect(external, { access: "a2", refresh: "r2", kind: "PERSONAL", userId: 10, email: "sam.new@example.com", username: "someone-else" });
    ok("same user id: nothing is cleared, even though email and login differ", !noAccountData(store) && !!store.bio && !!store.fieldCache && !!store["ws:5:assignedJobs"]);
    eq("same user id: the session is refreshed with the new email", [store.trackingAuth.access, store.trackingAuth.email], ["a2", "sam.new@example.com"]);
  }
  {
    // A web sign-out keeps learned answers + their owner marker; the next user id decides.
    const base = personalDevice(); delete base.trackingAuth;
    let { store, external } = boot(base);
    await connect(external, { access: "a1", refresh: "r1", kind: "PERSONAL", userId: 10, email: "sam@example.com" });
    ok("after web sign-out, same user id back: learned answers survive", !!store.fieldCache && !!store.bio);
    ({ store, external } = boot(base));
    await connect(external, { access: "a1", refresh: "r1", kind: "ENTERPRISE", orgId: 5, orgName: "Acme", email: "sam@example.com", userId: 11 });
    ok("after web sign-out, a different user id with the SAME email: everything incl. learned answers is wiped", noAccountData(store) && deviceIntact(store));
  }
  {
    // Sessions from before user ids existed: usernames bridge the upgrade, once.
    const legacy = () => personalDevice({ trackingAuth: { access: "a0", refresh: "r0", username: "sam" }, learnedAnswersOwner: "sam" });
    let { store, external } = boot(legacy());
    await connect(external, { access: "a1", refresh: "r1", kind: "PERSONAL", userId: 10, email: "sam@example.com", username: "sam" });
    ok("legacy session, same login, now with an id: nothing cleared", !noAccountData(store));
    eq("legacy session: the owner marker is upgraded to the user id", store.learnedAnswersOwner, "uid:10");
    ({ store, external } = boot(legacy()));
    await connect(external, { access: "a1", refresh: "r1", kind: "PERSONAL", userId: 77, email: "bob@example.com", username: "bob" });
    ok("legacy session, a different login: cleared", noAccountData(store));
    ({ store, external } = boot(legacy()));
    await connect(external, { access: "a1", refresh: "r1", kind: "ENTERPRISE", orgId: 5, orgName: "Acme", email: "sam@example.com", userId: 11 });
    ok("legacy personal session -> enterprise handoff (no login to compare): the kind change proves a switch, cleared", noAccountData(store));
    // An unknown side proves nothing: a handoff with neither id nor login must not wipe on a guess.
    ({ store, external } = boot(legacy()));
    await connect(external, { access: "a1", refresh: "r1" });
    ok("an anonymous handoff does not prove a switch: nothing cleared", !noAccountData(store));
  }

  /* ================= what a handoff must carry ================= */
  {
    const { store, external } = boot(personalDevice());
    const before = JSON.stringify(store);
    for (const [name, t] of [
      ["no org id", { access: "a", refresh: "r", kind: "ENTERPRISE", orgName: "Acme", userId: 11 }],
      ["no user id", { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: 5, orgName: "Acme" }],
      ["bad org id", { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: "../x", userId: 11 }],
      ["org id 0", { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: 0, userId: 11 }],
    ]) {
      const r = await connect(external, t);
      ok(`enterprise handoff with ${name}: refused, nothing touched`, r && r.ok === false && r.reason === "invalid-account" && JSON.stringify(store) === before, JSON.stringify(r));
    }
    const r2 = await connect(external, { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: 5, userId: 11 });
    ok("a missing org name still connects (shown as 'Organization')", r2 && r2.ok === true && store.trackingAuth.orgName === "Organization", JSON.stringify(store.trackingAuth));
  }
  {
    // Hostile / odd values never reach storage.
    const { store, external } = boot({});
    await connect(external, { access: "a", refresh: "r", kind: "PERSONAL", userId: "12abc", email: 42, orgId: 5, orgName: "x".repeat(1000), username: "ent#5#sam" });
    eq("junk id / non-string email dropped, org fields never stored on a personal session, synthetic login dropped", store.trackingAuth, { access: "a", refresh: "r", kind: "PERSONAL" });
    const b = boot({});
    await connect(b.external, { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: 5, userId: 3, orgName: "y".repeat(1000), email: "e".repeat(500) });
    ok("over-long org name is capped and over-long email dropped", b.store.trackingAuth.orgName.length === 200 && !("email" in b.store.trackingAuth), JSON.stringify(b.store.trackingAuth).slice(0, 120));
    const c = boot({});
    await connect(c.external, { access: "a", refresh: "r", kind: "TENANT_ADMIN", userId: 3 });
    ok("an unknown kind is not stored", !("kind" in c.store.trackingAuth));
  }

  /* ================= upgrade: the old workspace keys go away ================= */
  {
    const { store, installed } = boot({ settings: { apiKey: "sk-byo", workspace: 42, workspaces: [{ orgId: 42, name: "Acme", consultant: true, marketer: false }], autoAdvance: true } });
    for (const fn of installed) fn({ reason: "update" });
    await new Promise((res) => setTimeout(res, 30));
    ok("onInstalled(update) deletes the old `workspace` and `workspaces` settings", !("workspace" in store.settings) && !("workspaces" in store.settings), JSON.stringify(store.settings));
    ok("onInstalled(update) leaves the rest of the settings alone", store.settings.apiKey === "sk-byo" && store.settings.autoAdvance === true);
    const b = boot({ settings: { workspace: "personal", plan: "PRO" } });
    await b.JAF.storage.clearAccountData();
    ok("clearAccountData also removes the legacy keys if they are still there", !("workspace" in b.store.settings) && !("plan" in b.store.settings));
    const c = boot({});
    eq("migrateLegacyKeys with no settings is a no-op", await c.JAF.storage.migrateLegacyKeys(), false);
  }

  /* ================= source-level pins ================= */
  {
    for (const f of ["src/lib/tracking.js", "src/background/service-worker.js", "src/lib/sync.js", "entrypoints/panel/home-actions.ts", "entrypoints/panel/workspace-actions.ts", "entrypoints/panel/HomeView.tsx", "entrypoints/background.ts"]) {
      ok(`${f}: no X-Kiwiply-Workspace header is ever sent`, !/x-kiwiply-workspace/i.test(code(read(f))));
    }
    const opts = code(read("entrypoints/options/OptionsApp.tsx")) + code(read("entrypoints/options/actions.ts"));
    ok("options page renders the account from accountChip, never the login", /accountChip/.test(opts) && !/\.username|\.who\b|account\.login/.test(opts));
    ok("options page shows kind + organization (title/subtitle)", /account\.title/.test(opts) && /account\.subtitle/.test(opts));
    const hv = code(read("entrypoints/panel/HomeView.tsx")) + code(read("entrypoints/panel/home-actions.ts"));
    ok("drawer chip uses title/subtitle, never the login", /account\.title/.test(hv) && /account\.subtitle/.test(hv) && !/\.username|\.who\b/.test(hv));
    ok("drawer: Switch account opens the web connect flow", /Switch account/.test(read("entrypoints/panel/HomeView.tsx")) && /WEB \+ "\/connect"/.test(hv));
    const manifest = read("wxt.config.ts");
    const ec = /externally_connectable:[\s\S]*?\n {6}\},/.exec(manifest)[0];
    // X12.9 added ONE entry, the tenant-host wildcard, for "Prepare selected openings" only: the connect
    // gate in the service worker ignores wildcard entries (connect_handoff.test.js). Custom tenant domains
    // still cannot be listed.
    eq("manifest: externally_connectable lists the three exact origins + the tenant wildcard (prepare batch only)", ec.match(/"https?:\/\/[^"]+"/g), ['"https://kiwiply.com/*"', '"https://www.kiwiply.com/*"', '"https://app.kiwiply.com/*"', '"https://*.kiwiply.com/*"']);
    // The version ritual: both places carry the same value.
    const wxtV = /version:\s*"([^"]+)"/.exec(manifest)[1];
    const pkgV = JSON.parse(read("package.json")).version;
    ok("version ritual: wxt.config.ts and package.json agree", wxtV === pkgV, `${wxtV} vs ${pkgV}`);
  }

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
