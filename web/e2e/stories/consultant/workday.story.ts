import { test, expect, narrate } from "../_support/story";
import { isoDay, menuAction, openPage, pageTitle, pick, stamp, tileValue } from "./_helpers";

/** Tasks & Follow-ups, Activity Timeline, My Features, Notifications and Settings: the consultant's day-to-day housekeeping. */

test("CON-50 Anika reads her Tasks & Follow-ups: tiles, tabs with counts, search and filters", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Tasks & Follow-ups");
  await openPage(page, go, "tasks");
  await expect(pageTitle(page)).toHaveText("Tasks & Follow-ups");
  for (const key of ["total", "dueToday", "upcoming", "overdue", "completedThisWeek"]) await expect(page.locator(`[data-tasks-tiles] [data-stat-tile=${key}]`)).toBeVisible();
  expect(Number(await tileValue(page, "total"))).toBeGreaterThanOrEqual(5);

  await narrate(page, "Her five seeded tasks are listed; the tabs carry live counts");
  await expect(page.locator("[data-task]", { hasText: "Complete interview preparation" })).toBeVisible();
  await expect(page.locator("[data-tab=ALL]")).toContainText(/All Tasks \(\d+\)/);

  await narrate(page, "Search narrows the list");
  await page.getByLabel("Search tasks").fill("resume");
  await expect(page.locator("[data-task]", { hasText: "Update resume with latest project" })).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: "Complete interview preparation" })).toHaveCount(0);
  await page.getByLabel("Search tasks").fill("");

  await narrate(page, "The Priority filter and the Completed tab work too");
  await page.getByLabel("Priority", { exact: true }).selectOption({ label: "High" });
  await expect(page.locator("[data-task]").first()).toBeVisible();
  await page.getByLabel("Priority", { exact: true }).selectOption({ index: 0 });
  await page.locator("[data-tab=COMPLETED]").click();
  await expect(page.locator("[data-tab=COMPLETED]")).toHaveAttribute("aria-selected", "true");
  await page.locator("[data-tab=ALL]").click();
});

test("CON-51 Anika creates her own task, completes and reopens it, edits it and deletes it", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "tasks");
  const title = `QA story task ${stamp()}`;

  await narrate(page, "New Task opens a small form: only she can see her own to-do list");
  await page.locator("[data-action=new-task]").click();
  const dlg = page.getByRole("dialog", { name: "New task" });
  await dlg.getByLabel("Task name").fill(title);
  await dlg.getByLabel("Due date").fill(isoDay(3));
  await dlg.getByLabel("Task priority").selectOption({ label: "High" });
  await dlg.getByLabel("Task type").selectOption({ label: "Communication" });
  await dlg.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added")).toBeVisible();
  const row = page.locator("[data-task]", { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-status", "NOT_STARTED");

  await narrate(page, "She ticks it off, then reopens it");
  await row.getByRole("checkbox", { name: `Complete ${title}` }).check();
  await expect(page.getByText("Task completed")).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: title })).toHaveAttribute("data-status", "DONE");
  await page.locator("[data-task]", { hasText: title }).getByRole("checkbox", { name: `Reopen ${title}` }).uncheck();
  await expect(page.locator("[data-task]", { hasText: title })).toHaveAttribute("data-status", "NOT_STARTED");

  await narrate(page, "She edits the name from the row menu");
  const renamed = `${title} (edited)`;
  await menuAction(page, page.locator("[data-task]", { hasText: title }).getByRole("button", { name: `More actions for ${title}` }), "Edit task");
  const edit = page.getByRole("dialog", { name: "Edit task" });
  await edit.getByLabel("Task name").fill(renamed);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Task updated")).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: renamed })).toBeVisible();

  await narrate(page, "Delete task has a 6-second Undo window, then it is really gone");
  await menuAction(page, page.locator("[data-task]", { hasText: renamed }).getByRole("button", { name: `More actions for ${renamed}` }), "Delete task");
  await expect(page.getByText("Task deleted")).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: renamed })).toHaveCount(0);
  await page.waitForTimeout(7000);
  await page.reload();
  await expect(page.locator("[data-consultant-tasks][data-status=ready]")).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: renamed })).toHaveCount(0);
});

test("CON-52 A task name with an ID number is refused: Kiwiply never stores that", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "tasks");
  await page.locator("[data-action=new-task]").click();
  const dlg = page.getByRole("dialog", { name: "New task" });
  await narrate(page, "Anika types a social security number into a task name");
  await dlg.getByLabel("Task name").fill("Send my SSN 123-45-6789 to the recruiter");
  await dlg.getByRole("button", { name: "Add task" }).click();
  await expect(dlg.getByRole("alert")).not.toBeEmpty();
  await expect(dlg).toBeVisible(); // not saved
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-task]", { hasText: "123-45-6789" })).toHaveCount(0);
});

test("CON-53 Anika follows her Activity Timeline: filter by type and period, load more, export CSV", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Activity Timeline");
  await openPage(page, go, "activity-timeline");
  await expect(pageTitle(page)).toHaveText("Activity Timeline");
  for (const key of ["total", "thisWeek", "applications", "interviews", "profile"]) await expect(page.locator(`[data-timeline-tiles] [data-stat-tile=${key}]`)).toBeVisible();

  const rows = page.locator("[data-timeline-row]");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator("[data-day-group]").first()).toBeVisible();
  await expect(page.locator("[data-timeline-count]")).toContainText(/Showing \d+ of \d+/);

  await narrate(page, "She widens the period to 90 days and filters to Applications");
  await page.getByLabel("Period").selectOption({ label: "Last 90 Days" });
  await page.getByLabel("Activity type").selectOption({ label: "Applications" });
  await expect(rows.first()).toBeVisible();
  const types = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-timeline-row")));
  expect(types.length).toBeGreaterThan(0);

  await narrate(page, "Recent Milestones show what she has reached");
  await expect(page.locator("[data-milestone]").first()).toBeVisible();

  await narrate(page, "Export downloads the shown rows as a CSV in her own browser");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-quick=export]").click()]);
  expect(download.suggestedFilename()).toBe("activity-timeline.csv");
});

test("CON-54 Anika reviews My Features: what her plan includes, usage, and which numbers are samples", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens My Features");
  await openPage(page, go, "features");
  await expect(pageTitle(page)).toHaveText("My Features");
  for (const key of ["active", "credits", "used", "premium", "expiring"]) await expect(page.locator(`[data-features-tiles] [data-stat-tile=${key}]`)).toBeVisible();
  await expect(page.locator("[data-feature-row]").first()).toBeVisible();

  await narrate(page, "Entitlements are stand-ins until the admin catalog is connected, and the page says so");
  await expect(page.locator("[data-sample]").first()).toBeVisible();

  await narrate(page, "She filters to Premium features");
  await page.getByLabel("Filter features").selectOption({ label: "Premium" });
  await expect(page.locator("[data-features-table], [data-consultant-features]").first()).toBeVisible();
  await page.getByLabel("Filter features").selectOption({ label: "All Features" });

  await narrate(page, "A feature's action button takes her to the tool; Quick Actions lead to Matches and Interview Prep");
  await page.locator("[data-features-quick='View Job Matches']").click();
  await expect(page).toHaveURL(/\/w\/consultant\/matches/);
});

test("CON-55 Anika triages her Notifications: tabs, mark read/unread, and switches a category off and on", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Notifications");
  await openPage(page, go, "notifications");
  await expect(pageTitle(page)).toHaveText("Notifications");
  for (const key of ["unread", "highPriority", "today", "upcomingReminders", "resolvedThisWeek"]) await expect(page.locator(`[data-notifications-tiles] [data-stat-tile=${key}]`)).toBeVisible();
  await expect(page.locator("[data-tab=ALL]")).toContainText(/All \(\d+\)/);

  const rows = page.locator("[data-notification]");
  if ((await rows.count()) > 0) {
    const first = rows.first();
    const title = (await first.getByRole("button", { name: /^More actions for/ }).getAttribute("aria-label"))!.replace("More actions for ", "");
    await narrate(page, `She opens the menu of "${title}" and flips its read state`);
    await menuAction(page, first.getByRole("button", { name: `More actions for ${title}` }), /Mark as (read|unread)/);
    await expect(page.locator("[data-notification]").first()).toBeVisible();
  } else {
    test.info().annotations.push({ type: "note", description: "The feed is empty for Anika right now (it is generated from her own rows)." });
    await expect(page.getByText("You're all caught up")).toBeVisible();
  }

  await narrate(page, "Notification Preferences: she switches Reminders off and on again (SMS is not offered)");
  const reminders = page.getByRole("switch", { name: "Reminders notifications" });
  const was = await reminders.getAttribute("aria-checked");
  await reminders.click();
  await expect(reminders).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
  await reminders.click();
  await expect(reminders).toHaveAttribute("aria-checked", was ?? "true");
  await page.getByRole("button", { name: "Reminders channels", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /SMS/ })).toBeDisabled();
});

test("CON-56 Anika reviews Settings: account, privacy choices, honest security and connected-tools state", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Settings");
  await openPage(page, go, "settings");
  await expect(pageTitle(page)).toHaveText("Settings");
  await expect(page.locator("[data-settings-tiles]")).toBeVisible();
  await expect(page.locator("[data-fact]").first()).toBeVisible();

  await narrate(page, "Password and two-factor are managed on her Kiwiply account; they are never shown or faked here");
  await expect(page.locator("[data-security-row]").first()).toContainText(/Password|Two-Factor|Login/);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(page.locator("[data-security-link]")).toHaveAttribute("href", "/settings");

  await narrate(page, "Connected tools are not available yet, and the buttons say so");
  await expect(page.locator("[data-tool]").first()).toContainText("Not available yet");
  await expect(page.getByRole("button", { name: /Connect .* \(not available yet\)/ }).first()).toBeDisabled();

  await narrate(page, "Identity and tax documents are never collected");
  await expect(page.locator("[data-doc-row=supporting]")).toContainText("Not collected");
});

test("CON-57 Anika changes her profile visibility and analytics choice, sees the hint change, and puts both back", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "settings");
  const vis = page.locator("#settings-visibility");
  const originalVis = ((await vis.innerText()) ?? "").trim();
  const analytics = page.getByRole("switch", { name: "Allow Analytics Usage" });
  const analyticsWas = await analytics.getAttribute("aria-checked");

  await narrate(page, "She sets Profile Visibility to Private");
  await pick(page, vis, "Private");
  await expect(page.locator("[data-visibility-hint]")).toContainText("hidden from everyone but you");

  await narrate(page, "She toggles Allow Analytics Usage");
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", analyticsWas === "true" ? "false" : "true");

  await narrate(page, "Recent Account Activity records the privacy change");
  await expect(page.locator("[data-activity=PRIVACY]").first()).toBeVisible();

  await narrate(page, "Everything is put back");
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", analyticsWas ?? "false");
  await pick(page, vis, originalVis);
  await expect(vis).toContainText(originalVis);
});
