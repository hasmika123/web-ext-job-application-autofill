import { test, expect, narrate } from "../stories/_support/story";

/**
 * VIDEO 04: who changed what ("Updated ... by ...") on an application, seen as the admin, the consultant and the marketer (Acme Staffing).
 * Stories shown: change-audit X9.14 (organization Applications, consultant My Applications, marketer Applications) and the history list.
 * Sarah (Org Admin) changes Ben's application; Ben (consultant) and Omar (Ben's marketer) then read who changed it.
 */
const appDrawer = (p: import("@playwright/test").Page) => p.locator("#ent-application-sheet");

test("VIDEO-04 Who changed what: Updated ... by ... on an application, as admin, consultant and marketer", async ({ flow }) => {
  const f = await flow({ who: "sarah" });
  const { page } = f;
  const note = `Client asked for a Friday call ${Date.now() % 10000}`;

  await f.titleCard({
    title: "Who changed what",
    roles: "Org Admin  |  Consultant  |  Marketer",
    intro: "Every change to a job application records who made it and when. Here is how each role sees it.",
    minMs: 3500,
  });

  // ---- admin changes Ben's application
  await f.go("/w/admin/applications");
  await expect(page.locator("[data-applications-page]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Sarah is the Org Admin. She opens Applications and finds one that belongs to the consultant Ben Okafor, whose marketer is Omar.");
  await page.getByRole("searchbox", { name: "Search applications" }).fill("APP-2026-065");
  const first = page.locator("tr[data-row-id]").first();
  await expect(first).toContainText("APP-2026-065", { timeout: 30_000 });
  const code = ((await first.innerText()).match(/APP-\d{4}-\d+/) ?? [])[0] ?? "";
  await narrate(page, "The table has an Updated column: when each application last changed, and by whom.");
  await first.click();
  await expect(appDrawer(page).locator("[data-detail-body]")).toBeVisible();
  await narrate(page, "Opening one shows the same line at the top of the drawer, with the person who changed it last.");
  await narrate(page, "Sarah edits the next action. It saves by itself, with no Save button.");
  await appDrawer(page).locator("[data-edit-toggle]").click();
  const next = `Call the client back ${Date.now() % 10000}`;
  await appDrawer(page).getByRole("textbox", { name: "Next action" }).fill(next);
  await expect(appDrawer(page).locator("[data-autosave=nextAction][data-autosave-status=saved]")).toBeVisible();
  await narrate(page, "And she adds a note.");
  await appDrawer(page).getByRole("tab", { name: /^Notes/ }).click();
  await appDrawer(page).getByRole("textbox", { name: "Add a note" }).fill(note);
  await appDrawer(page).getByRole("button", { name: "Add note" }).click();
  await expect(appDrawer(page).locator("[data-note-id]").first()).toBeVisible();
  await narrate(page, "The header now says Updated just now, by you.");
  await expect(appDrawer(page).locator("[data-change-audit]").first()).toContainText(/Updated/);
  await appDrawer(page).getByRole("tab", { name: "Activity" }).click();
  await narrate(page, "The Activity tab is the full history: each change, who made it, and when. Nothing is ever rewritten.");
  await page.waitForTimeout(1800);

  // ---- the consultant sees it
  await f.switchTo("ben", "Now the same application, as Ben, the consultant.", "/w/consultant/applications");
  await expect(page.locator("[data-consultant-applications][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Ben opens My Applications. It is his own list; nobody else's.");
  const bens = page.locator("[data-application]", { hasText: /./ });
  await expect.poll(() => bens.count()).toBeGreaterThanOrEqual(1);
  // the application Sarah changed shows the new next action text in the row
  let target = page.locator("[data-application]", { hasText: next }).first();
  if ((await target.count()) === 0) target = bens.first();
  await narrate(page, "He opens the application Sarah changed.");
  await target.locator("[data-action=view]").click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-change-audit]").first()).toContainText(/Updated/);
  await narrate(page, "At the top it reads Updated, by Sarah Chen, with a tag that says she is the organization admin. He can see exactly who touched his application.");
  await detail.locator("[data-timeline]").scrollIntoViewIfNeeded().catch(() => undefined);
  await narrate(page, "The timeline below lists each change with the person who made it.");
  await page.waitForTimeout(1500);

  // ---- the marketer sees it
  await f.switchTo("omar", "Finally, Omar, the marketer who looks after Ben.", "/w/marketing/applications");
  const find = page.getByPlaceholder(/Search applications by consultant/);
  await expect(find).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Omar's Applications page has the same Updated column.");
  await find.fill(code || "APP-2026-065");
  await expect(page.getByText(code || "APP-2026-065").first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Ben's application shows that it was updated just now, by Sarah Chen. The marketer never has to ask who changed it.");
  await page.waitForTimeout(2200);
  // ---- the same for a resume (Gamma): the marketer edits for the consultant, the consultant and the admin read who changed it
  await f.switchTo("marco", "Resumes keep the same record. Marco is a marketer at Gamma Consulting, and he is improving a resume for his consultant Cora.", "/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  const resumeRow = page.locator("tbody tr", { hasText: "Cora Lindahl, Data Engineer" }).first();
  await expect(resumeRow).toBeVisible({ timeout: 30_000 });
  await resumeRow.click();
  await narrate(page, "The board shows each resume with its last modified date and who changed it. He opens the drawer and chooses Edit in the resume builder.");
  await page.locator("[data-edit-in-builder]").click();
  await page.waitForURL(/\/w\/marketing\/resumes\/\d+$/, { timeout: 60_000 });
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 45_000 });
  const headline = page.getByRole("textbox", { name: "Headline" });
  await headline.fill(`Data Engineer, pipelines and platforms ${Date.now() % 1000}`);
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await narrate(page, "He changes the headline. It saves by itself, and the header names who modified it last, and when.");

  await f.switchTo("cora", "Now Cora, the consultant who owns the resume.", "/w/consultant/resumes");
  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  const touched = page.locator("tbody tr", { hasText: "waiting for your approval" }).first();
  await expect(touched).toBeVisible({ timeout: 30_000 });
  await touched.scrollIntoViewIfNeeded();
  await narrate(page, "In My Resumes, the row says it was last modified just now by Marco, the marketer. And because a marketer wrote it, it is waiting for her approval again. Nothing a marketer writes counts until she approves it.");
  await page.waitForTimeout(1500);

  await f.switchTo("oscar", "And Oscar, the organization admin.", "/w/admin/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The organization's resume library shows the same line: last modified by Marco, the marketer. Versions inside the resume keep their own authors.");
  await page.waitForTimeout(1500);
  await narrate(page, "That is the change audit: who changed what, and when, on applications and on resumes, for the admin, the consultant and the marketer alike.", 1500);
});
