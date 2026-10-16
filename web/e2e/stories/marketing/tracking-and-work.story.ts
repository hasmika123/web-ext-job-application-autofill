import { test, expect, narrate } from "../_support/story";
import { pickOption } from "../admin/_helpers";
import { ready, tileValue } from "./_mkt";

/** Submissions, Applications, Interviews, Follow-ups, Tasks, Activity and Performance: the marketer's record-keeping pages. E1: every write here RECORDS; none submits for a consultant. */

test.describe("MKT submissions, applications, interviews", () => {
  test("MKT-30 Omar prepares a draft submission package and nothing is sent to a client", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/submissions");
    await ready(page, "[data-submissions-page]").waitFor();
    await narrate(page, "Four tiles: pending approvals, submitted today, under client review, rejected");
    for (const id of ["pendingApprovals", "submittedToday", "underClientReview", "rejected"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    const before = await page.locator("[data-submission-row]").count();

    await narrate(page, "New Submission opens a dialog that says it only creates a draft");
    await page.getByRole("button", { name: /New Submission/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("nothing is sent to the client");
    await dialog.getByRole("button", { name: "Consultant" }).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Job" }).click();
    await page.getByRole("option").first().click();
    const note = `Story note ${Date.now()}`;
    await dialog.getByLabel("Note").fill(note);
    await dialog.getByRole("button", { name: "Create draft" }).click();

    await narrate(page, "The draft is recorded; the row's actions are Send for approval or Withdraw, never Submit");
    await expect(page.getByText(/Draft prepared for/).first()).toBeVisible();
    await expect.poll(() => page.locator("[data-submission-row]").count()).toBeGreaterThanOrEqual(before);
    const menuButtons = page.getByRole("button", { name: /^Actions for / });
    await menuButtons.first().click();
    const entries = (await page.getByRole("menuitem").allInnerTexts()).join("|");
    expect(entries).not.toMatch(/submit to client|send to client|apply/i);
  });

  test("MKT-31 Omar filters the Applications tracker by stage and records a note", async ({ as }) => {
    // Applications is the shared organization page, scoped to Omar's consultants (tiles [data-kpi=...], rows tr[data-row-id], the drawer #ent-application-sheet).
    const { page, go } = await as("omar");
    await go("/w/marketing/applications");
    await expect(page.locator("[data-applications-page]")).toBeVisible({ timeout: 45_000 });
    await narrate(page, "Four tiles count all applications, those in review, interviewing and offers");
    for (const k of ["total", "inReview", "interviewing", "offers"]) await expect(page.locator(`[data-kpi-tiles] [data-kpi=${k}]`)).toBeVisible();
    const rows = page.locator("tr[data-row-id]");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "Choosing a Stage filters the table");
    await pickOption(page, page.locator('[role=search] button[aria-label="Stage"]'), page.getByRole("option", { name: "Interviewing" }));
    await expect(page).toHaveURL(/stage=INTERVIEWING/);
    await expect(rows.first()).toBeVisible();
    for (const s of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")))) expect(s).toBe("INTERVIEWING");

    await narrate(page, "Searching for nothing shows the honest empty state");
    await page.getByRole("searchbox", { name: "Search applications" }).fill("zzz-no-such-application");
    await expect(page.getByText("No applications match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(rows.first()).toBeVisible();

    await narrate(page, "He opens an application and adds a note: a record, not an action on the application");
    await rows.first().click();
    const drawer = page.locator("#ent-application-sheet");
    await expect(drawer.locator("[data-detail-body]")).toBeVisible();
    await drawer.getByRole("tab", { name: /^Notes/ }).click();
    const before = await drawer.locator("[data-note-id]").count();
    await drawer.getByRole("textbox", { name: "Add a note" }).fill(`Story follow-up note ${Date.now()}`);
    await drawer.getByRole("button", { name: "Add note" }).click();
    await expect(drawer.locator("[data-note-id]")).toHaveCount(before + 1);
  });

  test("MKT-32 Omar checks the interview schedule, switches to the calendar and sees what needs feedback", async ({ as }) => {
    // Interviews is the shared organization page, scoped to Omar's consultants.
    const { page, go } = await as("omar");
    await go("/w/marketing/interviews");
    await expect(page.locator("[data-interviews-page]")).toBeVisible({ timeout: 45_000 });
    await narrate(page, "Four tiles: all interviews, scheduled this week, in progress, completed");
    for (const k of ["total", "scheduledThisWeek", "inProgress", "completed"]) await expect(page.locator(`[data-kpi-tiles] [data-kpi=${k}]`)).toBeVisible();
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
    await narrate(page, "Calendar View draws the same interviews by week");
    await page.getByRole("tab", { name: /Calendar View/ }).click();
    await expect(page.locator("[data-calendar]")).toBeVisible();
    await narrate(page, "Pipeline groups them by status, and Analytics counts them");
    await page.getByRole("tab", { name: /Pipeline/ }).click();
    await expect(page.locator("[data-kanban-column]")).toHaveCount(4);
    await page.getByRole("tab", { name: /Analytics/ }).click();
    await expect(page.locator("[data-analytics-tab]")).toBeVisible();
    await page.getByRole("tab", { name: /All Interviews/ }).click();
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
  });
});

test.describe("MKT follow-ups, tasks, activity, performance", () => {
  test("MKT-33 Omar logs a call against today's follow-ups", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/followups");
    await ready(page, "[data-followups-page]").waitFor();
    await narrate(page, "Due today, overdue, completed today and waiting: four tiles");
    for (const id of ["dueToday", "overdue", "completedToday", "waiting"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    await expect(page.locator('[data-followups-card="today"]')).toBeVisible();
    await expect(page.locator('[data-followups-card="overdue"]')).toBeVisible();
    await expect(page.locator('[data-followups-card="upcoming"]')).toBeVisible();

    await narrate(page, "Pressing Log Call with nothing selected explains what to do");
    await page.getByRole("button", { name: "Log Call" }).first().click(); // the toolbar's button; the Quick Actions card has one too
    await expect(page.locator("[data-followups-notice]")).toContainText("Select at least one follow-up first.");

    const rows = page.locator('[data-followup-table="today"] [data-followup-row]');
    if ((await rows.count()) === 0) {
      await expect(page.getByText("You're all caught up.")).toBeVisible();
      return;
    }
    await narrate(page, "He ticks the first one and logs the call");
    await rows.first().locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Log Call" }).first().click();
    const dlg = page.locator("[data-followup-dialog=call]");
    await expect(dlg).toContainText("(1 selected)");
    await dlg.getByLabel("Call notes").fill(`Story call ${Date.now()}: spoke to the recruiter, waiting for a reply.`);
    await dlg.locator('input[type="checkbox"]').check();
    await dlg.getByRole("button", { name: "Save call" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator("[data-followups-notice]")).toHaveClass(/v2-green/); // the success tone (the warning tone is amber); the attribute no longer carries the tone
    await expect(page.locator("[data-followups-notice]")).toContainText(/call/i);
  });

  test("MKT-34 Omar adds a task, finds it under My Tasks, completes it and finds it under Completed", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/tasks");
    await ready(page, "[data-tasks-page]").waitFor();
    await narrate(page, "Four tiles and six tabs describe his workload");
    await expect(page.locator("[data-tasks-tiles] [data-stat-tile]")).toHaveCount(4);
    await expect(page.locator("[data-task-tab]")).toHaveCount(6);

    const title = `Story task ${Date.now()}`;
    await narrate(page, "Add Task: a title, a type and a due date");
    await page.getByRole("button", { name: "Add Task" }).first().click();
    const dlg = page.locator("[data-task-dialog]");
    await expect(dlg).toContainText("Saving it only records it: nothing is emailed and nothing is submitted for a consultant.");
    await dlg.getByLabel("Task title").fill(title);
    await dlg.getByRole("button", { name: "Add Task" }).click();
    await expect(dlg).toHaveCount(0);

    await narrate(page, "It shows up under My Tasks");
    await page.locator('[data-task-tab="MY"]').click();
    const row = page.locator("[data-task-row]").filter({ hasText: title });
    await expect(row).toHaveCount(1);

    await narrate(page, "Mark complete moves it to Completed");
    await row.getByRole("button", { name: `More for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Mark complete" }).click();
    await page.locator('[data-task-tab="COMPLETED"]').click();
    await expect(page.locator("[data-task-row]").filter({ hasText: title })).toHaveCount(1);
  });

  test("MKT-35 Omar logs an activity for Ben and sees it in the feed", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/activity");
    await ready(page, "[data-activity-page]").waitFor();
    await narrate(page, "Five tiles and a filter row sit above the feed");
    await expect(page.locator("[data-activity-tiles] [data-stat-tile]")).toHaveCount(5);
    await expect(page.locator("[data-activity-filters]")).toBeVisible();
    await expect(page.locator('[data-activity-card="feed"]')).toBeVisible();

    const title = `Story call with recruiter ${Date.now()}`;
    await narrate(page, "Log Activity records work done for a consultant; it sends nothing");
    await page.getByRole("button", { name: /Log Activity/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText("nothing is sent to the client or the consultant, and nothing is submitted");
    await dlg.getByRole("button", { name: "Consultant" }).click();
    await page.getByRole("option", { name: "Ben Okafor" }).click();
    await dlg.getByLabel("Title").fill(title);
    await dlg.getByRole("button", { name: "Log activity" }).click();
    await expect(page.locator("[data-activity-notice]")).toContainText("Activity logged. Nothing was sent to anyone.");
    await expect(page.locator('[data-activity-card="feed"]')).toContainText(title);
  });

  test("MKT-36 Omar checks his Performance numbers (the marketing manager's view is MKT-36b)", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/performance");
    await ready(page, "[data-performance]").waitFor();
    await narrate(page, "Six tiles measure assigned consultants, submissions, rates, placements and follow-up completion");
    for (const t of ["Assigned Consultants", "Active Submissions", "Interview Rate", "Offer Rate", "Placements This Month", "Follow-up Completion"]) {
      await expect(page.locator("[data-perf-tiles]").getByText(t, { exact: true }).first()).toBeVisible();
    }
    await narrate(page, "Charts and the funnel are drawn from real rows, or say there are no numbers yet");
    for (const c of ["weekly", "trend", "funnel", "readiness"]) await expect(page.locator(`[data-perf-card="${c}"]`)).toBeVisible();
    const assigned = await tileValue(page, "assignedConsultants");
    expect(assigned).toBeGreaterThan(0);

  });

  test("MKT-36b The marketing manager sees the same Performance page for her own book", async ({ as }) => {
    // BLOCKED: Sarah's Marketing Manager workspace (/w/marketing-mgmt) is a placeholder and /w/marketing is refused to her, so there is no page to open yet.
    test.fixme(true, "Marketing manager workspace (/w/marketing-mgmt) is not built: Sarah has no Performance page of her own");
    const sarah = await as("sarah");
    await sarah.go("/w/marketing/performance");
    await narrate(sarah.page, "Sarah opens the same page for her own book");
    await ready(sarah.page, "[data-performance]").waitFor();
    await expect(sarah.page.locator('[data-perf-card="funnel"]')).toBeVisible();
  });
});
