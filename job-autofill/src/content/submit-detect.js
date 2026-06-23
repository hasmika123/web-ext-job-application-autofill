/* submit-detect.js — JAF.submitDetect
 *
 * Content-side submission detection. After the user commits a fill, the filler ARMS
 * this watcher; it scans the page for a confirmation signal (via the conservative,
 * generic heuristics in app-tracking.js) and, if one appears, pings the service
 * worker (JAF_SUBMIT_DETECTED) so the DRAFT entry flips to APPLIED.
 *
 * Two complementary paths cover the two ways a submit can land:
 *   - in-page success (SPA, no navigation) -> this DOM watcher catches it;
 *   - a redirect to a "thank you" page -> the content script is torn down, but the
 *     service worker's webNavigation listener catches the success URL instead.
 *
 * Never auto-submits, never mutates the page. Self-disarms after a short window so it
 * can't fire on some unrelated later DOM change.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  let armed = false;
  let observer = null;
  let timer = null;

  function signal() {
    try {
      if (JAF.appTracking && JAF.appTracking.hasSuccessSignal(document)) {
        disarm();
        try { chrome.runtime.sendMessage({ type: "JAF_SUBMIT_DETECTED" }); } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  }

  function arm(opts) {
    if (armed) return;
    armed = true;
    const ms = (opts && opts.windowMs) || 120000; // watch for ~2 min after a fill
    if (signal()) return; // maybe it's already a confirmation page
    try {
      observer = new MutationObserver(() => signal());
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    try { timer = setTimeout(disarm, ms); } catch (e) {}
  }

  function disarm() {
    armed = false;
    if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
  }

  JAF.submitDetect = { arm, disarm, signal, isArmed: () => armed };
})();
