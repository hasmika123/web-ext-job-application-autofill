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

  // Toolbar-icon click opens the right-side drawer (side panel) instead of a popup — the
  // popup entrypoint is gone, so the action has no default_popup. Chrome opens the panel as
  // the click's user gesture when this behavior is set. Feature-detected: Firefox has no
  // chrome.sidePanel (it uses sidebar_action — wired separately in the Firefox-parity pass).
  try {
    chrome.sidePanel
      ?.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        /* older Chrome / unsupported — the panel still opens from other entrypoints */
      });
  } catch {
    /* chrome.sidePanel absent (e.g. Firefox) */
  }
});
