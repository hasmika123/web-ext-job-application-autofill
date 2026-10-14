import { test, expect, narrate } from "../_support/story";
import { PORT } from "../_support/personas";
import { ROOTS, bff, noSidewaysScroll, openPage, orgIdOf, pageTitle } from "./_helpers";

/** The 20 sidebar items in the boards' order (web/e2e/journeys/consultant-pages.spec.ts pins the same list). */
const SIDEBAR = [
  ["", "Home"],
  ["profile", "My Career Profile"],
  ["resumes", "My Resumes"],
  ["marketer", "My Marketer"],
  ["job-discovery", "Job Discovery"],
  ["matches", "Job Matches"],
  ["opportunities", "Assigned Opportunities"],
  ["applications", "My Applications"],
  ["submissions", "Submissions & Approvals"],
  ["interviews", "Interviews"],
  ["interview-prep", "Interview Prep"],
  ["offers", "Offers"],
  ["placements", "My Placement"],
  ["availability", "Availability"],
  ["tasks", "Tasks & Follow-ups"],
  ["activity-timeline", "Activity Timeline"],
  ["inbox", "Inbox"],
  ["features", "My Features"],
  ["notifications", "Notifications"],
  ["settings", "Settings"],
] as const;

test("CON-01 Anika opens her consultant Home and sees her own pipeline at a glance", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika signs in and lands on her consultant Home");
  await openPage(page, go, "");
  await expect(page).toHaveURL(/\/w\/consultant$/);
  await expect(pageTitle(page)).toHaveText("Home");

  await narrate(page, "Six key numbers summarise matches, opportunities, applications, interviews, approvals and placement");
  for (const key of ["jobMatches", "assignedOpportunities", "activeApplications", "upcomingInterviews", "submissionsPending", "activePlacement"]) {
    await expect(page.locator(`[data-stat-tile=${key}] [data-tile-value]`)).toBeVisible();
  }
  // The demo seed gives Anika three upcoming interviews (ConsultantWsDemoSeeder.pipeline()).
  await expect(page.locator("[data-stat-tile=upcomingInterviews] [data-tile-value]")).toHaveText("3");

  await narrate(page, "Every card on Home is her own data: matches, assigned jobs, applications, interviews, resume, tasks");
  for (const id of ["home-matches", "home-assigned", "home-applications", "home-interviews", "home-resume", "home-tasks", "home-focus", "home-quick", "home-messages", "help"]) {
    await expect(page.locator(`[data-home-card=${id}]`)).toBeVisible();
  }
  await expect(page.locator("[data-interview]")).toHaveCount(3);
  await expect(page.locator("[data-home-card=home-tasks] [data-task]").first()).toBeVisible();
  await expect(page.locator("[data-home-card=home-matches] [data-match]").first()).toBeVisible();

  await narrate(page, "Marketer messages are labelled Sample until the marketing workspace is connected");
  await expect(page.locator("[data-home-card=home-messages] [data-sample]")).toBeVisible();
});

test("CON-02 Anika jumps from Home into her work with Quick Actions and View All links", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "");

  await narrate(page, "Today's Focus items can be ticked off");
  const focus = page.locator("[data-home-card=home-focus]");
  const firstBox = focus.getByRole("checkbox").first();
  if (await firstBox.count()) {
    await firstBox.check();
    await expect(firstBox).toBeChecked();
  }

  await narrate(page, "Quick Action: Practice Interview opens Interview Prep");
  await page.locator("[data-quick=practice-interview]").click();
  await expect(page).toHaveURL(/\/w\/consultant\/interview-prep/);
  await expect(page.locator(`${ROOTS["interview-prep"]}[data-status=ready]`)).toBeVisible();

  await narrate(page, "Back on Home, View All on My Applications opens the full list");
  await go("/w/consultant");
  await expect(page.locator("[data-consultant-home][data-status=ready]")).toBeVisible();
  await page.locator("[data-home-card=home-applications]").getByRole("link", { name: "View All" }).click();
  await expect(page).toHaveURL(/\/w\/consultant\/applications/);
  await expect(page.locator(`${ROOTS.applications}[data-status=ready]`)).toBeVisible();

  await narrate(page, "Update Resume leads to My Resumes");
  await go("/w/consultant");
  await page.locator("[data-quick=update-resume]").click();
  await expect(page).toHaveURL(/\/w\/consultant\/resumes/);
  await expect(page.locator(`${ROOTS.resumes}[data-status=ready]`)).toBeVisible();
});

test("CON-03 Anika walks the 20-item consultant sidebar and every page opens with its data", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "");
  const items = page.locator('[data-shell-sidebar] nav[aria-label="Main"] a[href^="/w/consultant"]'); // the menu only (the brand link above it also points at the Home)
  await expect(items.filter({ hasText: /\S/ })).toHaveCount(20);
  const labels = (await items.allInnerTexts()).map((x) => x.trim()).filter(Boolean);
  expect(labels).toEqual(SIDEBAR.map(([, l]) => l));

  for (const [slug, label] of SIDEBAR) {
    await narrate(page, `Anika opens ${label}`, 500);
    const href = slug ? `/w/consultant/${slug}` : "/w/consultant";
    await page.locator(`[data-shell-sidebar] a[href="${href}"]`).first().click();
    await expect(page.locator(`${ROOTS[slug]}[data-status=ready]`)).toBeVisible({ timeout: 30_000 });
  }
});

test("CON-04 Sarah (Org Admin, not a consultant) is told 'not part of your role' and the consultant API answers 404", async ({ as }) => {
  const { page, go } = await as("sarah");
  await narrate(page, "Sarah is the Org Admin. She has no consultant profile");
  await go("/w/consultant");
  await expect(page.getByText(/part of your role/i).first()).toBeVisible(); // shell state (data-not-your-role) or the page's own denied state
  await expect(page.locator("[data-consultant-home]")).toHaveCount(0);

  await narrate(page, "A deep link to a consultant page shows the same honest state, no data");
  await go("/w/consultant/placements");
  await expect(page.getByText(/part of your role/i).first()).toBeVisible();
  await expect(page.locator("[data-consultant-placements]")).toHaveCount(0);

  await narrate(page, "The API says 404 (never 403) to a member who is not a consultant");
  const org = await orgIdOf(page);
  for (const path of ["home", "profile", "resumes", "applications", "offers"]) {
    const r = await bff(page, "GET", `/api/orgs/${org}/me-workspace/${path}`);
    expect(r.status, path).toBe(404);
  }
});

test("CON-05 Another tenant's host cannot read Acme's consultant workspace", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "");
  const org = await orgIdOf(page);

  await narrate(page, "The same URL on Beta Talent's host does not carry Anika's session");
  const betaBase = `http://beta.localhost:${PORT}`;
  const api = await page.goto(`${betaBase}/api/orgs/${org}/me-workspace/home`);
  expect([401, 403, 404]).toContain(api?.status());
  await page.goto(`${betaBase}/w/consultant`);
  await expect(page.locator("[data-consultant-home]")).toHaveCount(0);
  // Sessions are host-only: Beta's host asks for its own sign-in.
  await expect(page).toHaveURL(/\/login/);
});

test("CON-06 On a phone the consultant pages fit the screen (no sideways scroll)", async ({ as }) => {
  const { page, go } = await as("anika");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ["", "job-discovery", "matches", "applications", "tasks", "availability"]) {
    await narrate(page, `Checking ${slug || "home"} at 390px`, 400);
    await openPage(page, go, slug);
    await noSidewaysScroll(page);
  }
});
