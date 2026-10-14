import { test, expect, narrate } from "../_support/story";
import { api, boardRow, captureJob, consultantIdByName, conRow, jobBody, mockPostingSite, orgIdOf, ready } from "./_mkt";

/**
 * Release-1 JOB PIPELINE (docs/enterprise-v2/60-job-phase1-contract.md): a marketer captures a trimmed job (the extension's "Save for consultant" =
 * POST .../mkt/opportunities/from-extension, performed here over HTTP), assigns it to a consultant, the consultant sees it in their own workspace,
 * responds, and the marketer sees the response. Two browser sessions per story (marketer + consultant). E1 holds throughout: nothing here applies,
 * submits or signs in for anyone; "I applied" is the consultant's own statement.
 */

test.describe("MKT job pipeline", () => {
  test("MKT-20 Omar saves a job from the extension for Ben and sees it on his Opportunities board", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const ben = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const stamp = Date.now();
    const body = jobBody(stamp, [ben]);

    await narrate(omar.page, "Omar is on a job page: the extension sends a trimmed job for Ben (no description)");
    const cap = await captureJob(omar, "omar", orgId, body);
    expect(cap.status, cap.text).toBe(200);
    expect(cap.json?.existingJob).toBe(false);
    expect(cap.json?.results).toHaveLength(1);
    expect(cap.json?.results?.[0]).toMatchObject({ consultantId: ben, existing: false });
    expect(cap.json?.results?.[0]?.opportunityId).toBeGreaterThan(0);
    expect(cap.json?.results?.[0]?.reason).toBeUndefined();

    await narrate(omar.page, "The new opportunity shows up on his board, waiting for Ben's answer");
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, String(body.title));
    await expect(row).toContainText("Ben Okafor");
    await expect(row).toContainText(String(body.company));
    await expect(row.locator("[data-opp-interest=NO_RESPONSE]")).toBeVisible();

    await narrate(omar.page, "Job Discovery lists the same job, with its captured facts");
    await omar.go("/w/marketing/jobs");
    await ready(omar.page, "[data-jobs-page]").waitFor();
    await omar.page.getByPlaceholder(/Search job title, skills, client/).fill(String(stamp));
    await omar.page.keyboard.press("Enter");
    const jobRow = omar.page.locator("[data-job-row]").filter({ hasText: String(body.title) });
    await expect(jobRow).toHaveCount(1, { timeout: 20_000 });
    await expect(jobRow).toContainText(String(body.company));
  });

  test("MKT-21 Ben sees Omar's job in his workspace, opens the posting and says he is interested; Omar sees the answer", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const benId = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const body = jobBody(Date.now(), [benId]);
    const title = String(body.title);
    const cap = await captureJob(omar, "omar", orgId, body);
    expect(cap.status, cap.text).toBe(200);

    const ben = await as("ben");
    await mockPostingSite(ben);
    await ben.go("/w/consultant/opportunities");
    await narrate(ben.page, "Ben opens Assigned Opportunities");
    await ready(ben.page, "[data-con-opportunities]").waitFor();
    const row = conRow(ben.page, title);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(String(body.company));
    await expect(row.locator("[data-state-chip=ASSIGNED]")).toBeVisible();
    await expect(row).toContainText("Omar Haddad");

    await narrate(ben.page, "He opens the job: the marketer's note, pay and source are all there");
    await row.getByRole("link", { name: title }).click();
    const detail = ben.page.locator("[data-con-detail]");
    await expect(detail).toBeVisible();
    await expect(detail.locator("[data-con-section=note]")).toContainText("strong fit for your automation background");
    await expect(detail.locator("[data-con-section=pay]")).toContainText("$70 - $80 / hr");
    await expect(detail.locator("[data-con-section=source]")).toContainText(String(body.jobUrl));
    await expect(detail.locator("[data-never-applies]")).toBeVisible();
    // the full description is never held: only the facts and the link
    await expect(detail).not.toContainText(/job description/i);

    await narrate(ben.page, "Open job posting goes to the source site; Ben applies there himself");
    const [posting] = await Promise.all([ben.context.waitForEvent("page"), detail.locator("[data-open-posting]").click()]);
    await expect(posting.getByRole("heading", { name: /job posting on the source site/i })).toBeVisible();
    await posting.close();
    await expect(detail.locator("[data-state-chip=VIEWED]")).toBeVisible();

    await narrate(ben.page, "Ben presses Interested");
    await detail.locator("[data-action=INTEREST]").click();
    await expect(detail.locator("[data-state-chip=INTERESTED]")).toBeVisible();
    await ben.page.locator("[data-tab=INTERESTED]").first().click();
    await expect(conRow(ben.page, title)).toHaveCount(1);

    await narrate(omar.page, "Back on Omar's board the row now reads Interested");
    await omar.go("/w/marketing/opportunities");
    const mrow = await boardRow(omar.page, title);
    await expect(mrow.locator("[data-opp-interest=INTERESTED]")).toBeVisible();
    await expect(omar.page.locator("[data-opp-card=activity]")).toContainText(/is interested/);
  });

  test("MKT-22 Ben asks a question, Omar answers it, Ben reads the answer", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const ben = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const body = jobBody(Date.now(), [ben]);
    const title = String(body.title);
    const cap = await captureJob(omar, "omar", orgId, body);
    expect(cap.status, cap.text).toBe(200);
    const conOppId = cap.json?.results?.[0]?.opportunityId;

    const bena = await as("ben");
    await bena.go(`/w/consultant/opportunities/${conOppId}`);
    await narrate(bena.page, "Ben opens the job through its own link and asks about remote work");
    const detail = bena.page.locator("[data-con-detail]");
    await expect(detail).toBeVisible();
    await detail.locator("[data-action=REQUEST_INFO]").click();
    const question = `Is this role fully remote? (${Date.now()})`;
    await bena.page.getByLabel("Your question").fill(question);
    await bena.page.getByRole("button", { name: "Send question" }).click();
    await expect(detail.locator("[data-state-chip=NEEDS_INFO]")).toBeVisible();
    await expect(detail.locator("[data-con-section=info]")).toContainText(question);
    await expect(detail.locator("[data-con-section=info]")).toContainText(/Waiting for Omar Haddad to answer/);

    await narrate(omar.page, "Omar sees the question in his activity feed and in the opportunity timeline");
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await expect(omar.page.locator("[data-opp-card=activity]")).toContainText(/asked a question/);
    const matchId = Number(await row.getAttribute("data-opp-row"));
    expect(matchId).toBeGreaterThan(0);
    await row.getByRole("button", { name: new RegExp(`More for Ben Okafor, ${title.replace(/[()]/g, "\\$&")}`) }).click();
    await omar.page.getByRole("menuitem", { name: "Open details" }).click();
    await expect(omar.page.locator("[data-opp-dialog]")).toContainText(/asked a question/);

    await narrate(omar.page, "The answer goes back through the opportunity API (the board has no answer box yet)");
    const answer = "Yes, fully remote within the US. Hours overlap Central time.";
    const res = await api(omar, "omar", "POST", `/api/orgs/${orgId}/mkt/opportunities/${matchId}/answer-info`, { body: { answer } });
    expect(res.status, res.text).toBe(200);

    await narrate(bena.page, "Ben reloads the job and reads Omar's answer");
    await bena.go(`/w/consultant/opportunities/${conOppId}`);
    const info = bena.page.locator("[data-con-detail] [data-con-section=info]");
    await expect(info).toContainText(answer);
    await expect(info).toContainText("Omar Haddad answered");
    await expect(bena.page.locator("[data-con-detail] [data-state-chip=NEEDS_INFO]")).toBeVisible(); // only the consultant moves it on
    await bena.page.locator("[data-con-detail] [data-action=INTEREST]").click();
    await expect(bena.page.locator("[data-con-detail] [data-state-chip=INTERESTED]")).toBeVisible();
  });

  test("MKT-23 Ben declines with a reason and Omar sees Not Interested", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const ben = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const body = jobBody(Date.now(), [ben]);
    const title = String(body.title);
    expect((await captureJob(omar, "omar", orgId, body)).status).toBe(200);

    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-con-opportunities]").waitFor();
    await narrate(bena.page, "Ben opens the job and declines it because of the pay");
    await conRow(bena.page, title).getByRole("link", { name: title }).click();
    const detail = bena.page.locator("[data-con-detail]");
    await detail.locator("[data-action=DECLINE]").click();
    const dialog = bena.page.locator("[data-con-dialog=con-decline]");
    await dialog.getByLabel("Pay doesn't work").check();
    await dialog.getByLabel("Note for your marketer").fill("Below my minimum rate.");
    await dialog.getByRole("button", { name: "Decline job" }).click();
    await expect(detail.locator("[data-state-chip=DECLINED]")).toBeVisible();
    await bena.page.locator("[data-tab=DECLINED]").first().click();
    await expect(conRow(bena.page, title)).toHaveCount(1);

    await narrate(omar.page, "Omar's board shows Not Interested and the reason in the timeline");
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await expect(row.locator("[data-opp-interest=NOT_INTERESTED]")).toBeVisible();
    await expect(row).toHaveAttribute("data-action", "COMPARE");
    await row.getByRole("button", { name: "Compare" }).click();
    await expect(omar.page.locator("[data-opp-dialog=compare]")).toContainText(/declined/i);
  });

  test("MKT-24 Ben presses I applied; the marketer sees that he says he applied (and the marketer has no apply button)", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const ben = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const body = jobBody(Date.now(), [ben]);
    const title = String(body.title);
    expect((await captureJob(omar, "omar", orgId, body)).status).toBe(200);

    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-con-opportunities]").waitFor();
    await conRow(bena.page, title).getByRole("link", { name: title }).click();
    const detail = bena.page.locator("[data-con-detail]");
    await expect(detail.locator("[data-applied-copy]")).toContainText("press I applied after you submit");
    await narrate(bena.page, "Ben applied on the source site himself, then presses I applied");
    await detail.locator("[data-action=APPLIED]").click();
    await expect(detail.locator("[data-state-chip=APPLIED]")).toBeVisible();
    await expect(detail.locator("[data-action=APPLIED]")).toHaveCount(0);
    await bena.page.locator("[data-tab=APPLIED]").first().click();
    await expect(conRow(bena.page, title)).toHaveCount(1);

    await narrate(omar.page, "Omar sees it in the opportunity timeline; there is no way for him to mark it applied");
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await row.getByRole("button", { name: /^More for Ben Okafor/ }).click();
    await omar.page.getByRole("menuitem", { name: "Open details" }).click();
    await expect(omar.page.locator("[data-opp-dialog]")).toContainText(/says they applied/);
    const items = await omar.page.getByRole("menuitem").allInnerTexts();
    expect(items.join("|")).not.toMatch(/mark.*appl|submit/i);
  });

  test("MKT-25 Sarah saves a job for Anika only: Anika sees it, Ben does not and cannot open it by id", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/marketing/opportunities");
    await ready(sarah.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(sarah.page);
    const anika = await consultantIdByName(sarah.page, orgId, "Anika Rao");
    const body = jobBody(Date.now(), [anika], { priority: "LOW" });
    const title = String(body.title);
    await narrate(sarah.page, "Sarah (marketing manager) saves a job for Anika");
    const cap = await captureJob(sarah, "sarah", orgId, body);
    expect(cap.status, cap.text).toBe(200);
    const conOppId = cap.json?.results?.[0]?.opportunityId;

    const anikaS = await as("anika");
    await anikaS.go("/w/consultant/opportunities");
    await ready(anikaS.page, "[data-con-opportunities]").waitFor();
    await narrate(anikaS.page, "Anika sees it, assigned by Sarah Chen");
    await expect(conRow(anikaS.page, title)).toHaveCount(1);
    await expect(conRow(anikaS.page, title)).toContainText("Sarah Chen");

    const ben = await as("ben");
    await ben.go("/w/consultant/opportunities");
    await ready(ben.page, "[data-con-opportunities]").waitFor();
    await narrate(ben.page, "Ben's list does not contain Anika's job");
    await expect(conRow(ben.page, title)).toHaveCount(0);
    await narrate(ben.page, "and opening it by its id shows nothing");
    await ben.go(`/w/consultant/opportunities/${conOppId}`);
    await expect(ben.page.locator("[data-con-detail-missing]")).toBeVisible();
    await expect(ben.page.locator("body")).not.toContainText(title);
  });

  test("MKT-26 The from-extension call refuses bad input and stays idempotent", async ({ as }) => {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const ben = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const stamp = Date.now();
    const good = jobBody(stamp, [ben]);

    await narrate(omar.page, "No Idempotency-Key: refused");
    const noKey = await captureJob(omar, "omar", orgId, good, { key: null });
    expect(noKey.status).toBe(400);
    expect(noKey.text).toContain("IDEMPOTENCY_KEY_MISSING");

    await narrate(omar.page, "A job description, a state or an appliedAt in the body: refused, never stored");
    for (const extra of [{ jobDescription: "Full text of the posting" }, { state: "APPLIED" }, { appliedAt: "2026-01-01T00:00:00Z" }]) {
      const r = await captureJob(omar, "omar", orgId, { ...good, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
      expect(r.text).toContain(Object.keys(extra)[0]);
    }

    await narrate(omar.page, "A plain-http link, and a note that looks like a government id: refused");
    expect((await captureJob(omar, "omar", orgId, { ...good, jobUrl: "http://jobs.example.com/x" })).status).toBe(400);
    const sens = await captureJob(omar, "omar", orgId, { ...good, keyInfo: "Candidate SSN is 123-45-6789" });
    expect(sens.status).toBe(422);
    expect(sens.text).toContain("SENSITIVE_CONTENT");

    await narrate(omar.page, "A consultant outside Omar's scope is reported in the result, not as an error");
    const anika = await (async () => {
      const sarah = await as("sarah");
      await sarah.go("/w/marketing/opportunities");
      return consultantIdByName(sarah.page, orgId, "Anika Rao");
    })();
    const out = await captureJob(omar, "omar", orgId, jobBody(stamp + 1, [anika]));
    expect(out.status, out.text).toBe(200);
    expect(out.json?.results?.[0]).toMatchObject({ consultantId: anika, reason: "NOT_IN_SCOPE" });

    await narrate(omar.page, "The same Idempotency-Key replays the same answer; a new key finds the same job");
    const key = crypto.randomUUID();
    const first = await captureJob(omar, "omar", orgId, good, { key });
    const replay = await captureJob(omar, "omar", orgId, good, { key });
    expect(first.status, first.text).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.json?.jobId).toBe(first.json?.jobId);
    expect(replay.json?.results?.[0]?.opportunityId).toBe(first.json?.results?.[0]?.opportunityId);
    const again = await captureJob(omar, "omar", orgId, good);
    expect(again.json?.existingJob).toBe(true);
    expect(again.json?.jobId).toBe(first.json?.jobId);
    expect(again.json?.results?.[0]?.existing).toBe(true);

    await narrate(omar.page, "A consultant cannot use the marketer's call at all (generic 404)");
    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    const conTry = await captureJob(bena, "ben", orgId, jobBody(stamp + 2, [ben]));
    expect(conTry.status).toBe(404);
  });
});
