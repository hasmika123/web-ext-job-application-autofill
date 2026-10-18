import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, narrate, narrateDo } from "../../stories/_support/story";

/**
 * VIDEO 10: Track emails and update statuses (Anika Rao, consultant at Acme Staffing; the demo stack's SAMPLE mailbox).
 * On the demo stack the "Gmail" is a built-in sample mailbox (DemoImapGateway): one fixed demo address, any 16 letters connect it, and its mail goes through
 * the real sync, the real classifier and the real board. The address and the code are TEST VALUES read from the same fixture file the API reads; no real
 * mailbox is contacted and no real credential is typed.
 * Shown: connecting; mail classified and applications moving forward "from your inbox" (Saved to Applied to In review to Interview to Offer for Northwind Labs);
 * the safety features (a rejection is HELD under "Needs your review", Accept applies it, Undo takes it back); suggestions for jobs she never tracked
 * (add to the board, or dismiss). The mail text and the address never leave her account: the organization sees stages only.
 */
const FIXTURE = JSON.parse(readFileSync(resolve(__dirname, "../../../../api/src/main/resources/demo/inbox-demo.json"), "utf8")) as { address: string; wrongCodePrefix: string };
const ADDRESS = FIXTURE.address;
const GOOD_CODE = "abcdefghijklmnop";
const BAD_CODE = (FIXTURE.wrongCodePrefix + "abcdefghijklmnop").slice(0, 16);
const READY = "[data-consultant-inbox][data-status=ready]";

test("VIDEO-10 Email tracking: mail moves applications forward, risky changes wait for review, with Undo, and suggestions for untracked jobs", async ({ flow }) => {
  test.setTimeout(1_800_000);
  const f = await flow({ who: "anika" });
  const { page } = f;

  await f.titleCard({
    title: "Track your emails, update your statuses",
    roles: "Consultant  |  Acme Staffing",
    intro: "Hi! Keeping every application up to date by hand is a chore. In this video I'll show you how Kiwiply reads the mail from your own job-hunting Gmail, moves your applications forward for you, and asks before it does anything risky.",
    minMs: 4000,
  });

  // ---- the page, the privacy promise, connecting
  await f.go("/w/consultant/inbox");
  await expect(page.locator("[data-consultant-inbox]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "I'm Anika, a consultant at Acme Staffing, and this is the Inbox page in my workspace menu.");
  await narrate(page, "Before I type anything, it tells me who can see what. Only I see my mail. My organization never sees the password, the address, a subject, a sender, or a word of a message.", undefined, page.locator("[data-inbox-privacy]"));
  await narrate(page, "It walks me through three steps: use a Gmail just for job hunting, turn on 2-Step Verification, and create an app password. An app password is a special 16-letter code, so my real Google password is never used.");
  await narrate(page, "This is the demo, so the Gmail is a built-in sample mailbox. No real mailbox is contacted, and the address and code are just test values.", undefined, page.locator("[data-inbox-sandbox]"));

  await page.getByLabel("Gmail address").fill(ADDRESS);
  await page.getByLabel("App password").fill(BAD_CODE);
  await narrate(page, "First, a wrong code. I'll type one on purpose.");
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(page.locator("[data-consultant-inbox] form [role=alert]")).toContainText("Gmail didn't accept that address and app password");
  await narrate(page, "Kiwiply says so calmly, and it keeps nothing. Now the right code.");
  await page.getByLabel("App password").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "It's connected. The password is encrypted, and the page will never show it again. Kiwiply only reads. It never sends, moves, or deletes a single email.");

  // ---- the first read
  await expect(async () => {
    await page.reload();
    await expect(page.locator(READY)).toBeVisible();
    await expect(page.locator("[data-update]").first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 120_000 });
  await narrate(page, "The first read runs straight away. Kiwiply reads the new mail, decides what each message is, and matches it to the applications I already track.");
  const orbit = page.locator("[data-update]").filter({ hasText: "Orbit Freight" });
  await expect(orbit).toHaveAttribute("data-stage", "INTERVIEW");
  await narrate(page, "Orbit Freight sent an interview invitation, so that application moved to Interview. See the small label that says from your inbox.", undefined, orbit);
  const north = page.locator("[data-update]").filter({ hasText: "Northwind Labs" });
  await expect(north).toHaveAttribute("data-stage", "OFFER");
  await narrate(page, "And Northwind Labs went all the way to Offer. I had this one saved, and four emails moved it along: the receipt, a review notice, an interview invitation, and then an offer. I'll show you that step by step in a moment.", undefined, north);

  // ---- held for review
  const review = page.locator("[data-needs-review]");
  await expect(review).toBeVisible({ timeout: 30_000 });
  const rejection = page.locator("[data-review-item]").filter({ hasText: "Cedar Analytics" }).first();
  await expect(rejection).toBeVisible();
  await narrate(page, "Now the safety feature. Cedar Analytics sent what looks like a rejection. Kiwiply does not apply that on its own. A wrong rejection would be a painful mistake, so it waits for me under Needs your review.", undefined, review);
  await narrate(page, "It tells me exactly what it read, and asks if I want to mark the application as Rejected.", undefined, rejection);
  await rejection.locator("[data-action=accept]").click();
  await expect(page.locator("[data-review-item]").filter({ hasText: "Cedar Analytics" })).toHaveCount(0, { timeout: 20_000 });
  const cedar = page.locator("[data-update]").filter({ hasText: "Cedar Analytics" });
  await expect(cedar).toHaveAttribute("data-stage", "REJECTED", { timeout: 20_000 });
  await narrate(page, "It is a real rejection, so I press Accept. And now the application says Rejected.", undefined, cedar);

  // ---- undo
  const undo = cedar.locator("[data-update-undo]");
  await expect(undo).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Even after I accept, I can change my mind. There's an Undo right on the row. Let's say I looked again, and the mail was not about this job.", undefined, undo);
  await undo.getByRole("button", { name: /^Undo$/ }).first().click();
  await narrate(page, "Undo asks me to confirm first.");
  await cedar.locator("[data-update-undo]").getByRole("button", { name: /^Yes, undo$/ }).click();
  await expect(cedar).toHaveAttribute("data-stage", "APPLIED", { timeout: 20_000 });
  await narrate(page, "And Cedar Analytics is back to Applied, exactly as it was.", undefined, cedar);

  // ---- suggestions
  const suggestions = page.locator("[data-suggestions]");
  await expect(suggestions).toBeVisible();
  const harbor = suggestions.locator("[data-suggestion]").filter({ hasText: "Harbor Cloud" });
  const lumen = suggestions.locator("[data-suggestion]").filter({ hasText: "Lumen Health" });
  await narrate(page, "Some mail is about jobs I never tracked. Kiwiply does not add those behind my back. It offers them as suggestions.", undefined, suggestions);
  await narrate(page, "Lumen Health confirmed an application, and Harbor Cloud invited me to an interview.");
  await harbor.getByRole("button", { name: /Add to my board as Interview/ }).click();
  await expect(harbor).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("[data-update]").filter({ hasText: "Harbor Cloud" })).toHaveAttribute("data-stage", "INTERVIEW", { timeout: 20_000 });
  await narrate(page, "I'll add Harbor Cloud to my board as Interview. And it appears on the list right away, at that stage.");
  await lumen.getByRole("button", { name: "Dismiss" }).click();
  await expect(lumen).toHaveCount(0, { timeout: 20_000 });
  await narrate(page, "I'm not interested in Lumen Health, so I dismiss it. Nothing is kept.");

  // ---- Northwind step by step on My Applications
  await f.go("/w/consultant/applications");
  await expect(page.locator("[data-consultant-applications][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Let's see how Northwind Labs got to an offer. This is My Applications.");
  const nrow = page.locator("[data-application]").filter({ hasText: "Northwind Labs" }).first();
  await expect(nrow).toBeVisible();
  await nrow.locator("[data-action=view]").click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await narrate(page, "Every step is on its timeline. Look at the words: moved to Applied, in review, Interview and Offer, and each one says from an email, by Inbox. So I can always tell what the mail did, and what I did myself.", undefined, detail);
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");

  await narrate(page, "That's email tracking. Your applications stay up to date by themselves, anything risky waits for your say, and you can always take it back. And the organization sees only the stage, never your mail. Thanks for watching!", 1500);
});
