import { test, expect, narrate } from "../_support/story";
import { boardRow, captureJob, consultantIdByName, conRow, jobBody, keepMarketed, orgIdOf, ready } from "./_mkt";

/** Resumes, Jobs (Openings / Matches / Sources tabs) and the Opportunities board (Omar, plus Sarah for cross-person set-up). */

test.describe("MKT resumes, discovery, matches, opportunities, streams", () => {
  test("MKT-10 Omar reviews his consultants' resumes and previews one", async ({ as }) => {
    // The Marketing workspace has its own Resumes page (no tiles: the chip row carries the counts), scoped to Omar's consultants; rows are tr[data-resume-row].
    const { page, go } = await as("omar");
    await go("/w/marketing/resumes");
    await ready(page, "[data-mkt-resumes]").waitFor();
    await narrate(page, "The chips count his consultants' resumes and the ones pending review");
    const all = page.locator('[data-resumes-chips] [data-status-chip="ALL"]');
    await expect(all).toHaveText(/\(\d+\)/);
    expect(Number(/\((\d+)\)/.exec(await all.innerText())![1])).toBeGreaterThan(0);
    await expect(page.locator('[data-resumes-chips] [data-status-chip="PENDING"]')).toContainText("Pending review");

    await narrate(page, "The table lists a resume per row with its approval state");
    const rows = page.locator("tr[data-resume-row]");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText(/Approved|Pending review|Needs update/);

    await narrate(page, "Searching for a title that does not exist shows an honest empty table");
    const search = page.getByPlaceholder("Search consultants or resume titles...");
    await search.fill("zzz-nobody-has-this-title");
    await expect(rows).toHaveCount(0);
    await expect(page.getByText("No resumes match these filters.")).toBeVisible();
    await search.fill("");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "View opens a preview of the resume with its approval status");
    await rows.first().getByRole("button", { name: /^View / }).click();
    const drawer = page.locator('[data-resume-drawer][data-mode="view"]');
    await expect(drawer.getByRole("article", { name: "Resume preview" })).toBeVisible();
    await expect(drawer).toContainText(/Approved|Pending review|Needs update/);
  });

  test("MKT-11 Omar searches Jobs › Openings and opens a job's details", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/jobs");
    await ready(page, "[data-jobs-page]").waitFor();
    await narrate(page, "Jobs opens on the Openings tab: every opening from his sources");
    const rows = page.locator("[data-job-row]");
    await expect(rows.first()).toBeVisible();

    await narrate(page, "He searches for 'react'");
    await page.getByPlaceholder(/Search title, skills, client/).fill("react");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(rows.first()).toContainText(/react/i);

    await narrate(page, "A search with no hits says so");
    await page.getByPlaceholder(/Search title, skills, client/).fill("zzz-no-such-opening-zzz");
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

  test.describe("a consultant who is being marketed", () => {
  keepMarketed("Ben Okafor"); // Ben is ON_PROJECT (marketing paused) in the seed: nothing can be assigned to him until he is available

  test("MKT-12 Omar assigns a job to Ben from Jobs › Openings and Ben receives it (the consultant still applies himself)", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/admin"); // Sarah only supplies the job here; her own marketing workspace is not built, so no marketing page is opened for her
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
    const orgId = await orgIdOf(sarah.page);
    const anika = await consultantIdByName(sarah.page, orgId, "Anika Rao");
    const body = jobBody(Date.now(), [anika]);
    const title = String(body.title);
    await narrate(sarah.page, "Sarah captured a job for Anika; it is now an open job in the org");
    expect((await captureJob(sarah, "sarah", orgId, body)).status).toBe(200);

    const omar = await as("omar");
    await omar.go("/w/marketing/jobs");
    await ready(omar.page, "[data-jobs-page]").waitFor();
    await narrate(omar.page, "Omar finds the same job in Jobs › Openings");
    await omar.page.getByPlaceholder(/Search title, skills, client/).fill(title);
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
    await ready(ben.page, "[data-consultant-opportunities]").waitFor();
    await narrate(ben.page, "Ben has it in Opportunities › Assigned, assigned by Omar");
    await expect(conRow(ben.page, title)).toHaveCount(1);
    await expect(conRow(ben.page, title)).toContainText("Omar Haddad");
  });

  test("MKT-13 Omar reads Jobs › Matches and opens the explanation for one", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/jobs?tab=matches");
    await ready(page, "[data-job-matches]").waitFor();
    await narrate(page, "The Matches tab lists his consultants' matches");
    const rows = page.locator("[data-match-row]");
    await expect(rows.first().or(page.getByText(/Run a match to see suggestions|No matches fit these filters/))).toBeVisible();
    if ((await rows.count()) === 0) {
      await expect(page.getByText(/Run a match to see suggestions|No matches fit these filters/)).toBeVisible();
      return;
    }
    await narrate(page, "Selecting a row explains why the consultant fits the job");
    await rows.first().click();
    await expect(page.locator("[data-match-card=explanation]")).toContainText(/Why this|fit/i);
    await expect(page.locator("[data-tick]").first()).toBeVisible();
  });

  test("MKT-14 Omar reads the Opportunities board and filters it", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/opportunities");
    await ready(page, "[data-opportunities]").waitFor();
    await narrate(page, "Two tiles flag what needs him: awaiting consultant review, stale");
    for (const id of ["awaiting", "stale"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    await expect(page.locator("[data-opp-row]").first()).toBeVisible();

    await narrate(page, "The No response interest chip narrows the table to that status");
    await page.locator('[data-interest-chip="NO_RESPONSE"]').click();
    await expect(page.locator('[data-interest-chip="NO_RESPONSE"]')).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const v = await page.locator("[data-opp-interest]").evaluateAll((els) => els.map((e) => e.getAttribute("data-opp-interest")));
        return v.length > 0 && v.every((x) => x === "NO_RESPONSE");
      })
      .toBe(true);

    await narrate(page, "A search that matches nothing shows the empty state");
    await page.getByLabel("Search by consultant or job title").fill("zzz-no-such-job");
    await expect(page.getByText("No opportunities match these filters.")).toBeVisible();
    await narrate(page, "Bulk assign, Notify consultants and Export are requests only: nothing here answers or submits for a consultant");
    const board = page.locator('[data-opp-card="table"]');
    await expect(board.getByRole("button", { name: "Bulk assign" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Notify consultants" })).toBeVisible();
    await expect(board.getByRole("link", { name: "Export" })).toBeVisible();
  });

  test("MKT-15 Omar adds an opportunity, assigns it, and the consultant's answer stays the consultant's", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/admin");
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
    const orgId = await orgIdOf(sarah.page);
    const anika = await consultantIdByName(sarah.page, orgId, "Anika Rao");
    const body = jobBody(Date.now(), [anika]);
    const title = String(body.title);
    expect((await captureJob(sarah, "sarah", orgId, body)).status).toBe(200);

    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    await narrate(omar.page, "Omar presses Add opportunity");
    await omar.page.getByRole("button", { name: /Add opportunity/ }).first().click();
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
  });

  test("MKT-16 Omar adds a job source, pauses it and resumes it", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/jobs?tab=sources");
    await ready(page, "[data-job-streams]").waitFor();
    await narrate(page, "Jobs › Sources: one status line sums up the sources");
    await expect(page.locator("[data-sources-status]")).toBeVisible();
    const label = `Story Feed ${Date.now()}`;
    await narrate(page, "Add source: a source name, a schedule and keywords");
    await page.getByRole("button", { name: "Add source" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("LinkedIn Jobs").fill(label);
    await dialog.getByPlaceholder("Java, AWS, Data Engineer").fill("Playwright, QA");
    await expect(dialog).toContainText("Openings start to appear once the connector for this source is switched on.");
    await dialog.getByRole("button", { name: "Add source" }).click();
    const row = page.locator(`[data-stream-row="${label}"]`);
    await expect(row).toBeVisible();

    await narrate(page, "Pause and Resume change its status");
    await row.getByRole("button", { name: "Pause" }).click();
    await expect(row).toHaveCount(0); // a paused source is inactive, and inactive sources are hidden unless Show inactive is on
    await page.getByRole("switch", { name: "Show inactive" }).click();
    await expect(row).toContainText("Paused");
    await row.getByRole("button", { name: "Resume" }).click();
    await expect(row).toContainText("Active");
  });
});
