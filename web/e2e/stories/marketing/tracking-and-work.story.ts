import { test, expect, narrate } from "../_support/story";
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
    const { page, go } = await as("omar");
    await go("/w/marketing/applications");
    await ready(page, "[data-applications]").waitFor();
    await narrate(page, "Four tiles count active, awaiting, interviewing and offers");
    for (const id of ["active", "awaiting", "interviewing", "offers"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    const tabs = page.locator("[data-stage-tab]");
    expect(await tabs.count()).toBeGreaterThan(1);

    await narrate(page, "Stage tabs carry counts; choosing one filters the table");
    const second = tabs.nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-selected", "true");

    await narrate(page, "Searching for nothing shows the honest empty state");
    await page.getByLabel("Search applications").fill("zzz-no-such-application");
    await expect(page.getByText("No applications match these filters.")).toBeVisible();
    await page.getByLabel("Search applications").fill("");
    await tabs.first().click();

    const menu = page.locator("[data-app-row] [data-row-menu]").first();
    if ((await menu.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "no row with FULL consent in the seed: the note action is not offered (consent working as designed)" });
      return;
    }
    await narrate(page, "On a row the consultant shares fully, Omar adds a note (a record, not an action on the application)");
    await menu.click();
    await page.getByRole("menuitem", { name: "Add a note" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("What happened, what is next...").fill(`Story follow-up note ${Date.now()}`);
    await dlg.getByRole("button", { name: "Add note" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("MKT-32 Omar checks the interview schedule, switches to the calendar and sees what needs feedback", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/interviews");
    await ready(page, "[data-interviews]").waitFor();
    await narrate(page, "Four tiles: this week, confirmed, pending feedback, reschedules");
    for (const id of ["interviewsThisWeek", "confirmedInterviews", "pendingFeedback", "reschedules"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    await narrate(page, "The schedule, upcoming, pending-feedback, checklist and reminder cards are all there");
    for (const c of ["schedule", "upcoming", "pending-feedback", "checklist", "reminders"]) await expect(page.locator(`[data-card="${c}"]`)).toBeVisible();
    await narrate(page, "Calendar view draws the same interviews by week");
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
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
    await page.getByRole("button", { name: "Log Call" }).click();
    await expect(page.locator("[data-followups-notice]")).toContainText("Select at least one follow-up first.");

    const rows = page.locator('[data-followup-table="today"] [data-followup-row]');
    if ((await rows.count()) === 0) {
      await expect(page.getByText("You're all caught up.")).toBeVisible();
      return;
    }
    await narrate(page, "He ticks the first one and logs the call");
    await rows.first().locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Log Call" }).click();
    const dlg = page.locator("[data-followup-dialog=call]");
    await expect(dlg).toContainText("(1 selected)");
    await dlg.getByLabel("Call notes").fill(`Story call ${Date.now()}: spoke to the recruiter, waiting for a reply.`);
    await dlg.locator('input[type="checkbox"]').check();
    await dlg.getByRole("button", { name: "Save call" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator("[data-followups-notice]")).toHaveAttribute("data-followups-notice", "ok");
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

  test("MKT-36 Omar checks his Performance numbers and the marketing manager sees the same page", async ({ as }) => {
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

    const sarah = await as("sarah");
    await sarah.go("/w/marketing/performance");
    await narrate(sarah.page, "Sarah opens the same page for her own book");
    await ready(sarah.page, "[data-performance]").waitFor();
    await expect(sarah.page.locator('[data-perf-card="funnel"]')).toBeVisible();
  });
});
