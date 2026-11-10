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

/**
 * "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", then a short date once it is over a week
 * old. `nowMs` is a parameter so a caller (and a test) controls the clock; "" for a missing or unparseable date.
 */
export function timeAgo(iso: string | null | undefined, nowMs: number, display: DateDisplay = SERVER_DATE_DISPLAY): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d <= 7) return `${d} days ago`;
  return formatDate(iso, { month: "short", day: "numeric", year: "numeric" }, display);
}
