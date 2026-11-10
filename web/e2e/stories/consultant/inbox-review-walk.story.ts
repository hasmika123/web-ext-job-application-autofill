import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, openPage, orgIdOf } from "./_helpers";

/**
 * A browser walk of the inbox safety feature on the demo stack's SAMPLE mailbox (test values only): connect, the held rejection shows under
 * "Needs your review", Accept applies it, the application timeline offers Undo, the interviews read from the mail show up, and the same page at phone width.
 * It collects every console error and every failed request on the way and prints them; screenshots go to SHOTS.
 */
const SHOTS = process.env.WALK_SHOTS ?? "C:/work_bench_claude/qa-videos/inbox-review-walk";
const ADDRESS = "kiwiply.demo.anika@gmail.com";
const GOOD_CODE = "abcdefghijklmnop";
const READY = "[data-consultant-inbox][data-status=ready]";

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

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test("INBOX-WALK the held rejection, Accept, Undo and the interviews read from the mail", async ({ as }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const { page, go } = await as("anika");
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/_next/")) problems.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  await go("/w/consultant");
  const orgId = await orgIdOf(page);
  expect((await bff(page, "DELETE", `/api/orgs/${orgId}/me-workspace/inbox`)).status).toBe(200);
  // Start the story from "applied": the sample mail then has something to move (an earlier run left these at their later stages).
  // A direct SQL reset bypasses Hibernate's second-level cache; reset BEFORE the API starts (WALK_RESET=0 skips it here).
  const reset = process.env.WALK_RESET === "0" ? true : qaSql(
    "UPDATE application a JOIN jhi_user u ON u.id = a.user_id SET a.status = 'APPLIED' WHERE u.login = 'demo-ent-acme-anika' AND a.company IN ('Orbit Freight','Cedar Analytics');",
  );
  console.log(`WALK reset of the demo board: ${reset ? "done" : "skipped (no docker access)"}`);

  await openPage(page, go, "inbox");
  await narrate(page, "Anika connects the sample mailbox");
  await shot(page, "01-inbox-before-connect");
  await page.getByLabel("Gmail address").fill(ADDRESS);
  await page.getByLabel("App password").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 20_000 });

  await narrate(page, "The first read runs; a rejection is held for her review instead of being applied");
  await expect(async () => {
    await page.reload();
    await expect(page.locator(READY)).toBeVisible();
    await expect(page.locator("[data-needs-review]")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 90_000 });
  await shot(page, "02-needs-your-review");
  const items = page.locator("[data-review-item]");
  console.log(`WALK review items: ${await items.count()} kinds=${await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")).join(","))}`);
  const rejection = items.filter({ hasText: "Cedar Analytics" }).first();
  await expect(rejection).toBeVisible();
  console.log(`WALK review sentence: ${JSON.stringify((await rejection.innerText()).slice(0, 200))}`);

  await narrate(page, "She accepts: the application now says Rejected");
  await rejection.locator("[data-action=accept]").click();
  await expect(items.filter({ hasText: "Cedar Analytics" })).toHaveCount(0, { timeout: 20_000 });
  await shot(page, "03-after-accept");

  await narrate(page, "The interviews the mail announced show on the rows of the applications the mail is tracking");
  const orbitRow = page.locator("[data-update]").filter({ hasText: "Orbit Freight" });
  const harborRow = page.locator("[data-update]").filter({ hasText: "Harbor Cloud" });
  await expect(orbitRow.locator("[data-update-interview]").first()).toBeVisible({ timeout: 20_000 });
  console.log(`WALK orbit interview line: ${JSON.stringify((await orbitRow.locator("[data-update-interview]").first().innerText()).slice(0, 160))}`);
  if (await harborRow.count()) {
    await expect(harborRow.locator("[data-update-interview]").first()).toBeVisible();
    console.log(`WALK harbor interview line: ${JSON.stringify((await harborRow.locator("[data-update-interview]").first().innerText()).slice(0, 160))}`);
  }
  await shot(page, "03b-interview-lines");
  await narrate(page, "The accepted change can be undone right from its row");
  const cedarRow = page.locator("[data-update]").filter({ hasText: "Cedar Analytics" });
  await expect(cedarRow.locator("[data-update-undo]")).toBeVisible({ timeout: 20_000 });
  await shot(page, "03c-undo-offered");
  await cedarRow.locator("[data-update-undo]").getByRole("button", { name: /^Undo$/ }).first().click();
  await shot(page, "03d-undo-confirm");
  await cedarRow.locator("[data-update-undo]").getByRole("button", { name: /^Yes, undo$/ }).click();
  await expect(cedarRow).toContainText("Applied", { timeout: 20_000 });
  await shot(page, "03e-after-undo");

  await narrate(page, "The interviews the mail announced appear in her applications and interviews");
  await go("/w/consultant/interviews");
  await page.waitForLoadState("networkidle");
  await shot(page, "04-interviews");
  console.log(`WALK interviews page text has Orbit: ${(await page.locator("body").innerText()).includes("Orbit Freight")}; Harbor: ${(await page.locator("body").innerText()).includes("Harbor Cloud")}`);

  await narrate(page, "The same Email Tracking page at phone width");
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/w/consultant/inbox");
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  await shot(page, "08-inbox-phone");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`WALK phone horizontal overflow: ${overflow}`);

  console.log(`WALK problems (${problems.length}):\n${problems.slice(0, 25).join("\n")}`);
});
