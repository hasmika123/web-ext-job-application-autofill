import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { FRESH, MOCK_URL, STATE } from "../fixtures/accounts";
import { expectNoHorizontalScroll, expectNoSeriousAxe, expectNoWordPerLineHeadings } from "../fixtures/audit";

/**
 * Joining an organization (O2.2, O6.2, O2.3). Runs against the mock API (`scripts/mock-org.mjs`), which stands in for
 * `JoinResource` / `MeOrgResource` / `OrgMemberResource`:
 *
 *  - a shared link (`/join/<slug>/<code>`) as a signed-out visitor: preview -> sign in -> back on the consent step -> "What
 *    exactly?" -> join -> "You're in", and the join shows in `GET /api/me/orgs`;
 *  - an emailed invite (`/join/t/<token>`): the owner invites, the "email" lands in the mock outbox, the invitee opens its
 *    link signed in and joins with the other choice;
 *  - links that don't work (junk, used, full, used twice) are one calm screen each.
 *
 * Both a phone (390) and a desktop (1440) width get the audits: no serious axe findings, no sideways scroll, no
 * word-per-line heading.
 */
test.describe.configure({ mode: "serial" });

const CODE_LINK = "/join/brightside-bootcamp/BRTE5K26";
/** The writable organization the mock seeds for `org.owner` (the demo organization is id 1). */
const BRIGHTSIDE = 2;

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${MOCK_URL}/mock/org/reset`);
  expect(reset.ok(), "the mock org store resets").toBeTruthy();
});

async function as(browser: Browser, who: keyof typeof STATE | null, width = 390): Promise<Page> {
  const context = await browser.newContext({ storageState: who ? STATE[who] : undefined, viewport: { width, height: width < 700 ? 844 : 900 } });
  return context.newPage();
}

async function audit(page: Page, label: string) {
  await expectNoHorizontalScroll(page, label);
  await expectNoWordPerLineHeadings(page, label);
  await expectNoSeriousAxe(page, label);
}

for (const width of [390, 1440]) {
  test(`a signed-out visitor previews a shared link, signs in, chooses and joins (${width}px)`, async ({ browser }) => {
    const page = await as(browser, null, width);
    await page.goto(CODE_LINK);
    await expect(page.getByRole("heading", { level: 1, name: "Join Brightside Bootcamp" })).toBeVisible();
    await expect(page.getByText("As a member · Spring cohort")).toBeVisible();
    await expect(page.getByText(/You keep your own account, resumes and applications/)).toBeVisible();
    await audit(page, `join preview at ${width}`);

    // both ways in carry the visitor back to this very page
    await expect(page.getByRole("link", { name: "Create an account to join" })).toHaveAttribute("href", `/signup?next=${encodeURIComponent(CODE_LINK)}`);
    await page.getByRole("link", { name: "I already have an account" }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel("Email address").fill(FRESH.username);
    await page.getByLabel("Password", { exact: true }).fill(FRESH.password);
    await page.getByRole("button", { name: "Log in" }).click();

    // back on the join page, now on the consent step: the recommended choice is already picked
    await expect(page).toHaveURL(new RegExp(`${CODE_LINK}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Join Brightside Bootcamp" })).toBeVisible();
    const summary = page.getByRole("radio", { name: /Progress summary/ });
    const none = page.getByRole("radio", { name: /Only that I joined/ });
    await expect(summary).toHaveAttribute("aria-checked", "true");
    await expect(none).toHaveAttribute("aria-checked", "false");
    await audit(page, `consent at ${width}`);

    // "What exactly?" spells it out and closes again
    await page.getByRole("button", { name: "What exactly?" }).click();
    const sheet = page.getByRole("dialog", { name: "What exactly can they see?" });
    await expect(sheet.getByText("Neither choice ever shows")).toBeVisible();
    await expect(sheet.getByRole("row", { name: /How many applications you have in each stage/ })).toBeVisible();
    await audit(page, `what exactly at ${width}`);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "Join Brightside Bootcamp" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /You're in\. Welcome to Brightside Bootcamp\./ })).toBeVisible();
    await expect(page.getByText(/Brightside Bootcamp sees a progress summary/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Add the browser extension/ })).toHaveAttribute("href", "/connect");
    await expect(page.getByRole("link", { name: /Upload or build a resume/ })).toHaveAttribute("href", "/resumes");
    await audit(page, `done at ${width}`);

    // the choice and the seat are really recorded
    const mine = await page.request.get("/api/me/orgs");
    expect(mine.ok()).toBeTruthy();
    const orgs = (await mine.json()) as { org: { slug: string }; scope: string; consentVersion: string; sees: string[] }[];
    const ours = orgs.find((o) => o.org.slug === "brightside-bootcamp");
    expect(ours).toMatchObject({ scope: "SUMMARY", consentVersion: "org-share/v1" });
    expect(ours!.sees.join(" ")).toContain("How many applications you have in each stage");
    expect(ours!.sees.join(" ")).not.toMatch(/Company names/);
    await page.context().close();
  });
}

test("an emailed invite: the owner invites, the invitee opens the link and joins sharing only the seat", async ({ browser, request }) => {
  const owner = await as(browser, "org-owner");
  const sent = await owner.request.post(`/api/orgs/${BRIGHTSIDE}/members/invite`, { data: { emails: ["Sam <sam@example.test>", "not-an-email"], role: "MEMBER" } });
  expect(sent.status()).toBe(200);
  const result = (await sent.json()) as { invited: { email: string; name: string }[]; invalid: { reason: string }[] };
  expect(result.invited).toMatchObject([{ email: "sam@example.test", name: "Sam" }]);
  expect(result.invalid).toMatchObject([{ reason: "malformed" }]);

  const outbox = (await (await request.get(`${MOCK_URL}/mock/org/outbox?to=sam@example.test`)).json()) as { link: string; orgName: string }[];
  expect(outbox).toHaveLength(1);
  expect(outbox[0].link).toMatch(/^\/join\/t\/[A-Za-z0-9]{32}$/);

  const invitee = await as(browser, "fresh");
  await invitee.goto(outbox[0].link);
  await expect(invitee.getByRole("heading", { level: 1, name: "Join Brightside Bootcamp" })).toBeVisible();
  await expect(invitee.getByText("by Jordan Ellis")).toBeVisible();
  await invitee.getByRole("radio", { name: /Only that I joined/ }).click();
  await invitee.getByRole("button", { name: "Join Brightside Bootcamp" }).click();
  await expect(invitee.getByText(/Brightside Bootcamp sees only that you joined/)).toBeVisible();

  // the link is single use: opening it again is the same calm "doesn't work" screen, not a leak of who used it
  await invitee.goto(outbox[0].link);
  await expect(invitee.getByRole("heading", { level: 1, name: "This link doesn't work" })).toBeVisible();
  await audit(invitee, "dead link");
  await owner.context().close();
  await invitee.context().close();
});

test("links that don't work are one calm screen each, and a full link says whose it was", async ({ browser, request }) => {
  const page = await as(browser, null);
  await page.goto(`/join/t/${"Z".repeat(32)}`);
  await expect(page.getByRole("heading", { level: 1, name: "This link doesn't work" })).toBeVisible();
  await audit(page, "junk link");
  await page.goto("/join/brightside-bootcamp/NOPE1234");
  await expect(page.getByRole("heading", { level: 1, name: "This link doesn't work" })).toBeVisible();
  // the right code under the wrong slug is a bad link too: a stranger cannot tell which half was wrong
  await page.goto("/join/some-other-org/BRTE5K26");
  await expect(page.getByRole("heading", { level: 1, name: "This link doesn't work" })).toBeVisible();

  // use up the code's three places through the API, then open it
  const joiner = await as(browser, "fresh");
  for (let i = 0; i < 3; i++) {
    const ok = await request.post(`${MOCK_URL}/mock/org/fill-code?code=BRTE5K26`);
    expect(ok.ok()).toBeTruthy();
  }
  await joiner.goto(CODE_LINK);
  await expect(joiner.getByRole("heading", { level: 1, name: "This link has no places left" })).toBeVisible();
  await expect(joiner.getByText(/Brightside Bootcamp's link has been used by everyone it was meant for/)).toBeVisible();
  await audit(joiner, "full link");
  await page.context().close();
  await joiner.context().close();
});
