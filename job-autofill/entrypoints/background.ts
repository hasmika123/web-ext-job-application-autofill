/**
 * Background entrypoint (W0.2) — wraps the existing service worker with NO behavior change.
 *
 * The engine libs are imported first as ES side-effect imports (they attach to
 * globalThis.JAF), then `service-worker.js` runs and registers all its chrome.* listeners
 * synchronously at startup — exactly as the old classic worker did via importScripts.
 * WXT bundles everything into a single `background.js`; nothing here is remote code.
 */
import "../src/lib/tracking.js";
import "../src/lib/sync.js";
import "../src/lib/app-tracking.js";
import "../src/lib/analytics.js";
// Registers onInstalled / onMessage / onMessageExternal / webNavigation / tabs listeners.
import "../src/background/service-worker.js";

export default defineBackground(() => {
  // All work happens at module load (the imports above). The listeners must be registered
  // synchronously at the top level for MV3, which the side-effect import does.

  // Toolbar-icon click (no popup, no native side panel) toggles an on-page drawer: an iframe
  // hosting panel.html, injected into the active tab at a high z-index so it FLOATS OVER the
  // page without resizing it — unlike Chrome's native side panel, which docks and compresses
  // the site. Cross-browser: no chrome.sidePanel dependency, so it also works on Firefox.
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toggleDrawer }).catch(() => {
      /* restricted page (chrome://, the web store, the PDF viewer) — can't inject an overlay there */
    });
  });
});

/**
 * Injected into the page (isolated world) on each toolbar click. SELF-CONTAINED — it is serialized
 * and runs in the page, so it must not reference anything from this module. Toggles a fixed
 * right-edge iframe drawer (matching the on-page fill overlay's look). A one-time, origin-checked
 * message listener lets the framed app close itself (see lib/panel-frame.ts).
 */
function toggleDrawer() {
  const HOST_ID = "__kiwiply_drawer_host";
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove(); // second click closes it
    return;
  }
  const panelUrl = chrome.runtime.getURL("panel.html");
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "position:fixed;top:0;right:0;width:400px;max-width:100vw;height:100vh;z-index:2147483647;" +
    "border-left:4px solid #94BD37;border-radius:20px 0 0 20px;overflow:hidden;" +
    "box-shadow:-12px 0 40px rgba(45,49,51,.22);background:#ECEBE3;";
  const frame = document.createElement("iframe");
  frame.src = panelUrl;
  frame.title = "Kiwiply";
  frame.style.cssText = "width:100%;height:100%;border:0;background:transparent;";
  host.appendChild(frame);
  (document.body || document.documentElement).appendChild(host);

  // Bind the close listener once per page (the framed app posts a namespaced close message).
  const w = window as unknown as { __kiwiplyDrawerBound?: boolean };
  if (!w.__kiwiplyDrawerBound) {
    w.__kiwiplyDrawerBound = true;
    const panelOrigin = new URL(panelUrl).origin;
    window.addEventListener("message", (e) => {
      if (e.origin !== panelOrigin) return; // only our own extension frame may close the drawer
      if (e.data && e.data.source === "kiwiply-panel" && e.data.type === "close") {
        document.getElementById(HOST_ID)?.remove();
      }
    });
  }
}
