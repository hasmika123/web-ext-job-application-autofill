import { test, expect, narrate } from "../_support/story";
import { menuAction, openPage, pageTitle, pick, stamp, stubJobSite } from "./_helpers";

/**
 * Job Discovery, Job Matches, Assigned Opportunities and the Phase 1 job-link flow.
 * The marketer's source link and quick info are seeded in cws_job_source by ConsultantWsJobSourceDemoSeeder:
 * https://jobs.example.com/<org-slug>/<requirementId>, a source name (LinkedIn / Dice / Company site / Indeed), a one-line note, all flagged Sample.
 * "Open job link" is stubbed locally (stubJobSite) so no story reaches the public internet.
 */

test("CON-20 Anika searches Job Discovery, filters, sorts and opens a job's details", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Job Discovery: the jobs her marketer loaded");
  await openPage(page, go, "job-discovery");
  await expect(pageTitle(page)).toHaveText("Job Discovery");
  await expect(page.locator("[data-results-count]")).toContainText(/Showing \d+ opportunit/);
  const cards = page.locator("[data-job]");
  await expect(cards.first()).toBeVisible();

  await narrate(page, "The page says what to do: open the link, apply on the source site with the extension");
  await expect(page.locator("[data-apply-helper]")).toContainText("Apply on the source site with the Kiwiply extension");

  await narrate(page, "She types a keyword and searches");
  const first = (await cards.first().locator("h3 button").first().innerText()).trim();
  const word = first.split(/\s+/)[0];
  await page.getByRole("search").getByRole("textbox").first().fill(word);
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page.locator("[data-results-count]")).toContainText(/Showing \d+ opportunit/);
  await expect(cards.first()).toBeVisible();

  await narrate(page, "She narrows by job type, then sorts by newest");
  const filters = page.getByRole("group", { name: "Filters" });
  await filters.getByRole("button", { name: "Job Type" }).click();
  const optionCount = await page.getByRole("option").count();
  if (optionCount > 1) await page.getByRole("option").nth(1).click();
  else await page.keyboard.press("Escape");
  await pick(page, page.getByRole("button", { name: "Sort by" }), /Newest/i);
  await expect(page.locator("[data-results-count]")).toContainText(/Showing \d+ opportunit/);

  await narrate(page, "Clear All brings every job back");
  await filters.getByRole("button", { name: "Clear All" }).click();
  await expect(cards.first()).toBeVisible();

  const title = (await cards.first().locator("h3 button").first().innerText()).trim();
  await narrate(page, `She opens the details of "${title}"`);
  await page.getByRole("button", { name: `View ${title}`, exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.locator("[data-job-detail]")).toBeVisible();
  await expect(sheet.getByText("Marketer's quick info")).toBeVisible();
  await expect(sheet.getByText(/not the full posting|Apply on the source site/).first()).toBeVisible();
});

test("CON-21 Anika opens the marketer's job link from Job Discovery (new tab, safe link) and the quick info is shown", async ({ as }) => {
  const { page, go, context } = await as("anika");
  await stubJobSite(context);
  await openPage(page, go, "job-discovery");
  const card = page.locator("[data-job]").filter({ has: page.locator("a[data-job-link]") }).first();
  await expect(card).toBeVisible();

  await narrate(page, "Each job shows the marketer's quick info, the source site and a Sample mark (demo stand-in)");
  const quick = card.locator("[data-quick-info]");
  await expect(quick).toContainText("Marketer's quick info");
  await expect(quick.locator("[data-sample]")).toBeVisible();

  await narrate(page, "Open job link is a plain https link that opens in a new tab and never navigates this tab");
  const link = card.locator("a[data-job-link]");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("href", /^https:\/\/jobs\.example\.com\/demo-acme\/\d+$/);

  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState();
  await narrate(popup, "The source posting opens in its own tab: the consultant applies here with the Kiwiply extension");
  await expect(popup).toHaveURL(/jobs\.example\.com\/demo-acme\/\d+/);
  await expect(popup.getByRole("heading", { name: "Source job posting" })).toBeVisible();
  await popup.close();

  await expect(page).toHaveURL(/\/w\/consultant\/job-discovery/); // Kiwiply tab untouched
  await expect(page.locator("[data-job-discovery][data-status=ready]")).toBeVisible();
});

test("CON-22 Anika bookmarks a job, saves a search, re-runs it from Saved Searches and deletes it", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "job-discovery");
  const cards = page.locator("[data-job]");
  await expect(cards.first()).toBeVisible();

  const title = (await cards.first().locator("h3 button").first().innerText()).trim();
  const saveBtn = page.getByRole("button", { name: `Save ${title}`, exact: true });
  const removeBtn = page.getByRole("button", { name: `Remove ${title} from saved jobs`, exact: true });
  const wasSaved = (await removeBtn.count()) > 0;
  await narrate(page, wasSaved ? `"${title}" is bookmarked; she un-bookmarks it, then bookmarks it again` : `She bookmarks "${title}"`);
  if (wasSaved) {
    await removeBtn.click();
    await expect(saveBtn).toBeVisible();
  }
  await saveBtn.click();
  await expect(removeBtn).toBeVisible();
  await expect(removeBtn).toHaveAttribute("aria-pressed", "true");
  if (!wasSaved) {
    await removeBtn.click(); // leave the demo data as she found it
    await expect(saveBtn).toBeVisible();
  }

  const name = `QA search ${stamp()}`;
  await narrate(page, "She searches for 'engineer', opens More Filters and saves the search");
  await page.getByRole("search").getByRole("textbox").first().fill("engineer");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /More Filters/ }).click();
  await page.getByRole("textbox", { name: "Name for this search" }).fill(name);
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();

  await narrate(page, "It now appears under Saved Searches with a new-results count");
  await page.getByRole("tab", { name: /Saved Searches/ }).click();
  const saved = page.locator("[data-saved-search]", { hasText: name });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText(/\d+ new result/);

  await narrate(page, "Run brings back the results; Delete removes the saved search");
  await page.getByRole("button", { name: `Run saved search ${name}` }).first().click();
  await expect(page.locator("[data-results-count]")).toContainText(/Showing \d+ opportunit/);
  await page.getByRole("tab", { name: /Saved Searches/ }).click();
  await page.getByRole("button", { name: `Delete saved search ${name}` }).click();
  await expect(page.locator("[data-saved-search]", { hasText: name })).toHaveCount(0);
});

test("CON-23 Anika reviews her Job Matches: ranked list, score insight, skill alignment, save and express interest", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Job Matches");
  await openPage(page, go, "matches");
  await expect(pageTitle(page)).toHaveText("Job Matches");
  for (const key of ["total", "high", "fresh", "saved", "viewed"]) await expect(page.locator(`[data-matches-tiles] [data-stat-tile=${key}]`)).toBeVisible();

  const rows = page.locator("[data-match]");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3);

  await narrate(page, "The best match is selected: the score, skill alignment and 'what to improve' explain why");
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-detail-score]")).toContainText("%");
  await expect(detail.locator("[data-block=skills]")).toBeVisible();
  await expect(detail.locator("[data-block=improve]")).toBeVisible();
  await expect(detail.locator("[data-apply-helper]")).toContainText("extension");

  await narrate(page, "She opens another match and the detail follows");
  const second = rows.nth(1);
  const secondTitle = (await second.getByRole("button", { name: /^View match for/ }).getAttribute("aria-label"))!.replace("View match for ", "");
  await second.getByRole("button", { name: /^View match for/ }).click();
  await expect(page.locator("[data-detail] h3").first()).toHaveText(secondTitle);

  await narrate(page, "She bookmarks it for later and filters to Saved only");
  const save = second.locator("[data-action=save]");
  const wasSaved = (await save.getAttribute("aria-pressed")) === "true";
  if (!wasSaved) await save.click();
  await expect(second.locator("[data-action=save]")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Saved only").check();
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(1);
  await page.getByLabel("Saved only").uncheck();
  if (!wasSaved) await second.locator("[data-action=save]").click(); // restore

  await narrate(page, "She compares two matches side by side");
  await rows.nth(0).locator("[data-action=compare]").click();
  await rows.nth(1).locator("[data-action=compare]").click();
  await expect(page.locator("[data-compare-sheet]")).toBeVisible();
  await page.locator("[data-home-card=matches-compare]").getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator("[data-compare-sheet]")).toHaveCount(0);
});

test("CON-24 Anika expresses interest in a match: it records her wish, nothing is applied or submitted", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "matches");
  const pending = page.locator("[data-match]").filter({ has: page.locator("[data-action=interest]") }).first();
  const already = (await pending.count()) === 0;
  if (already) {
    test.info().annotations.push({ type: "note", description: "Every match already has 'Interest sent' (earlier run); asserting that state instead." });
    await expect(page.locator("[data-action=interest-sent]").first()).toBeVisible();
    return;
  }
  const title = (await pending.getByRole("button", { name: /^View match for/ }).getAttribute("aria-label"))!.replace("View match for ", "");
  await narrate(page, `She clicks Express Interest on "${title}"`);
  await pending.locator("[data-action=interest]").click();
  await expect(page.locator("[data-match]", { hasText: title }).locator("[data-action=interest-sent]")).toBeVisible();
  await narrate(page, "It shows 'Interest sent'; there is no Apply or Submit button on the page");
  await expect(page.getByRole("button", { name: /^(Apply|Submit)/i })).toHaveCount(0);
});

test("CON-25 Anika works her Assigned Opportunities: tiles, detail drawer, quick info and Open job link", async ({ as }) => {
  const { page, go, context } = await as("anika");
  await stubJobSite(context);
  await narrate(page, "Anika opens Assigned Opportunities: the jobs her marketer assigned");
  await openPage(page, go, "opportunities");
  await expect(pageTitle(page)).toHaveText("Assigned Opportunities");
  for (const key of ["total", "high", "awaiting", "inReview", "declined"]) await expect(page.locator(`[data-opps-tiles] [data-stat-tile=${key}]`)).toBeVisible();
  const rows = page.locator("[data-opp]");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3);

  const title = (await rows.first().getByRole("button", { name: /^View / }).getAttribute("aria-label"))!.replace(/^View /, "");
  await narrate(page, `She opens "${title}"`);
  await rows.first().locator("[data-action=view]").click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.locator("[data-detail]")).toBeVisible();
  await expect(sheet.locator("[data-quick-info]")).toContainText("Marketer's quick info");
  await expect(sheet.locator("[data-apply-helper]")).toContainText("extension");

  await narrate(page, "Open job link takes her to the source posting in a new tab");
  const link = sheet.locator("a[data-job-link]");
  await expect(link).toHaveAttribute("target", "_blank");
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState();
  await expect(popup).toHaveURL(/jobs\.example\.com\/demo-acme\/\d+/);
  await popup.close();
  await expect(sheet.locator("[data-detail]")).toBeVisible();
});

test("CON-26 Anika asks her marketer for more info, declines an opportunity with a reason and reopens it", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "opportunities");
  const rows = page.locator("[data-opp]");
  const row = rows.first();
  const title = (await row.getByRole("button", { name: /^View / }).getAttribute("aria-label"))!.replace(/^View /, "");

  await narrate(page, "From the row menu she picks Need More Info");
  await menuAction(page, row.getByRole("button", { name: `More actions for ${title}` }), "Need More Info");
  const ask = page.getByRole("dialog", { name: `Need more info: ${title}` });
  await expect(ask).toBeVisible();
  await narrate(page, "A question needs at least a few characters; Cancel closes without sending");
  await expect(ask.getByRole("button", { name: "Send question" })).toBeDisabled();
  await ask.getByLabel("What would you like to know?").fill(`QA ${stamp()}: is the end client open to remote work?`);
  await ask.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Question sent to your marketer")).toBeVisible();

  await narrate(page, "She declines it with a reason, then uses Undo-by-Reopen so the demo data stays intact");
  await menuAction(page, rows.first().getByRole("button", { name: `More actions for ${title}` }), "Decline Opportunity");
  const decline = page.getByRole("dialog", { name: `Decline opportunity: ${title}` });
  await decline.getByLabel("Why is it not a fit?").fill("QA story: rate is below my minimum for this kind of role.");
  await decline.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(page.getByText("Opportunity declined")).toBeVisible();
  await expect(page.locator("[data-opp]", { hasText: title }).first()).toContainText("Declined");

  await menuAction(page, page.locator("[data-opp]", { hasText: title }).first().getByRole("button", { name: `More actions for ${title}` }), "Reopen");
  await expect(page.getByText("Opportunity reopened")).toBeVisible();
});

test("CON-27 Phase 1 job-link flow: assigned job -> quick info -> Open job link -> apply on the source site -> progress is tracked in My Applications", async ({ as }) => {
  const { page, go, context } = await as("anika");
  await stubJobSite(context);

  await narrate(page, "1. The marketer assigned a job; Anika finds it under Assigned Opportunities with the marketer's quick info");
  await openPage(page, go, "opportunities");
  const row = page.locator("[data-opp]").filter({ has: page.locator("a[data-job-link]") }).first();
  await expect(row).toBeVisible();
  const title = (await row.getByRole("button", { name: /^View / }).getAttribute("aria-label"))!.replace(/^View /, "");
  await row.locator("[data-action=view]").click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.locator("[data-quick-info]")).toBeVisible();

  await narrate(page, "2. Open job link: the posting opens in a new tab on the source site");
  const [popup] = await Promise.all([context.waitForEvent("page"), sheet.locator("a[data-job-link]").click()]);
  await popup.waitForLoadState();
  await expect(popup).toHaveURL(/jobs\.example\.com\/demo-acme\/\d+/);
  await narrate(popup, "3. Here the consultant applies with their OWN Kiwiply extension; Kiwiply never submits for them");
  // The extension step cannot run in the story kit (no extension loaded, no real ATS page): see BLOCKED note in consultant.md.
  await popup.close();

  await narrate(page, "4. Progress is followed in My Applications; the page is read-only (no submit button)");
  await go("/w/consultant/applications");
  await expect(page.locator("[data-consultant-applications][data-status=ready]")).toBeVisible();
  await expect(page.locator("[data-application]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Submit|Apply)/i })).toHaveCount(0);
});

test("CON-28 A job without a source link shows a disabled 'Open job link' with an honest tooltip", async ({ as }) => {
  // Every OPEN demo job is seeded with a link, so this state only appears when the marketer has not added one.
  const { page, go } = await as("anika");
  await openPage(page, go, "job-discovery");
  const missing = page.locator("[data-job-link-missing]").first();
  if ((await missing.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "All seeded jobs have a link; the disabled state is covered by JobLinkButton unit tests and cannot be reached without a job that has no cws_job_source row." });
    await narrate(page, "Every demo job has a link, so there is no disabled button to show here");
    await expect(page.locator("a[data-job-link]").first()).toBeVisible();
    return;
  }
  await expect(missing).toHaveAttribute("title", "Your marketer hasn't added the link yet");
  await expect(missing.getByRole("button")).toBeDisabled();
});
