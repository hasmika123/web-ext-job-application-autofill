/**
 * Panel-frame messaging — the drawer (panel.html) runs as an on-page iframe injected into the
 * active tab (see background.ts). It can't reach out and remove its own host element (that lives
 * in the page document), so it asks the injected host to close it via a namespaced postMessage.
 *
 * The host listener (in background.ts's injected toggle function) verifies the message origin is
 * this extension before acting, so a page can't spoof a close. Kept tiny + framework-free so both
 * the React views and any future caller share one contract.
 */
export const PANEL_MESSAGE_SOURCE = "kiwiply-panel";

/** Ask the host page to remove the drawer overlay (no-op if we're not framed). */
export function closePanel(): void {
  try {
    window.parent?.postMessage({ source: PANEL_MESSAGE_SOURCE, type: "close" }, "*");
  } catch {
    /* not framed / cross-origin quirk — nothing to close */
  }
}
