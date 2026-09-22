// Tests for the web → extension change signal (Phase 11.1).
//
// The web app sends { type: "KIWIPLY_SYNC", event: "changed" | "signedOut" } over the same
// origin-gated channel as the connect handoff — Chrome's onMessageExternal directly, or on
// Firefox the connect-relay content script forwarding it as an internal onMessage with a
// `sender.tab`. Both paths must:
//   - apply the SAME origin gate (an ATS content script or a foreign page must be ignored),
//   - "changed"   → pull the mirror once, stamp __lastPull, tell open drawers to repaint,
//   - "changed" while not connected → no pull, honest "not-connected",
//   - "signedOut" → best-effort server revoke, then ALWAYS clear the local session,
//   - an unknown event → refused, nothing touched.
//
// Same technique as connect_handoff.test.js: boot service-worker.js against a mock `chrome`,
// capture the listeners it registers, and drive them directly.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

const PROD_MATCHES = ["https://kiwiply.com/*", "https://www.kiwiply.com/*", "https://app.kiwiply.com/*"];

function boot(opts) {
  opts = opts || {};
  const store = {};                 // chrome.storage.local
  const calls = { pullAll: 0, logout: 0, clear: 0, broadcast: [], checkAndPull: 0, alarmsCreated: [], versionCalls: 0, forgot: 0 };
  const external = [];
  const internal = [];
  const installed = [];             // 11.3: onInstalled listeners (the alarm is created here)
  const startup = [];
  const alarmListeners = [];
  const focusListeners = [];
  const noop = { addListener() {} };

  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches: PROD_MATCHES } }),
      onInstalled: { addListener: (fn) => installed.push(fn) },
      onStartup: { addListener: (fn) => startup.push(fn) },
      onMessage: { addListener: (fn) => internal.push(fn) },
      onMessageExternal: { addListener: (fn) => external.push(fn) },
      // The SW broadcasts "mirror updated" to any open drawer; with no drawer there is no
      // receiver, and Chrome reports that through lastError — which the SW must read, not throw.
      sendMessage: (msg, cb) => { calls.broadcast.push(msg); chrome.runtime.lastError = { message: "no receiver" }; cb && cb(); chrome.runtime.lastError = undefined; },
    },
    storage: {
      local: {
        get: (k, cb) => cb({ [k]: store[k] }),
        set: (o, cb) => { Object.assign(store, o); cb && cb(); },
      },
    },
    webNavigation: { onCompleted: noop },
    tabs: { onRemoved: noop, sendMessage() {}, create() {} },
    // 11.3 — the scheduled + focus-driven checks.
    alarms: {
      create: (name, cfg) => calls.alarmsCreated.push({ name, cfg }),
      onAlarm: { addListener: (fn) => alarmListeners.push(fn) },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: (fn) => focusListeners.push(fn) },
    },
  };

  const provider = {
    isAuthenticated: () => Promise.resolve(opts.connected !== false),
    logout: () => { calls.logout++; return opts.logoutFails ? Promise.reject(new Error("offline")) : Promise.resolve(); },
    profileVersion: () => { calls.versionCalls++; return Promise.resolve(opts.version === undefined ? "v-new" : opts.version); },
  };

  const sandbox = {
    chrome, console, setTimeout, clearTimeout, URL,
    fetch: () => Promise.reject(new Error("no network in tests")),
    JAF: {
      // clearAccountData is the real one in storage.js, covered by account_clear.test.js; here
      // we only need to know the SW calls it, and when.
      storage: { tag: "storage-stub", clearAccountData: () => { calls.forgot++; return Promise.resolve(true); } },
      sync: {
        providerFromSettings: () => provider,
        pullAll: (p, storage) => { calls.pullAll++; calls.pullStorage = storage; return Promise.resolve({ bio: {}, resumeCount: 1 }); },
        // The real one lives in sync.js and is covered by sync.test.js; here we only need to
        // know the SW calls it and reacts to "pulled".
        checkAndPull: () => { calls.checkAndPull++; return Promise.resolve({ pulled: opts.pulled !== false, reason: "changed" }); },
      },
      tracking: {
        chromeTokenStore: () => ({
          get: () => Promise.resolve(opts.prevAuth || {}),
          set: () => Promise.resolve(true),
          clear: () => { calls.clear++; return Promise.resolve(); },
        }),
      },
      analytics: { create: () => ({ track: () => Promise.resolve({ sent: false }) }) },
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/background/service-worker.js"), "utf8"), sandbox);
  return { external: external[0], internal, calls, store, installed, startup, alarmListeners, focusListeners, chrome };
}

// Drive the Chrome (external) listener; resolves with the response, or null if ignored.
function sendExternal(listener, origin, msg) {
  return new Promise((resolve) => {
    let responded = false;
    const ret = listener(msg, { origin }, (resp) => { responded = true; resolve(resp); });
    if (ret !== true && !responded) resolve(null);
    else if (ret === true) setTimeout(() => { if (!responded) resolve(null); }, 50);
  });
}

// Drive every internal listener the way the Firefox relay path arrives (sender has a tab).
function sendRelayed(internal, sender, msg) {
  return new Promise((resolve) => {
    let settled = false, async = false;
    const respond = (r) => { if (!settled) { settled = true; resolve(r); } };
    for (const fn of internal) if (fn(msg, sender, respond) === true) async = true;
    if (!async) respond(null); else setTimeout(() => respond(null), 50);
  });
}

const changed = { type: "KIWIPLY_SYNC", event: "changed" };
const signedOut = { type: "KIWIPLY_SYNC", event: "signedOut" };

(async function run() {
  /* ---- "changed" from our origin: pull once, stamp, broadcast ---- */
  {
    const { external, calls, store } = boot();
    const resp = await sendExternal(external, "https://kiwiply.com", changed);
    ok("changed: accepted", resp && resp.ok === true, JSON.stringify(resp));
    ok("changed: pulled the mirror exactly once", calls.pullAll === 1, `got ${calls.pullAll}`);
    ok("changed: pull writes into JAF.storage (the SW now loads storage.js)", calls.pullStorage && calls.pullStorage.tag === "storage-stub");
    ok("changed: stamped __lastPull so the drawer doesn't re-pull", !!(store.settings && store.settings.__lastPull > 0));
    // 11.3: the signal pulls without asking, but must still record what it pulled under —
    // otherwise the next scheduled check compares against a stale marker and pulls again.
    ok("changed: recorded the version it pulled under", store.settings && store.settings.__profileVersion === "v-new", JSON.stringify(store.settings));
    ok("changed: told open drawers to repaint", calls.broadcast.some((m) => m && m.type === "KIWIPLY_MIRROR_UPDATED"));
    ok("changed: did not touch the session", calls.clear === 0 && calls.logout === 0);
  }

  /* ---- "changed" while the extension isn't connected: honest no-op ---- */
  {
    const { external, calls } = boot({ connected: false });
    const resp = await sendExternal(external, "https://kiwiply.com", changed);
    ok("changed/not connected: refused with a reason", resp && resp.ok === false && resp.reason === "not-connected", JSON.stringify(resp));
    ok("changed/not connected: no pull", calls.pullAll === 0);
  }

  /* ---- "signedOut": revoke best-effort, ALWAYS clear ---- */
  {
    const { external, calls } = boot();
    const resp = await sendExternal(external, "https://app.kiwiply.com", signedOut);
    ok("signedOut: accepted", resp && resp.ok === true, JSON.stringify(resp));
    ok("signedOut: revoked server-side", calls.logout === 1);
    ok("signedOut: cleared the local session", calls.clear === 1);
    ok("signedOut: no pull", calls.pullAll === 0);
  }

  /* ---- "signedOut" means this browser forgets the account (pre-launch review 2026-09-22) ---- */
  {
    const { external, calls } = boot();
    const resp = await sendExternal(external, "https://kiwiply.com", signedOut);
    ok("signedOut/forget: accepted", resp && resp.ok === true, JSON.stringify(resp));
    // Tokens alone left the previous user's profile and resumes in the drawer, ready to autofill.
    ok("signedOut/forget: the account's data was cleared", calls.forgot === 1, `got ${calls.forgot}`);
    ok("signedOut/forget: an open drawer is told to repaint", calls.broadcast.some((m) => m && m.type === "KIWIPLY_MIRROR_UPDATED"));
  }

  /* ---- connecting a DIFFERENT account over one that never signed out ---- */
  {
    // The sign-out signal can be missed (browser closed, extension updated); the next account
    // to connect must not inherit the previous one's data.
    const { external, calls } = boot({ prevAuth: { access: "old", refresh: "old", username: "alice" } });
    const resp = await sendExternal(external, "https://kiwiply.com", { type: "KIWIPLY_CONNECT", tokens: { access: "a", refresh: "r", username: "bob" } });
    ok("switch: connect accepted", resp && resp.ok === true, JSON.stringify(resp));
    ok("switch: alice's data is cleared before bob's session is stored", calls.forgot === 1, `got ${calls.forgot}`);
  }
  {
    const { external, calls } = boot({ prevAuth: { access: "old", refresh: "old", username: "alice" } });
    await sendExternal(external, "https://kiwiply.com", { type: "KIWIPLY_CONNECT", tokens: { access: "a", refresh: "r", username: "alice" } });
    ok("switch: reconnecting as the same account keeps its data", calls.forgot === 0, `got ${calls.forgot}`);
  }
  {
    // An unknown name can't prove a switch, and wiping on a guess costs a Free user the only
    // copy of their learned answers.
    const { external, calls } = boot({ prevAuth: { access: "old", refresh: "old" } });
    await sendExternal(external, "https://kiwiply.com", { type: "KIWIPLY_CONNECT", tokens: { access: "a", refresh: "r", username: "bob" } });
    ok("switch: an unknown previous account is not treated as a switch", calls.forgot === 0, `got ${calls.forgot}`);
  }
  {
    const { external, calls } = boot({ logoutFails: true });
    const resp = await sendExternal(external, "https://kiwiply.com", signedOut);
    ok("signedOut/offline: still ok — the local clear is what matters", resp && resp.ok === true, JSON.stringify(resp));
    ok("signedOut/offline: session cleared even though revoke failed", calls.clear === 1);
  }

  /* ---- the origin gate is the connect handoff's gate ---- */
  {
    const { external, calls } = boot();
    for (const origin of ["https://evil.com", "https://kiwiply.com.evil.com", "http://kiwiply.com", "https://boards.greenhouse.io", ""]) {
      const resp = await sendExternal(external, origin, changed);
      ok(`gate: ignores changed from ${origin || "(empty)"}`, resp === null, JSON.stringify(resp));
      const r2 = await sendExternal(external, origin, signedOut);
      ok(`gate: ignores signedOut from ${origin || "(empty)"}`, r2 === null, JSON.stringify(r2));
    }
    ok("gate: rejected signals touched nothing", calls.pullAll === 0 && calls.clear === 0 && calls.logout === 0);
  }

  /* ---- unknown event: refused, nothing touched ---- */
  {
    const { external, calls } = boot();
    const resp = await sendExternal(external, "https://kiwiply.com", { type: "KIWIPLY_SYNC", event: "dropTables" });
    ok("unknown event: refused", resp && resp.ok === false && resp.reason === "unknown-event", JSON.stringify(resp));
    ok("unknown event: nothing touched", calls.pullAll === 0 && calls.clear === 0);
  }

  /* ---- Firefox relay path: same handling, same gate ---- */
  {
    const { internal, calls } = boot();
    const fromOurPage = { tab: { id: 1 }, url: "https://kiwiply.com/resumes" };   // Firefox: no sender.origin
    const resp = await sendRelayed(internal, fromOurPage, changed);
    ok("relay: changed from our page pulls", resp && resp.ok === true && calls.pullAll === 1, JSON.stringify(resp));

    const fromAts = { tab: { id: 2 }, url: "https://boards.greenhouse.io/acme/jobs/1" };
    const r2 = await sendRelayed(internal, fromAts, signedOut);
    ok("relay: an ATS content script cannot sign the extension out", r2 === null && calls.clear === 0, JSON.stringify(r2));

    const noTab = { url: "https://kiwiply.com/resumes" };                          // another extension page
    const r3 = await sendRelayed(internal, noTab, signedOut);
    ok("relay: a non-page sender cannot sign the extension out", r3 === null && calls.clear === 0, JSON.stringify(r3));
  }

  /* ---- the connect handoff still works through the shared router ---- */
  {
    const { external } = boot();
    const resp = await sendExternal(external, "https://kiwiply.com", { type: "KIWIPLY_CONNECT", tokens: { access: "a", refresh: "r", username: "alex" } });
    ok("connect: handoff unaffected by the sync route", resp && resp.ok === true, JSON.stringify(resp));
    const junk = await sendExternal(external, "https://kiwiply.com", { type: "SOMETHING_ELSE" });
    ok("router: an unrelated message type is ignored (no response)", junk === null, JSON.stringify(junk));
  }

  /* ---- 11.3: the scheduled alarm + the window-focus check ---- */
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // Registration. The alarm is what wakes an idle MV3 worker, so it has to be (re)created on
  // install/update AND on browser start — alarms don't survive an extension update.
  {
    const b = boot();
    ok("alarm: registered an onAlarm listener", b.alarmListeners.length === 1, `got ${b.alarmListeners.length}`);
    ok("alarm: registered a window-focus listener", b.focusListeners.length === 1, `got ${b.focusListeners.length}`);
    ok("alarm: hooked onInstalled and onStartup", b.installed.length >= 1 && b.startup.length === 1);

    b.installed.forEach((fn) => fn({ reason: "update" }));
    ok("alarm: onInstalled creates kiwiply-sync", b.calls.alarmsCreated.some((a) => a.name === "kiwiply-sync"), JSON.stringify(b.calls.alarmsCreated));
    ok("alarm: period is 15 minutes", b.calls.alarmsCreated.some((a) => a.cfg && a.cfg.periodInMinutes === 15), JSON.stringify(b.calls.alarmsCreated));
    b.startup.forEach((fn) => fn());
    ok("alarm: onStartup re-creates it (alarms don't survive an update)", b.calls.alarmsCreated.length >= 2, `got ${b.calls.alarmsCreated.length}`);
  }

  // Firing the alarm runs the cheap check and, when it pulled, tells an open drawer.
  {
    const b = boot();
    b.store.settings = { apiBaseUrl: "https://api.test" };
    await b.alarmListeners[0]({ name: "kiwiply-sync" });
    await tick();
    ok("alarm: fired → ran checkAndPull", b.calls.checkAndPull === 1, `got ${b.calls.checkAndPull}`);
    ok("alarm: a pull that landed broadcasts to the drawer", b.calls.broadcast.some((m) => m && m.type === "KIWIPLY_MIRROR_UPDATED"));

    // Somebody else's alarm is not ours.
    await b.alarmListeners[0]({ name: "some-other-alarm" });
    await tick();
    ok("alarm: ignores alarms that aren't ours", b.calls.checkAndPull === 1, `got ${b.calls.checkAndPull}`);
  }

  // Nothing changed server-side → no broadcast, so the drawer doesn't repaint for nothing.
  {
    const b = boot({ pulled: false });
    b.store.settings = { apiBaseUrl: "https://api.test" };
    await b.alarmListeners[0]({ name: "kiwiply-sync" });
    await tick();
    ok("alarm/unchanged: checked but did not broadcast", b.calls.checkAndPull === 1 && b.calls.broadcast.length === 0);
  }

  // Not connected / not configured: quiet no-ops, not errors. This runs unattended on a timer.
  {
    const b = boot({ connected: false });
    b.store.settings = { apiBaseUrl: "https://api.test" };
    await b.alarmListeners[0]({ name: "kiwiply-sync" });
    await tick();
    ok("alarm/not connected: no check, no throw", b.calls.checkAndPull === 0);

    const b2 = boot();                      // no settings at all → no apiBaseUrl
    await b2.alarmListeners[0]({ name: "kiwiply-sync" });
    await tick();
    ok("alarm/not configured: no check", b2.calls.checkAndPull === 0);
  }

  // Focus: checks on return to the browser, guarded so alt-tabbing doesn't spray requests.
  {
    const b = boot();
    b.store.settings = { apiBaseUrl: "https://api.test" };
    await b.focusListeners[0](1);
    await tick();
    ok("focus: a focused window runs the check", b.calls.checkAndPull === 1, `got ${b.calls.checkAndPull}`);

    await b.focusListeners[0](2);
    await tick();
    ok("focus: a second focus within the guard window does not re-check", b.calls.checkAndPull === 1, `got ${b.calls.checkAndPull}`);

    await b.focusListeners[0](b.chrome.windows.WINDOW_ID_NONE);
    await tick();
    ok("focus: losing focus entirely is ignored", b.calls.checkAndPull === 1, `got ${b.calls.checkAndPull}`);
  }

  console.log(`\n[sync_signal] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[sync_signal] All green.");
})();
