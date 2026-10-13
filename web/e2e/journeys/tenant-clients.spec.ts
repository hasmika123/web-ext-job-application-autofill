import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Clients page against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing client list (24 clients with contacts,
 * requirements, placements and notes), Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real-clients.config.ts`
 * (docs/enterprise-v2/real-stack-runbook.md) and the demo data on (`DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true`). The journey
 * writes (it adds a client, a contact, a note and a requirement, changes a status): reset the database to run it again from the seed.
 */
const port = process.env.E2E_REAL_PORT ?? "3214";
const base = `http://acme.localhost:${port}`;
const betaBase = `http://beta.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-more/built");

async function signIn(page: Page, host: string, person: string) {
  await page.goto(`${host}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${person}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const rows = (page: Page) => page.locator("tr[data-row-id]");

test.describe("clients (real stack)", () => {
  test.use({ viewport: { width: 1448, height: 1086 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signIn(page, base, "Sarah Chen");
    await page.goto(`${base}/w/admin/clients`);
    await expect(page.locator("[data-clients-page]")).toBeVisible();

    // the four tiles come from the seeded rows; the first client opens in the docked drawer
    const kpi = (k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
    await expect(kpi("totalClients")).toHaveText(/^\d+$/);
    const total0 = Number(await kpi("totalClients").innerText());
    const fresh0 = Number(await kpi("newThisMonth").innerText());
    expect(total0).toBeGreaterThanOrEqual(24);
    await expect(page.locator("[data-kpi=totalClients] [data-kpi-delta]")).toContainText("vs last month");
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator("[data-client-drawer] [data-detail-body]")).toBeVisible();
    await expect(page.locator("[data-help-bee]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "clients-list.png") });

    // filter by health through the dropdown: the address and the count follow, every row carries that badge
    await page.locator('[data-filters] button[aria-label="Health"]').click();
    await page.getByRole("option", { name: /^At Risk \(/ }).click();
    expect(page.url()).toContain("health=AT_RISK");
    const atRisk = await rows(page).count();
    expect(atRisk).toBeGreaterThan(0);
    for (let i = 0; i < atRisk; i++) await expect(rows(page).nth(i).locator("[data-health]")).toHaveAttribute("data-health", "AT_RISK");
    await page.locator("[data-clear-filters]").click();
    await expect(rows(page)).toHaveCount(10);

    // search narrows (and a shared link would reproduce it)
    await page.getByLabel("Search clients").fill("tech");
    await expect(rows(page).first()).toContainText(/tech/i);
    const filteredUrl = page.url();
    expect(filteredUrl).toContain("q=tech");

    // open a client: the drawer, its URL, its contacts and requirements
    await rows(page).first().click();
    const drawer = page.locator("[data-detail-body]");
    await expect(drawer).toBeVisible();
    expect(page.url()).toContain("client=");
    const clientId = await drawer.getAttribute("data-client-id");
    await expect(drawer.locator("[data-key-contacts] [data-contact-row]").first()).toBeVisible();
    await expect(drawer.locator("[data-health-reason]")).toContainText(/days|Nothing|prospect|inactive/i);
    await page.screenshot({ path: resolve(shots, "clients-drawer.png") });
    const fresh = await page.context().newPage();
    await fresh.goto(page.url());
    await expect(fresh.locator("[data-detail-body]")).toBeVisible();
    await expect(fresh.getByLabel("Search clients")).toHaveValue("tech");
    await fresh.close();

    // add a contact: a private mailbox is refused, a work e-mail is added and shows in the Contacts tab
    await drawer.locator("[data-add-contact]").click();
    await page.getByLabel(/^Name/).fill("Journey Contact");
    await page.getByLabel(/Work e-mail/).fill("journey.contact@gmail.com");
    await page.locator("[data-contact-submit]").click();
    await expect(page.locator("[data-contact-error]")).toContainText(/work e-mail/i);
    await page.getByLabel(/Work e-mail/).fill("journey.contact@techcorp.example.com");
    await page.locator("[data-contact-submit]").click();
    await expect(page.getByText("Journey Contact was added")).toBeVisible();
    await page.getByRole("tab", { name: /^Contacts \(/ }).click();
    await expect(page.locator("[data-contacts-tab]")).toContainText("Journey Contact");
    await page.getByRole("tab", { name: "Overview" }).click();

    // a relationship note: an explicit send
    await page.getByLabel("Add a relationship note").click();
    await page.getByLabel("New relationship note").fill("Journey note: renewal call booked.");
    await page.locator("[data-note-send]").click();
    await expect(page.getByText("Note added")).toBeVisible();
    await expect(page.locator("[data-notes]")).toContainText("Journey note: renewal call booked.");

    // status from the drawer autosaves, and Undo puts it back
    await page.locator("[data-status-menu]").click();
    await page.getByRole("menuitem", { name: "Inactive" }).click();
    await expect(page.getByText(/is now Inactive/)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(page.locator("[data-status-menu]")).toContainText("Active");

    // edit mode: a field saves by itself, no Save button
    await page.locator("[data-edit-toggle]").click();
    await page.getByLabel("Location").fill("Austin, TX");
    await page.getByLabel("Location").blur();
    await expect(page.locator("[data-save-status]")).toContainText("Saved");
    await page.locator("[data-edit-toggle]").click();
    await expect(page.locator("[data-facts]")).toContainText("Austin, TX");

    // create a requirement for this client: the Jobs dialog opens with the client chosen
    await page.locator("[data-create-requirement]").click();
    await page.getByLabel(/Job title/).fill("Journey Platform Engineer");
    await page.locator("[data-create-submit]").click();
    await expect(page.getByText("Journey Platform Engineer was created")).toBeVisible();
    await page.getByRole("tab", { name: /^Requirements \(/ }).click();
    await expect(page.locator("[data-requirements-tab]")).toContainText("Journey Platform Engineer");
    await page.getByRole("tab", { name: "Overview" }).click();

    // add a client: it opens in the drawer and the tiles move
    await page.locator("[data-clear-filters]").click();
    await page.locator("[data-add-client]").click();
    await page.getByPlaceholder("TechCorp Inc.").fill("Journey Logistics");
    await page.locator("[data-add-submit]").click();
    await expect(page.getByText("Journey Logistics was added")).toBeVisible();
    await expect(page.locator("[data-client-title]")).toHaveText("Journey Logistics");
    await expect(kpi("totalClients")).toHaveText(String(total0 + 1));
    await expect(kpi("newThisMonth")).toHaveText(String(fresh0 + 1));
    await page.screenshot({ path: resolve(shots, "clients-added.png") });
    // the same name again is refused
    await page.locator("[data-add-client]").click();
    await page.getByPlaceholder("TechCorp Inc.").fill("journey logistics");
    await page.locator("[data-add-submit]").click();
    await expect(page.locator("[data-add-error]")).toContainText(/already have a client/);
    await page.getByRole("button", { name: "Cancel" }).click();

    // the other tabs are real lists
    await page.getByRole("tab", { name: /Contacts/ }).first().click();
    await expect(page.locator("[data-contacts-view] [data-contact-row]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "clients-contacts.png") });
    await page.getByRole("tab", { name: /Requirements/ }).first().click();
    await expect(page.locator("[data-requirements-view] [data-requirement-row]").first()).toBeVisible();
    await page.getByRole("tab", { name: /Activity/ }).click();
    await expect(page.locator("[data-activity-view] [data-activity-row]").first()).toBeVisible();
    await expect(page.locator("[data-activity-view]")).toContainText("Journey Logistics");
    await page.screenshot({ path: resolve(shots, "clients-activity.png") });

    // a phone gets cards and a bottom sheet
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/w/admin/clients`);
    await expect(page.locator("[data-clients-list] ul li[data-row-id]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(shots, "clients-phone.png") });
    await page.locator("[data-clients-list] ul li[data-row-id]").first().click();
    await expect(page.locator("#ent-client-sheet")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "clients-phone-sheet.png") });
    expect(clientId).toBeTruthy();

    // the other tenant: Beta sees only its own clients, and Acme's ids are the generic 404 through either organization
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await signIn(beta, betaBase, "Bea Turner");
    await beta.goto(`${betaBase}/w/admin/clients`);
    await expect(beta.locator("[data-clients-page]")).toBeVisible();
    await expect(beta.locator("tr[data-row-id]").first()).toBeVisible();
    await expect(beta.locator("[data-clients-page]")).not.toContainText("Journey Logistics");
    const out = await beta.evaluate(async (acmeClient) => {
      const me = (await (await fetch("/api/me/tenant")).json()) as { org: { id: number } };
      const mine = (await (await fetch(`/api/orgs/${me.org.id}/clients?size=100`)).json()) as { total: number; items: { name: string }[] };
      const acmeOrg = me.org.id === 1 ? 2 : 1;
      const viaOwn = await fetch(`/api/orgs/${me.org.id}/clients/${acmeClient}`);
      const viaAcme = await fetch(`/api/orgs/${acmeOrg}/clients`);
      const write = await fetch(`/api/orgs/${acmeOrg}/clients/${acmeClient}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "hijack" }) });
      return { total: mine.total, names: mine.items.map((i) => i.name), viaOwn: viaOwn.status, viaAcme: viaAcme.status, write: write.status };
    }, clientId!);
    expect(out.total).toBeGreaterThan(0);
    expect(out.names).not.toContain("Journey Logistics");
    expect(out.viaOwn).toBe(404);
    expect(out.viaAcme).toBe(404);
    expect(out.write).toBe(404);
    await betaCtx.close();
  });
});
