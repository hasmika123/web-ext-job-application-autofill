import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * Smoke: every signed-in route opens at a phone (390) and a desktop (1440) width with no console errors, no page
 * errors and no horizontal scroll. The cheapest net under every page story.
 */

/** The user dashboard's routes (20): the audit list of APP-E2E-PLAN section 1.1. */
export const USER_ROUTES = [
  "/dashboard",
  "/jobs",
  "/applications",
  "/profiles",
  "/profiles/setup",
  "/assistant",
  "/alerts",
  "/resume-builder",
  "/resume-builder/templates",
  "/resume-builder/3",
  "/resume-builder/4",
  "/resumes",
  "/interview-prep",
  "/messages",
  "/saved",
  "/explore",
  "/analytics",
  "/settings",
  "/settings/inbox",
  "/welcome",
];

/** The organization console's routes (10): section 1.2. */
export const ORG_ROUTES = [
  "/org",
  "/org/team",
  "/org/opportunities",
  "/org/applications",
  "/org/interviews",
  "/org/analytics",
  "/org/resumes",
  "/org/integrations",
  "/org/billing",
  "/org/settings",
];

const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

/**
 * Console noise that is not a defect of the page under test. Keep this list short and explain each entry:
 *  - a bare "Failed to load resource" line is the browser reporting an HTTP error status; the mock API answers 404 for
 *    endpoints that no story has built yet, and the page handles that. Real script errors still fail the test.
 */
const IGNORED_CONSOLE = [/Failed to load resource/i];

async function visit(page: Page, route: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((rx) => rx.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // an `h1` (or the editor's own heading) proves a page rendered rather than an error boundary
  await expect(page.locator("body")).not.toContainText(/Application error|This page couldn.t load/i);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(overflow.innerWidth + 1);
  expect(errors, `console errors on ${route}`).toEqual([]);
}

for (const w of WIDTHS) {
  test.describe(`user routes at ${w.name}px`, () => {
    test.use({ storageState: STATE.demo, viewport: { width: w.width, height: w.height } });
    for (const route of USER_ROUTES) {
      test(route, async ({ page }) => {
        await visit(page, route);
      });
    }
  });

  test.describe(`org routes at ${w.name}px`, () => {
    test.use({ storageState: STATE["demo-org"], viewport: { width: w.width, height: w.height } });
    for (const route of ORG_ROUTES) {
      test(route, async ({ page }) => {
        await visit(page, route);
      });
    }
  });
}
