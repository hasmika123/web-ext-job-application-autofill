import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, orgIdOf } from "./_helpers";

const rowsOf = (page: Page) => page.locator("tr[data-row-id]");
const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const num = async (page: Page, k: string) => Number((await kpi(page, k).innerText()).replace(/,/g, ""));
/** The bench size from the Consultants list header ("153 consultants"; there is no Total tile any more). */
const benchTotal = async (page: Page) => {
  const head = page.locator("[data-consultant-count]");
  await expect(head).toHaveText(/^[\d,]+ consultants?$/);
  return Number((await head.innerText()).replace(/[^\d]/g, ""));
};

// ---------------------------------------------------------------- consultants

test("ADM-40 Org admin browses the consultant bench, filters by availability and opens a consultant", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await narrate(page, "Sarah opens Consultants from the sidebar");
  await page.getByRole("link", { name: "Consultants", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/consultants/);
  await expect(page.locator("[data-consultants-page]")).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(10);

  await narrate(page, "The list counts the demo bench of 150+ consultants; the tiles show who is available and who is on a project");
  expect(await benchTotal(page)).toBeGreaterThanOrEqual(150);
  await expect(kpi(page, "available")).not.toHaveText("");
  expect(await num(page, "available")).toBeGreaterThan(0);
  expect(await num(page, "onProject")).toBeGreaterThan(0);

  await narrate(page, "Filter: On project only. The address carries the filter");
  await page.locator('[role=search] button[aria-label="Availability"]').click();
  await page.getByRole("option", { name: "On project", exact: true }).click();
  await expect(page).toHaveURL(/availability=ON_PROJECT/);
  await expect(rowsOf(page).first()).toBeVisible();
  const pills = await rowsOf(page).locator("[data-state-pill=consultant-availability]").allInnerTexts();
  expect(pills.length).toBeGreaterThan(0);
  expect(new Set(pills)).toEqual(new Set(["On project"]));
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/availability=/);

  await narrate(page, "Open the first consultant: tabs for Assignments, Applications and Activity");
  await rowsOf(page).first().click();
  const sheet = page.locator("#ent-consultant-sheet");
  await expect(sheet.locator("[data-detail-body]")).toBeVisible();
  await expect(page).toHaveURL(/c=\d+/);
  await expect(sheet.locator("[data-checklist] li")).toHaveCount(5);
  await expect(sheet.locator("[data-quick-actions]")).toContainText("Assign marketer");
  for (const tab of ["Assignments", "Applications", "Activity"]) {
    await sheet.getByRole("tab", { name: tab }).click();
    await expect(sheet.locator(`[data-tab-panel=${tab.toLowerCase()}]`)).toBeVisible();
  }
});

test("ADM-41 Org admin flips a consultant's availability (autosaved, with Undo) and puts it back", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/consultants");
  await expect(page.locator("[data-consultants-page]")).toBeVisible();
  await rowsOf(page).first().click();
  const sheet = page.locator("#ent-consultant-sheet");
  await expect(sheet.locator("[data-detail-body]")).toBeVisible();
  const id = await sheet.locator("[data-detail-body]").getAttribute("data-consultant-id");
  const row = page.locator(`tr[data-row-id="${id}"]`);
  const before = (await row.locator("[data-state-pill=consultant-availability]").innerText()).trim();
  const target = before === "Unavailable" ? "Available" : "Unavailable";
  await narrate(page, `Availability ${before} to ${target}`);
  await sheet.getByRole("button", { name: "Availability" }).click();
  await page.getByRole("option", { name: target, exact: true }).click();
  await expect(page.getByText(`Availability set to ${target}`)).toBeVisible();
  await expect(row.locator("[data-state-pill=consultant-availability]")).toHaveText(target);
  await narrate(page, "It survives a reload");
  await page.reload();
  await expect(page.locator(`tr[data-row-id="${id}"] [data-state-pill=consultant-availability]`)).toHaveText(target);
  await narrate(page, "And is put back to what it was");
  await page.getByRole("button", { name: "Availability" }).last().click();
  await page.getByRole("option", { name: before, exact: true }).click();
  await expect(page.getByText(`Availability set to ${before}`)).toBeVisible();
});

test("ADM-42 Org admin adds a consultant (the count moves) and deactivates them with a reason", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/consultants");
  await expect(page.locator("[data-consultants-page]")).toBeVisible();
  const total = await benchTotal(page);
  const stamp = String(Date.now() % 1_000_000);
  await narrate(page, "Add consultant");
  await page.getByRole("button", { name: /Add consultant/ }).first().click();
  const add = page.getByRole("dialog", { name: "Add consultant" });
  await add.getByLabel("Full name").fill(`Story Consultant${stamp}`);
  await add.getByLabel("Work email").fill(`story.consultant${stamp}@acme-story.example.org`);
  await add.getByLabel("Job title").fill("QA Engineer");
  await add.getByRole("button", { name: "Add consultant" }).click();
  await expect(page.getByText(`Story Consultant${stamp} was added`)).toBeVisible();
  const sheet = page.locator("#ent-consultant-sheet");
  await expect(sheet).toContainText(`Story Consultant${stamp}`);
  await expect.poll(() => benchTotal(page)).toBe(total + 1);
  await narrate(page, "Deactivate with a reason: the count returns to what it was");
  await sheet.locator("[data-quick-action=deactivate]").click();
  const off = page.getByRole("dialog", { name: /Deactivate Story Consultant/ });
  await off.getByLabel("Reason (required)").fill("Story test clean-up of the added consultant");
  await off.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText(`Story Consultant${stamp} is deactivated`)).toBeVisible();
  await expect.poll(() => benchTotal(page)).toBe(total);
});

test("ADM-43 Beta cannot read Acme's consultants and sees its own smaller bench", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/consultants");
  await expect(sarah.page.locator("[data-consultants-page]")).toBeVisible();
  const acmeOrg = await orgIdOf(sarah.page);
  const acmeList = (await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/consultants?size=3`)).json;
  const ids = (acmeList.items as { id: number }[]).map((i) => i.id);

  const { page, go } = await as("bea");
  await go(`/w/admin/consultants?c=${ids[0]}`);
  await narrate(page, "Bea opens Consultants with an Acme consultant id in the address");
  await expect(page.locator("[data-consultants-page]")).toBeVisible();
  await expect(page.locator("#ent-consultant-sheet [data-detail-body]")).toHaveCount(0);
  for (const path of ["", "/counts", "/filters", `/${ids[0]}`, `/${ids[0]}/applications`]) {
    expect((await bff(page, "GET", `/api/orgs/${acmeOrg}/consultants${path}`)).status, path || "list").toBe(404);
  }
  const own = (await bff(page, "GET", `/api/orgs/${await orgIdOf(page)}/consultants?size=100`)).json;
  expect(own.total).toBeLessThan(acmeList.total);
  expect((own.items as { id: number }[]).map((i) => i.id)).not.toContain(ids[0]);
});

// -------------------------------------------------------------------- resumes

const resumeDrawer = (page: Page) => page.locator("#ent-resume-sheet");

test("ADM-44 Org admin reviews the resume library: tabs, visibility filter, search and the preview drawer", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/resumes");
  await narrate(page, "Sarah opens Resumes");
  await expect(page.locator("[data-resumes-page]")).toBeVisible();
  await expect(page.locator("[data-range]")).toHaveText(/of \d+ resumes/);
  const total = Number((await page.locator("[data-range]").innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(50);
  await expect(rowsOf(page)).toHaveCount(10);

  await narrate(page, "Pending approval keeps only pending resumes");
  await page.getByRole("tab", { name: /^Pending approval/ }).click();
  await expect(page).toHaveURL(/tab=pending/);
  await expect(rowsOf(page).first()).toBeVisible();
  for (const r of await rowsOf(page).all()) await expect(r).toContainText("Pending");
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await expect(page).not.toHaveURL(/tab=/);

  await narrate(page, "Filter by visibility: Private");
  await page.locator('[role=search] button[aria-label="Visibility"]').click();
  await page.getByRole("option", { name: "Private" }).click();
  await expect(page).toHaveURL(/vis=PRIVATE/);
  await expect(rowsOf(page).first()).toBeVisible();
  for (const r of await rowsOf(page).all()) await expect(r).toContainText("Private");
  await page.getByRole("button", { name: "Clear filters" }).click();

  await narrate(page, "Open an approved, non-primary resume in the drawer");
  await go("/w/admin/resumes?status=APPROVED&primary=no");
  await expect(rowsOf(page).first()).toBeVisible();
  const target = rowsOf(page).first();
  const targetId = await target.getAttribute("data-row-id");
  await target.click();
  await expect(resumeDrawer(page).locator("[data-detail-body]")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`open=${targetId}`));
  await expect(resumeDrawer(page).locator("[data-resume-paper]")).toBeVisible();
  await expect(resumeDrawer(page).getByRole("button", { name: "Preview" })).toBeVisible();

  await narrate(page, "Make it primary: saved at once, Undo takes it back");
  const toggle = resumeDrawer(page).getByRole("switch", { name: "Primary resume" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(page.getByText(/is now the primary resume/)).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Undone")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("ADM-45 Adding a resume refuses an SSN in the text and starts the new resume as Pending", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/resumes");
  await expect(page.locator("[data-resumes-page]")).toBeVisible();
  await narrate(page, "Sarah opens Upload resume and picks a consultant");
  await page.locator("[data-upload-open]").click();
  const up = page.getByRole("dialog", { name: "Upload resume" });
  await up.locator('button[aria-label="Consultant"]').click();
  await page.getByRole("option").first().click();
  const name = `Story Resume ${Date.now() % 100000}`;
  await up.getByLabel("Resume name").fill(name);
  await up.getByLabel("Target role").fill("QA Engineer");
  await narrate(page, "A Social Security number in the summary is refused: Kiwiply never stores it");
  await up.getByLabel("Professional summary").fill("My SSN is 123-45-6789");
  await expect(up.getByRole("alert").first()).toContainText(/never store/i);
  await expect(up.getByRole("button", { name: "Add resume" })).toBeDisabled();
  await narrate(page, "With a clean summary the resume is added");
  await up.getByLabel("Professional summary").fill("Writes tests that find real problems.");
  await up.getByRole("button", { name: "Add resume" }).click();
  await expect(page.getByText(`${name} was added`)).toBeVisible();
  await expect(resumeDrawer(page)).toContainText(name);
  await narrate(page, "The person who prepared it cannot approve it");
  await expect(resumeDrawer(page).getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(resumeDrawer(page)).toContainText("cannot approve it");
});

test("ADM-46 Beta cannot read Acme's resumes", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/resumes");
  await expect(sarah.page.locator("[data-resumes-page]")).toBeVisible();
  const acmeOrg = await orgIdOf(sarah.page);
  const first = (await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/resumes?size=1`)).json.items[0].id as number;

  const { page, go } = await as("bea");
  await go("/w/admin/resumes");
  await narrate(page, "Bea's Resumes page shows only Beta's data");
  await expect(page.locator("[data-resumes-page]")).toBeVisible();
  for (const path of ["", "/counts", "/filters", `/${first}`, `/${first}/export`]) {
    expect((await bff(page, "GET", `/api/orgs/${acmeOrg}/resumes${path}`)).status, path || "list").toBe(404);
  }
  expect((await bff(page, "PUT", `/api/orgs/${acmeOrg}/resumes/${first}/primary`, { primary: true })).status).toBe(404);
});

// ------------------------------------------------------ marketing assignments

const card = (page: Page, name: string) => page.locator("[data-marketer]", { hasText: name });
const tableOf = (page: Page) => page.getByRole("table", { name: "Assigned consultants" });

test("ADM-47 Org admin reads the marketing workload board and drills into one marketer", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/marketing-assignments");
  await narrate(page, "Sarah opens Assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  for (const k of ["unassigned", "overloaded"]) await expect(kpi(page, k)).toHaveText(/^\d+$/);

  await narrate(page, "Marketers are listed by load, each with 'n / capacity'");
  await expect(page.locator("[data-marketer]").first()).toBeVisible();
  await expect(card(page, "Jessica Davis").locator("[data-load]")).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.locator("[data-marketers-count]")).toHaveText(/^\d+ marketers? · \d+ assigned$/);

  await narrate(page, "Pick Jessica Davis: her consultants, ten to a page, and the URL names her");
  await card(page, "Jessica Davis").getByRole("button", { name: /Show their consultants/ }).click();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("Consultants assigned to Jessica Davis");
  await expect(tableOf(page).getByRole("row")).toHaveCount(11); // header + 10
  await expect(page).toHaveURL(/[?&]m=\d+/);

  await narrate(page, "Filter by High priority; a reload keeps the view");
  await page.locator('[data-consultants-panel] [role=search] button[aria-label="Priority"]').click();
  await page.getByRole("option", { name: "High" }).click();
  await expect(page).toHaveURL(/priority=HIGH/);
  await page.reload();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("Jessica Davis");
  await page.getByRole("button", { name: "Clear filters" }).first().click();
});

test("ADM-48 Org admin assigns two unassigned consultants to a marketer and undoes it", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/marketing-assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  await expect(kpi(page, "unassigned")).toHaveText(/^\d+$/);
  await expect(page.locator("[data-marketers-count]")).toHaveText(/ assigned$/);
  const unassigned0 = await kpi(page, "unassigned").innerText();
  const assigned0 = await page.locator("[data-marketers-count]").innerText(); // "8 marketers · 141 assigned"
  const david = card(page, "David Kim");
  await david.getByRole("button", { name: /Show their consultants/ }).click();
  const load0 = await david.locator("[data-load]").innerText();
  await narrate(page, "Assign consultants to David Kim");
  await page.getByRole("button", { name: "Assign consultants" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Assign consultants to David Kim/ });
  const boxes = dlg.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(dlg.locator("[data-picked-count]")).toHaveText("2 selected");
  await dlg.getByRole("button", { name: "Assign 2 consultants" }).click();
  await expect(page.getByText("Assigned 2 consultants")).toBeVisible();
  await expect(david.locator("[data-load]")).not.toHaveText(load0);
  await narrate(page, "Undo: the counts and the load return");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Undone")).toBeVisible();
  await expect(david.locator("[data-load]")).toHaveText(load0);
  await expect(kpi(page, "unassigned")).toHaveText(unassigned0);
  await expect(page.locator("[data-marketers-count]")).toHaveText(assigned0);
});

test("ADM-49 Assigning past a marketer's capacity warns first and changes nothing; the workload report opens", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/marketing-assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  const michael = card(page, "Michael Park");
  await michael.getByRole("button", { name: /Show their consultants/ }).click();
  const load0 = await michael.locator("[data-load]").innerText();
  await narrate(page, "Michael Park is nearly full: pick two more consultants");
  await page.getByRole("button", { name: "Assign consultants" }).first().click();
  const over = page.getByRole("dialog", { name: /Assign consultants to Michael Park/ });
  const boxes = over.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(over.locator("[data-capacity-warning]")).toContainText(/would have \d+ of \d+ consultants/);
  await over.getByRole("button", { name: "Assign 2 consultants" }).click();
  await expect(over.locator("[data-over-capacity]")).toContainText("over capacity");
  await expect(over.getByRole("button", { name: "Assign anyway" })).toBeVisible();
  await narrate(page, "Cancel: nothing changed");
  await over.getByRole("button", { name: "Cancel" }).click();
  await expect(michael.locator("[data-load]")).toHaveText(load0);

  await narrate(page, "The workload report lists every marketer");
  await page.getByRole("button", { name: /View workload report/ }).click();
  await expect(page.getByRole("table", { name: "Workload by marketer" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
});

test("ADM-50 Beta sees only its own marketers; Acme's assignment board is a 404 for Beta", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/marketing-assignments");
  const acmeOrg = await orgIdOf(sarah.page);
  const { page, go } = await as("bea");
  await go("/w/admin/marketing-assignments");
  await narrate(page, "Bea opens Beta's board");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  await expect(page.locator("[data-marketer]").first()).toBeVisible();
  await expect(page.locator("[data-marketers-panel]")).not.toContainText("Jessica Davis");
  for (const path of ["/marketers", "/kpis", "/consultants", "/workload", "/filters", "/marketers/candidates"]) {
    expect((await bff(page, "GET", `/api/orgs/${acmeOrg}/marketing-assignments${path}`)).status, path).toBe(404);
  }
});
