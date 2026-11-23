// Guards the hosts a STORE build of the extension can talk to or link to.
//
// A commit once hard-coded a hosted test environment as the extension's web app and API, which a
// store build would have shipped: new installs would have opened that site's /connect page, used
// its API and accepted its sign-in handoff. Test environments belong in a development build
// (WXT_DEV_WEB_ORIGINS / WXT_DEV_API_ORIGINS / WXT_DEV_TENANT_ORIGINS, see lib/hosts.ts and
// wxt.config.ts). This test keeps it that way:
//   1. every http(s) host literal in the shipped sources is on the allow-list below;
//   2. lib/hosts.ts only honours an override outside production mode;
//   3. the service worker opens kiwiply.com/connect on install unless a dev build said otherwise.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

// Hosts the extension may name in its sources. Adding one is a reviewed decision: it ships to
// every user. kiwiply.com hosts, the ATS hosts the manifest lists, BYO-key AI, GA4, LinkedIn
// links, and local hosts that wxt.config.ts only adds to development builds.
const ALLOWED = new Set([
  "kiwiply.com", "www.kiwiply.com", "app.kiwiply.com", "api.kiwiply.com", "*.kiwiply.com",
  "*.myworkdayjobs.com", "*.myworkday.com", "*.greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io",
  "jobs.lever.co", "jobs.ashbyhq.com", "apply.workable.com", "*.workable.com", "*.icims.com", "*.taleo.net",
  "jobs.smartrecruiters.com", "*.bamboohr.com", "*.jobvite.com", "smartapply.indeed.com",
  "api.anthropic.com", "www.google-analytics.com", "www.linkedin.com",
  "localhost", "127.0.0.1",
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ---- 1. host literals in the shipped sources -------------------------------------------------
const files = [...walk(path.join(ROOT, "entrypoints"), []), ...walk(path.join(ROOT, "lib"), []), ...walk(path.join(ROOT, "src"), []), path.join(ROOT, "wxt.config.ts")];
const offenders = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const re = /["'`]https?:\/\/([^"'`/:\s]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const host = m[1].toLowerCase();
    // Documentation placeholders in comments/strings ("http://<name>.localhost[:port]").
    if (/[<[]/.test(host) || host.endsWith(".localhost")) continue;
    if (!ALLOWED.has(host)) offenders.push(path.relative(ROOT, f) + ": " + host);
  }
}
ok("shipped sources name only allow-listed hosts", offenders.length === 0, offenders.join(", "));
ok("host scan read the sources it guards", files.some((f) => f.endsWith("service-worker.js")) && files.some((f) => f.endsWith(path.join("lib", "hosts.ts"))));

// ---- 2. lib/hosts.ts: overrides only outside production --------------------------------------
const hosts = fs.readFileSync(path.join(ROOT, "lib/hosts.ts"), "utf8");
ok("hosts: production web origin is kiwiply.com", /PROD_WEB_ORIGIN = "https:\/\/kiwiply\.com"/.test(hosts));
ok("hosts: production API origin is api.kiwiply.com", /PROD_API_ORIGIN = "https:\/\/api\.kiwiply\.com"/.test(hosts));
ok("hosts: dev flag is MODE !== production", /const dev = import\.meta\.env\.MODE !== "production";/.test(hosts));
ok("hosts: web override needs the dev flag", /WEB_ORIGIN = \(dev && firstOrigin\(import\.meta\.env\.WXT_DEV_WEB_ORIGINS\)\) \|\| PROD_WEB_ORIGIN/.test(hosts));
ok("hosts: API override needs the dev flag", /API_ORIGIN = \(dev && firstOrigin\(import\.meta\.env\.WXT_DEV_API_ORIGINS\)\) \|\| PROD_API_ORIGIN/.test(hosts));
const bg = fs.readFileSync(path.join(ROOT, "entrypoints/background.ts"), "utf8");
const firstImport = (bg.match(/^import .*$/m) || [""])[0];
ok("background imports lib/hosts before the engine", /from "\.\.\/lib\/hosts"/.test(firstImport), firstImport);

// firstOrigin(): the same logic, exercised (TypeScript annotations stripped).
const fo = /export function firstOrigin\(list: string \| undefined\): string \{([\s\S]*?)\n\}/.exec(hosts);
ok("hosts: firstOrigin found", !!fo);
if (fo) {
  const firstOrigin = new Function("list", fo[1]);
  ok("firstOrigin: first of a list, trailing slash dropped", firstOrigin("https://test.example.com/, http://localhost:3000") === "https://test.example.com");
  ok("firstOrigin: keeps a port", firstOrigin("http://localhost:3200") === "http://localhost:3200");
  ok("firstOrigin: rejects a wildcard", firstOrigin("https://*.example.com") === "");
  ok("firstOrigin: rejects a path", firstOrigin("https://example.com/connect") === "");
  ok("firstOrigin: unset is empty", firstOrigin(undefined) === "");
}

// ---- 3. the install tab -------------------------------------------------------------------
function installTab(build) {
  const created = [];
  const installed = [];
  const noop = { addListener() {} };
  const chrome = {
    runtime: {
      getManifest: () => ({ externally_connectable: { matches: [] }, version: "0.0.0" }),
      onInstalled: { addListener: (fn) => installed.push(fn) },
      onMessage: noop,
      onMessageExternal: noop,
    },
    storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } },
    webNavigation: { onCompleted: noop },
    tabs: { onRemoved: noop, sendMessage() {}, create: (o) => { created.push(o.url); return Promise.resolve({}); } },
  };
  const sandbox = { chrome, console, setTimeout, clearTimeout, URL, fetch: () => Promise.reject(new Error("no network")), JAF: {} };
  if (build) sandbox.JAF_BUILD = build;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/background/service-worker.js"), "utf8"), sandbox);
  installed.forEach((fn) => fn({ reason: "install" }));
  return created;
}
const prodTabs = installTab(null);
ok("install opens kiwiply.com/connect by default", prodTabs.length === 1 && prodTabs[0] === "https://kiwiply.com/connect", JSON.stringify(prodTabs));
const devTabs = installTab({ webOrigin: "http://localhost:3200", apiOrigin: "http://localhost:18183" });
ok("a dev build's web origin is used for the install tab", devTabs[0] === "http://localhost:3200/connect", JSON.stringify(devTabs));

console.log(`[build_hosts] ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("[build_hosts] All green.");
