/**
 * Dates that render the same on the server and in the browser (pre-launch review, 2026-09-22).
 *
 * <p>Every page is rendered twice: once on the server, once in the browser to hydrate it. A date
 * formatted with the defaults uses whichever machine is doing the formatting — the production
 * box is UTC and en-US, a visitor might be in New York with en-GB. So a subscription renewing at
 * 02:53 UTC on 22 October read "October 22" from the server and "21 October" in the browser,
 * which is both wrong (the Stripe portal said the 21st) and a hydration mismatch React throws
 * away and re-renders.
 *
 * <p>The fix is to render twice on purpose: a fixed, deterministic form (UTC, en-US) on the server
 * and during hydration, so both passes agree, then the viewer's own zone and locale once the page
 * is live. `useDateDisplay` (lib/use-date-display.ts) is the switch.
 *
 * <p>This module is deliberately free of React so Server Components can import the formatter;
 * the hook lives next door, in a module only Client Components import. Keeping them together
 * pulled a hook into a Server Component's graph, which Next refuses to build.
 */
export type DateDisplay = { locale?: string; timeZone?: string };

/** Server render and hydration: identical on both sides, whatever machine is doing it. */
export const SERVER_DATE_DISPLAY: DateDisplay = { locale: "en-US", timeZone: "UTC" };
/** Live in the browser: the viewer's own locale and time zone. */
export const BROWSER_DATE_DISPLAY: DateDisplay = {};

/** "" for a missing or unparseable date, so callers can fall back with `||`. */
export function formatDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  display: DateDisplay = SERVER_DATE_DISPLAY,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(display.locale, { ...options, timeZone: display.timeZone });
}
