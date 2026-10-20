import { test, expect, narrate } from "../_support/story";
import { lettersStamp, openPage, pageTitle, stamp } from "./_helpers";

/**
 * My Marketer, My Applications, Submissions and Interviews (its Schedule and Prepare tabs): the part of the workspace where the consultant
 * follows what the marketer prepared and records her own decisions. Kiwiply never submits anything; the consultant applies on the
 * source site with her own extension and only records / follows status here.
 */

test("CON-30 Anika sees who her marketer is and what they are working on; messaging says honestly that it is not available yet", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens My Marketer");
  await openPage(page, go, "marketer");
  await expect(pageTitle(page)).toHaveText("My Marketer");

  await narrate(page, "Her marketer is Sarah Chen (the demo pins Anika to Sarah)");
  await expect(page.locator("[data-marketer-name]")).toHaveText("Sarah Chen");
  await expect(page.locator("[data-response-badge]")).toHaveCount(0); // D12: no invented 'Responsive' badge: nothing measures a response time yet

  // D12: there is no message or call channel, so Send Message and Schedule Call are disabled and say why (no dialog pretends to send)
  await narrate(page, "Send Message and Schedule Call are disabled, and the tooltip says why: nothing can be sent or scheduled yet");
  for (const label of ["Send Message", "Schedule Call"]) {
    const button = page.locator(`[data-marketer-action='${label}']`);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /isn't available yet/);
  }
});

test("CON-31 Ben's marketer is Omar Haddad (each consultant sees only their own marketer)", async ({ as }) => {
  const { page, go } = await as("ben");
  await openPage(page, go, "marketer");
  await narrate(page, "Ben is assigned to Omar, not Sarah");
  await expect(page.locator("[data-marketer-name]")).toHaveText("Omar Haddad");
});

test("CON-32 Anika follows her applications: status filter, sort and the stage timeline of one application", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens My Applications");
  await openPage(page, go, "applications");
  await expect(pageTitle(page)).toHaveText("My Applications");
  const rows = page.locator("[data-application]");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(4);

  await narrate(page, "She filters to Under Review");
  const filter = page.getByLabel("Filter by status");
  const labels = await filter.locator("option").allInnerTexts();
  const under = labels.find((l) => l.startsWith("Under Review"));
  if (under) {
    await filter.selectOption({ label: under });
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText("Under Review");
  }
  await filter.selectOption({ index: 0 }); // All Statuses
  await page.getByLabel("Sort by").selectOption({ label: "Sort by: Company" });
  await expect(rows.first()).toBeVisible();

  await narrate(page, "She opens one application: stage timeline, next step, who updated it");
  await rows.first().locator("[data-action=view]").click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Application ID")).toBeVisible();
  await expect(detail.locator("[data-timeline]").or(detail.getByText("No stage changes have been recorded"))).toBeVisible();
  await expect(detail.getByText("You submit applications yourself, on the employer's site")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Submit|Apply)/i })).toHaveCount(0); // read-only: no submit anywhere
});

test("CON-33 Anika reads her Submissions and reviews a pending one before deciding", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Submissions");
  await openPage(page, go, "submissions");
  await expect(pageTitle(page)).toHaveText("Submissions");

  const pending = page.locator("[data-submission]");
  await narrate(page, "Submissions her marketer prepared wait for her approval, each with the resume version and a due time");
  if ((await pending.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "No pending submissions left (earlier run approved/declined all three); asserting the empty state and Past Submissions." });
  } else {
    await expect(pending.first().locator("[data-due]")).toBeVisible();
    const title = (await pending.first().getByRole("button", { name: /^Review / }).getAttribute("aria-label"))!.replace(/^Review /, "");
    await narrate(page, `She opens Review on "${title}"`);
    await pending.first().locator("[data-action=review]").click();
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet.locator("[data-review]")).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Marketer note" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Resume" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Before you approve" })).toBeVisible(); // the submission checklist now lives in the review
    await expect(sheet.getByRole("list", { name: "Submission checklist" })).toBeVisible();
    await sheet.getByRole("button", { name: `Close ${title}` }).click();
  }

  await narrate(page, "Past Submissions track what happened next (submitted, interview, not selected, declined)");
  await expect(page.locator("[data-past]").first()).toBeVisible();
  const statuses = await page.locator("[data-past]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  expect(statuses.length).toBeGreaterThanOrEqual(3);
});

test("CON-34 Anika approves a submission: it records her decision and nothing is sent to a client", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "submissions");
  const pending = page.locator("[data-submission]");
  if ((await pending.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "No pending submission left to approve (seed is consumed by earlier runs)." });
    await narrate(page, "Nothing is waiting for approval right now");
    return;
  }
  const before = await pending.count();
  const title = (await pending.first().getByRole("button", { name: /^Approve / }).getAttribute("aria-label"))!.replace(/^Approve /, "");
  await narrate(page, `She clicks Approve on "${title}"`);
  await pending.first().locator("[data-action=approve]").click();
  const dlg = page.getByRole("dialog", { name: "Approve this submission?" });
  await expect(dlg.locator("[data-approve-copy]")).toBeVisible();
  await narrate(page, "The dialog explains what approving means before she confirms");
  await dlg.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText("Submission approved")).toBeVisible();
  await expect(page.getByText(/Nothing was sent to the client from here/)).toBeVisible();
  await expect.poll(() => pending.count()).toBe(before - 1);
});

test("CON-35 Anika declines a submission with a reason; an empty reason is refused first", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "submissions");
  const pending = page.locator("[data-submission]");
  if ((await pending.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "No pending submission left to decline." });
    return;
  }
  const before = await pending.count();
  const title = (await pending.first().getByRole("button", { name: /^Decline / }).getAttribute("aria-label"))!.replace(/^Decline /, "");
  await narrate(page, `She clicks Decline on "${title}"`);
  await pending.first().locator("[data-action=decline]").click();
  const dlg = page.getByRole("dialog", { name: "Decline this submission?" });
  await narrate(page, "Without a reason the dialog does not let her decline");
  await dlg.getByRole("button", { name: "Decline submission" }).click();
  await expect(dlg.getByRole("alert")).not.toBeEmpty();
  await narrate(page, "With a reason it records the decision for her marketer");
  await dlg.getByLabel("Reason for declining").fill(`QA story ${stamp()}: the rate is below my minimum for this kind of role.`);
  await dlg.getByRole("button", { name: "Decline submission" }).click();
  await expect(page.getByText("Submission declined")).toBeVisible();
  await expect.poll(() => pending.count()).toBe(before - 1);
});

test("CON-36 Anika manages her Interviews: calendar, details, join link, and feedback on a completed one", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Interviews (the Schedule tab)");
  await openPage(page, go, "interviews");
  await expect(pageTitle(page)).toHaveText("Interviews");

  await narrate(page, "The table lists her three upcoming interviews; the calendar marks their days");
  await expect(page.locator("[data-interview]")).toHaveCount(3);
  await expect(page.locator("[data-day]").first()).toBeVisible();

  const first = page.locator("[data-interview]").first();
  await narrate(page, "She opens the first one and saves how she will join (video + meeting link) and a private prep note");
  await first.locator("[data-action=view]").click();
  const sheet = page.locator("[data-interview-sheet]");
  await expect(sheet).toBeVisible();
  const link = `https://meet.example.org/qa-${lettersStamp()}`;
  await sheet.locator("#iv-mode").selectOption({ label: "Video" });
  await sheet.locator("#iv-url").fill(link);
  await sheet.locator("#iv-note").fill(`QA story ${stamp()}: review the system design notes.`);
  await sheet.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("[data-notice]")).toContainText("Interview details saved");
  await expect(page.locator(`a[data-action=join][href="${link}"]`).first()).toBeVisible();

  await page.keyboard.press("Escape"); // close the sheet if the save left it open
  await expect(page.locator("[data-interview-sheet]")).toHaveCount(0);
  await narrate(page, "Feedback she still owes on a completed interview appears under 'Waiting for your feedback'");
  const pendingFeedback = page.locator("[data-pending-feedback]");
  if ((await pendingFeedback.count()) > 0) {
    await pendingFeedback.getByRole("button", { name: /^Add feedback for/ }).first().click();
    const fb = page.locator("[data-block=feedback]");
    await fb.getByRole("button", { name: "Positive" }).click();
    await fb.locator("#iv-summary").fill("QA story: the panel asked about system design and my recent cloud migration work; it went well.");
    await fb.getByRole("button", { name: "Save feedback" }).click();
    await expect(page.locator("[data-notice]")).toContainText("Feedback saved");
  } else {
    test.info().annotations.push({ type: "note", description: "No interview is waiting for feedback (earlier run recorded it)." });
    await expect(page.locator("[data-feedback]").first()).toBeVisible();
  }
});

test("CON-37 Anika prepares for interviews: checklist with Undo, a practice session, and the history", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens Interviews > Prepare");
  await openPage(page, go, "interviews?tab=prepare");
  await expect(pageTitle(page)).toHaveText("Interviews");
  for (const m of ["question-bank", "technical", "company", "behavioral"]) await expect(page.locator(`[data-module=${m}]`)).toBeVisible();

  await narrate(page, "She ticks an item on the 'Before interview' checklist, then undoes it");
  const check = page.locator("[data-check=review-jd]");
  const was = await check.getAttribute("aria-checked");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
  await page.locator("[data-action=undo]").click();
  await expect(check).toHaveAttribute("aria-checked", was ?? "false");

  const history = page.locator("[data-home-card=prep-history]");
  const expandHistory = async () => {
    const all = history.getByRole("button", { name: "View All" });
    if (await all.count()) await all.click();
  };
  const sessionIds = () => page.locator("[data-session]").evaluateAll((els) => els.map((e) => e.getAttribute("data-session")));
  await expandHistory();
  const idsBefore = await sessionIds();
  await narrate(page, "She starts a Technical Topics practice and scores each answer herself (this is self-assessment, not AI scoring)");
  await page.locator("[data-module=technical] [data-action=practice]").click();
  const sheet = page.getByRole("dialog", { name: "Technical Topics" });
  await expect(sheet.locator("[data-practice=technical]")).toBeVisible();
  const questions = sheet.locator("[data-question] input[type=range]");
  const n = await questions.count();
  expect(n).toBe(5);
  for (let i = 0; i < n; i++) await questions.nth(i).fill(String(60 + i * 5));
  await sheet.locator("[data-avg]").waitFor();
  await expect(sheet.locator("[data-avg]")).toContainText("Your score:");
  await sheet.getByLabel("Notes for yourself (optional)").fill(`QA story ${stamp()}: revisit scaling trade-offs.`);
  await sheet.locator("[data-action=save-session]").click();
  await expect(page.locator("[data-banner]")).not.toBeEmpty();
  await expandHistory();
  await expect.poll(async () => (await sessionIds()).filter((id) => !idsBefore.includes(id)).length).toBe(1);
  const fresh = (await sessionIds()).find((id) => !idsBefore.includes(id))!;

  await narrate(page, "Practice Session History now lists it; she reviews the question-level scores");
  await page.locator(`[data-session="${fresh}"] [data-action=review]`).click();
  await expect(page.locator("[data-review]")).toBeVisible();
  await expect(page.locator("[data-answer]").first()).toBeVisible();
});

test("CON-38 Ben (on a project) has his own marketer, applications and interviews, separate from Anika's", async ({ as }) => {
  const { page, go } = await as("ben");
  await narrate(page, "Ben signs in: a different consultant, a different workspace");
  await openPage(page, go, "applications");
  await expect(page.locator("[data-application]").first()).toBeVisible();
  await openPage(page, go, "interviews");
  await expect(page.locator("[data-interview]").first()).toBeVisible();
});
