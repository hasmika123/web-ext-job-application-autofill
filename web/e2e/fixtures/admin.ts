import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Fixtures every admin journey shares (E2E-A15.0; ADMIN-E2E-PLAN section 3.6 / 3.7): sign in as the mock API's
 * `demo-admin` (ROLE_ADMIN in the mock only), an axe audit with zero tolerance, an overflow check and a screenshot
 * helper. One spec per admin page imports these instead of re-deriving them (`admin-ai.spec.ts` and `admin-kit.spec.ts`
 * do).
 *
 *   test.beforeEach(({ page }) => signInAdmin(page));
 *   await page.goto("/admin/users");
 *   await expectAccessible(page, "users 390");
 */

/** The mock API's admin account: `POST /api/auth/demo { login }` signs it in. Writes stay `403 DEMO_READ_ONLY`. */
export const DEMO_ADMIN = "demo-admin";

/** The widths every admin page is checked at (ADMIN-E2E-PLAN section 3.7). */
export const ADMIN_WIDTHS = { phone: 390, tablet: 768, desktop: 1440 } as const; // config-literal-ok: the three viewport widths of the admin test matrix

const SESSION_REUSE_MS = 10 * 60_000; // config-literal-ok: shorter than the 15 min access token, so a reused session is never stale
let session: { at: number; cookies: Awaited<ReturnType<BrowserContext["cookies"]>> } | null = null;

/**
 * Signs the browser context in as `demo-admin` (cookies land on the context, so `page.goto` is signed in). The demo
 * sign-in route is rate limited (20 per 5 min per IP), so the first call in a worker signs in and the next ones within
 * 10 minutes replay the same cookies instead of asking again.
 */
export async function signInAdmin(page: Page): Promise<void> {
  const ctx = page.context();
  if (session && Date.now() - session.at < SESSION_REUSE_MS) {
    await ctx.addCookies(session.cookies);
    return;
  }
  const res = await ctx.request.post("/api/auth/demo", { data: { login: DEMO_ADMIN } });
  expect(res.ok(), `${DEMO_ADMIN} sign-in`).toBeTruthy();
  session = { at: Date.now(), cookies: await ctx.cookies() };
}

/** The Next dev tools badge is not part of the product. */
const NOT_OURS = ["nextjs-portal"];

/**
 * axe over the page (or `scope`) with the WCAG 2 A and AA rules; ANY violation fails, whatever its impact (the console is
 * ours to get right, not a marketing page). `label` names the screen in the failure.
 */
export async function expectAccessible(page: Page, label = "page", scope?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (scope) builder = builder.include(scope);
  for (const sel of NOT_OURS) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `axe on ${label}`).toEqual([]);
}

/** The page does not scroll sideways (a 1 px rounding slack is allowed). */
export async function noOverflow(page: Page, label = "page"): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${label}`).toBeLessThanOrEqual(o.iw + 1);
}

/**
 * Collects console errors and uncaught exceptions from now on; call the returned function at the end and expect `[]`.
 * "Failed to load resource" (a mock endpoint that answers 4xx on purpose) is not a page error.
 */
export function trackConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return () => errors;
}

/** Saves a full-page screenshot to `$ADMIN_SHOTS/<name>.png` when that variable names a folder; otherwise does nothing. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.ADMIN_SHOTS ?? process.env.AI_ADMIN_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}
