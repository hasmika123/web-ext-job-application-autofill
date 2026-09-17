// Tests for the web→extension session handoff gate (W6.0): the service worker's
// `onMessageExternal` listener must accept a session ONLY from an origin the manifest's
// `externally_connectable.matches` allows, and must derive that list from the manifest
// rather than hardcoding it — so the dev-only localhost origin disappears with the
// dev-only manifest entry instead of shipping to the store.
//
// The service worker registers its chrome.* listeners at load, so this mocks just enough
// of `chrome` to capture them, then drives the captured listener directly.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

// Boots service-worker.js against a mock `chrome` whose getManifest() reports `matches`.
// Returns the captured onMessageExternal listener + the token store it writes through.
function boot(matches) {
  const store = {};                 // chrome.storage.local backing map
  const saved = [];                 // token-store writes
  const external = [];              // captured onMessageExternal listeners
  const noop = { addListener() {} };

  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches } }),
      onInstalled: noop,
      onMessage: noop,
      onMessageExternal: { addListener: (fn) => external.push(fn) },
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

  const sandbox = {
    chrome,
    console,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error("no network in tests")),
    JAF: {
      // Only the pieces this listener path touches.
      tracking: { chromeTokenStore: () => ({ set: (t) => { saved.push(t); return Promise.resolve(true); } }) },
      analytics: { create: () => ({ track: () => Promise.resolve({ sent: false }) }) },
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/background/service-worker.js"), "utf8"), sandbox);

  ok("boot: registered an onMessageExternal listener", external.length === 1, `got ${external.length}`);
  return { listener: external[0], saved, store };
}

// Fires a well-formed KIWIPLY_CONNECT from `origin`; resolves to the response, or null
// when the listener ignored the message (a rejected origin never responds).
function connect(listener, origin) {
  return new Promise((resolve) => {
    let responded = false;
    const ret = listener(
      { type: "KIWIPLY_CONNECT", tokens: { access: "a-token", refresh: "r-token", username: "alex" } },
      { origin },
      (resp) => { responded = true; resolve(resp); },
    );
    // A rejected origin returns undefined synchronously and never calls sendResponse.
    if (ret !== true && !responded) resolve(null);
    else if (ret === true) setTimeout(() => { if (!responded) resolve(null); }, 50);
  });
}

const PROD_MATCHES = ["https://kiwiply.com/*", "https://www.kiwiply.com/*", "https://app.kiwiply.com/*"];

(async function run() {
  /* ---- production manifest: our own origins in, everything else out ---- */
  {
    const { listener, saved } = boot(PROD_MATCHES);

    for (const origin of PROD_MATCHES.map((m) => m.replace("/*", ""))) {
      const resp = await connect(listener, origin);
      ok(`accepts ${origin}`, resp && resp.ok === true, JSON.stringify(resp));
    }
    ok("accepted handoffs stored a session each", saved.length === 3, `got ${saved.length}`);
    ok("stored the tokens verbatim",
      saved[0] && saved[0].access === "a-token" && saved[0].refresh === "r-token" && saved[0].username === "alex",
      JSON.stringify(saved[0]));

    // The reason this gate exists: nothing else may hand the extension a session.
    const rejected = [
      "https://evil.com",
      "http://kiwiply.com",              // scheme downgrade
      "https://kiwiply.com.evil.com",    // suffix-confusion
      "https://evilkiwiply.com",
      "https://notkiwiply.com",
      "http://localhost:3000",           // dev origin, absent from a production manifest
      "https://sub.kiwiply.com",         // not listed (no wildcard in production)
      "",                                // no origin at all
    ];
    for (const origin of rejected) {
      const resp = await connect(listener, origin);
      ok(`rejects ${origin || "(empty origin)"}`, resp === null, JSON.stringify(resp));
    }
    ok("rejected handoffs stored nothing", saved.length === 3, `got ${saved.length}`);
  }

  /* ---- dev manifest: the localhost origin works ONLY because the manifest lists it ---- */
  {
    const { listener } = boot(PROD_MATCHES.concat(["http://localhost:3000/*"]));
    const resp = await connect(listener, "http://localhost:3000");
    ok("dev manifest accepts http://localhost:3000", resp && resp.ok === true, JSON.stringify(resp));
    const other = await connect(listener, "http://localhost:3001");
    ok("dev manifest still rejects a different port", other === null, JSON.stringify(other));
  }

  /* ---- a wildcard match covers subdomains and the bare host, nothing else ---- */
  {
    const { listener } = boot(["https://*.kiwiply.com/*"]);
    ok("wildcard accepts the bare host", (await connect(listener, "https://kiwiply.com"))?.ok === true);
    ok("wildcard accepts a subdomain", (await connect(listener, "https://app.kiwiply.com"))?.ok === true);
    ok("wildcard rejects suffix-confusion", (await connect(listener, "https://kiwiply.com.evil.com")) === null);
  }

  /* ---- a malformed payload from a GOOD origin is refused, not stored ---- */
  {
    const { listener, saved } = boot(PROD_MATCHES);
    const resp = await new Promise((resolve) => {
      listener({ type: "KIWIPLY_CONNECT", tokens: { access: "a" } }, { origin: "https://kiwiply.com" }, resolve);
    });
    ok("missing refresh token is refused", resp && resp.ok === false && resp.reason === "missing-tokens", JSON.stringify(resp));
    ok("refused payload stored nothing", saved.length === 0, `got ${saved.length}`);
  }

  /* ---- an unrelated message type from a good origin is ignored ---- */
  {
    const { listener, saved } = boot(PROD_MATCHES);
    const resp = await connect2(listener, "https://kiwiply.com", { type: "SOMETHING_ELSE", tokens: { access: "a", refresh: "r" } });
    ok("unknown message type ignored", resp === null, JSON.stringify(resp));
    ok("unknown message type stored nothing", saved.length === 0, `got ${saved.length}`);
  }

  console.log(`[connect_handoff] ${pass} passed, ${fail} failed`);
  if (fail) { console.log(fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log("[connect_handoff] All green.");
})();

// connect(), but with a caller-supplied message body.
function connect2(listener, origin, msg) {
  return new Promise((resolve) => {
    let responded = false;
    const ret = listener(msg, { origin }, (resp) => { responded = true; resolve(resp); });
    if (ret !== true && !responded) resolve(null);
    else if (ret === true) setTimeout(() => { if (!responded) resolve(null); }, 50);
  });
}
