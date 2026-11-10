import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, orgIdOf, pickOption } from "./_helpers";

const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const num = async (page: Page, k: string) => Number((await kpi(page, k).innerText()).replace(/,/g, ""));

// ----------------------------------------------------------------------- jobs

const jobRows = (page: Page) => page.locator("li[data-row-id]");

test("ADM-51 Org admin filters the job list, opens a job and sees its top matches", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/jobs");
  await narrate(page, "Sarah opens Jobs");
  await expect(page.locator("[data-jobs-page]")).toBeVisible();
  await expect(kpi(page, "openJobs")).toHaveText(/^\d+$/);
  const open0 = Number(await kpi(page, "openJobs").innerText());
  expect(open0).toBeGreaterThan(0);
  await expect(jobRows(page)).toHaveCount(10);

  await narrate(page, "Status filter: Open. The count follows");
  await page.locator('[data-filters] button[aria-label="Status"]').click();
  await page.getByRole("option", { name: /^Open \(/ }).click();
  await expect(page.locator("[data-showing]").first()).toHaveText(new RegExp(`of ${open0} jobs$`));
  expect(page.url()).toContain("status=OPEN");

  await narrate(page, "Search for 'react' narrows further");
  await page.getByLabel("Search jobs").fill("react");
  await expect(page.locator("[data-showing]").first()).not.toHaveText(new RegExp(`of ${open0} jobs$`));
  await expect(jobRows(page).first()).toContainText(/react/i);
  expect(page.url()).toContain("q=react");

  await narrate(page, "Open the first job: the drawer lists the best matching consultants");
  await jobRows(page).first().click();
  const drawer = page.locator("[data-detail-body]");
  await expect(drawer).toBeVisible();
  expect(page.url()).toContain("job=");
  await expect(drawer.locator("[data-top-matches] [data-match-row]").first()).toBeVisible();
});

test("ADM-52 Org admin changes a job's status from the drawer and undoes it", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/jobs?status=OPEN");
  await expect(page.locator("[data-jobs-page]")).toBeVisible();
  await jobRows(page).first().click();
  await expect(page.locator("[data-detail-body]")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await narrate(page, "Status menu: On Hold");
  await page.locator("[data-status-menu]").click();
  await page.getByRole("menuitem", { name: "On Hold" }).click();
  await expect(page.getByText("Status is now On Hold")).toBeVisible();
  await narrate(page, "Undo puts it back to Open");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Undone")).toBeVisible();
  await expect(page.locator("[data-status-menu]")).toContainText("Open");
});

test("ADM-53 Org admin creates a job for a client and it appears first in the list", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/jobs");
  await expect(page.locator("[data-jobs-page]")).toBeVisible();
  await expect(kpi(page, "newThisWeek")).toHaveText(/^\d+$/);
  const fresh0 = await num(page, "newThisWeek");
  const title = `Story Platform Engineer ${Date.now() % 100000}`;
  await narrate(page, "Create job: a title and a client");
  await page.getByRole("button", { name: /Create job/ }).click();
  await page.getByLabel(/Job title/).fill(title);
  await page.locator("[data-create-form] button").first().click();
  await page.getByRole("option", { name: "TechCorp" }).click();
  await page.locator("[data-create-submit]").click();
  await expect(page.getByText(`${title} was created`)).toBeVisible();
  await expect(jobRows(page).first()).toContainText(title);
  await expect(kpi(page, "newThisWeek")).toHaveText(String(fresh0 + 1));
});

// --------------------------------------------------------------- applications

const appDrawer = (page: Page) => page.locator("#ent-application-sheet");

test("ADM-54 Org admin filters applications by stage and finds the empty state when nothing matches", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/applications");
  await narrate(page, "Sarah opens Applications");
  await expect(page.locator("[data-applications-page]")).toBeVisible();
  await expect(kpi(page, "total")).not.toHaveText("");
  const total = await num(page, "total");
  expect(total).toBeGreaterThanOrEqual(100);
  await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
  await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")} applications`);

  await narrate(page, "Stage: Interviewing. The table, pager and tile agree");
  await page.locator('[role=search] button[aria-label="Stage"]').click();
  await page.getByRole("option", { name: "Interviewing" }).click();
  await expect(page).toHaveURL(/stage=INTERVIEWING/);
  const interviewing = await num(page, "interviewing");
  await expect(page.locator("[data-showing]")).toContainText(`of ${interviewing}`);
  for (const s of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")))) expect(s).toBe("INTERVIEWING");

  await narrate(page, "A search that matches nothing says so honestly");
  await page.getByRole("searchbox", { name: "Search applications" }).fill("zzzz-nobody");
  await expect(page.getByText("No applications match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
});

test("ADM-55 Org admin records an application move, undoes it, edits the next action and adds a note", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/applications?stage=ASSIGNED");
  await expect(page.locator("[data-applications-page]")).toBeVisible();
  const row = page.locator("tr[data-row-id]").first();
  await expect(row).toHaveAttribute("data-stage", "ASSIGNED");
  const id = await row.getAttribute("data-row-id");
  await narrate(page, "Open an application still in Assigned");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`app=${id}`));
  await expect(appDrawer(page).locator("[data-detail-body]")).toBeVisible();
  await expect(appDrawer(page).locator("[data-step=ASSIGNED][data-step-state=CURRENT]")).toBeVisible();
  await expect(appDrawer(page).locator("[data-field=code]")).toContainText(/APP-\d{4}-\d+/);

  await narrate(page, "Record as Submitted: a record of what the consultant did, then Undo");
  await appDrawer(page).locator("[data-move-trigger]").click();
  await page.getByRole("menuitem", { name: "Record as Submitted" }).click();
  const undo = page.getByRole("button", { name: "Undo" }).last();
  await expect(undo).toBeVisible();
  await expect(page.getByText(/recorded as Submitted/)).toBeVisible();
  await undo.click();
  await expect(page.getByText("Undone", { exact: true })).toBeVisible();
  await expect(appDrawer(page).locator("[data-step=ASSIGNED][data-step-state=CURRENT]")).toBeVisible();

  await narrate(page, "Edit the next action: autosaved, no Save button");
  await appDrawer(page).locator("[data-edit-toggle]").click();
  await appDrawer(page).getByRole("textbox", { name: "Next action" }).fill(`Call the client ${Date.now() % 100000}`);
  await expect(appDrawer(page).locator("[data-autosave=nextAction][data-autosave-status=saved]")).toBeVisible();
  await expect(appDrawer(page).getByRole("button", { name: /^Save/ })).toHaveCount(0);

  await narrate(page, "Add a note; the Activity tab records it");
  await appDrawer(page).getByRole("tab", { name: /^Notes/ }).click();
  const before = await appDrawer(page).locator("[data-note-id]").count();
  await appDrawer(page).getByRole("textbox", { name: "Add a note" }).fill("Client prefers a Friday call");
  await appDrawer(page).getByRole("button", { name: "Add note" }).click();
  await expect(appDrawer(page).locator("[data-note-id]")).toHaveCount(before + 1);
  await appDrawer(page).getByRole("tab", { name: "Activity" }).click();
  await expect(appDrawer(page)).toContainText("Note added");
});

test("ADM-56 Org admin switches Applications to the pipeline board and the analytics funnel", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/applications");
  await expect(page.locator("[data-applications-page]")).toBeVisible();
  await narrate(page, "Pipeline: six stage columns");
  await page.getByRole("tab", { name: "Pipeline", exact: true }).click();
  await expect(page.locator("[data-kanban-column]")).toHaveCount(6);
  await expect(page.locator("[data-kanban-column=OFFER] [data-card-id]").first()).toBeVisible();
  await narrate(page, "Analytics: the funnel down to Hired");
  await page.getByRole("tab", { name: /Analytics/ }).click();
  await expect(page.locator("[data-analytics-tab]")).toBeVisible();
  await expect(page.locator("[data-analytics=funnel]")).toContainText("Hired");
});

// ------------------------------------------------------------------ interviews

/** The interview's detail drawer: docked beside the table from 1680 px, a side dialog below that (at 1440 the docked column squeezed the table: intended). */
const dock = (page: Page) => page.locator("[data-drawer-dock], [role=dialog]:has([data-detail-body])");

test("ADM-57 Org admin filters interviews, records a status with Undo, and reschedules one", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/interviews");
  await narrate(page, "Sarah opens Interviews");
  await expect(page.locator("[data-interviews-page]").first()).toBeVisible({ timeout: 60_000 });
  await expect(kpi(page, "total")).not.toHaveText("");
  const total = await num(page, "total");
  expect(total).toBeGreaterThanOrEqual(50);
  await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
  await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")} interviews`);

  await narrate(page, "Status filter: Completed");
  await page.locator('[role=search] button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "Completed" }).click();
  await expect(page).toHaveURL(/status=COMPLETED/);
  await expect(page.locator("[data-showing]")).toContainText(`of ${await num(page, "completed")}`);
  // The toolbar has no "Clear filters" button (that one belongs to the empty state); the filter is cleared by choosing "All statuses".
  await page.locator('[role=search] button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "All statuses" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")} interviews`);

  await narrate(page, "Open a Scheduled interview and record it as In Progress, then Undo");
  await page.locator('[role=search] button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "Scheduled" }).click();
  const row = page.locator("tr[data-row-id]").first();
  await expect(row).toHaveAttribute("data-status", "SCHEDULED");
  const id = await row.getAttribute("data-row-id");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`iv=${id}`));
  await expect(dock(page).locator(`[data-interview-id="${id}"]`)).toBeVisible();
  await pickOption(page, dock(page).locator("[data-status-trigger]"), page.getByRole("menuitem", { name: "Record as In Progress" })); // a menu closes when the page scrolls
  await expect(page.getByText(/recorded as In Progress/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Undone", { exact: true })).toBeVisible();

  await narrate(page, "Reschedule through the dialog; the Timeline remembers");
  await dock(page).locator('[data-action="reschedule"]').click();
  const dialog = page.locator("[role=dialog]:has([data-reschedule-dialog])");
  await expect(dialog.locator("[data-reschedule-dialog]")).toBeVisible();
  await dialog.locator('input[type="time"]').fill("16:30");
  await dialog.locator("[data-reschedule-submit]").click();
  await expect(page.getByText(/is recorded for a new time|Rescheduled/).first()).toBeVisible();
  await dock(page).getByRole("tab", { name: "Timeline" }).click();
  await expect(dock(page)).toContainText("Rescheduled");
});

test("ADM-58 Org admin sees interviews as a calendar, a pipeline and analytics", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/interviews");
  await expect(page.locator("[data-interviews-page]").first()).toBeVisible({ timeout: 60_000 });
  await narrate(page, "Calendar");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page.locator("[data-calendar]")).toBeVisible();
  await expect(page.locator("[data-calendar-chip]").first()).toBeVisible();
  await narrate(page, "Pipeline: four columns");
  await page.getByRole("tab", { name: "Pipeline", exact: true }).click();
  await expect(page.locator("[data-kanban-column]")).toHaveCount(4);
  await narrate(page, "Analytics");
  await page.getByRole("tab", { name: /Analytics/ }).click();
  await expect(page.locator("[data-analytics-tab]")).toBeVisible();
});

// --------------------------------------------------------------------- clients

const clientRows = (page: Page) => page.locator("tr[data-row-id]");

test("ADM-59 Org admin filters clients by health and opens a client with its contacts", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/clients");
  await narrate(page, "Sarah opens Clients");
  await expect(page.locator("[data-clients-page]")).toBeVisible();
  await expect(kpi(page, "totalClients")).toHaveText(/^\d+$/);
  expect(await num(page, "totalClients")).toBeGreaterThanOrEqual(24);
  await expect(clientRows(page)).toHaveCount(10);

  await narrate(page, "Health: At Risk. Every row carries that badge");
  await page.locator('[data-filters] button[aria-label="Health"]').click();
  await page.getByRole("option", { name: /^At Risk \(/ }).click();
  expect(page.url()).toContain("health=AT_RISK");
  await expect(clientRows(page).first().locator("[data-health]")).toHaveAttribute("data-health", "AT_RISK");
  await expect(clientRows(page).locator("[data-health=HEALTHY]")).toHaveCount(0);
  await page.locator("[data-clear-filters]").click();

  await narrate(page, "Search 'tech' and open the first client");
  await page.getByLabel("Search clients").fill("tech");
  await expect(clientRows(page).first()).toContainText(/tech/i);
  await clientRows(page).first().click();
  const drawer = page.locator("[data-detail-body]");
  await expect(drawer).toBeVisible();
  expect(page.url()).toContain("client=");
  await expect(drawer.locator("[data-key-contacts] [data-contact-row]").first()).toBeVisible();
  await expect(drawer.locator("[data-health-reason]")).toContainText(/days|Nothing|prospect|inactive/i);
});

test("ADM-60 Org admin adds a client, a duplicate name is refused, and a private mailbox is not accepted as a contact", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/clients");
  await expect(page.locator("[data-clients-page]")).toBeVisible();
  await expect(kpi(page, "totalClients")).toHaveText(/^\d+$/);
  const total0 = await num(page, "totalClients");
  const name = `Story Logistics ${Date.now() % 100000}`;
  await narrate(page, "Add client");
  await page.locator("[data-add-client]").click();
  await page.getByPlaceholder("TechCorp Inc.").fill(name);
  await page.locator("[data-add-submit]").click();
  await expect(page.getByText(`${name} was added`)).toBeVisible();
  await expect(page.locator("[data-client-title]")).toHaveText(name);
  await expect(kpi(page, "totalClients")).toHaveText(String(total0 + 1));

  await narrate(page, "The same name again is refused");
  await page.locator("[data-add-client]").click();
  await page.getByPlaceholder("TechCorp Inc.").fill(name.toLowerCase());
  await page.locator("[data-add-submit]").click();
  await expect(page.locator("[data-add-error]")).toContainText(/already have a client/);
  await page.getByRole("button", { name: "Cancel" }).click();

  await narrate(page, "A contact must use a work e-mail: a gmail.com address is refused");
  await page.locator("[data-add-contact]").click();
  await page.getByLabel(/^Name/).fill("Story Contact");
  await page.getByLabel(/Work e-mail/).fill("story.contact@gmail.com");
  await page.locator("[data-contact-submit]").click();
  await expect(page.locator("[data-contact-error]")).toContainText(/work e-mail/i);
  await page.getByLabel(/Work e-mail/).fill("story.contact@logistics-story.example.com");
  await page.locator("[data-contact-submit]").click();
  await expect(page.getByText("Story Contact was added")).toBeVisible();
});

// ------------------------------------------------------------------ placements

test("ADM-61 Org admin reviews placements by tab, filters ending-soon and sorts by bill rate", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/placements");
  await narrate(page, "Sarah opens Placements");
  await expect(page.locator("[data-placements-page]")).toBeVisible();
  await expect(kpi(page, "active")).not.toHaveText("");
  const active = await num(page, "active");
  expect(active).toBeGreaterThanOrEqual(50);
  await expect(page.getByRole("tab", { name: `Active (${active})` })).toBeVisible();
  await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
  await expect(page.locator("[data-showing-top]")).toContainText(`of ${active.toLocaleString("en-US")} active placements`);

  await narrate(page, "Upcoming and Completed tabs list their own rows");
  for (const [tab, status] of [["Upcoming", "UPCOMING"], ["Completed", "ENDED"]] as const) {
    await page.getByRole("tab", { name: new RegExp(`^${tab} \\(`) }).click();
    await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
    for (const s of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))) expect(s).toBe(status);
  }
  await page.getByRole("tab", { name: /^Active \(/ }).click();

  await narrate(page, "Status filter: Ending soon");
  await page.locator('button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "Ending soon" }).click();
  await expect(page).toHaveURL(/status=ENDING_SOON/);
  await expect(page.locator("[data-showing-top]")).toContainText(`of ${await num(page, "endingSoon")} active placements`);
  await page.locator('button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "All statuses" }).click();

  await narrate(page, "Sort by bill rate, high to low");
  await page.locator('button[aria-label="Sort by"]').click();
  await page.getByRole("option", { name: "Bill Rate (High to Low)" }).click();
  await expect(page).toHaveURL(/sort=rate%2Cdesc/);
  const rates = await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => Number(/\$([\d,.]+)\//.exec(e.textContent ?? "")?.[1]?.replace(/,/g, "") ?? "0")));
  expect(rates).toEqual([...rates].sort((a, b) => b - a));
});

test("ADM-62 Org admin requests a placement extension and undoes it", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/placements");
  await expect(page.locator("[data-placements-page]")).toBeVisible();
  const drawer = page.locator("[data-docked-drawer] [data-detail-body]");
  // The board lists the placements that end soonest first, so the first page holds none that is quiet: ask the same list for one with nothing to do.
  const orgId = await orgIdOf(page);
  const list = (await bff(page, "GET", `/api/orgs/${orgId}/placements?tab=active&size=100`)).json;
  const quiet = (list.items as { id: number; nextAction: { kind: string } }[]).find((p) => p.nextAction.kind === "NONE");
  expect(quiet, "an active placement with nothing to do").toBeTruthy();
  await narrate(page, "Open a placement with nothing to do");
  await go(`/w/admin/placements?pl=${quiet!.id}`);
  await expect(page.locator("[data-placements-page]")).toBeVisible();
  await expect(drawer.locator("[data-field=end]")).toBeVisible();
  const endText = await drawer.locator("[data-field=end]").innerText();
  const m = /([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(endText);
  expect(m, `an end date in "${endText}"`).toBeTruthy();
  const later = new Date(new Date(`${m![1]} UTC`).getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  await narrate(page, "Request an extension 30 days later");
  await drawer.locator("[data-request-extension]").click();
  const dialog = page.locator("[data-extension-dialog=request]");
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-extension-submit]")).toBeDisabled();
  await dialog.getByLabel("Requested end date").fill(later);
  await page.locator("[data-extension-submit]").click();
  await expect(page.getByText("Extension requested", { exact: true }).first()).toBeVisible();
  await expect(drawer.locator("[data-extension-status]")).toContainText("An extension to");
  await narrate(page, "Undo takes the request back");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Undone", { exact: true })).toBeVisible();
  await expect(drawer.locator("[data-extension-status]")).toContainText("No extension requested yet");
});

// ----------------------------------------------------------------- isolation

test("ADM-63 Beta's owner cannot read Acme's jobs, applications, interviews, clients or placements", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/jobs");
  const acmeOrg = await orgIdOf(sarah.page);
  const ids: Record<string, number> = {};
  for (const m of ["jobs", "applications", "interviews", "clients", "placements"]) {
    const r = await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/${m}?size=1`);
    expect(r.status, m).toBe(200);
    ids[m] = r.json.items[0].id;
  }

  const { page, go } = await as("bea");
  const betaOrg = await (async () => {
    await go("/w/admin/jobs");
    await expect(page.locator("[data-jobs-page]")).toBeVisible();
    return orgIdOf(page);
  })();
  for (const m of Object.keys(ids)) {
    await narrate(page, `Beta asks for Acme's ${m}`, 500);
    expect((await bff(page, "GET", `/api/orgs/${acmeOrg}/${m}`)).status, `${m} list`).toBe(404);
    expect((await bff(page, "GET", `/api/orgs/${betaOrg}/${m}/${ids[m]}`)).status, `${m} acme id in beta org`).toBe(404);
    const own = await bff(page, "GET", `/api/orgs/${betaOrg}/${m}?size=1`);
    expect(own.status, `${m} own`).toBe(200);
    expect(own.json.total, `${m} own is smaller`).toBeLessThan((await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/${m}?size=1`)).json.total);
  }
  expect((await bff(page, "POST", `/api/orgs/${acmeOrg}/jobs/bulk/status`, { ids: [ids.jobs], status: "CLOSED" }, { "idempotency-key": "story-adm-63" })).status).toBe(404);
});
