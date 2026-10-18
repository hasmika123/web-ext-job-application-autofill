import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * Shared helpers for the CON (consultant workspace) stories. Selectors come from the real components under
 * web/src/components/ent/consultant-ws/** (each page root is `[data-consultant-<page>][data-status=ready]`).
 */

/** Page roots by sidebar slug (see consultant-pages.spec.ts for the same table). */
export const ROOTS: Record<string, string> = {
  "": "[data-consultant-home]",
  profile: "[data-consultant-profile]",
  resumes: "[data-consultant-resumes]",
  marketer: "[data-consultant-marketer]",
  "job-discovery": "[data-job-discovery]",
  matches: "[data-consultant-matches]",
  opportunities: "[data-consultant-opportunities]",
  applications: "[data-consultant-applications]",
  submissions: "[data-consultant-submissions]",
  interviews: "[data-consultant-interviews]",
  "interview-prep": "[data-consultant-interview-prep]",
  offers: "[data-consultant-offers]",
  placements: "[data-consultant-placements]",
  availability: "[data-consultant-availability]",
  tasks: "[data-consultant-tasks]",
  "activity-timeline": "[data-consultant-activity-timeline]",
  inbox: "[data-consultant-inbox]",
  features: "[data-consultant-features]",
  notifications: "[data-consultant-notifications]",
  settings: "[data-consultant-settings]",
};

/** Opens /w/consultant/<slug> and waits until the page has loaded its data (status=ready). */
export async function openPage(page: Page, go: (p: string) => Promise<void>, slug: string): Promise<Locator> {
  await go(slug ? `/w/consultant/${slug}` : "/w/consultant");
  const root = page.locator(`${ROOTS[slug]}[data-status=ready]`);
  await expect(root).toBeVisible({ timeout: 30_000 });
  return root;
}

/** The page title in the shell's top bar (PageHeader renders into it). */
export const pageTitle = (page: Page) => page.locator("[data-shell-topbar] h1, h1").first();

/** A Playwright-safe unique suffix of letters only (a digit run can look like an ID number to the PII guard). */
export function lettersStamp(): string {
  return Date.now()
    .toString()
    .slice(-8)
    .split("")
    .map((d) => "abcdefghij"[Number(d)])
    .join("");
}

/** Digits-and-letters short stamp for free text that has no PII guard concern (task names, etc.). */
export const stamp = () => Date.now().toString(36).slice(-5);

/** yyyy-mm-dd for today + n days (UTC, like the seeders). */
export function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** The kit's custom Select (`@kiwiply/ui` Select) is a button[aria-haspopup=listbox] plus a portal listbox of role=option. */
export async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  const choice = page.getByRole("option", { name: option, exact: typeof option === "string" }).first();
  // A dropdown closes when the page scrolls (by design) and Playwright's scroll-into-view of the trigger can do exactly that: open it again until the option is up.
  await expect(async () => {
    if (!(await choice.isVisible().catch(() => false))) {
      await trigger.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await trigger.click();
    }
    await expect(choice).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
}

/**
 * Removes the tasks a story created earlier and never finished (a run that failed half way leaves them behind), so a story that creates tasks
 * can run again on the same data. Only the consultant's own tasks whose name starts with `prefix`.
 */
export async function removeLeftoverTasks(page: Page, orgId: number, prefix: string) {
  for (let round = 0; round < 5; round++) {
    const r = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/tasks/list?q=${encodeURIComponent(prefix)}&sort=due&dir=asc&page=0&size=50`);
    const mine = ((r.json?.items ?? []) as { id: number; title: string }[]).filter((t) => t.title.startsWith(prefix));
    if (mine.length === 0) return;
    for (const t of mine) await bff(page, "DELETE", `/api/orgs/${orgId}/me-workspace/tasks/${t.id}`);
  }
}

/** Opens a row's kebab Menu and clicks an item. The page scrolls smoothly and a Menu closes on scroll, so retry until it is up. */
export async function menuAction(page: Page, trigger: Locator, item: string | RegExp) {
  await trigger.scrollIntoViewIfNeeded();
  await expect(async () => {
    await page.waitForTimeout(400);
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("menuitem", { name: item }).click();
}

/** Reads one stat tile's big number (`[data-stat-tile=<key>] [data-tile-value]`). The Placement/Availability/Settings pages key tiles by title. */
export async function tileValue(page: Page, key: string): Promise<string> {
  const v = page.locator(`[data-stat-tile="${key}"] [data-tile-value]`);
  await expect(v).toBeVisible();
  return (await v.innerText()).trim();
}

/** The page must not scroll sideways (390px phone check used by the existing journeys). */
export async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}

/**
 * Keeps the job-link stories off the public internet: any request to the marketer's source site (the demo seeder uses
 * https://jobs.example.com/<org-slug>/<requirementId>) is answered locally with a tiny page. Applies to popups opened by "Open job link".
 */
export async function stubJobSite(context: BrowserContext) {
  await context.route(/^https:\/\/jobs\.example\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Source job posting (stub)</title><h1>Source job posting</h1><p>Stand-in page for the marketer's source link. The consultant applies here with the Kiwiply extension.</p>" }),
  );
}

/** Calls the BFF from inside the page (the browser resolves *.localhost, Node does not). */
export async function bff(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, { method, headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json: json as any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- the BFF's JSON is whatever the page sends
    },
    { method, path, body },
  );
}

/** The signed-in member's organization id (API paths are /api/orgs/{id}/...). */
export async function orgIdOf(page: Page): Promise<number> {
  const r = await bff(page, "GET", "/api/me/tenant");
  expect(r.status).toBe(200);
  return r.json.org.id as number;
}
