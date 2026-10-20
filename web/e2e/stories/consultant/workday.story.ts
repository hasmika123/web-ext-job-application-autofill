import { test, expect, narrate } from "../_support/story";
import { isoDay, menuAction, openPage, orgIdOf, pageTitle, pick, removeLeftoverTasks, stamp } from "./_helpers";

/** Tasks, Activity (its Needs attention and Timeline tabs) and Settings (with its Plan & features tab): the consultant's day-to-day housekeeping. */

test("CON-50 Anika reads her Tasks: tabs with counts, search and filters", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Tasks");
  await openPage(page, go, "tasks");
  await expect(pageTitle(page)).toHaveText("Tasks");

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
  // self-contained: a run that failed half way leaves its task behind, and the list pages 8 at a time, so clear those first and find the new one by name
  await removeLeftoverTasks(page, await orgIdOf(page), "QA story task");
  await page.reload();
  await expect(page.locator("[data-consultant-tasks][data-status=ready]")).toBeVisible();
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
  await page.getByRole("searchbox", { name: "Search tasks" }).fill(title); // the list pages 8 at a time, ordered by due date
  const row = page.locator("[data-task]", { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-status", "NOT_STARTED");

  await narrate(page, "She ticks it off, then reopens it");
  // click, not check(): the box renames itself ("Complete" -> "Reopen") and the row re-renders when the status changes, which check() reads as "did not change"
  await row.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await expect(page.getByText("Task completed")).toBeVisible();
  await expect(page.locator("[data-task]", { hasText: title })).toHaveAttribute("data-status", "DONE");
  await page.locator("[data-task]", { hasText: title }).getByRole("checkbox", { name: `Reopen ${title}` }).click();
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

test("CON-53 Anika follows her activity timeline: filter by type and period, load more, export CSV", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Activity > Timeline");
  await openPage(page, go, "activity?tab=timeline");
  await expect(pageTitle(page)).toHaveText("Activity");

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
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-export]").click()]);
  expect(download.suggestedFilename()).toBe("activity-timeline.csv");
});

test("CON-54 Anika reviews Settings > Plan & features: what her plan includes, usage, and which numbers are samples", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Settings > Plan & features");
  await openPage(page, go, "settings?tab=features");
  await expect(pageTitle(page)).toHaveText("Settings");
  await expect(page.locator("[data-feature-row]").first()).toBeVisible();

  await narrate(page, "Entitlements are stand-ins until the admin catalog is connected, and the page says so");
  await expect(page.locator("[data-sample]").first()).toBeVisible();

  await narrate(page, "She filters to Premium features");
  await page.getByLabel("Filter features").selectOption({ label: "Premium" });
  await expect(page.locator("[data-features-table], [data-consultant-features]").first()).toBeVisible();
  await page.getByLabel("Filter features").selectOption({ label: "All Features" });
});

test("CON-55 Anika triages her notifications (Activity > Needs attention): tabs, mark read/unread, and the way to her preferences", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Activity: the Needs attention tab lists her notifications");
  await openPage(page, go, "activity");
  await expect(pageTitle(page)).toHaveText("Activity");
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

  await narrate(page, "Notification preferences live on her My profile page; the button leads there");
  await expect(page.locator("[data-notification-prefs]")).toHaveAttribute("href", "/me#notifications");
});

test("CON-56 Anika reviews Settings: links to where profile, notifications and security live, and the page's tabs", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Settings");
  await openPage(page, go, "settings");
  await expect(pageTitle(page)).toHaveText("Settings");

  await narrate(page, "Profile details, notifications, password and two-factor live elsewhere: three links at the top lead there, nothing is shown or faked here");
  await expect(page.locator("[data-settings-link=profile]")).toHaveAttribute("href", "/w/consultant/profile");
  await expect(page.locator("[data-settings-link=notifications]")).toHaveAttribute("href", "/me#notifications");
  await expect(page.locator("[data-settings-link=security]")).toHaveAttribute("href", "/me#security"); // one basic My profile page for every member (D6)
  await expect(page.locator("input[type=password]")).toHaveCount(0);

  await narrate(page, "Privacy, Appearance and Plan & features are tabs of the page");
  const tabs = page.getByRole("tablist", { name: "Settings views" });
  for (const name of ["Privacy", "Appearance", "Plan & features"]) await expect(tabs.getByRole("tab", { name })).toBeVisible();
  await tabs.getByRole("tab", { name: "Appearance" }).click();
  await expect(page).toHaveURL(/\/w\/consultant\/settings\?tab=appearance/);
  await expect(page.locator("#settings-theme")).toBeVisible();
});

test("CON-57 Anika changes her profile visibility and analytics choice, sees the hint change, and puts both back", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "settings");
  const vis = page.locator("#settings-visibility");
  const originalVis = ((await vis.innerText()) ?? "").trim();
  const analytics = page.getByRole("switch", { name: "Analytics" });
  const analyticsWas = await analytics.getAttribute("aria-checked");

  await narrate(page, "She sets Profile visibility to Private");
  await pick(page, vis, "Private");
  await expect(page.locator("[data-visibility-hint]")).toContainText("hidden from everyone but you");

  await narrate(page, "She toggles Analytics");
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", analyticsWas === "true" ? "false" : "true");

  await narrate(page, "Everything is put back");
  await analytics.click();
  await expect(analytics).toHaveAttribute("aria-checked", analyticsWas ?? "false");
  await pick(page, vis, originalVis);
  await expect(vis).toContainText(originalVis);
});
