import type { Page } from "@playwright/test";
import { expect } from "../_support/story";
import { PORT } from "../_support/personas";

export const ACME = `http://acme.localhost:${PORT}`;
export const BETA = `http://beta.localhost:${PORT}`;

/** The signed-in member's organization id, read from the same session call the shell uses. The page must already be on a tenant host. */
export async function orgIdOf(page: Page): Promise<number> {
  return page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
}

/** GET a same-origin path from inside the page (so the tenant session cookies ride along) and return status + text. */
export async function apiGet(page: Page, path: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { accept: "application/json" } });
    return { status: r.status, body: await r.text() };
  }, path);
}

/** "This isn't part of your role": the shell's denied state (no redirect, no data). */
export async function expectNotYourRole(page: Page) {
  await expect(page.locator("[data-not-your-role]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "This isn't part of your role" }).first()).toBeVisible();
}

/** "This page is on the way": a menu entry whose page is not built yet (never a 404). */
export async function expectOnTheWay(page: Page) {
  const soon = page.locator("[data-coming-soon]");
  await expect(soon).toBeVisible();
  // the header's subtitle ("This page is on the way.") is hidden on a phone; the empty state's own title is the exact, always-visible line
  await expect(soon.getByText("This page is on the way", { exact: true })).toBeVisible();
}

/** No horizontal page scroll at the current viewport (1px of rounding allowed). */
export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** The hrefs of every menu entry in the sidebar (desktop). */
export const navKeys = (page: Page) => page.locator("[data-shell-sidebar] [data-nav-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nav-item") ?? ""));
