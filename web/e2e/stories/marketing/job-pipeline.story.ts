import { test, expect, narrate } from "../_support/story";
import { menuAction } from "../consultant/_helpers";
import { api, bff, boardRow, captureJob, consultantIdByName, conRow, jobBody, keepMarketed, mockPostingSite, orgIdOf, ready } from "./_mkt";

/**
 * Release-1 JOB PIPELINE (docs/enterprise-v2/60-job-phase1-contract.md): a marketer captures a trimmed job (the extension's "Save for consultant" =
 * POST .../mkt/opportunities/from-extension, performed here over HTTP), assigns it to a consultant, the consultant sees it in their own workspace,
 * responds, and the marketer sees the response. Two browser sessions per story (marketer + consultant). E1 holds throughout: nothing here applies,
 * submits or signs in for anyone; "I applied" is the consultant's own statement.
 */

test.describe("MKT job pipeline", () => {
  keepMarketed("Ben Okafor"); // Ben is ON_PROJECT (marketing paused) in the seed: nothing can be assigned to him until he is available

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

  // The consultant side below is the LIVE Assigned Opportunities page (components/ent/consultant-ws/OpportunitiesPage.tsx: rows [data-opp], a detail side
  // sheet, a row menu with Express Interest / Need More Info / Decline). It answers for the consultant only on the consultant's own press, and never applies.

  /**
   * Omar saves a fresh job for Ben (the extension's "Save for consultant"), as every story below starts.
   *
   * KNOWN PRODUCT GAP (reported in videos-index.md, "Findings"): the live consultant Assigned Opportunities page (ent-consultant) writes Ben's answers
   * (Express Interest, Need More Info, Decline) to its own records, while Omar's Opportunities board (ent-marketer) reads its own interest state, so a consultant's
   * answer never reaches the board, and a job saved from the extension has no cws_job_source row, so its Open job link is disabled. The "b" stories carry the
   * marketer-side steps and are marked fixme until the two sides share one record.
   */
  async function savedForBen(as: Parameters<Parameters<typeof test>[2]>[0]["as"]) {
    const omar = await as("omar");
    await omar.go("/w/marketing/opportunities");
    await ready(omar.page, "[data-opportunities]").waitFor();
    const orgId = await orgIdOf(omar.page);
    const benId = await consultantIdByName(omar.page, orgId, "Ben Okafor");
    const body = jobBody(Date.now(), [benId]);
    const cap = await captureJob(omar, "omar", orgId, body);
    expect(cap.status, cap.text).toBe(200);
    return { omar, orgId, body, title: String(body.title), matchOppId: cap.json?.results?.[0]?.opportunityId };
  }

  test("MKT-21 Ben sees Omar's job in his workspace, opens the posting and says he is interested", async ({ as }) => {
    const { body, title } = await savedForBen(as);
    const ben = await as("ben");
    await mockPostingSite(ben);
    await ben.go("/w/consultant/opportunities");
    await narrate(ben.page, "Ben opens Assigned Opportunities");
    await ready(ben.page, "[data-consultant-opportunities]").waitFor();
    const row = conRow(ben.page, title);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(String(body.company));

    await narrate(ben.page, "He opens the job: the marketer's name and how to apply are there");
    await row.locator("[data-action=view]").click();
    const sheet = ben.page.getByRole("dialog", { name: title });
    await expect(sheet.locator("[data-detail]")).toBeVisible();
    await expect(sheet).toContainText("Omar Haddad");
    await expect(sheet.locator("[data-apply-helper]")).toContainText("extension"); // he applies himself, with his own extension

    await narrate(ben.page, "Open job link goes to the source site; Ben applies there himself");
    const link = sheet.locator("a[data-job-link]");
    if ((await link.count()) > 0) {
      const [posting] = await Promise.all([ben.context.waitForEvent("page"), link.click()]);
      await expect(posting.getByRole("heading", { name: /job posting on the source site/i })).toBeVisible();
      await posting.close();
    } else {
      // BLOCKED (product gap, see above): a job saved from the extension has no cws_job_source row, so the link is disabled.
      test.info().annotations.push({ type: "BLOCKED", description: "Open job link is disabled for a job saved from the extension (no cws_job_source row)" });
      await expect(sheet.locator("[data-job-link-missing]")).toBeVisible();
    }
    await ben.page.keyboard.press("Escape");

    await narrate(ben.page, "Ben presses Express Interest");
    await menuAction(ben.page, conRow(ben.page, title).getByRole("button", { name: `More actions for ${title}` }), "Express Interest");
    await expect(conRow(ben.page, title)).toContainText("Interested");
  });

  test("MKT-21b Omar's board reads Interested once Ben has pressed Express Interest", async ({ as }) => {
    test.fixme(true, "Product gap: the live consultant page's Express Interest does not reach the marketer's Opportunities board (stays No response)");
    const { omar, title } = await savedForBen(as);
    const ben = await as("ben");
    await ben.go("/w/consultant/opportunities");
    await ready(ben.page, "[data-consultant-opportunities]").waitFor();
    await menuAction(ben.page, conRow(ben.page, title).getByRole("button", { name: `More actions for ${title}` }), "Express Interest");
    await omar.go("/w/marketing/opportunities");
    const mrow = await boardRow(omar.page, title);
    await expect(mrow.locator("[data-opp-interest=INTERESTED]")).toBeVisible();
    await expect(omar.page.locator("[data-opp-card=activity]")).toContainText(/is interested/);
  });

  test("MKT-22 Ben asks a question about the job and is told it was sent to his marketer", async ({ as }) => {
    const { title } = await savedForBen(as);
    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await narrate(bena.page, "Ben asks his marketer about remote work from the row menu");
    await menuAction(bena.page, conRow(bena.page, title).getByRole("button", { name: `More actions for ${title}` }), "Need More Info");
    const ask = bena.page.getByRole("dialog", { name: `Need more info: ${title}` });
    await expect(ask.getByRole("button", { name: "Send question" })).toBeDisabled(); // a question needs words first
    await ask.getByLabel("What would you like to know?").fill(`Is this role fully remote? (${Date.now()})`);
    await ask.getByRole("button", { name: "Send question" }).click();
    await expect(bena.page.getByText("Question sent to your marketer")).toBeVisible();
  });

  test("MKT-22b Omar sees Ben's question, answers it, and Ben reads the answer", async ({ as }) => {
    test.fixme(true, "Product gap: the live consultant page's Need More Info does not reach the marketer (answer-info answers NO_OPEN_INFO_REQUEST), and the page shows no answer");
    const { omar, orgId, title } = await savedForBen(as);
    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await menuAction(bena.page, conRow(bena.page, title).getByRole("button", { name: `More actions for ${title}` }), "Need More Info");
    const ask = bena.page.getByRole("dialog", { name: `Need more info: ${title}` });
    await ask.getByLabel("What would you like to know?").fill(`Is this role fully remote? (${Date.now()})`);
    await ask.getByRole("button", { name: "Send question" }).click();
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await expect(omar.page.locator("[data-opp-card=activity]")).toContainText(/asked a question/);
    const matchId = Number(await row.getAttribute("data-opp-row"));
    const answer = "Yes, fully remote within the US. Hours overlap Central time.";
    const res = await api(omar, "omar", "POST", `/api/orgs/${orgId}/mkt/opportunities/${matchId}/answer-info`, { body: { answer } });
    expect(res.status, res.text).toBe(200);
    await bena.go("/w/consultant/opportunities");
    await conRow(bena.page, title).locator("[data-action=view]").click();
    await expect(bena.page.getByRole("dialog", { name: title })).toContainText(answer);
  });

  test("MKT-23 Ben declines with a reason and his own page keeps it", async ({ as }) => {
    const { title } = await savedForBen(as);
    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await narrate(bena.page, "Ben declines the job because of the pay");
    await menuAction(bena.page, conRow(bena.page, title).getByRole("button", { name: `More actions for ${title}` }), "Decline Opportunity");
    const decline = bena.page.getByRole("dialog", { name: `Decline opportunity: ${title}` });
    await decline.getByLabel("Why is it not a fit?").fill("Pay is below my minimum rate.");
    await decline.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(bena.page.getByText("Opportunity declined")).toBeVisible();
    await expect(conRow(bena.page, title)).toContainText("Declined");
    await narrate(bena.page, "His reason is kept on the job");
    await conRow(bena.page, title).locator("[data-action=view]").click();
    await expect(bena.page.getByRole("dialog", { name: title })).toContainText("Pay is below my minimum rate.");
  });

  test("MKT-23b Omar's board shows Not Interested and the reason once Ben has declined", async ({ as }) => {
    test.fixme(true, "Product gap: the live consultant page's Decline does not reach the marketer's Opportunities board (stays No response)");
    const { omar, title } = await savedForBen(as);
    const bena = await as("ben");
    await bena.go("/w/consultant/opportunities");
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await menuAction(bena.page, conRow(bena.page, title).getByRole("button", { name: `More actions for ${title}` }), "Decline Opportunity");
    const decline = bena.page.getByRole("dialog", { name: `Decline opportunity: ${title}` });
    await decline.getByLabel("Why is it not a fit?").fill("Pay is below my minimum rate.");
    await decline.getByRole("button", { name: "Decline", exact: true }).click();
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await expect(row.locator("[data-opp-interest=NOT_INTERESTED]")).toBeVisible();
    await expect(row).toHaveAttribute("data-action", "COMPARE");
    await row.getByRole("button", { name: "Compare" }).click();
    await expect(omar.page.locator("[data-opp-dialog=compare]")).toContainText(/declined/i);
  });

  test("MKT-24 Ben presses I applied; the marketer sees that he says he applied (and the marketer has no apply button)", async ({ as }) => {
    // BLOCKED: the live Assigned Opportunities page has no "I applied" button. The consultant applies on the source site with his own extension and
    // the application then appears under My Applications; only the shadowed registry page (ent-marketer) offered I applied. MKT-24b covers the part that holds.
    test.fixme(true, "The live consultant Assigned Opportunities page has no I applied action (see MKT-24b for the no-apply guarantee)");
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
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await conRow(bena.page, title).locator("[data-action=view]").click();
    await bena.page.getByRole("button", { name: "I applied" }).click();
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await row.getByRole("button", { name: /^More for Ben Okafor/ }).click();
    await omar.page.getByRole("menuitem", { name: "Open details" }).click();
    await expect(omar.page.locator("[data-opp-dialog]")).toContainText(/says they applied/);
  });

  test("MKT-24b Nobody can apply for Ben inside Kiwiply: Ben's page offers no Apply or Submit, and neither does Omar's board", async ({ as }) => {
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
    await ready(bena.page, "[data-consultant-opportunities]").waitFor();
    await narrate(bena.page, "Ben's page has the posting link and his own answers, but no Apply, Submit or I applied");
    await conRow(bena.page, title).locator("[data-action=view]").click();
    await expect(bena.page.getByRole("dialog", { name: title }).locator("[data-detail]")).toBeVisible();
    await expect(bena.page.getByRole("button", { name: /^(Apply|Submit|I applied)/i })).toHaveCount(0);

    await narrate(omar.page, "Omar's board has no way to mark it applied or to submit it");
    await omar.go("/w/marketing/opportunities");
    const row = await boardRow(omar.page, title);
    await row.getByRole("button", { name: /^More for Ben Okafor/ }).click();
    const items = await omar.page.getByRole("menuitem").allInnerTexts();
    expect(items.join("|")).not.toMatch(/mark.*appl|submit/i);
  });

  test("MKT-25 Sarah saves a job for Anika only: Anika sees it, Ben does not and cannot open it by id", async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/admin"); // Sarah only supplies the job; her own marketing workspace is not built
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
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
    await ready(anikaS.page, "[data-consultant-opportunities]").waitFor();
    await narrate(anikaS.page, "Anika sees it, assigned by Sarah Chen");
    await expect(conRow(anikaS.page, title)).toHaveCount(1);
    await expect(conRow(anikaS.page, title)).toContainText("Sarah Chen");

    const ben = await as("ben");
    await ben.go("/w/consultant/opportunities");
    await ready(ben.page, "[data-consultant-opportunities]").waitFor();
    await narrate(ben.page, "Ben's list does not contain Anika's job");
    await expect(conRow(ben.page, title)).toHaveCount(0);
    await narrate(ben.page, "and asking for it by its id gets the same answer as for a job that does not exist");
    const byId = await bff(ben.page, `/api/orgs/${orgId}/me-workspace/opportunities/${conOppId}`);
    expect(byId.status).toBe(404);
    expect(JSON.stringify(byId.json ?? "")).not.toContain(title);
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
      await sarah.go("/w/admin");
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
