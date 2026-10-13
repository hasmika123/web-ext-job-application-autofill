/**
 * Web → extension change signal (Phase 11.1).
 *
 * The extension's local store is a read-only mirror of the server, and until now it only
 * re-pulled when the drawer opened (throttled to 90 s) — so a resume saved here, or a sign-out
 * here, took minutes to show up over there. This module tells the extension the moment
 * something changed, over the same trust boundary the /connect handoff already uses:
 *
 *  - Chrome / Edge: `chrome.runtime.sendMessage(EXT_ID, …)` (manifest `externally_connectable`).
 *  - Firefox: neither `externally_connectable` nor web-page `runtime.sendMessage` exist
 *    (https://bugzil.la/1319168), so we post to ourselves and the extension's connect-relay
 *    content script forwards it. Same origin gate on the receiving side either way.
 *
 * Fire-and-forget by design. No extension installed, wrong browser, or a dead background
 * are all silent no-ops — the server is the source of truth and the extension's own
 * version check (11.3) is the safety net. Nothing here is awaited by any save.
 */

/**
 * Pinned extension id (derived from the manifest "key"). Stable for the unpacked/dev build
 * and for the published item after its first Web Store upload. Override per-build with
 * NEXT_PUBLIC_KIWIPLY_EXTENSION_ID if the Web Store ever assigns a different id.
 * Only the DIRECT transport needs it; Firefox's relay addresses its own extension.
 */
export const EXT_ID = process.env.NEXT_PUBLIC_KIWIPLY_EXTENSION_ID || "ejlamilajchikpbeipdkjljjgankbfii";

/** Message type. Must match `SYNC` in job-autofill/src/background/service-worker.js and the relay. */
export const SYNC_MESSAGE = "KIWIPLY_SYNC";

/**
 * `changed`  — profile or resumes changed on the web; the extension re-pulls its mirror.
 * `signedOut` — the user signed out on the web; the extension drops its session at once.
 */
export type SyncEvent = "changed" | "signedOut";

type ChromeRuntime = {
  sendMessage?: (extId: string, msg: unknown, cb?: (resp: unknown) => void) => void;
  lastError?: { message?: string };
};

/** The exact payload both transports carry. Exported so the shape has one definition. */
export function buildSyncMessage(event: SyncEvent): { type: typeof SYNC_MESSAGE; event: SyncEvent } {
  return { type: SYNC_MESSAGE, event };
}

/**
 * Where "Install the extension" goes: the Chrome Web Store page of the pinned extension id (Edge installs from it too).
 * Override per build with NEXT_PUBLIC_KIWIPLY_EXTENSION_URL (a Firefox add-on page, a landing page).
 */
export const EXT_STORE_URL = process.env.NEXT_PUBLIC_KIWIPLY_EXTENSION_URL || `https://chromewebstore.google.com/detail/${EXT_ID}`;

/** The relay's presence check (Firefox), the same words `/connect` uses. */
const RELAY_PING = "KIWIPLY_CONNECT_PING";
const RELAY_PONG = "KIWIPLY_CONNECT_PONG";

/**
 * Is the Kiwiply extension installed in this browser? Resolves within `timeoutMs` (the setup payoff waits 300 ms, DESIGN
 * 5.11), never rejects, and answers false for "no", "can't tell" and "not a browser we ship for". Chrome / Edge: a
 * `changed` sync signal to the pinned extension id (harmless: the extension just re-pulls its mirror) is answered only
 * by the extension. Firefox: the connect-relay's ping, which only an installed extension answers.
 */
export function detectExtension(timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(found: boolean) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(found);
    }
    function onMessage(e: MessageEvent) {
      if (e.source === window && e.origin === window.location.origin && (e.data as { type?: unknown } | null)?.type === RELAY_PONG) finish(true);
    }
    const chromeApi = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
    const direct = chromeApi?.runtime?.sendMessage;
    if (direct && EXT_ID) {
      try {
        direct(EXT_ID, buildSyncMessage("changed"), () => finish(!chromeApi?.runtime?.lastError));
      } catch {
        finish(false);
      }
      return;
    }
    try {
      window.addEventListener("message", onMessage);
      window.postMessage({ type: RELAY_PING }, window.location.origin);
    } catch {
      finish(false);
    }
  });
}

/**
 * Tell the extension something changed. Never throws, never blocks; safe to call from any
 * client component after a successful save / sign-in / sign-out.
 */
export function notifyExtension(event: SyncEvent): void {
  if (typeof window === "undefined") return; // server render
  const msg = buildSyncMessage(event);
  const chromeApi = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  const direct = chromeApi?.runtime?.sendMessage;

  if (direct && EXT_ID) {
    try {
      // The callback exists only to READ lastError — an uninstalled extension otherwise logs
      // "Unchecked runtime.lastError" to the page console on every save.
      direct(EXT_ID, msg, () => {
        void chromeApi?.runtime?.lastError;
      });
    } catch {
      /* not our extension, or messaging unavailable on this page */
    }
    return;
  }

  // Firefox (or any browser without page-level runtime messaging): the relay picks this up
  // if it is installed; otherwise the message dies unheard, which is the intended no-op.
  try {
    window.postMessage(msg, window.location.origin);
  } catch {
    /* nothing to do */
  }
}
