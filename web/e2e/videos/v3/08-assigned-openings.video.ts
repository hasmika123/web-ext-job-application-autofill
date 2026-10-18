import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { menuAction } from "../../stories/consultant/_helpers";
import type { Page } from "@playwright/test";
import { captureJob, consultantIdByName, jobBody, mockPostingSite, setAvailability, ready, orgIdOf } from "../../stories/marketing/_mkt";
import { offCamera } from "./_kit";

/**
 * VIDEO 08: Open the jobs your marketer assigned to you (Ben Okafor, consultant, and Omar Haddad, his marketer, at Acme Staffing).
 * Stories shown: CON-25/26 and MKT-21/21b/22/22b/23/23b/24 (the one consultant answer that reaches the marketer's board).
 * E1 holds throughout: the consultant answers and applies himself; nothing in Kiwiply applies, submits or signs in for anyone.
 * Setup off camera (the same HTTP call the extension's "Save for consultant" makes): Omar saves three jobs for Ben; Ben is made available for marketing.
 */
const stamp = Date.now();
/** This take's own job (the title can repeat across takes, the employer does not). */
const rowOf = (page: Page, i: number) => page.locator("[data-consultant-opportunities] [data-opp]").filter({ hasText: JOBS[i].title }).filter({ hasText: JOBS[i].company }).first();
const boardOf = (page: Page, i: number) => page.locator("[data-opp-row]").filter({ hasText: JOBS[i].title }).filter({ hasText: JOBS[i].company }).first();
// A job the same consultant already holds (same title and company, last 90 days) is refused by the duplicate guard, so every take uses its own set of employers (STORY_TAKE=0,1,2...).
const SETS = [
  ["Brightwave Systems", "Copperline Analytics", "Meridian Freight"],
  ["Larkspur Cloud", "Fernhill Data", "Anchorpoint Logistics"],
  ["Tidewater Software", "Granite Peak Analytics", "Silverline Freight"],
  ["Oakridge Systems", "Bluebird Analytics", "Harborlight Logistics"],
];
const TAKE = Number(process.env.STORY_TAKE ?? 0) % SETS.length;
const [C1, C2, C3] = SETS[TAKE];
const JOBS = [
  { key: "A", title: "Senior Platform Engineer", company: C1, pay: "$95 - $110 / hr", note: `${C1} runs Kubernetes on three clouds. Strong fit with your DevOps work. Please read the posting and apply yourself if you like it.` },
  { key: "B", title: "Data Reliability Engineer", company: C2, pay: "$55 - $62 / hr", note: `${C2} is a small analytics team. The rate is lower than your last role, so I wanted you to see it before I push any further.` },
  { key: "C", title: "DevOps Lead", company: C3, pay: "$100 - $115 / hr", note: `${C3} needs a lead for its delivery pipelines. Your Terraform and AWS background matches closely.` },
];

test("VIDEO-08 Open assigned openings: interest, a question, a decline, 'I applied', and the marketer's board", async ({ flow, browser }) => {
  test.setTimeout(1_800_000);
  // ---- off camera: Ben is available for marketing, and Omar saves three jobs for him
  const sarah = await offCamera(browser, "sarah", "/w/admin");
  await sarah.page.locator("[data-enterprise-shell]").waitFor({ timeout: 45_000 });
  const org = await orgIdOf(sarah.page);
  const benWas = await setAvailability(sarah.page, org, "Ben Okafor", "AVAILABLE");
  await sarah.close();
  const omarSetup = await offCamera(browser, "omar", "/w/marketing/opportunities");
  await ready(omarSetup.page, "[data-opportunities]").waitFor();
  const benId = await consultantIdByName(omarSetup.page, org, "Ben Okafor");
  const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  for (const [i, j] of JOBS.entries()) {
    const body = jobBody(stamp + i, [benId], {
      title: j.title,
      company: j.company,
      payLabel: j.pay,
      keyInfo: j.note,
      priority: i === 1 ? "MEDIUM" : "HIGH",
      dueOn: due(1 + i),
      skills: ["AWS", "Kubernetes", "Terraform"],
      location: "Remote (US)",
    });
    const cap = await captureJob(omarSetup, "omar", org, body);
    expect(cap.status, cap.text).toBe(200);
  }
  await omarSetup.close();

  try {
    const f = await flow({ who: "omar" });
    const { page, context } = f;
    await mockPostingSite({ page, context, go: f.go });

    await f.titleCard({
      title: "Open your assigned openings",
      roles: "Consultant and Marketer  |  Acme Staffing",
      intro: "Hi! In this video I'll show you what happens when your marketer finds a job for you. You'll see how a consultant answers, and how every answer reaches the marketer's board.",
      minMs: 3500,
    });

    // ---- Omar: the three jobs he just saved
    await f.go("/w/marketing/opportunities");
    await ready(page, "[data-opportunities]").waitFor();
    await narrate(page, "Let's start with the marketer. I'm Omar, and I use the Kiwiply extension to save jobs for my consultants. These three just arrived on my Opportunities board.");
    await page.getByLabel("Search by consultant or job title").fill("Ben Okafor");
    const mrowA = boardOf(page, 0);
    await expect(mrowA).toBeVisible({ timeout: 20_000 });
    await narrate(page, "They're all assigned to Ben, and every one says No response. Ben hasn't looked at them yet. Now it's his turn.", undefined, mrowA);

    // ---- Ben: Assigned Opportunities
    await f.switchTo("ben", "Now let's switch to Ben, the consultant.", "/w/consultant/opportunities");
    await ready(page, "[data-consultant-opportunities]").waitFor();
    await mockPostingSite({ page, context, go: f.go });
    await narrate(page, "This is Ben's Assigned Opportunities page. It lists the jobs his marketer assigned to him, each with a priority and a due date.");
    const tiles = page.locator("[data-opps-tiles]");
    await narrate(page, "The tiles up here count them: the total, the high priority ones, those waiting for his answer, and the ones he declined.", undefined, tiles);
    const rowA = rowOf(page, 0);
    await expect(rowA).toBeVisible({ timeout: 30_000 });
    await narrate(page, `Ben spots the new Senior Platform Engineer job from ${C1}. He opens it to read the details.`, undefined, rowA);
    await rowA.locator("[data-action=view]").click();
    const sheet = page.getByRole("dialog", { name: JOBS[0].title }).first();
    await expect(sheet.locator("[data-detail]")).toBeVisible();
    await narrate(page, "Here is what Omar wrote in his quick info, and who the marketer is. And there's a reminder that Ben applies himself, with his own extension.", undefined, sheet.locator("[data-quick-info]"));
    const link = sheet.locator("a[data-job-link]");
    const [posting] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await expect(posting.getByRole("heading", { name: /job posting on the source site/i })).toBeVisible();
    await narrate(page, "Open job link takes him to the employer's own posting in a new tab. Kiwiply never applies for him.");
    await posting.close();
    await page.keyboard.press("Escape");

    // ---- Express interest + ask a question
    await narrateDo(page, "He likes it, so from the row menu he picks Express Interest. That tells his marketer he wants it.", async () => {
      await menuAction(page, rowOf(page, 0).getByRole("button", { name: `More actions for ${JOBS[0].title}` }), "Express Interest");
      await expect(rowOf(page, 0)).toContainText("Interested");
    });
    await narrate(page, "The row now reads Interested. That is only his wish. Nothing is applied, and nothing is sent to the employer.");
    await menuAction(page, rowOf(page, 0).getByRole("button", { name: `More actions for ${JOBS[0].title}` }), "Need More Info");
    const ask = page.getByRole("dialog", { name: `Need more info: ${JOBS[0].title}` });
    await expect(ask).toBeVisible();
    await narrate(page, "He also has a question. He picks Need More Info and asks about the work arrangement.");
    await ask.getByLabel("What would you like to know?").fill("Is this role fully remote, and does it need on-call weekends?");
    await ask.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByText("Question sent to your marketer")).toBeVisible();
    await narrate(page, "The page confirms the question went to his marketer.");

    // ---- Decline B
    const rowB = rowOf(page, 1);
    await narrate(page, `The second job, Data Reliability Engineer at ${C2}, pays less than Ben wants. So he declines it, and gives a reason.`, undefined, rowB);
    await menuAction(page, rowB.getByRole("button", { name: `More actions for ${JOBS[1].title}` }), "Decline Opportunity");
    const decline = page.getByRole("dialog", { name: `Decline opportunity: ${JOBS[1].title}` });
    await decline.getByLabel("Why is it not a fit?").fill("The hourly rate is below my minimum for this kind of role.");
    await page.waitForTimeout(900);
    await decline.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(page.getByText("Opportunity declined")).toBeVisible();
    await expect(rowOf(page, 1)).toContainText("Declined");
    await narrate(page, "It's marked Declined, and his reason is kept with the job.");

    // ---- I applied C
    const rowC = rowOf(page, 2);
    await narrate(page, `The third one, DevOps Lead at ${C3}, is a great match. Ben applied on the employer's site himself, using the extension. Now he tells Kiwiply that he did.`, undefined, rowC);
    await rowC.locator("[data-action=view]").click();
    await page.getByRole("dialog", { name: JOBS[2].title }).first().getByRole("button", { name: "I applied" }).click();
    await expect(page.locator("[data-applied-confirm]")).toContainText("never applies or submits for you");
    await narrate(page, "A confirmation explains that Kiwiply never applies or submits for him. This is just his own statement, so his marketer can follow along.", undefined, page.locator("[data-applied-confirm]"));
    await page.getByRole("button", { name: "Yes, I applied" }).click();
    await expect(page.getByText("Marked as applied. Your marketer can see it.")).toBeVisible();
    await expect(rowOf(page, 2)).toContainText("Applied");

    // ---- Omar's board
    await f.switchTo("omar", "Now back to Omar's board, to see what Ben said.", "/w/marketing/opportunities");
    await ready(page, "[data-opportunities]").waitFor();
    await page.getByLabel("Search by consultant or job title").fill("Ben Okafor");
    const mA = boardOf(page, 0);
    await expect(mA.locator("[data-opp-interest=INTERESTED]")).toBeVisible({ timeout: 20_000 });
    await narrate(page, `${C1} now says Interested. Ben's answer reached the board by itself.`, undefined, mA);
    const mB = boardOf(page, 1);
    await expect(mB.locator("[data-opp-interest=NOT_INTERESTED]")).toBeVisible();
    await narrate(page, `${C2} says Not Interested.`, undefined, mB);
    const mC = boardOf(page, 2);
    await narrate(page, `And ${C3} shows that Ben says he applied.`, undefined, mC);
    await expect(page.locator("[data-opp-card=activity]")).toContainText(/asked a question/);
    await narrate(page, "The activity feed on the side lists each step too: Ben is interested, Ben asked a question, Ben declined, and Ben says he applied.", undefined, page.locator("[data-opp-card=activity]"));

    // decline reason
    await mB.getByRole("button", { name: "Compare" }).click();
    await expect(page.locator("[data-opp-dialog=compare]")).toContainText(/declined/i);
    await narrate(page, "For the declined job I can open Compare, and the reason Ben gave is right there. So I know to look for a better paying role, instead of guessing.");
    await page.keyboard.press("Escape");

    // answer the question
    await menuAction(page, mA.getByRole("button", { name: /^More for Ben Okafor/ }), "Open details");
    const detail = page.locator("[data-opp-dialog]").first();
    await expect(detail.locator("[data-opp-info]")).toBeVisible({ timeout: 20_000 });
    await narrate(page, `Now Ben's question. I open the details of the ${C1} job, and his question is waiting for me.`, undefined, detail.locator("[data-opp-info]"));
    await detail.getByLabel("Your answer").fill("Yes, it is fully remote within the US. There is no weekend on-call, and hours overlap with Central time.");
    await page.waitForTimeout(800);
    await detail.getByRole("button", { name: "Send answer" }).click();
    await expect(detail.locator("[data-opp-info-answer]")).toBeVisible({ timeout: 20_000 });
    await narrate(page, "I type my answer, and press Send answer. Only the answer is sent. Ben's interest stays exactly as he set it.");
    await page.keyboard.press("Escape");

    // ---- Ben reads the answer
    await f.switchTo("ben", "Back to Ben, to see whether his question was answered.", "/w/consultant/opportunities");
    await ready(page, "[data-consultant-opportunities]").waitFor();
    await rowOf(page, 0).locator("[data-action=view]").click();
    const sheet2 = page.getByRole("dialog", { name: JOBS[0].title }).first();
    await expect(sheet2).toContainText("fully remote within the US", { timeout: 20_000 });
    await narrate(page, "And there it is. Omar's answer shows up on the job itself. Ben knows it is remote with no weekend on-call, so he can decide with confidence.", undefined, sheet2);
    await page.keyboard.press("Escape");
    await narrate(page, "That's the whole loop. The marketer finds the job, the consultant answers in his own words, and every answer reaches the marketer's board. And Kiwiply never applies for anyone. Thanks for watching!", 1500);
  } finally {
    // put Ben back the way he was (the demo has him on a project)
    const s = await offCamera(browser, "sarah", "/w/admin");
    await s.page.locator("[data-enterprise-shell]").waitFor({ timeout: 45_000 }).catch(() => undefined);
    await setAvailability(s.page, org, "Ben Okafor", benWas).catch(() => undefined);
    await s.close();
  }
});
