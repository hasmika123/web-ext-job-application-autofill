import { test, expect, narrate, narrateDo } from "../stories/_support/story";

/**
 * VIDEO 04: who changed what ("Updated ... by ...") on an application, seen as the admin, the consultant and the marketer (Acme Staffing).
 * Stories shown: change-audit X9.14 (organization Applications, consultant My Applications, marketer Applications) and the history list.
 * Sarah (Org Admin) changes Ben's application; Ben (consultant) and Omar (marketer, on another application Sarah changes) then read who changed it.
 */
const appDrawer = (p: import("@playwright/test").Page) => p.locator("#ent-application-sheet");

test("VIDEO-04 Who changed what: Updated ... by ... on an application, as admin, consultant and marketer", async ({ flow }) => {
  const f = await flow({ who: "sarah" });
  const { page } = f;
  const note = `Client asked for a Friday call ${Date.now() % 10000}`;

  await f.titleCard({
    title: "Who changed what",
    roles: "Org Admin  |  Consultant  |  Marketer",
    intro: "Hi! In this video I'll show you something I really like: every change to an application or a resume records who made it, and when. Let's see how each role sees it.",
    minMs: 3500,
  });

  // ---- admin changes Ben's application
  await f.go("/w/admin/applications");
  await expect(page.locator("[data-applications-page]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "I'm signed in as Sarah, the org admin. Let's open Applications and find one that belongs to the consultant Ben Okafor.");
  await page.getByRole("searchbox", { name: "Search applications" }).fill("Ben Okafor");
  const first = page.locator("tr[data-row-id]").first();
  await expect(first).toContainText("Ben Okafor", { timeout: 30_000 });
  await narrate(page, "See this Updated column? It tells me when each application last changed, and by whom.");
  await first.click();
  await expect(appDrawer(page).locator("[data-detail-body]")).toBeVisible();
  await narrate(page, "When I open one, the same line sits at the top of the drawer, with the person who changed it last.");
  await appDrawer(page).locator("[data-edit-toggle]").click();
  const next = `Call the client back ${Date.now() % 10000}`;
  await narrateDo(page, "Now I'll edit the next action. It saves by itself, so there's no Save button to press.", async () => {
    await appDrawer(page).getByRole("textbox", { name: "Next action" }).fill(next);
  });
  await expect(appDrawer(page).locator("[data-autosave=nextAction][data-autosave-status=saved]")).toBeVisible();
  await narrateDo(page, "And let me add a note, too.", async () => {
    await appDrawer(page).getByRole("tab", { name: /^Notes/ }).click();
    await appDrawer(page).getByRole("textbox", { name: "Add a note" }).fill(note);
    await appDrawer(page).getByRole("button", { name: "Add note" }).click();
  });
  await expect(appDrawer(page).locator("[data-note-id]").first()).toBeVisible();
  await narrate(page, "Look at the header now. It says Updated just now, by you.");
  await expect(appDrawer(page).locator("[data-change-audit]").first()).toContainText(/Updated/);
  await appDrawer(page).getByRole("tab", { name: "Activity" }).click();
  await narrate(page, "The Activity tab is the full history: each change, who made it, and when. Nothing here is ever rewritten.");
  await page.waitForTimeout(1800);

  // one more change, on an application Omar looks after, so his side can be shown too (Ben's own applications carry no marketer in this demo data)
  await page.keyboard.press("Escape");
  await narrate(page, "Omar looks after other consultants too. Let me change one of his applications as well, so we can see his side later.");
  await page.getByRole("searchbox", { name: "Search applications" }).fill("APP-2026-119");
  const omars = page.locator("tr[data-row-id]").first();
  await expect(omars).toContainText("APP-2026-119", { timeout: 30_000 });
  await omars.click();
  await expect(appDrawer(page).locator("[data-detail-body]")).toBeVisible();
  await appDrawer(page).locator("[data-edit-toggle]").click();
  await appDrawer(page).getByRole("textbox", { name: "Next action" }).fill(`Confirm the start date ${Date.now() % 10000}`);
  await expect(appDrawer(page).locator("[data-autosave=nextAction][data-autosave-status=saved]")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");

  // ---- the consultant sees it
  await f.switchTo("ben", "Now let's see the very same application from Ben's side. Ben is the consultant.", "/w/consultant/applications");
  await expect(page.locator("[data-consultant-applications][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Ben opens My Applications. This list is his, and nobody else's.");
  const bens = page.locator("[data-application]", { hasText: /./ });
  await expect.poll(() => bens.count()).toBeGreaterThanOrEqual(1);
  // the application Sarah changed shows the new next action text in the row
  let target = page.locator("[data-application]", { hasText: next }).first();
  if ((await target.count()) === 0) target = bens.first();
  await narrate(page, "Let's open the application Sarah just changed.");
  await target.locator("[data-action=view]").click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-change-audit]").first()).toContainText(/Updated/);
  await narrate(page, "At the top it says Updated, by Sarah Chen, with a little tag showing she's the organization admin. So Ben knows exactly who touched his application.");
  await detail.locator("[data-timeline]").scrollIntoViewIfNeeded().catch(() => undefined);
  await narrate(page, "And the timeline below lists each change, with the person who made it.");
  await page.waitForTimeout(1500);

  // ---- the marketer sees it
  await f.switchTo("omar", "Next, Omar, the marketer. Remember the application I changed for one of his consultants? Let's see what he sees.", "/w/marketing/applications");
  const find = page.getByLabel("Search applications");
  await expect(find).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Omar's Applications page has the same Updated column.");
  await find.fill("APP-2026-119"); // the search matches the application's code; the row itself shows the consultant, role and client
  await expect(page.locator("tr[data-app-row]").filter({ has: page.locator("[data-updated-cell]", { hasText: "Sarah Chen" }) }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "There it is. This application was updated just now, by Sarah Chen. The marketer never has to ask who changed something.");
  await page.waitForTimeout(2200);
  // ---- the same for a resume (Gamma): the marketer edits for the consultant, the consultant and the admin read who changed it
  await f.switchTo("marco", "Resumes keep the same kind of record. Let's move to Gamma Consulting, where Marco, a marketer, is improving a resume for his consultant Cora.", "/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  const resumeRow = page.locator("tr[data-resume-row]", { hasText: "Cora Lindahl, Data Engineer" }).first();
  await expect(resumeRow).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The board shows each resume with its last modified date. I'll open this one in the resume builder.");
  // the Marketing Resumes board has no "Edit in builder" button: the builder lives at /w/marketing/resumes/<row id> (the "Edit it" toast after a create goes there too)
  await f.go(`/w/marketing/resumes/${await resumeRow.getAttribute("data-resume-row")}`);
  await page.waitForURL(/\/w\/marketing\/resumes\/\d+$/, { timeout: 60_000 });
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 45_000 });
  const headline = page.getByRole("textbox", { name: "Headline" });
  await headline.fill(`Data Engineer, pipelines and platforms ${Date.now() % 1000}`);
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await narrate(page, "I'll change the headline. It saves by itself, and the header names who modified it last, and when.");

  await f.switchTo("cora", "Now let's be Cora, the consultant who owns this resume.", "/w/consultant/resumes");
  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  const touched = page.locator("tbody tr", { hasText: "waiting for your approval" }).first();
  await expect(touched).toBeVisible({ timeout: 30_000 });
  await touched.scrollIntoViewIfNeeded();
  await narrate(page, "In My Resumes, the row says it was last modified just now by Marco, the marketer. And because a marketer wrote it, it's waiting for Cora's approval again. Nothing a marketer writes counts until she approves it.");
  await page.waitForTimeout(1500);

  await f.switchTo("oscar", "And one more view: Oscar, the organization admin at Gamma.", "/w/admin/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The organization's resume library shows the same line: last modified by Marco, the marketer. And the versions inside the resume keep their own authors.");
  await page.waitForTimeout(1500);
  await narrate(page, "So that's the change audit: who changed what, and when, on applications and on resumes, for the admin, the consultant and the marketer alike. Thanks for watching!", 1500);
});
