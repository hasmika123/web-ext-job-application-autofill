import { expect, type Page } from "@playwright/test";

/** Calls the BFF from inside the page (its own session cookie and host; Node cannot resolve *.localhost, the browser can). */
export async function bff(page: Page, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(
    async ({ method, path, body, headers }) => {
      const res = await fetch(path, {
        method,
        headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json: json as any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- the BFF's JSON is whatever the page sends
    },
    { method, path, body, headers },
  );
}

/** The signed-in member's organization id (the API paths are /api/orgs/{id}/...). */
export async function orgIdOf(page: Page): Promise<number> {
  const r = await bff(page, "GET", "/api/me/tenant");
  expect(r.status).toBe(200);
  return r.json.org.id as number;
}

/** A unique, short suffix so a story can create rows without colliding with an earlier run. */
export const stamp = () => Date.now().toString(36).slice(-5);

/** Opens a table row's "Row actions" menu (the page scrolls smoothly and a menu closes on scroll, so retry until it is up). */
export async function openRowMenu(page: Page, row: ReturnType<Page["locator"]>, item: string | RegExp) {
  const kebab = row.getByRole("button", { name: "Row actions" });
  await kebab.scrollIntoViewIfNeeded();
  await expect(async () => {
    await page.waitForTimeout(500);
    await kebab.click();
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Opens a dropdown and clicks one option. A dropdown closes when the page scrolls (by design), and Playwright's own scroll-into-view of the
 * trigger can do exactly that, so open it again until the option is up instead of assuming the first click left it open.
 */
export async function pickOption(page: Page, trigger: ReturnType<Page["locator"]>, option: ReturnType<Page["locator"]>) {
  await expect(async () => {
    if (!(await option.isVisible().catch(() => false))) {
      await trigger.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await trigger.click();
    }
    await expect(option).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await option.click();
}

/** Waits for the tenant shell to be drawn (sidebar + main), reloading once if the first workspace call missed on a cold API. */
export async function shellReady(page: Page) {
  await expect(async () => {
    if (!(await page.locator("[data-enterprise-shell]").isVisible().catch(() => false))) await page.reload();
    await expect(page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
}

/** Opens the Invite panel's Department list and picks the first department (the list closes when the page scrolls, so retry until an option is up). */
export async function pickFirstDepartment(page: Page, panel: ReturnType<Page["locator"]>) {
  const dept = panel.getByRole("button", { name: "Department" });
  if (!(await dept.isEnabled())) return;
  const option = page.getByRole("option").first();
  await expect(async () => {
    if (!(await option.isVisible().catch(() => false))) {
      await dept.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      await dept.click();
    }
    await expect(option).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await option.click();
}
