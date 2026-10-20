import type { Page } from "@playwright/test";
import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { ROOTS } from "../../stories/consultant/_helpers";
import { settle } from "./_c";

/**
 * V3 VIDEO 12: Offers and placements. ONE story: a client extends an offer to Anika. Amara (Account Manager) records it; Anika reviews it, asks to
 * negotiate; Amara revises it; Anika accepts; the accept starts her placement. Then Anika's My Placement page, Amara's Placements page and Sarah's
 * (Org Admin) Placements page show it.
 * Stories shown: X9.8 (record / revise an offer), CON offers (review, compare, negotiate, accept), X10.4 / X10.6 (accept creates the placement), CON My Placement,
 * ADM-62 style placements board.
 *
 * Honest limits: Kiwiply records offers and placements; it signs nothing, sends nothing to the client and moves no money (the dialogs say so). The seeded
 * offers carry a Sample mark; the one in this story is made on camera and does not.
 */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ROLE = "Senior Data Engineer";

const openConsultant = async (page: Page, go: (p: string) => Promise<void>, slug: string) => {
  await go(`/w/consultant/${slug}`);
  await expect(page.locator(`${ROOTS[slug]}[data-status=ready]`)).toBeVisible({ timeout: 45_000 });
};

async function pick(page: Page, label: string, option: RegExp | string) {
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${label}`) }).click().catch(async () => {
    await page.getByRole("dialog").getByLabel(label, { exact: true }).click();
  });
  await page.getByRole("option", { name: option }).first().click();
}

test("V3-12 Offers and placements: an offer is recorded, negotiated, accepted, and becomes a placement", async ({ flow }) => {
  const f = await flow();
  const { page } = f;

  await f.titleCard({
    title: "Offers and placements",
    roles: "Account Manager (Amara)  |  Consultant (Anika)  |  Org Admin (Sarah)  |  Acme Staffing",
    intro:
      "Hi! In this video I'll follow one job offer from start to finish. A client makes an offer, the account manager records it, the consultant negotiates and accepts, and that starts her placement. Everyone you see is made up.",
    minMs: 4000,
  });

  // =============== Amara records the offer
  await f.signInAs("amara");
  await f.go("/w/accounts/offers");
  await expect(page.locator("[data-offers-page]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "I'm Amara, an account manager at Acme Staffing. My Offers page lists the offers our clients make to our consultants, and follows each one until it becomes a placement.", undefined, page.locator("[data-offers-card]"));
  await narrate(page, "Northwind Logistics has told me they want to hire Anika Rao as a senior data engineer. Kiwiply doesn't send offers. I just record what the client extended.");
  await page.locator("[data-record-offer]").click();
  const dialog = page.getByRole("dialog", { name: "Record an offer" });
  await expect(dialog).toBeVisible();
  await narrate(page, "The box says it plainly: only the consultant can accept or decline. Nothing is signed or sent by Kiwiply, and no money moves.", undefined, dialog);
  await narrateDo(page, "I choose the consultant, and the client.", async () => {
    await pick(page, "Consultant", /Anika Rao/);
    await pick(page, "Client", /Northwind/);
  });
  await narrateDo(page, "Then the role, contract type, work mode, and the start date. She starts today.", async () => {
    await dialog.getByLabel("Role", { exact: true }).fill(ROLE);
    await pick(page, "Type", /Contract/);
    await pick(page, "Work mode", /Remote/);
    await dialog.locator("input[type=date]").first().fill(today());
  });
  await narrateDo(page, "The rate is a plain number. It's a record, not a payment. I add a short note, and no ID or bank details are allowed.", async () => {
    await dialog.getByLabel("Rate", { exact: true }).fill("85");
    await dialog.getByLabel("Notes").fill("Twelve month contract, extension likely. Client wants her to start this week.");
  });
  await narrateDo(page, "The client has made the offer, so I tick this box. Then Anika can see it and answer.", async () => {
    await dialog.locator("[data-offer-extend]").check();
  });
  await dialog.locator("[data-offer-submit]").click();
  await expect(page.locator("[data-offer-detail]")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Recorded, as Extended. Anika has been told. Only she can answer it. There is no accept button for me, on purpose.", undefined, page.locator("[data-offer-actions]"));

  // =============== Anika reviews and negotiates
  await f.switchTo("anika", "Now let's switch to Anika, who just got the news.", "/w/consultant/offers");
  await expect(page.locator("[data-consultant-offers][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "This is Anika's Offers page. The chips on top count her offers by status: pending, negotiating, accepted and declined.", undefined, page.locator("[data-offers-chips]"));
  const mine = page.locator("[data-offer]").filter({ hasText: ROLE }).first();
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The new one from Northwind Logistics is waiting for her review. Offers marked Sample are demo stand-ins. This one was made just now.", undefined, mine);
  await narrate(page, "She can compare offers side by side.");
  await mine.locator("input[type=checkbox]").check();
  await page.locator("[data-offer]").filter({ hasNotText: ROLE }).first().locator("input[type=checkbox]").check();
  await page.locator("[data-action=compare]").click();
  await expect(page.locator("[data-compare-result]")).toBeVisible({ timeout: 15_000 });
  await narrate(page, "Pay, work mode, start date and deadline, next to each other.", undefined, page.locator("[data-compare-result]"));
  await mine.locator("[data-action=view]").click();
  const sheet = page.locator("[data-offer-detail]");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Opening it, she sees the package, start date, benefits, deadline, and a timeline.", undefined, sheet);
  await narrate(page, "She likes the role, but wants to talk about the rate first. So she chooses Negotiate.");
  await page.locator("#offer-detail-sheet").getByRole("button", { name: "Negotiate", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Ask to negotiate?" });
  await expect(ask).toBeVisible();
  await narrateDo(page, "She says what she'd like to discuss, and sends it.", async () => {
    await ask.getByLabel("What you would like to negotiate").fill("I would like to talk about the hourly rate, and to start next Monday instead.");
  });
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Negotiation requested").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Sent. The offer now shows Negotiation.");
  await page.keyboard.press("Escape");

  // =============== Amara revises
  await f.switchTo("amara", "Back to Amara, who sees the request come in.", "/w/accounts/offers");
  await expect(page.locator("[data-offers-page]")).toBeVisible({ timeout: 45_000 });
  const row = page.locator("[data-row-id]").filter({ hasText: ROLE }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The offer now says Negotiating. Let me open it.", undefined, row);
  await row.click();
  await expect(page.locator("[data-offer-detail]")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Anika's note is on the timeline. I take it to the client, who agrees to a better rate. So I revise the offer.", undefined, page.locator("[data-offer-detail]"));
  await page.locator("[data-action=edit]").click();
  const edit = page.getByRole("dialog", { name: "Edit offer" });
  await expect(edit).toBeVisible();
  await narrateDo(page, "I change the rate to ninety-two. A revision sends the offer back to Extended, so Anika can answer again.", async () => {
    await edit.getByLabel("Rate", { exact: true }).fill("92");
  });
  await edit.locator("[data-offer-submit]").click();
  await expect(page.getByText("Extended").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Revised, and back to Extended.");

  // =============== Anika accepts
  await f.switchTo("anika", "And over to Anika again.", "/w/consultant/offers");
  await expect(page.locator("[data-consultant-offers][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  const again = page.locator("[data-offer]").filter({ hasText: ROLE }).first();
  await again.locator("[data-action=view]").click();
  await expect(page.locator("[data-offer-detail]")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The offer is back with the new rate. This time she is happy, so she accepts.", undefined, page.locator("[data-offer-detail]"));
  await page.locator("#offer-detail-sheet").getByRole("button", { name: "Accept Offer", exact: true }).click();
  const accept = page.getByRole("dialog", { name: "Accept this offer?" });
  await expect(accept).toBeVisible();
  await narrate(page, "The box explains what accepting means: it records her decision and starts her placement. Nobody can accept for her.", undefined, accept.locator("[data-accept-copy]"));
  await accept.getByRole("button", { name: "Yes, accept offer" }).click();
  await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Accepted. And her accept is what starts the placement. Nobody types it in again.");
  await page.keyboard.press("Escape");

  // =============== Anika's placement
  await openConsultant(page, f.go.bind(f), "placements");
  await narrate(page, "Now My Placement. It used to say she had none. Now her new engagement is active, and started today.", undefined, page.locator("[data-placement-tiles]"));
  await narrate(page, "The client is Northwind Logistics, her role is Senior Data Engineer, and Omar is her marketer. Anything nobody filled in says Not shared yet. Nothing is invented.", undefined, page.getByRole("heading", { name: "Placement overview" }));
  await narrate(page, "The checklist and milestones are empty for now. Nobody has set them up for this new placement yet, and the page says so.", undefined, page.locator("#placement-checklist"));
  await page.locator("[data-post-update]").click();
  const upd = page.getByRole("dialog", { name: "Update status" });
  await expect(upd).toBeVisible();
  await narrateDo(page, "What she can do is post a short status update.", async () => {
    await upd.getByLabel("Status update").fill("Laptop and access are ready. First stand-up with the Northwind data team tomorrow morning.");
  });
  await upd.getByRole("button", { name: "Post update" }).click();
  await expect(page.locator("[data-activity]").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Posted, under Recent placement activity.", undefined, page.locator("[data-activity]").first());

  // =============== Amara and Sarah see the placement
  await f.switchTo("amara", "On Amara's side, the same placement is on her Placements page.", "/w/accounts/placements");
  await expect(page.locator("[data-placements-page]")).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Search placements").fill("Anika");
  const prow = page.locator("[data-row-id]").filter({ hasText: "Anika Rao" }).first();
  await expect(prow).toBeVisible({ timeout: 30_000 });
  await narrate(page, "I search for Anika, and there she is. The bill rate is only shown to people whose job needs it, never to the consultant.", undefined, prow);
  await prow.click();
  const drawer = page.locator("[data-detail-body]");
  await expect(drawer).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Timeline" }).click();
  await narrate(page, "The Timeline keeps the history, starting with the hire from her accepting. Every change leaves a line here.", undefined, drawer);
  await f.switchTo("sarah", "Finally, Sarah, the organization administrator.", "/w/admin/placements");
  await expect(page.locator("[data-placements-page]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Sarah sees every placement in the company, with counts for active, starting soon, ending soon, and the redeployment pool. Anika's is one of the active ones.", undefined, page.locator("[data-placements-card]"));
  await page.getByLabel("Search placements").fill("Anika");
  await expect(page.locator("[data-row-id]").filter({ hasText: "Anika Rao" }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Same record. And like everywhere in Kiwiply, it is only a record. Nothing signs a contract, bills the client, or moves money.");
  await f.switchTo("omar", "And last, Omar, her marketer. He doesn't have an offers or placements page of his own.", "/w/marketing/performance");
  await expect(page.getByRole("heading", { name: "Performance", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "But his Performance page measures what his work leads to: interview rate, offer rate and placements. Thanks for watching!");
  await settle(page, 500);
});
