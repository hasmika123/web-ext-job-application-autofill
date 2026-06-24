/**
 * GA4 analytics helper for the web app (Phase 6.2).
 *
 * gtag.js is loaded by <Analytics /> ONLY when NEXT_PUBLIC_GA_MEASUREMENT_ID is set, so
 * every call here safely no-ops in dev/preview or when analytics is unconfigured. The
 * measurement ID is public by design (it ships in the page) — unlike the extension's
 * Measurement Protocol api_secret, gtag.js needs no secret, so there's nothing to hide here.
 *
 * Never pass PII to track() — use coarse, non-identifying params (a method, a count).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

// Master switch, separate from the ID so you can STAGE the measurement id but keep analytics
// dark until launch. Analytics only runs when BOTH are set: the ID is present AND this is "true".
// Default off — set NEXT_PUBLIC_ANALYTICS_ENABLED=true (and redeploy) to go live.
const GA_ENABLED = (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED ?? "") === "true";

export function analyticsEnabled(): boolean {
  return GA_ENABLED && GA_MEASUREMENT_ID.length > 0;
}

/** Fire a GA4 event. No-ops when gtag isn't loaded (unconfigured / server / blocked). */
export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, params ?? {});
}
