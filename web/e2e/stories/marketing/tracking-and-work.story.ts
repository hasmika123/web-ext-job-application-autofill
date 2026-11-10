import { test, expect, narrate } from "../_support/story";
import { pickOption } from "../admin/_helpers";
import { ready, tileValue } from "./_mkt";

/** Submissions, Applications, Interviews, Tasks (Tasks and Follow-ups tabs), Activity and Performance: the marketer's record-keeping pages. E1: every write here RECORDS; none submits for a consultant. */

test.describe("MKT submissions, applications, interviews", () => {
  test("MKT-30 Omar prepares a draft submission package and nothing is sent to a client", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/submissions");
    await ready(page, "[data-submissions-page]").waitFor();
    await narrate(page, "Three status chips: awaiting approval, under client review, rejected");
    for (const id of ["AWAITING_APPROVAL", "CLIENT_REVIEW", "REJECTED"]) await expect(page.locator(`[data-submissions-chip="${id}"]`)).toBeVisible();
    const before = await page.locator("[data-submission-row]").count();

    await narrate(page, "New submission opens a dialog that says it only creates a draft");
    await page.getByRole("button", { name: /New submission/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("nothing is sent to the client");
    // A consultant and job pair that already has a draft is refused (409) and the dialog stays open, so each run takes the next free pair.
    const start = Date.now() % 7;
    let created = false;
    for (let attempt = 0; attempt < 8 && !created; attempt++) {
      await pickOption(page, dialog.getByRole("button", { name: "Consultant" }), page.getByRole("option").nth((start + attempt) % 6));
      await pickOption(page, dialog.getByRole("button", { name: "Job" }), page.getByRole("option").nth((start * 2 + attempt) % 6));
      await dialog.getByLabel("Note").fill(`Story note ${Date.now()}`);
      await dialog.getByRole("button", { name: "Create draft" }).click();
      created = await dialog.waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false);
    }
    expect(created, "a consultant and job pair without a draft").toBe(true);

    await narrate(page, "The draft is recorded; the row's actions are Send for approval or Withdraw, never Submit");
    await expect(page.getByText(/Draft prepared for/).first()).toBeVisible();
    await expect.poll(() => page.locator("[data-submission-row]").count()).toBeGreaterThanOrEqual(before);
    await pickOption(page, page.getByRole("button", { name: /^Actions for / }).first(), page.getByRole("menuitem").first()); // a menu closes when the page scrolls
    const entries = (await page.getByRole("menuitem").allInnerTexts()).join("|");
    expect(entries).not.toMatch(/submit to client|send to client|apply/i);
  });

  test("MKT-31 Omar filters the Applications tracker by stage and records a note", async ({ as }) => {
    // The Marketing workspace has its own Applications tracker, scoped to Omar's consultants (tiles [data-stat-tile], stage tabs [data-stage-tab], rows tr[data-app-row]).
    const { page, go } = await as("omar");
    await go("/w/marketing/applications");
    await ready(page, "[data-applications]").waitFor();
    await narrate(page, "Four tiles count active applications, those awaiting a response, interviewing and offers");
    for (const k of ["active", "awaiting", "interviewing", "offers"]) await expect(page.locator(`[data-stat-tile="${k}"]`)).toBeVisible();
    const rows = page.locator("tr[data-app-row]");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "Choosing the Interviewing stage tab filters the table");
    await page.locator('[data-stage-tab="interviewing"]').click();
    await expect(page.locator('[data-stage-tab="interviewing"]')).toHaveAttribute("aria-selected", "true");
    await expect(rows.first().or(page.getByText("No applications match these filters."))).toBeVisible();
    for (const s of await rows.locator("[data-stage]").evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")))) expect(s).toBe("interviewing");

    await narrate(page, "Searching for nothing shows the honest empty state");
    await page.getByLabel("Search applications").fill("zzz-no-such-application");
    await expect(page.getByText("No applications match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(rows.first()).toBeVisible();

    await narrate(page, "He adds a note to an application: a record, not an action on the application");
    await pickOption(page, page.locator("[data-row-menu]").first(), page.getByRole("menuitem", { name: "Add a note" }));
    const dlg = page.getByRole("dialog", { name: "Add a note" });
    await dlg.getByRole("textbox").fill(`Story follow-up note ${Date.now()}`);
    await dlg.getByRole("button", { name: "Add note" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("MKT-32 Omar checks the interview schedule, switches to the calendar and sees what needs feedback", async ({ as }) => {
    // The Marketing workspace has its own Interviews page, scoped to Omar's consultants: a Schedule card (list / calendar) and Pending feedback.
    const { page, go } = await as("omar");
    await go("/w/marketing/interviews");
    await ready(page, "[data-interviews]").waitFor();
    await narrate(page, "The schedule lists his consultants' interviews, with this week's count in its header");
    const schedule = page.locator('[data-card="schedule"]');
    await expect(schedule).toBeVisible();
    await expect(schedule.locator("[data-this-week]")).toContainText("this week");
    await expect(schedule.locator("[data-interview-row]").first().or(schedule.getByText(/No interviews/))).toBeVisible();
    await narrate(page, "Calendar draws the same interviews by week");
    await schedule.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.locator("[data-calendar]")).toBeVisible();
    await schedule.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("[data-calendar]")).toHaveCount(0);
    await narrate(page, "Pending feedback lists the interviews still waiting for an outcome");
    await expect(page.locator('[data-card="pending-feedback"]')).toBeVisible();
  });
});

test.describe("MKT follow-ups, tasks, activity, performance", () => {
  test("MKT-33 Omar logs a call against today's follow-ups", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/tasks?tab=followups");
    await ready(page, "[data-followups-page]").waitFor();
    await narrate(page, "Tasks › Follow-ups: today, overdue, upcoming and done are chips over one list");
    for (const id of ["today", "overdue", "upcoming", "done"]) await expect(page.locator(`[data-followup-chip="${id}"]`)).toBeVisible();
    await expect(page.locator('[data-followup-chip="today"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-followups-card="today"]')).toBeVisible();

    const rows = page.locator('[data-followup-table="today"] [data-followup-row]');
    await expect(rows.first().or(page.getByText("You're all caught up."))).toBeVisible();
    if ((await rows.count()) === 0) {
      await expect(page.getByText("You're all caught up.")).toBeVisible();
      return;
    }
    await narrate(page, "He ticks the first one and logs the call");
    await rows.first().locator('input[type="checkbox"]').check();
    await page.locator("[data-followups-selection]").getByRole("button", { name: "Log call" }).click();
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
    await narrate(page, "Five chips describe his workload");
    await expect(page.locator("[data-task-tab]")).toHaveCount(5);

    const title = `Story task ${Date.now()}`;
    await narrate(page, "Add task: a title, a type and a due date");
    await page.getByRole("button", { name: "Add task" }).first().click();
    const dlg = page.locator("[data-task-dialog]");
    await expect(dlg).toContainText("Saving it only records it: nothing is emailed and nothing is submitted for a consultant.");
    await dlg.getByLabel("Task title").fill(title);
    await dlg.getByRole("button", { name: "Add task" }).click();
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
    await narrate(page, "A filter row sits above the feed");
    await expect(page.locator("[data-activity-filters]")).toBeVisible();
    await expect(page.locator('[data-activity-card="feed"]')).toBeVisible();

    const title = `Story call with recruiter ${Date.now()}`;
    await narrate(page, "Log activity records work done for a consultant; it sends nothing");
    await page.getByRole("button", { name: /Log activity/ }).first().click();
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
    await narrate(page, "Four tiles measure active submissions, interview and offer rates, and placements this month");
    for (const t of ["Active submissions", "Interview rate", "Offer rate", "Placements this month"]) {
      await expect(page.locator("[data-perf-tiles]").getByText(t, { exact: true }).first()).toBeVisible();
    }
    await narrate(page, "Charts and the funnel are drawn from real rows, or say there are no numbers yet");
    for (const c of ["weekly", "trend", "funnel"]) await expect(page.locator(`[data-perf-card="${c}"]`)).toBeVisible();
    const active = await tileValue(page, "activeSubmissions");
    expect(active).toBeGreaterThanOrEqual(0);
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
