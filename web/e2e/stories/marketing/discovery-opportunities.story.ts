import { test, expect, narrate } from "../_support/story";
import { boardRow, captureJob, consultantIdByName, conRow, jobBody, orgIdOf, ready, tileValue } from "./_mkt";

/** Resumes, Job Discovery, Job Matches, Opportunities board and Job Streams (Omar, plus Sarah for cross-person set-up). */

test.describe("MKT resumes, discovery, matches, opportunities, streams", () => {
  test("MKT-10 Omar reviews his consultants' resumes and previews one", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/resumes");
    await ready(page, "[data-mkt-resumes]").waitFor();
    await narrate(page, "Four tiles: total resumes, profiles ready, needs update, approvals pending");
    await expect(page.locator("[data-resumes-tiles] [data-stat-tile]")).toHaveCount(4);
    const total = await tileValue(page, "total");
    expect(total).toBeGreaterThan(0);

    await narrate(page, "The table lists a resume per row with its approval state");
    const rows = page.locator("[data-resume-row]");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first()).toContainText(/Approved|Pending Review|Needs Update/);

    await narrate(page, "Searching for a name that does not exist shows an honest empty table");
    await page.getByPlaceholder("Search consultants or resume titles...").fill("zzz-nobody-has-this-title");
    await expect(rows).toHaveCount(0);
    await page.getByPlaceholder("Search consultants or resume titles...").fill("");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "View opens a read-only preview of the resume");
    await rows.first().getByRole("button", { name: /^View / }).click();
    const drawer = page.locator("[data-resume-drawer]");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("article", { name: "Resume preview" })).toBeVisible();
    await expect(drawer.locator("[aria-label=Summary], [aria-label=Skills]").first()).toBeVisible();
  });

  test("MKT-11 Omar searches Job Discovery and opens a job's details", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/jobs");
    await ready(page, "[data-jobs-page]").waitFor();
    await narrate(page, "Job Discovery counts new openings, high matches, assigned jobs and saved searches");
    for (const id of ["newToday", "highMatch", "assigned", "savedSearchCount", "savedSearches"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    const rows = page.locator("[data-job-row]");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "He searches for 'react'");
    await page.getByPlaceholder(/Search job title, skills, client/).fill("react");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(rows.first()).toContainText(/react/i);

    await narrate(page, "A search with no hits says so");
    await page.getByPlaceholder(/Search job title, skills, client/).fill("zzz-no-such-opening-zzz");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No openings match these filters.")).toBeVisible();

    await narrate(page, "Clear all brings the board back; View shows the facts and the best matches");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(rows.first()).toBeVisible();
    await rows.first().getByRole("button", { name: /^View / }).click();
    const sheet = page.locator("[data-job-sheet]");
    await expect(sheet).toBeVisible();
    for (const k of ["Client", "Location", "Rate", "Source"]) await expect(sheet.getByText(k, { exact: true }).first()).toBeVisible();
  });

  test("MKT-12 Omar assigns a job to Ben from Job Discovery and Ben receives it (the consultant still applies himself)", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/marketing/opportunities");
    await ready(sarah.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(sarah.page);
    const anika = await consultantIdByName(sarah.page, orgId, "Anika Rao");
    const body = jobBody(Date.now(), [anika]);
    const title = String(body.title);
    await narrate(sarah.page, "Sarah captured a job for Anika; it is now an open job in the org");
    expect((await captureJob(sarah, "sarah", orgId, body)).status).toBe(200);

    const omar = await as("omar");
    await omar.go("/w/marketing/jobs");
    await ready(omar.page, "[data-jobs-page]").waitFor();
    await narrate(omar.page, "Omar finds the same job in Job Discovery");
    await omar.page.getByPlaceholder(/Search job title, skills, client/).fill(title);
    await omar.page.getByRole("button", { name: "Search", exact: true }).click();
    const jobRow = omar.page.locator("[data-job-row]").filter({ hasText: title });
    await expect(jobRow).toHaveCount(1);

    await narrate(omar.page, "Assign opens the consultant picker with the E1 reminder");
    await jobRow.getByRole("button", { name: `Assign ${title}` }).click();
    const sheet = omar.page.locator("[data-assign-sheet]");
    await expect(sheet).toContainText("It does not apply to the job: the consultant submits the application themselves.");
    await sheet.getByPlaceholder("Search your consultants").fill("Ben");
    await sheet.locator("[data-candidate]").filter({ hasText: "Ben Okafor" }).click();
    await omar.page.getByRole("button", { name: "Assign", exact: true }).last().click();
    await expect(omar.page.getByText(/Assigned Ben Okafor/)).toBeVisible();

    const ben = await as("ben");
    await ben.go("/w/consultant/opportunities");
    await ready(ben.page, "[data-con-opportunities]").waitFor();
    await narrate(ben.page, "Ben has it in his Assigned Opportunities, assigned by Omar");
    await expect(conRow(ben.page, title)).toHaveCount(1);
    await expect(conRow(ben.page, title)).toContainText("Omar Haddad");
  });

  test("MKT-13 Omar reads Job Matches and opens the explanation for one", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/matches");
    await ready(page, "[data-job-matches]").waitFor();
    await narrate(page, "Four tiles summarize his matches");
    await expect(page.locator("[data-matches-tiles] [data-stat-tile]")).toHaveCount(4);
    const rows = page.locator("[data-match-row]");
    if ((await rows.count()) === 0) {
      await expect(page.getByText(/Run a match to see suggestions|No matches fit these filters/)).toBeVisible();
      return;
    }
    await narrate(page, "Selecting a row explains why the consultant fits the job");
    await rows.first().click();
    await expect(page.locator("[data-match-card=explanation]")).toContainText(/Why this is a great match|fit/i);
    await expect(page.locator("[data-match-card=insights]")).toBeVisible();
    await expect(page.locator("[data-tick]").first()).toBeVisible();
  });

  test("MKT-14 Omar reads the Opportunities board and filters it", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/opportunities");
    await ready(page, "[data-opportunities]").waitFor();
    await narrate(page, "Four tiles: open, ready to assign, awaiting consultant review, stale");
    for (const id of ["open", "ready", "awaiting", "stale"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    await expect(page.locator("[data-opp-row]").first()).toBeVisible();

    await narrate(page, "Filtering by Interest Status narrows the table to that status");
    await page.getByRole("button", { name: "Interest Status" }).click();
    await page.getByRole("option", { name: "No Response" }).click();
    await expect
      .poll(async () => {
        const v = await page.locator("[data-opp-interest]").evaluateAll((els) => els.map((e) => e.getAttribute("data-opp-interest")));
        return v.length > 0 && v.every((x) => x === "NO_RESPONSE");
      })
      .toBe(true);

    await narrate(page, "A search that matches nothing shows the empty state");
    await page.getByLabel("Search by consultant or job title").fill("zzz-no-such-job");
    await expect(page.getByText("No opportunities match these filters.")).toBeVisible();
    await narrate(page, "Quick actions are requests only: nothing here answers or submits for a consultant");
    await expect(page.locator('[data-quick="bulk"], [data-quick="notify"], [data-quick="export"]')).toHaveCount(3);
  });

  test("MKT-15 Omar adds an opportunity, assigns it, and the consultant's answer stays the consultant's", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/marketing/opportunities");
    await ready(sarah.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(sarah.page);
    const anika = await consultantIdByName(sarah.page, orgId, "Anika Rao");
    const body = jobBody(Date.now(), [anika]);
    const title = String(body.title);
    expect((await captureJob(sarah, "sarah", orgId, body)).status).toBe(200);

    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    await narrate(omar.page, "Omar presses Add Opportunity");
    await omar.page.getByRole("button", { name: /Add Opportunity/ }).click();
    const dlg = omar.page.locator("[data-opp-dialog=add]");
    await expect(dlg).toContainText("The consultant is not contacted until you assign it.");
    await dlg.getByRole("button", { name: "Consultant" }).click();
    await omar.page.getByRole("option", { name: /Ben Okafor/ }).click();
    await dlg.getByRole("button", { name: "Job" }).click();
    await omar.page.getByRole("option", { name: new RegExp(`Story ${String(body.externalJobId).replace("story-", "")}`) }).click();
    await dlg.getByRole("button", { name: "Add opportunity" }).click();

    await narrate(omar.page, "It appears as a suggestion with no answer from Ben");
    const row = await boardRow(omar.page, title);
    await expect(row.locator("[data-opp-interest=NO_RESPONSE]")).toBeVisible();
    await expect(row).toHaveAttribute("data-action", /ASSIGN|FOLLOW_UP/);
    if ((await row.getAttribute("data-action")) === "ASSIGN") {
      await narrate(omar.page, "Assign asks Ben for his interest; it never answers for him");
      await row.getByRole("button", { name: "Assign" }).click();
      await expect(omar.page.getByText(/Assigned|assigned|asked|Requested|Interest requested/i).first()).toBeVisible();
    }
    await expect(omar.page.locator("[data-opp-row]").filter({ hasText: title }).locator("[data-opp-interest=NO_RESPONSE]")).toBeVisible();
  });

  test("MKT-16 Omar adds a job stream, pauses it and resumes it", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/streams");
    await ready(page, "[data-job-streams]").waitFor();
    await narrate(page, "Four tiles show stream health");
    await expect(page.locator("[data-streams-tiles] [data-stat-tile]")).toHaveCount(4);
    const label = `Story Feed ${Date.now()}`;
    await narrate(page, "Add Job Stream: a source name, a schedule and keywords");
    await page.getByRole("button", { name: "Add Job Stream" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("LinkedIn Jobs").fill(label);
    await dialog.getByPlaceholder("Java, AWS, Data Engineer").fill("Playwright, QA");
    await expect(dialog).toContainText("Openings start to appear once the connector for this source is switched on.");
    await dialog.getByRole("button", { name: "Add Job Stream" }).click();
    const row = page.locator(`[data-stream-row="${label}"]`);
    await expect(row).toBeVisible();

    await narrate(page, "Pause and Resume change its status");
    await row.getByRole("button", { name: "Pause" }).click();
    await expect(row).toContainText("Paused");
    await row.getByRole("button", { name: "Resume" }).click();
    await expect(row).toContainText("Active");
  });
});
