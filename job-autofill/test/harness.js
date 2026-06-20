/* harness.js — load real extension source into a jsdom window.
 *
 * Each src file is a classic IIFE script that attaches to window.JAF. We execute
 * it INSIDE the jsdom realm via window.eval (runScripts:"outside-only") so that
 * Event / MouseEvent / MutationObserver / document all resolve to jsdom's
 * globals rather than Node's. chrome.storage is stubbed in-memory.
 *
 * Run:  node test/run.js     (from job-autofill/, with jsdom on NODE_PATH)
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");

function makeWindow(html) {
  const dom = new JSDOM(html || "<!doctype html><html><body></body></html>", {
    url: "https://acme.myworkdayjobs.com/en-US/careers",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const window = dom.window;
  // jsdom has no layout engine: make visibility checks pass by default.
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 };
  };
  Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() { return this.parentNode || null; },
  });
  // chrome.* stub (shared in-memory store for local + sync)
  const store = {};
  const api = {
    get: (k, cb) => (cb ? cb(store) : Promise.resolve(store)),
    set: (o, cb) => { Object.assign(store, o); cb && cb(); return Promise.resolve(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); return Promise.resolve(); },
  };
  window.chrome = {
    storage: { local: api, sync: api },
    runtime: { getURL: (p) => "chrome-extension://test/" + p, onMessage: { addListener() {} } },
  };
  return window;
}

function load(window, relPath) {
  window.eval(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

// Data + logic layers an adapter needs (no DOM-driving side effects on load).
function loadCore(window) {
  ["src/config/rules.js",
   "src/lib/rules-store.js",
   "src/lib/schema.js",
   "src/content/adapters/base.js",
   "src/content/adapters/workday.js"].forEach((p) => load(window, p));
}

module.exports = { makeWindow, load, loadCore, ROOT };
