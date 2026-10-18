import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, openPage, orgIdOf, pageTitle } from "./_helpers";

/**
 * The consultant's OWN Gmail inbox inside the organization workspace (docs/enterprise-v2/18-consultant-inbox.md). On the demo stack the "Gmail" is a
 * built-in sample mailbox (DemoImapGateway): one fixed demo address, any 16 letters connect it, and its mail goes through the real sync, parser and board.
 * The address and the code rules are TEST VALUES read from the same fixture file the API reads; no real mailbox is ever contacted.
 *
 * Anika's license carries the add-on `inbox.monitoring`; Ben's does not. Sarah (Org Admin) and Omar (Marketing Specialist) are the organization's side:
 * they must never see any of it. CON-75 switches Anika's add-on off in the database of the QA stack and puts it back (needs docker and the QA MySQL
 * container; it skips itself otherwise). The stories share one mailbox state per database: they disconnect first, and accepting a suggestion consumes it
 * (re-seed the demo database to repeat that step).
 */

const FIXTURE = JSON.parse(readFileSync(resolve(__dirname, "../../../../api/src/main/resources/demo/inbox-demo.json"), "utf8")) as {
  address: string;
  wrongCodePrefix: string;
  appPasswordRequiredPrefix: string;
  mails: { subject: string; fromAddress: string; body: string }[];
};
const ADDRESS = FIXTURE.address;
const GOOD_CODE = "abcdefghijklmnop";
const code = (prefix: string) => (prefix + "abcdefghijklmnop").slice(0, 16);
const BAD_CODE = code(FIXTURE.wrongCodePrefix);
const NEEDS_APP_CODE = code(FIXTURE.appPasswordRequiredPrefix);

const READY = "[data-consultant-inbox][data-status=ready]";

/** Everything a mail could leak to the organization: the address, a sender, a subject, a line of a body. */
const MAIL_MARKERS = [ADDRESS, "orbitfreight.example", "cedaranalytics.example", "harborcloud.example", "lumenhealth.example", "Ten long articles for the weekend", "Please share your availability"];

async function leavesNoMailInside(page: Page, paths: string[]) {
  for (const p of paths) {
    const r = await bff(page, "GET", p);
    const text = JSON.stringify(r.json) ?? "";
    for (const m of MAIL_MARKERS) expect(text, `${p} must not carry "${m}"`).not.toContain(m);
  }
}

/** Disconnect through the BFF so every story starts from "nothing connected" (the API forgets the password and every message). */
async function startClean(page: Page, orgId: number) {
  const r = await bff(page, "DELETE", `/api/orgs/${orgId}/me-workspace/inbox`);
  expect(r.status).toBe(200);
}

async function connectFromThePage(page: Page, address: string, password: string) {
  await page.getByLabel("Gmail address").fill(address);
  await page.getByLabel("App password").fill(password);
  await page.getByRole("button", { name: "Check and connect" }).click();
}

/** SQL on the QA stack's MySQL container (no password is printed; the root password is read from the container's own environment). */
function qaSql(sql: string): boolean {
  const container = process.env.QA_MYSQL_CONTAINER ?? "kiwiply-qa-mysql";
  const db = process.env.QA_MYSQL_DB ?? "dossier_ent_demo";
  try {
    const env = execFileSync("docker", ["inspect", container, "--format", "{{range .Config.Env}}{{println .}}{{end}}"], { encoding: "utf8" });
    const pw = env.split("\n").find((l) => l.startsWith("MYSQL_ROOT_PASSWORD="))?.slice("MYSQL_ROOT_PASSWORD=".length);
    if (!pw) return false;
    execFileSync("docker", ["exec", "-e", `MYSQL_PWD=${pw}`, container, "mysql", "-uroot", db, "-e", sql], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const ANIKA_ADDON = "select lf.id from license_feature lf join consultant_license cl on cl.id = lf.license_id join consultant_profile cp on cp.id = cl.consultant_id where cp.display_name = 'Anika Rao' and lf.feature_key = 'inbox.monitoring'";

test("CON-70 Anika connects her own Gmail the guided way; a wrong or blocked code gets a calm sentence, never her code back", async ({ as }) => {
  const { page, go } = await as("anika");
  const orgId = await (async () => {
    await go("/w/consultant");
    return orgIdOf(page);
  })();
  await startClean(page, orgId);

  await narrate(page, "Anika opens the Inbox page in her workspace menu");
  await openPage(page, go, "inbox");
  await expect(pageTitle(page)).toHaveText("Inbox");
  await expect(page.locator('[data-shell-sidebar] a[href="/w/consultant/inbox"]')).toBeVisible();

  await narrate(page, "It says who can see what, before she types anything");
  const privacy = page.locator("[data-inbox-privacy]");
  await expect(privacy).toContainText("Only you see your mail");
  await expect(privacy).toContainText("never see the password, the address, a subject, a sender or a word of a message");

  await narrate(page, "The same guided steps as the personal inbox: a job-hunting Gmail, 2-Step Verification, an app password");
  for (const t of ["Use a Gmail just for job hunting", "Turn on 2-Step Verification", "Create an app password"]) await expect(page.getByText(t)).toBeVisible();
  await expect(page.locator("[data-inbox-sandbox]")).toContainText(ADDRESS); // the demo stack names its one sample address

  await narrate(page, "A password Gmail would refuse: the page says so calmly and keeps nothing");
  await connectFromThePage(page, ADDRESS, BAD_CODE);
  const alert = page.locator("[data-consultant-inbox] form [role=alert]");
  await expect(alert).toContainText("Gmail didn't accept that address and app password");
  await expect(page.locator("body")).not.toContainText(BAD_CODE);
  await expect(page.getByLabel("Gmail address")).toBeVisible(); // still on the form

  await narrate(page, "Her real Google password (not 16 letters) is turned away before Google is even asked");
  await page.getByLabel("App password").fill("MyRealGooglePassword1");
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(alert).toContainText("Paste the 16-letter app password");

  await narrate(page, "Gmail asking for an app password has its own sentence");
  await page.getByLabel("App password").fill(NEEDS_APP_CODE);
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(alert).toContainText("Gmail wants an app password");

  const view = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`);
  expect(view.json.inbox.connected, "nothing was stored by the refusals").toBe(false);
});

test("CON-71 Anika connects: the live Gmail check passes, the mailbox is read, and the password is never shown again", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant");
  const orgId = await orgIdOf(page);
  await startClean(page, orgId);
  await openPage(page, go, "inbox");

  await narrate(page, "She pastes the sample address and any 16 letters");
  await connectFromThePage(page, ADDRESS, "abcd efgh ijkl mnop"); // Google shows it with spaces; they are not part of it
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-consultant-inbox][data-connection=CONNECTED]")).toBeVisible();
  await expect(page.getByText(ADDRESS)).toBeVisible();
  await expect(page.locator("[data-consultant-inbox] span").filter({ hasText: /^Connected$/ })).toBeVisible(); // the badge (the term "Connected" above its date is a different element)

  await narrate(page, "The page, the API and the browser never hold the code again");
  await expect(page.locator("body")).not.toContainText(GOOD_CODE);
  const r = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`);
  const text = JSON.stringify(r.json);
  expect(text).not.toContain(GOOD_CODE);
  expect(text).not.toContain("passwordEnc");
  expect(text).not.toContain("v1:");
  expect(r.json.inbox.address).toBe(ADDRESS);
  expect(r.json.inbox.entitled).toBe(true);
});

test("CON-72 Mail moves her applications and offers new ones, all marked 'from your inbox'", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant");
  const orgId = await orgIdOf(page);
  await startClean(page, orgId);
  await openPage(page, go, "inbox");
  await connectFromThePage(page, ADDRESS, GOOD_CODE);
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });

  await narrate(page, "The first read runs straight after connecting; the page lists the applications the mail is tracking");
  await expect(async () => {
    await page.reload();
    await expect(page.locator(READY)).toBeVisible();
    await expect(page.locator("[data-update]").first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });

  await narrate(page, "Orbit Freight sent an interview invitation: her application stands at Interview");
  const orbit = page.locator("[data-update]").filter({ hasText: "Orbit Freight" });
  await expect(orbit).toHaveAttribute("data-stage", "INTERVIEW");
  await expect(orbit.locator("[data-from-inbox]")).toHaveText("from your inbox");
  await expect(orbit).toContainText("Interview invite");

  await narrate(page, "Cedar Analytics sent a rejection: it stands at Rejected");
  const cedar = page.locator("[data-update]").filter({ hasText: "Cedar Analytics" });
  await expect(cedar).toHaveAttribute("data-stage", "REJECTED");
  await expect(cedar.locator("[data-from-inbox]")).toBeVisible();

  await narrate(page, "Lumen Health confirmed an application she never tracked: it is offered, not added behind her back");
  const suggestions = page.locator("[data-suggestions]");
  const lumen = suggestions.locator("[data-suggestion]").filter({ hasText: "Lumen Health" });
  const harbor = suggestions.locator("[data-suggestion]").filter({ hasText: "Harbor Cloud" });
  if (await lumen.count()) await expect(lumen.getByRole("button", { name: "Add to my board as Applied" })).toBeVisible();

  await narrate(page, "Harbor Cloud invited her to interview: 'Add to my board as Interview' lands it at that stage");
  if (await harbor.count()) {
    await harbor.getByRole("button", { name: "Add to my board as Interview" }).click();
    await expect(harbor).toHaveCount(0);
    // the new application now stands at Interview on her board, listed with the others the mail moved
    await expect(page.locator("[data-update]").filter({ hasText: "Harbor Cloud" })).toHaveAttribute("data-stage", "INTERVIEW");
  } else {
    // a repeat run: the suggestion was consumed earlier, so Harbor Cloud is already tracked and is not suggested again
    await expect(suggestions).not.toContainText("Harbor Cloud");
  }

  await narrate(page, "A suggestion can also be dismissed");
  if (await lumen.count()) {
    await lumen.getByRole("button", { name: "Dismiss" }).click();
    await expect(lumen).toHaveCount(0);
  }
});

test("CON-73 Disconnecting forgets the password and every message", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant");
  const orgId = await orgIdOf(page);
  await startClean(page, orgId);
  await openPage(page, go, "inbox");
  await connectFromThePage(page, ADDRESS, GOOD_CODE);
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });

  await narrate(page, "She disconnects; the page says what that deletes");
  await page.getByText("Disconnect this inbox").click();
  const warning = page.getByText(/Disconnecting deletes the saved app password and any mail/);
  await expect(warning).toBeVisible();
  console.log("DISCONNECT_TEXT=" + JSON.stringify((await warning.innerText()).slice(0, 110)));
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();

  await narrate(page, "The guided steps are back, nothing is connected, and the API holds nothing");
  await expect(page.getByLabel("App password")).toBeVisible({ timeout: 20_000 });
  const r = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`);
  expect(r.json.inbox.connected).toBe(false);
  expect(r.json.inbox.address).toBeNull();
  expect(r.json.suggestions).toEqual([]);
  expect(r.json.updates).toEqual([]);
});

test("CON-74 The organization sees none of it: the Org Admin and the marketer get 404 on the address and find no mail in their pages", async ({ as }) => {
  const anika = await as("anika");
  await anika.go("/w/consultant");
  const orgId = await orgIdOf(anika.page);
  await startClean(anika.page, orgId);
  await openPage(anika.page, anika.go, "inbox");
  await connectFromThePage(anika.page, ADDRESS, GOOD_CODE);
  await expect(anika.page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await anika.page.reload();
    await expect(anika.page.locator("[data-update]").first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });

  for (const who of ["sarah", "omar"] as const) {
    const { page, go } = await as(who);
    await narrate(page, `${who === "sarah" ? "Sarah (Org Admin)" : "Omar (marketer)"} tries Anika's inbox address: it is the same 404 as a page that does not exist`);
    await go(who === "sarah" ? "/w/admin" : "/w/marketing");
    for (const tail of ["", "/suggestions", "/updates"]) {
      const r = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox${tail}`);
      expect(r.status, `${who} GET inbox${tail}`).toBe(404);
    }
    expect((await bff(page, "POST", `/api/orgs/${orgId}/me-workspace/inbox`, { address: ADDRESS, appPassword: GOOD_CODE })).status).toBe(404);
    expect((await bff(page, "DELETE", `/api/orgs/${orgId}/me-workspace/inbox`)).status).toBe(404);

    await narrate(page, "And the organization's own pages carry no address, no sender, no subject, no line of mail");
    await leavesNoMailInside(page, [
      `/api/orgs/${orgId}/consultants`,
      `/api/orgs/${orgId}/applications`,
      `/api/orgs/${orgId}/interviews`,
      `/api/orgs/${orgId}/members`,
      `/api/orgs/${orgId}/audit`,
      `/api/orgs/${orgId}/mkt/applications`,
      `/api/orgs/${orgId}/mkt/talent`,
    ]);
    // the Inbox is not even in their menu
    await expect(page.locator('[data-shell-sidebar] a[href$="/inbox"]')).toHaveCount(0);
  }
  await anika.page.close();
});

test("CON-75 Taking the add-on off stops the inbox and says why; putting it back resumes it", async ({ as }) => {
  test.skip(!qaSql("select 1"), "needs docker and the QA MySQL container (QA_MYSQL_CONTAINER / QA_MYSQL_DB)");
  const { page, go } = await as("anika");
  await go("/w/consultant");
  const orgId = await orgIdOf(page);
  await startClean(page, orgId);
  await openPage(page, go, "inbox");
  await connectFromThePage(page, ADDRESS, GOOD_CODE);
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });

  try {
    await narrate(page, "An administrator removes Inbox monitoring from Anika's license");
    expect(qaSql(`update license_feature set live = 0 where id in (select id from (${ANIKA_ADDON}) x)`)).toBe(true);

    await narrate(page, "Her page says reading stopped and why; nothing new is offered");
    await page.reload();
    await expect(page.locator(READY)).toBeVisible();
    await expect(page.locator("[data-consultant-inbox][data-connection=NO_ENTITLEMENT]")).toBeVisible();
    await expect(page.locator("[data-inbox-stopped]")).toContainText("Your organization no longer includes inbox tracking.");
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(page.locator("[data-suggestions]")).toHaveCount(0);
    const stopped = await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`);
    expect(stopped.json.inbox.entitled).toBe(false);
    expect(stopped.json.inbox.status).toBe("NO_ENTITLEMENT");

    await narrate(page, "She can still disconnect and be sure everything is deleted");
    await expect(page.getByText("Disconnect this inbox")).toBeVisible();
  } finally {
    await narrate(page, "The add-on goes back on; reading resumes by itself");
    expect(qaSql(`update license_feature set live = 1 where id in (select id from (${ANIKA_ADDON}) x)`)).toBe(true);
  }
  await page.reload();
  await expect(page.locator("[data-consultant-inbox][data-connection=CONNECTED]")).toBeVisible();
});

test("CON-76 Ben's license does not include inbox tracking: the page says so instead of offering a form, and the API refuses with 402", async ({ as }) => {
  const { page, go } = await as("ben");
  await narrate(page, "Ben opens Inbox");
  await openPage(page, go, "inbox");
  const locked = page.locator("[data-inbox-locked]");
  await expect(locked).toContainText("Inbox tracking isn't part of your license");
  await expect(locked).toContainText("Ask your administrator to add Inbox monitoring");
  await expect(page.getByLabel("App password")).toHaveCount(0);
  await expect(page.locator("[data-consultant-inbox]")).toHaveAttribute("data-entitled", "false");

  await narrate(page, "Even by hand the API says the same, and stores nothing");
  const orgId = await orgIdOf(page);
  const r = await bff(page, "POST", `/api/orgs/${orgId}/me-workspace/inbox`, { address: ADDRESS, appPassword: GOOD_CODE });
  expect(r.status).toBe(402);
  expect(r.json.code).toBe("FEATURE_NOT_LICENSED");
  expect((await bff(page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`)).json.inbox.connected).toBe(false);
});

test("CON-77 Anika's mailbox is hers alone: Ben sees none of it", async ({ as }) => {
  const anika = await as("anika");
  await anika.go("/w/consultant");
  const orgId = await orgIdOf(anika.page);
  await startClean(anika.page, orgId);
  await openPage(anika.page, anika.go, "inbox");
  await connectFromThePage(anika.page, ADDRESS, GOOD_CODE);
  await expect(anika.page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });

  const ben = await as("ben");
  await ben.go("/w/consultant");
  const r = await bff(ben.page, "GET", `/api/orgs/${orgId}/me-workspace/inbox`);
  expect(r.status).toBe(200);
  expect(r.json.inbox.connected).toBe(false);
  expect(r.json.inbox.address).toBeNull();
  expect(r.json.suggestions).toEqual([]);
  expect(r.json.updates).toEqual([]);
  await startClean(anika.page, orgId);
});
