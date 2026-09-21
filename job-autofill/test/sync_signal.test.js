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
  const calls = { pullAll: 0, logout: 0, clear: 0, broadcast: [] };
  const external = [];
  const internal = [];
  const noop = { addListener() {} };

  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches: PROD_MATCHES } }),
      onInstalled: noop,
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
    tabs: { onRemoved: noop, sendMessage() {} },
  };

  const provider = {
    isAuthenticated: () => Promise.resolve(opts.connected !== false),
    logout: () => { calls.logout++; return opts.logoutFails ? Promise.reject(new Error("offline")) : Promise.resolve(); },
  };

  const sandbox = {
    chrome, console, setTimeout, clearTimeout, URL,
    fetch: () => Promise.reject(new Error("no network in tests")),
    JAF: {
      storage: { tag: "storage-stub" },
      sync: {
        providerFromSettings: () => provider,
        pullAll: (p, storage) => { calls.pullAll++; calls.pullStorage = storage; return Promise.resolve({ bio: {}, resumeCount: 1 }); },
      },
      tracking: {
        chromeTokenStore: () => ({
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
  return { external: external[0], internal, calls, store };
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

  console.log(`\n[sync_signal] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[sync_signal] All green.");
})();
