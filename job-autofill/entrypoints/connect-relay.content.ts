/**
 * Firefox-only session-handoff relay (W6.1).
 *
 * On Chrome the web app hands the extension a session directly: kiwiply.com/connect calls
 * `chrome.runtime.sendMessage(EXT_ID, …)` and the background's `onMessageExternal` takes it
 * (manifest `externally_connectable`). **Firefox has never implemented that** — neither
 * `externally_connectable` nor web-page `runtime.sendMessage` exist there
 * (https://bugzil.la/1319168, open since 2016). Without a relay, a Firefox user cannot sign in
 * at all, because the extension deliberately has no login of its own.
 *
 * So on Firefox we register this content script on our own web origins. The page posts the
 * session to itself with `window.postMessage`; this script — which does have `chrome.runtime` —
 * forwards it to the background and posts the reply back. The trust boundary is unchanged:
 * `externally_connectable` also trusts a whole origin, and the matches below are the same
 * origins listed there, so Firefox ends up trusting exactly what Chrome trusts, no more.
 *
 * Chrome keeps using the direct path and does not ship this script (`include: ["firefox"]`),
 * so its manifest gains no content script and no host permission on kiwiply.com.
 */

/** Same-origin page → relay. The page sends these; we never accept them from a frame or another origin. */
const REQUEST = "KIWIPLY_CONNECT";
/** Page → relay: "is the extension here?". Lets /connect detect us before it mints a session. */
const PING = "KIWIPLY_CONNECT_PING";
/** Relay → page. */
const PONG = "KIWIPLY_CONNECT_PONG";
const RESPONSE = "KIWIPLY_CONNECT_RESULT";

export default defineContentScript({
  // Exactly the origins in `externally_connectable.matches` — this is the Firefox equivalent of
  // that key, not a wider grant, so the two lists must stay in step (wxt.config.ts holds the
  // other one). The dev web app is added only to development builds, for the same reason it is
  // kept out of the manifest there: on a released build, any page on a developer's
  // localhost:3000 could otherwise hand this extension a session.
  matches: [
    "https://kiwiply.com/*",
    "https://www.kiwiply.com/*",
    "https://app.kiwiply.com/*",
    ...(import.meta.env.MODE === "production" ? [] : ["http://localhost:3000/*"]),
  ],
  include: ["firefox"],
  runAt: "document_start",
  allFrames: false,
  main() {
    window.addEventListener("message", (event: MessageEvent) => {
      // Only this exact document may hand over a session — not an embedded frame, not an
      // opener, and not another origin that happens to have a handle on this window.
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;

      const data = event.data as { type?: unknown; tokens?: unknown } | null;
      if (!data) return;

      // Presence check: answering this is how /connect learns a relay is listening, so it can
      // show "install the extension" instead of minting a session pair nobody will collect.
      if (data.type === PING) {
        window.postMessage({ type: PONG }, window.location.origin);
        return;
      }
      if (data.type !== REQUEST) return;

      const reply = (result: unknown) =>
        window.postMessage({ type: RESPONSE, result }, window.location.origin);

      try {
        chrome.runtime.sendMessage({ type: REQUEST, tokens: data.tokens }, (result) => {
          // A dead background or a mid-update reload surfaces here, not as a throw.
          const err = chrome.runtime.lastError;
          reply(err ? { ok: false, reason: err.message || "extension-unavailable" } : result);
        });
      } catch (e) {
        reply({ ok: false, reason: String((e as Error)?.message || e) });
      }
    });
  },
});
