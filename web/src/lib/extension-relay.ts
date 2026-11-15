/**
 * The page side of the extension's connect relay (job-autofill/entrypoints/connect-relay.content.ts; the names must match).
 *
 * Where a page cannot call the extension directly, the extension's content script listens on the page and the session is handed over by posting it
 * to the page itself: on Firefox, which has no web-page `runtime.sendMessage` (https://bugzil.la/1319168), and on an organization's own extension
 * build (CUSTOM-DOMAINS-BUILD.md A6), whose unlisted store item has an ID the organization's connect page cannot know. Only this exact document
 * talks to the relay: messages from a frame or another origin are ignored on both sides.
 */
export const RELAY_PING = "KIWIPLY_CONNECT_PING";
export const RELAY_PONG = "KIWIPLY_CONNECT_PONG";
export const RELAY_HANDOFF = "KIWIPLY_CONNECT";
export const RELAY_RESULT = "KIWIPLY_CONNECT_RESULT";
/** How long to wait for the relay to answer. Local postMessage, so this is generous. */
export const RELAY_TIMEOUT_MS = 2000;

export type RelayResult = { ok?: boolean; reason?: string } | null;

/** The part of `window` the relay uses (a fake one in tests). */
export type RelayWindow = Pick<Window, "addEventListener" | "removeEventListener" | "postMessage"> & { location: { origin: string } };

function exchange<T>(win: RelayWindow, send: unknown, answer: (data: { type?: unknown; result?: unknown }) => T | undefined, fallback: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      win.removeEventListener("message", onMessage as EventListener);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== (win as unknown) || e.origin !== win.location.origin) return;
      const v = answer((e.data ?? {}) as { type?: unknown; result?: unknown });
      if (v !== undefined) finish(v);
    };
    win.addEventListener("message", onMessage as EventListener);
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    win.postMessage(send, win.location.origin);
  });
}

/** Resolves true if a connect relay is listening on this page and answers for connect (Firefox, or a build that lists this page exactly). */
export function pingRelay(timeoutMs = RELAY_TIMEOUT_MS, win: RelayWindow = window): Promise<boolean> {
  return exchange(win, { type: RELAY_PING }, (d) => (d.type === RELAY_PONG ? true : undefined), false, timeoutMs);
}

/** Hands `tokens` to the relay and resolves with the extension's answer (null when nobody answered in time). */
export function sendViaRelay(tokens: unknown, timeoutMs = RELAY_TIMEOUT_MS, win: RelayWindow = window): Promise<RelayResult> {
  return exchange<RelayResult>(win, { type: RELAY_HANDOFF, tokens }, (d) => (d.type === RELAY_RESULT ? ((d.result as RelayResult) ?? null) : undefined), null, timeoutMs);
}
