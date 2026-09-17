// Tests for the web→extension session handoff gate, across BOTH transports.
//
// W6.0 — Chrome (`onMessageExternal`): accept a session only from an origin the manifest's
// `externally_connectable.matches` allows, and derive that list from the manifest rather than
// hardcoding it, so the dev-only localhost origin disappears with the dev-only manifest entry
// instead of shipping to the store.
//
// W6.1 — Firefox (`onMessage`, via the connect-relay content script): Firefox implements
// neither `externally_connectable` nor web-page `runtime.sendMessage`
// (https://bugzil.la/1319168), so the page posts the session to itself and a content script
// forwards it as an ordinary internal message. That path must apply the SAME origin gate: a
// content script running on an ATS page must not be able to hand over a session, and neither
// must another extension page (no `sender.tab`). Firefox also leaves `sender.origin` unset for
// content scripts, so the origin has to come from `sender.url`.
//
// The service worker registers its chrome.* listeners at load, so this mocks just enough
// of `chrome` to capture them, then drives the captured listeners directly.
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
  const internal = [];              // captured onMessage listeners
  const noop = { addListener() {} };

  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches } }),
      onInstalled: noop,
      onMessage: { addListener: (fn) => internal.push(fn) },
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
    // A fresh vm context has only ECMAScript intrinsics, so host globals must be passed in.
    // `URL` matters: the origin gate uses it to read an origin off `sender.url` (the Firefox
    // path), and without it that derivation silently fails inside its own try/catch.
    URL,
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
  ok("boot: registered onMessage listeners", internal.length > 0, `got ${internal.length}`);
  return { listener: external[0], internal, saved, store };
}

// Fires a relayed KIWIPLY_CONNECT at every internal onMessage listener, the way Chrome/Firefox
// fan a message out, and resolves with the first response (or null if none answered).
// `sender` is passed through verbatim so a test can omit `origin` the way Firefox does.
function relay(internal, sender, msg) {
  const body = msg || { type: "KIWIPLY_CONNECT", tokens: { access: "a-token", refresh: "r-token", username: "alex" } };
  return new Promise((resolve) => {
    let settled = false;
    let async = false;
    const respond = (resp) => { if (!settled) { settled = true; resolve(resp); } };
    for (const fn of internal) {
      if (fn(body, sender, respond) === true) async = true;
    }
    if (!async) respond(null);
    else setTimeout(() => respond(null), 50);
  });
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

  /* ---- W6.1 relay path: same gate, sender is our own content script ---- */
  {
    const { internal, saved } = boot(PROD_MATCHES);

    // Firefox content scripts carry `url` but no `origin` — the gate must cope.
    const resp = await relay(internal, { tab: { id: 7 }, url: "https://kiwiply.com/connect" });
    ok("relay: accepts our own origin with only sender.url", resp && resp.ok === true, JSON.stringify(resp));
    ok("relay: stored the session", saved.length === 1 && saved[0].access === "a-token", JSON.stringify(saved));

    // Chrome-shaped sender (origin present) on the relay path too.
    const resp2 = await relay(internal, { tab: { id: 8 }, origin: "https://app.kiwiply.com", url: "https://app.kiwiply.com/connect" });
    ok("relay: accepts sender.origin when present", resp2 && resp2.ok === true, JSON.stringify(resp2));

    // The whole point of re-checking: our content script also runs on ATS pages.
    const ats = await relay(internal, { tab: { id: 9 }, url: "https://boards.greenhouse.io/acme/jobs/1" });
    ok("relay: rejects a content script on an ATS page", ats === null, JSON.stringify(ats));

    const evil = await relay(internal, { tab: { id: 10 }, url: "https://kiwiply.com.evil.com/connect" });
    ok("relay: rejects suffix-confusion", evil === null, JSON.stringify(evil));

    const insecure = await relay(internal, { tab: { id: 11 }, url: "http://kiwiply.com/connect" });
    ok("relay: rejects scheme downgrade", insecure === null, JSON.stringify(insecure));

    // No tab => not a content script. An extension page (our own options/panel) must not be
    // able to inject a session this way.
    const noTab = await relay(internal, { url: "https://kiwiply.com/connect" });
    ok("relay: rejects a sender with no tab", noTab === null, JSON.stringify(noTab));

    const noSender = await relay(internal, {});
    ok("relay: rejects an empty sender", noSender === null, JSON.stringify(noSender));

    ok("relay: only the two valid handoffs were stored", saved.length === 2, `got ${saved.length}`);

    // Malformed payload from a good origin: refused, nothing stored.
    const bad = await relay(internal, { tab: { id: 12 }, url: "https://kiwiply.com/connect" },
      { type: "KIWIPLY_CONNECT", tokens: { access: "a" } });
    ok("relay: missing refresh token is refused", bad && bad.ok === false && bad.reason === "missing-tokens", JSON.stringify(bad));
    ok("relay: refused payload stored nothing", saved.length === 2, `got ${saved.length}`);
  }

  /* ---- the dev origin reaches the relay path only when the manifest lists it ---- */
  {
    const prod = boot(PROD_MATCHES);
    const devOrigin = { tab: { id: 1 }, url: "http://localhost:3000/connect" };
    ok("relay: production manifest rejects the dev origin",
      (await relay(prod.internal, devOrigin)) === null);

    const dev = boot(PROD_MATCHES.concat(["http://localhost:3000/*"]));
    const okResp = await relay(dev.internal, devOrigin);
    ok("relay: dev manifest accepts the dev origin", okResp && okResp.ok === true, JSON.stringify(okResp));
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
