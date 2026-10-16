import { test, expect, narrate } from "../_support/story";
import { api, bff, orgIdOf, ready, sidebar, tileValue } from "./_mkt";

/** Marketing Home, the sidebar tour and My Assigned Talent, plus the denied variants. Personas: omar (Marketing Specialist, ASSIGNED scope), sarah (Org Admin + Marketing Manager). */

const HOME_TILES = ["assigned", "profilesReady", "newMatches", "pendingSubmissions", "upcomingInterviews", "overdueFollowups"];
const HOME_CARDS = ["My Assigned Talent", "Job Stream Monitor", "Top Openings for My Talent", "Submission Pipeline", "Today's Follow-ups & Tasks", "Upcoming Interviews", "Recent Activity"];

test.describe("MKT home and talent", () => {
  test("MKT-01 Omar starts his day on the Talent Marketing Dashboard", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing");
    await narrate(page, "Omar lands on the Talent Marketing Dashboard");
    await expect(page.getByRole("heading", { name: "Talent Marketing Dashboard" })).toBeVisible();
    await ready(page, "[data-marketing-home]").waitFor();

    await narrate(page, "Six numbers, all counted from his own assigned consultants");
    for (const id of HOME_TILES) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    const assigned = await tileValue(page, "assigned");
    expect(assigned).toBeGreaterThan(0); // seeded: Omar is the primary marketer of Ben plus a seeded book
    await expect(page.locator('[data-stat-tile="assigned"]')).toContainText("Assigned Consultants");

    await narrate(page, "Below them: talent, streams, openings, pipeline, follow-ups, interviews and activity");
    for (const name of HOME_CARDS) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(page.locator("[data-talent-row]").first()).toBeVisible();
    expect(await page.locator("[data-talent-row]").count()).toBeLessThanOrEqual(5);
    await expect(page.locator('[data-home-card="help"]')).toBeVisible();
  });

  test("MKT-02 Omar tours every Marketing page from the sidebar", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing");
    await ready(page, "[data-marketing-home]").waitFor();
    const tour: [string, string, string, string][] = [
      ["My Assigned Talent", "/talent", "[data-marketing-talent]", "My Assigned Talent"],
      ["Resumes", "/resumes", "[data-mkt-resumes]", "Resumes"],
      ["Job Discovery", "/jobs", "[data-jobs-page]", "Job Discovery"],
      ["Job Matches", "/matches", "[data-job-matches]", "Job Matches"],
      ["Opportunities", "/opportunities", "[data-opportunities]", "Opportunities"],
      ["Job Streams", "/streams", "[data-job-streams]", "Job Streams"],
      ["Submissions", "/submissions", "[data-submissions-page]", "Submissions"],
      ["Applications", "/applications", "[data-applications]", "Applications"],
      ["Interviews", "/interviews", "[data-interviews]", "Interviews"],
      ["Follow-ups", "/followups", "[data-followups-page]", "Follow-ups"],
      ["Tasks", "/tasks", "[data-tasks-page]", "Tasks"],
      ["Activities", "/activity", "[data-activity-page]", "Activities"],
      ["Performance", "/performance", "[data-performance]", "Performance"],
    ];
    for (const [label, end, root, heading] of tour) {
      await narrate(page, `Omar opens ${label}`, 500);
      await sidebar(page, label, end);
      await ready(page, root).waitFor();
      await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("This page is on the way");
      await expect(page.locator("body")).not.toContainText("This isn't part of your role");
    }
  });

  test("MKT-03 Sarah (marketing manager) opens the same workspace with her own book", async ({ as }) => {
    // BLOCKED: Sarah's second role (Marketing Manager) opens /w/marketing-mgmt, a placeholder ("This page is on the way"); /w/marketing is the specialist's
    // workspace and is not part of her roles. The steps below are what the story means to prove once the manager workspace shows her own book.
    test.fixme(true, "Marketing manager workspace (/w/marketing-mgmt) is not built: Sarah is refused /w/marketing and her own workspace is a placeholder");
    const { page, go } = await as("sarah");
    await go("/w/marketing");
    await narrate(page, "Sarah switches to the Marketing workspace");
    await ready(page, "[data-marketing-home]").waitFor();
    await expect(page.getByRole("heading", { name: "Talent Marketing Dashboard" })).toBeVisible();
    const assigned = await tileValue(page, "assigned");
    expect(assigned).toBeGreaterThan(0);
    await narrate(page, "Her talent list opens too, and Anika Rao (her primary consultant) can be found");
    await go("/w/marketing/talent");
    await ready(page, "[data-marketing-talent]").waitFor();
    await page.getByPlaceholder("Search by name, skill, or location...").fill("Anika");
    await expect(page.locator("[data-talent-row]").filter({ hasText: "Anika Rao" })).toHaveCount(1);
  });

  test("MKT-03b Today the marketing manager is told /w/marketing is not part of her role, and her own workspace says it is on the way", async ({ as }) => {
    const { page, go } = await as("sarah");
    await go("/w/marketing");
    await narrate(page, "Sarah (Org Admin and Marketing Manager) types /w/marketing");
    await expect(page.locator("[data-not-your-role]").first()).toBeVisible({ timeout: 30_000 });
    await go("/w/marketing-mgmt");
    await expect(page.locator("[data-coming-soon]")).toBeVisible();
  });

  test("MKT-04 Omar finds a consultant, filters by status and opens the profile drawer", async ({ as }) => {
    const { page, go } = await as("omar");
    await go("/w/marketing/talent");
    await ready(page, "[data-marketing-talent]").waitFor();
    await narrate(page, "Five tiles describe his assigned consultants");
    for (const id of ["assigned", "availableNow", "needUpdates", "activeInterviews", "pendingApprovals"]) await expect(page.locator(`[data-stat-tile="${id}"]`)).toBeVisible();
    const total = await tileValue(page, "assigned");

    await narrate(page, "He searches for Ben");
    await page.getByPlaceholder("Search by name, skill, or location...").fill("Ben");
    const bens = page.locator("[data-talent-row]").filter({ hasText: "Ben Okafor" });
    await expect(bens).toHaveCount(1);

    await narrate(page, "Clearing the search and choosing the Available Now chip narrows the list");
    await page.getByPlaceholder("Search by name, skill, or location...").fill("");
    await page.locator('[data-status-chip="AVAILABLE_NOW"]').click();
    await expect(page.locator('[data-status-chip="AVAILABLE_NOW"]')).toHaveAttribute("aria-pressed", "true");
    const filtered = await page.locator("[data-talent-row]").count();
    expect(filtered).toBeLessThanOrEqual(total);
    await page.locator('[data-status-chip="ALL"]').click();

    await narrate(page, "View Profile opens a summary-only drawer");
    await page.getByPlaceholder("Search by name, skill, or location...").fill("Ben");
    await bens.getByRole("button", { name: "View Profile" }).click();
    const drawer = page.locator("[data-talent-drawer]");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Ben Okafor");
    await expect(drawer).toContainText("Summary only. Contact details stay with the consultant.");
    for (const h of ["Skills", "Resumes", "Active applications", "Upcoming interviews", "Assigned jobs"]) await expect(drawer.getByText(h, { exact: true }).first()).toBeVisible();
  });

  test("MKT-05 A consultant is refused the Marketing workspace, and its API answers 404", async ({ as }) => {
    const anika = await as("anika");
    await anika.go("/w/marketing");
    await narrate(anika.page, "Anika (consultant) tries to open the Marketing workspace");
    await expect(anika.page.getByText("This isn't part of your role").first()).toBeVisible();
    await expect(anika.page.locator("[data-marketing-home]")).toHaveCount(0);
    const orgId = await orgIdOf(anika.page);
    await narrate(anika.page, "The data behind it is refused too: a generic 404, not a hint");
    for (const p of ["home", "talent", "opportunities", "tasks"]) {
      const r = await bff(anika.page, `/api/orgs/${orgId}/mkt/${p}`);
      expect(r.status, p).toBe(404);
    }
    const direct = await api(anika, "anika", "GET", `/api/orgs/${orgId}/mkt/home`);
    expect(direct.status).toBe(404);
  });

  test("MKT-06 A consultant outside Omar's book cannot be opened by id", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/admin"); // Sarah only supplies Anika's id (her marketing manager workspace is not built)
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
    const orgId = await orgIdOf(sarah.page);
    // Anika's id from Sarah's view (Sarah is her primary marketer)
    const opts = await bff<{ consultants?: { id: number; name: string }[] }>(sarah.page, `/api/orgs/${orgId}/mkt/opportunities/options?q=Anika`);
    const anika = opts.json?.consultants?.find((c) => c.name === "Anika Rao");
    expect(anika, "Anika is in Sarah's assignable list").toBeTruthy();

    const omar = await as("omar");
    await omar.go("/w/marketing/talent");
    await ready(omar.page, "[data-marketing-talent]").waitFor();
    await narrate(omar.page, "Omar asks for Anika's profile, who is not in his book");
    const r = await bff(omar.page, `/api/orgs/${orgId}/mkt/talent/${anika!.id}`);
    expect(r.status).toBe(404);
    await omar.page.getByPlaceholder("Search by name, skill, or location...").fill("Anika");
    await expect(omar.page.locator("[data-talent-row]").filter({ hasText: "Anika Rao" })).toHaveCount(0);
  });
});
