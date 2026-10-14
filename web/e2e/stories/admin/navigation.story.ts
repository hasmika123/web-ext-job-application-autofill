import { test, expect, narrate } from "../_support/story";
import { shellReady } from "./_helpers";

/** Admin menu slugs whose page exists as its own route (components/ent/**). Everything else in the menu renders "This page is on the way". */
const BUILT = ["", "employees", "invitations", "teams", "departments", "roles", "consultants", "resumes", "marketing-assignments", "jobs", "applications", "interviews", "clients", "placements", "branding"];

test("ADM-05 Org admin walks the Administration menu: built pages open, unbuilt ones say 'on the way'", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await shellReady(page);
  await narrate(page, "Sarah reads her Administration menu");
  const links = page.locator("[data-shell-sidebar] a[data-nav-item]");
  await expect(links.first()).toBeVisible();
  const all = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  const hrefs = [...new Set(all.filter((h) => h.startsWith("/w/admin")).map((h) => h.split("#")[0].split("?")[0]))];
  expect(hrefs.length).toBeGreaterThan(10);
  expect(hrefs).toContain("/w/admin/employees");
  expect(hrefs).toContain("/w/admin/roles");

  const origin = new URL(page.url()).origin;
  const onTheWay: string[] = [];
  for (const href of hrefs) {
    const slug = href.replace(/^\/w\/admin\/?/, "");
    await narrate(page, `Opening ${href}`, 400);
    const res = await page.goto(`${origin}${href}`);
    expect(res?.status(), href).toBe(200); // the sidebar never leads to a 404
    if (BUILT.includes(slug)) {
      await expect(page.locator("[data-coming-soon]"), `${href} is built`).toHaveCount(0);
    } else {
      await expect(page.locator("[data-coming-soon]"), href).toBeVisible();
      onTheWay.push(href);
    }
  }
  await narrate(page, `Pages still on the way: ${onTheWay.length}`);
  // Subscription, licenses, billing, usage, HR, Finance, reports, domains, integrations, audit and settings are not built yet.
  expect(onTheWay.length).toBeLessThanOrEqual(11);
});

test("ADM-06 Org admin opens an unbuilt menu page and sees the honest 'on the way' state", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await shellReady(page);
  const target = page.locator('[data-shell-sidebar] a[data-nav-item][href^="/w/admin/audit"], [data-shell-sidebar] a[data-nav-item][href^="/w/admin/reports"], [data-shell-sidebar] a[data-nav-item][href^="/w/admin/settings"]').first();
  test.skip((await target.count()) === 0, "Audit/Reports/Settings are not in this member's menu");
  const label = ((await target.innerText()) || "").trim();
  await narrate(page, `Sarah clicks ${label} in the sidebar`);
  await target.click();
  await expect(page.locator("[data-coming-soon]")).toBeVisible();
  await expect(page.getByText("This page is on the way").first()).toBeVisible();
  await narrate(page, "No fake data, no 404: the page says it is not ready");
});

test("ADM-07 A consultant and a marketing specialist are told Administration is not part of their role", async ({ as }) => {
  for (const who of ["anika", "omar"] as const) {
    const { page, go } = await as(who);
    for (const path of ["/w/admin", "/w/admin/roles", "/w/admin/employees"]) {
      await go(path);
      await narrate(page, `${who} types ${path} into the address bar`, 500);
      await expect(page.locator("[data-not-your-role]").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("This isn't part of your role").first()).toBeVisible();
      await expect(page.locator("[data-employees-page], [data-roles-page], [data-dashboard]")).toHaveCount(0);
    }
  }
});
