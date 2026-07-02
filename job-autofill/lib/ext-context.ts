/**
 * Extension-context resilience for the on-page drawer iframe.
 *
 * The drawer (panel.html) runs as an iframe injected into the active tab. When the extension is
 * reloaded, updated, or disabled while the drawer is open, that iframe is ORPHANED: its chrome.*
 * references point at a dead context, so the next chrome call throws "Extension context
 * invalidated". That's expected (not a code bug) — these helpers detect it so the drawer can bow
 * out cleanly (auto-close) instead of spewing uncaught errors. Reopening from the toolbar injects
 * a fresh iframe bound to the live context.
 */

/** True while this iframe's chrome.* context is still valid (runtime.id goes undefined when not). */
export function extensionAlive(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

const INVALIDATION_RE = /context invalidated|Extension context was invalidated/i;

function isInvalidation(v: unknown): boolean {
  const msg = v instanceof Error ? v.message : typeof v === "string" ? v : "";
  return INVALIDATION_RE.test(msg);
}

/**
 * Install one-shot global handlers that run `handler` and swallow the error when an "Extension
 * context invalidated" failure surfaces (synchronously via window "error", or from a rejected
 * promise via "unhandledrejection"). Idempotent per call.
 */
export function onContextInvalidated(handler: () => void): void {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    try {
      handler();
    } catch {
      /* nothing more we can do from a dead context */
    }
  };
  window.addEventListener("error", (e) => {
    if (isInvalidation(e.error) || isInvalidation(e.message)) {
      e.preventDefault();
      fire();
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isInvalidation(e.reason)) {
      e.preventDefault();
      fire();
    }
  });
}
