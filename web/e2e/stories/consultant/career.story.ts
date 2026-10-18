import { test, expect, narrate } from "../_support/story";
import { isoDay, menuAction, openPage, pageTitle, pick, stamp } from "./_helpers";

/**
 * Offers, My Placement and Availability. Money on Offers and Placement is a RECORD only (no payment, no signature, no bill rate shown
 * to the consultant). Offers, the placement project data and the vacation approval status are seeded stand-ins (Sample marks).
 */

test("CON-40 Anika reviews her Offers: tiles, status, deadlines, side-by-side compare and the offer's timeline", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Offers");
  await openPage(page, go, "offers");
  await expect(pageTitle(page)).toHaveText("Offers");
  for (const key of ["total", "pending", "accepted", "negotiation", "declined"]) await expect(page.locator(`[data-offers-tiles] [data-stat-tile=${key}]`)).toBeVisible();

  const rows = page.locator("[data-offer]");
  await narrate(page, "Five seeded offers in different states: pending review, negotiation, accepted, declined");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator("[data-offer][data-status=ACCEPTED]").first()).toBeVisible();
  await expect(page.locator("[data-offer][data-status=DECLINED]").first()).toBeVisible();
  await expect(page.locator("[data-sample-note]").first()).toBeVisible(); // demo stand-ins say so

  await narrate(page, "She ticks two offers and compares them side by side");
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  await page.locator("[data-action=compare]").click();
  const result = page.locator("[data-compare-result]");
  await expect(result).toBeVisible();
  for (const fact of ["Base Salary", "Total Compensation", "Start Date", "Offer Deadline", "Status"]) await expect(result.locator(`[data-compare-fact="${fact}"]`)).toBeVisible();

  await narrate(page, "She opens one offer: benefits and a timeline of what happened");
  await rows.nth(0).locator("[data-action=view]").click();
  const detail = page.locator("[data-offer-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Benefits" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(detail.getByText("Accepting starts your placement when the offer is linked to a client")).toBeVisible();
});

test("CON-41 Anika opens 'Accept offer', reads what accepting means, and cancels: no answer is recorded", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "offers");
  const open = page.locator("[data-offer][data-status=PENDING_REVIEW]").first();
  if ((await open.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "No offer is pending review any more (earlier run answered them)." });
    return;
  }
  await narrate(page, "She opens a pending offer");
  await open.locator("[data-action=view]").click();
  const sheet = page.locator("[data-offer-detail]");
  await expect(sheet).toBeVisible();
  await narrate(page, "Accept Offer asks for confirmation and explains that nothing is signed or sent to the client");
  await page.getByRole("button", { name: "Accept Offer" }).click();
  const dlg = page.getByRole("dialog", { name: "Accept this offer?" });
  await expect(dlg.locator("[data-accept-copy]")).toContainText("Nothing is signed or sent to the client by Kiwiply");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator("[data-offer][data-status=PENDING_REVIEW]").first()).toBeVisible(); // unchanged
});

test("CON-42 Anika asks to negotiate a pending offer: her request is recorded for the marketer", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "offers");
  const open = page.locator("[data-offer][data-status=PENDING_REVIEW]").first();
  if ((await open.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "No offer is pending review any more; the negotiation state is asserted instead." });
    await expect(page.locator("[data-offer][data-status=NEGOTIATION]").first()).toBeVisible();
    return;
  }
  await narrate(page, "She opens a pending offer and chooses Negotiate");
  await open.locator("[data-action=view]").click();
  await page.getByRole("button", { name: "Negotiate", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Ask to negotiate?" });
  await dlg.getByRole("button", { name: "Send request" }).click();
  await narrate(page, "A note is required: she says what she wants to discuss");
  await expect(dlg.getByRole("alert")).not.toBeEmpty();
  await dlg.getByLabel("What you would like to negotiate").fill(`QA story ${stamp()}: I would like to talk about the start date.`);
  await dlg.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Negotiation requested").first()).toBeVisible(); // the toast, the offer card and the drawer all say it
  await expect(page.locator("[data-offer][data-status=NEGOTIATION]").first()).toBeVisible();
});

test("CON-43 Ben (on a project) sees his active placement with no rate or amount anywhere", async ({ as }) => {
  const { page, go } = await as("ben");
  await narrate(page, "Ben is on a project: he opens My Placement");
  await openPage(page, go, "placements");
  await expect(pageTitle(page)).toHaveText("My Placement");
  await expect(page.locator("[data-no-placement]")).toHaveCount(0);
  await expect(page.locator("[data-stat-tile='Active Placement'] [data-tile-value]")).toHaveText("1");

  await narrate(page, "Overview: client, project and manager (demo stand-ins carry a Sample mark)");
  const overview = page.locator("[data-home-card=placement-overview]");
  await expect(overview).toContainText("Digital Platform Programme");
  await expect(overview).toContainText("Alex Morgan");

  await narrate(page, "Milestones and upcoming meetings are listed; a meeting without a link has a disabled Join");
  await expect(page.locator("[data-milestone]").first()).toBeVisible();
  await expect(page.locator("[data-meeting]").first()).toBeVisible();
  await expect(page.locator("[data-meeting] a[target=_blank]").first()).toHaveAttribute("rel", /noopener/);

  await narrate(page, "A consultant never sees a bill rate or an amount on this page");
  const text = await page.locator("[data-consultant-placements]").innerText();
  expect(text).not.toMatch(/\$\s?\d|per hour|\/hr|bill rate/i);
});

test("CON-44 Ben works his onboarding checklist (with Undo), posts a status update and reads the client details", async ({ as }) => {
  const { page, go } = await as("ben");
  await openPage(page, go, "placements");

  await narrate(page, "He ticks an onboarding item and undoes it");
  const items = page.locator("[data-check]");
  await expect(items.first()).toBeVisible();
  const unchecked = page.locator("[data-check][aria-checked=false]").first();
  // Pin the item by its own id: "the first unchecked one" stops matching the moment it is ticked (and matches ANOTHER item when two are open), so the
  // story left the checklist in whatever state an earlier run had. The Undo below puts this item back, so the story can run again.
  const id = await ((await unchecked.count()) ? unchecked : items.first()).getAttribute("data-check");
  const target = page.locator(`[data-check="${id}"]`);
  const was = await target.getAttribute("aria-checked");
  await target.click();
  await expect(target).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
  await page.locator("[data-action=undo]").click();
  await expect(target).toHaveAttribute("aria-checked", was ?? "false");

  await narrate(page, "Quick Action: View Client Details opens the client's non-sensitive details");
  await page.locator("[data-quick=client]").click();
  const client = page.getByRole("dialog", { name: "Client details" });
  await expect(client.locator("[data-client-details]")).toBeVisible();
  await client.getByRole("button", { name: /^Close/ }).first().click(); // the header's X and the footer's Close button

  await narrate(page, "Update Status posts a short note to his placement activity");
  await page.locator("[data-quick=status]").click();
  const dlg = page.getByRole("dialog", { name: "Update status" });
  await dlg.getByLabel("Status update").fill(`QA story ${stamp()}: onboarding is on track and the first sprint starts Monday.`);
  await dlg.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Update posted")).toBeVisible();
  await expect(page.locator("[data-activity]").first()).toBeVisible();

  await narrate(page, "Download Documents is honest about not being available yet");
  await page.locator("[data-quick=docs]").click();
  await expect(page.locator("[data-docs-hint]")).toContainText("Documents arrive with the HR workspace");
});

test("CON-45 Anika (not on a project) sees the honest 'no active placement' state", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "placements");
  await narrate(page, "Anika is available, so there is no placement to show; the page says so instead of inventing one");
  await expect(page.locator("[data-no-placement]")).toBeVisible();
  await expect(page.locator("[data-quick=status]")).toBeDisabled();
});

test("CON-46 Anika reviews her Availability: tiles, calendar, work preferences and history", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Availability");
  await openPage(page, go, "availability");
  await expect(pageTitle(page)).toHaveText("Availability");
  for (const title of ["Available From", "Open Opportunities", "Preferred Work Mode", "Notice Period"]) await expect(page.locator(`[data-stat-tile="${title}"]`)).toBeVisible();
  await expect(page.locator('[data-stat-tile^="Vacation Days"]')).toBeVisible();

  await narrate(page, "The month calendar paints time off and open-to-work days; she can step forward a month");
  await expect(page.locator("[data-calendar]")).toBeVisible();
  const month = await page.locator("[data-month-title]").innerText();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator("[data-month-title]")).not.toHaveText(month);
  await page.getByRole("button", { name: "Previous month" }).click();

  await narrate(page, "Work preferences (location, authorization, mode, rate, travel) and Availability History are real; approvals are marked Sample");
  await expect(page.locator("[data-pref=authorization]")).toBeVisible();
  await expect(page.locator("[data-pref=mode]")).toBeVisible();
  await expect(page.locator("[data-block]").first()).toBeVisible();
  await expect(page.locator("[data-history]").first()).toBeVisible();
  await expect(page.locator("[data-sample-note]").first()).toBeVisible();
});

test("CON-47 Anika adds a personal day off to her calendar, then removes it; a past date is refused", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "availability");
  const reason = `QA day off ${stamp()}`;
  const day = isoDay(150 + (Date.now() % 90));

  await narrate(page, "Quick Action: Add Blocked Dates");
  await page.locator("[data-quick=blocked]").click();
  const sheet = page.getByRole("dialog", { name: "Add blocked dates" });
  await pick(page, sheet.getByRole("button", { name: "Type" }), "Personal");

  await narrate(page, "A date in the past is refused");
  await sheet.getByLabel("Start date").fill(isoDay(-3));
  await sheet.getByLabel("End date").fill(isoDay(-3));
  await sheet.getByRole("button", { name: "Add entry" }).click();
  await expect(sheet.getByRole("alert")).not.toBeEmpty();

  await narrate(page, "A future day is accepted");
  await sheet.getByLabel("Start date").fill(day);
  await sheet.getByLabel("End date").fill(day);
  await sheet.getByLabel("Reason (optional)").fill(reason);
  await sheet.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Entry added").or(page.getByText(/saved|added/i)).first()).toBeVisible();

  const viewAll = page.getByRole("button", { name: /^View all \d+ unavailable dates/ });
  if (await viewAll.count()) await viewAll.click();
  const row = page.locator("[data-block]", { hasText: reason });
  await expect(row).toBeVisible();

  await narrate(page, "Then she deletes it again (the calendar is back to how it was)");
  await menuAction(page, row.getByRole("button", { name: /^More actions for/ }), "Delete");
  await page.getByRole("dialog", { name: "Delete this entry?" }).getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText("Entry removed")).toBeVisible();
  await expect(page.locator("[data-block]", { hasText: reason })).toHaveCount(0);
});

test("CON-48 Anika changes her availability status (it also updates her career profile) and restores it", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "profile");
  const select = page.locator("[data-profile-top]").getByRole("button", { name: "Availability" });
  const original = ((await select.innerText()) ?? "").trim();

  await narrate(page, "On Availability she opens Update Availability and chooses 'On notice'");
  await go("/w/consultant/availability");
  await expect(page.locator("[data-consultant-availability][data-status=ready]")).toBeVisible();
  await page.locator("[data-quick=update]").click();
  let sheet = page.getByRole("dialog", { name: "Update availability" });
  await pick(page, sheet.getByRole("button", { name: "Status" }), "On notice");
  await sheet.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByText("Availability updated")).toBeVisible();

  await narrate(page, "The same status shows on My Career Profile");
  await go("/w/consultant/profile");
  await expect(page.locator("[data-consultant-profile][data-status=ready]")).toBeVisible();
  await expect(page.locator("[data-profile-top]").getByRole("button", { name: "Availability" })).toContainText("On notice");

  await narrate(page, "She sets it back");
  await go("/w/consultant/availability");
  await expect(page.locator("[data-consultant-availability][data-status=ready]")).toBeVisible();
  await page.locator("[data-quick=update]").click();
  sheet = page.getByRole("dialog", { name: "Update availability" });
  await pick(page, sheet.getByRole("button", { name: "Status" }), original || "Available");
  await sheet.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByText("Availability updated")).toBeVisible();
});
