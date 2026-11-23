/**
 * The web app and API origins the extension links to.
 *
 * A store build (`wxt build`, mode=production) ALWAYS uses kiwiply.com: nothing here can change
 * it. A development build (`wxt`, or `wxt build --mode development`) may be pointed at another
 * stack (a local one, or a hosted test environment) with the same env vars wxt.config.ts already
 * reads for the manifest:
 *
 *   WXT_DEV_WEB_ORIGINS  first origin = where "Connect", "Dashboard" and pricing links go
 *   WXT_DEV_API_ORIGINS  first origin = the API a fresh install talks to (see background.ts)
 *
 * Only an explicitly set variable counts; a plain dev build keeps the kiwiply.com links. The
 * value is also published on `globalThis.JAF_BUILD` for the vanilla engine (service-worker.js),
 * which cannot read `import.meta.env`; import this module before the engine.
 */
export const PROD_WEB_ORIGIN = "https://kiwiply.com";
export const PROD_API_ORIGIN = "https://api.kiwiply.com";

/** The first plain origin (no wildcard, no path) in a comma-separated list, or "". */
export function firstOrigin(list: string | undefined): string {
  const first = String(list || "").split(",")[0]?.trim().replace(/\/+$/, "") || "";
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(first) ? first : "";
}

const dev = import.meta.env.MODE !== "production";

export const WEB_ORIGIN = (dev && firstOrigin(import.meta.env.WXT_DEV_WEB_ORIGINS)) || PROD_WEB_ORIGIN;
export const API_ORIGIN = (dev && firstOrigin(import.meta.env.WXT_DEV_API_ORIGINS)) || PROD_API_ORIGIN;

(globalThis as typeof globalThis & { JAF_BUILD?: { webOrigin: string; apiOrigin: string } }).JAF_BUILD = Object.freeze({
  webOrigin: WEB_ORIGIN,
  apiOrigin: API_ORIGIN,
});
