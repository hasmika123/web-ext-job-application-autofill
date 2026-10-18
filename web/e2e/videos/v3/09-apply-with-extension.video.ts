import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, narrate, narrateDo, startNarration, Flow } from "../../stories/_support/story";
import { installHuman } from "../../stories/_support/human";
import { captureJob, consultantIdByName, jobBody, ready, orgIdOf } from "../../stories/marketing/_mkt";
import { hostOf, PERSONAS } from "../../stories/_support/personas";
import { freshSignIn, statePath } from "../../stories/_support/global-setup";
import { launchWithExtension, offCamera, openDrawer, prepareExtensionCopy } from "./_kit";

/**
 * VIDEO 09: Apply for a job with the browser extension (Cora Lindahl, consultant at Gamma Consulting; Marco Bellini, her marketer).
 * Gamma's people have their OWN enterprise accounts, so the extension connects with the one-time code flow of the tenant page ("Connect extension").
 *
 * What is real: the built extension (job-autofill, `npm run build`) in a real Chrome profile, the connect handoff, the drawer, the scan, the review
 * overlay, the fill, the real submit detection, and the application recorded on the web board. What is a stand-in, and the video says so:
 *  - the employer page is a LOCAL fixture (fixtures/greenhouse-apply.html) answered for a Greenhouse-style address inside the browser; no real site is contacted;
 *  - an automated browser has no toolbar, so the drawer is opened by the same code the toolbar icon runs (`openDrawer` in _kit.ts);
 *  - the extension is pointed at the local API (this demo's stack) and its manifest trusts this local web origin (prepareExtensionCopy).
 * Hard rule: the extension NEVER submits. The person presses the page's own Submit button on the local fixture.
 * Setup off camera: Marco saves the job for Cora (the same HTTP call the extension's "Save for consultant" makes) and Cora has one resume built from her profile.
 */
const ROOT = resolve(__dirname, "../../../..");
const PORT = process.env.E2E_REAL_PORT ?? "3200";
const API = process.env.E2E_API_URL ?? "http://localhost:18183";
const FIXTURE = readFileSync(resolve(__dirname, "fixtures/greenhouse-apply.html"), "utf8");
const JOB_URL = "https://boards.greenhouse.io/northwindlabs/jobs/4012345";
const GAMMA = hostOf(PERSONAS.cora);
const BIO = {
  firstName: "Cora", lastName: "Lindahl", email: "cora.lindahl@gamma.example.com", phone: "(512) 555-0187", city: "Austin", state: "TX", postalCode: "78701", country: "United States",
  linkedin: "https://www.linkedin.com/in/cora-lindahl-example", website: "https://coralindahl.example.com", authorizedToWork: "Yes", requireSponsorship: "No",
};
const TITLE = "Data Platform Engineer";

test("VIDEO-09 Apply with the extension: connect, open the job, autofill with review, submit yourself, and see it tracked", async ({ browser }, testInfo) => {
  test.setTimeout(1_800_000);

  // ---- setup off camera -----------------------------------------------------------------------------------------------------------
  const marco = await offCamera(browser, "marco", "/w/marketing/opportunities");
  await ready(marco.page, "[data-opportunities]").waitFor();
  const org = await orgIdOf(marco.page);
  const coraId = await consultantIdByName(marco.page, org, "Cora Lindahl");
  const stamp = Date.now();
  const job = jobBody(stamp, [coraId], {
    jobUrl: JOB_URL, title: TITLE, company: "Northwind Labs", location: "Remote, United States", workMode: "REMOTE", employmentType: "Full-time", payLabel: "$150K - $170K / yr",
    payMin: 150000, payMax: 170000, payPeriod: "YEAR", externalJobId: "4012345", atsPlatform: "greenhouse", priority: "HIGH", skills: ["Python", "SQL", "Airflow"],
    keyInfo: "Strong fit for your data pipeline work. Apply with your extension and tell me when it is in. Skip the optional essay if you like.",
  });
  const cap = await captureJob(marco, "marco", org, job);
  expect(cap.status, cap.text).toBe(200);
  await marco.close();
  await freshSignIn(browser, "cora");
  const coraSetup = await offCamera(browser, "cora", "/w/consultant/resumes");
  await expect(coraSetup.page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  if ((await coraSetup.page.locator("tbody tr").count()) === 0) {
    await coraSetup.page.locator("[data-create-resume]").click();
    const dlg = coraSetup.page.getByRole("dialog");
    await dlg.getByRole("radio", { name: /profile/i }).first().click();
    await dlg.getByRole("button", { name: "Continue" }).click();
    await dlg.getByLabel("Resume name").fill("Cora Lindahl, Data Engineer");
    await dlg.getByRole("button", { name: "Create resume" }).click();
    await coraSetup.page.waitForURL(/\/w\/consultant\/resumes\/\d+$/, { timeout: 60_000 });
    await coraSetup.page.waitForTimeout(4000);
  }
  await coraSetup.close();

  // ---- the browser with the extension, recorded ------------------------------------------------------------------------------------
  const extDir = prepareExtensionCopy(ROOT, PORT, API);
  const t0 = Date.now();
  const { context, extId, worker } = await launchWithExtension(extDir, testInfo.outputDir, Number(process.env.STORY_SLOWMO ?? 280));
  try {
    await worker.evaluate(async (api) => {
      const cur = ((await chrome.storage.local.get("settings")) as { settings?: Record<string, unknown> }).settings ?? {};
      await chrome.storage.local.set({ settings: { ...cur, apiBaseUrl: api } }); // this demo's own API; a normal install talks to api.kiwiply.com
    }, API);
    await context.route("https://boards.greenhouse.io/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: FIXTURE }));
    await context.addInitScript(() => {
      // "Connect" and "Open job link" would open new tabs; one recording follows ONE tab, so they open in this tab instead.
      window.open = ((url?: string | URL) => {
        if (url) location.href = String(url);
        return null;
      }) as typeof window.open;
    });
    const cookies = (JSON.parse(readFileSync(statePath("cora"), "utf8")) as { cookies: Parameters<typeof context.addCookies>[0] }).cookies;
    await context.addCookies(cookies);
    const page = context.pages()[0] ?? (await context.newPage());
    await installHuman(context, page);
    startNarration(page, t0);
    if (process.env.EXT_DEBUG) {
      page.on("console", (m) => console.log("[page]", m.type(), m.text().slice(0, 240)));
      page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 240)));
      worker.on("console", (m) => console.log("[sw]", m.type(), m.text().slice(0, 240)));
      context.on("page", (p2) => console.log("[new page]", p2.url()));
    }
    const f = new Flow(page, context);

    await f.titleCard({
      title: "Apply with the extension",
      roles: "Consultant  |  Gamma Consulting",
      intro: "Hi! In this video I'll show you how a consultant applies for a job with the Kiwiply browser extension. It fills in the form for her, she checks every answer, and she presses submit herself.",
      minMs: 3500,
    });

    // ---- the assigned job
    await page.goto(`${GAMMA}/w/consultant/opportunities`);
    await expect(page.locator("[data-consultant-opportunities][data-status=ready]")).toBeVisible({ timeout: 60_000 });
    const row = page.locator("[data-consultant-opportunities] [data-opp]").filter({ hasText: TITLE }).filter({ hasText: "Northwind Labs" }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await narrate(page, "I'm Cora, a consultant at Gamma Consulting. My marketer, Marco, just assigned me a job: Data Platform Engineer at Northwind Labs.", undefined, row);
    await row.locator("[data-action=view]").click();
    const sheet = page.getByRole("dialog", { name: TITLE }).first();
    await expect(sheet.locator("[data-detail]")).toBeVisible();
    await narrate(page, "It says right here to apply with the Kiwiply extension on the employer's own site. Kiwiply never applies for me.", undefined, sheet.locator("[data-apply-helper]"));
    await page.keyboard.press("Escape");

    // ---- connect the extension (the real one-time-code handoff)
    await narrate(page, "First, I connect the extension to my account. It has no password of its own. I open my account menu, and choose Connect extension.");
    await page.getByRole("button", { name: /Cora Lindahl/ }).first().click();
    await page.getByRole("menuitem", { name: "Connect extension" }).click();
    const connect = page.getByRole("dialog");
    await expect(connect).toBeVisible();
    await narrate(page, "Kiwiply makes a one-time code that works for sixty seconds, once. Pressing Connect hands it to the extension.", undefined, connect);
    await connect.getByRole("button", { name: "Connect", exact: true }).click({ noWaitAfter: true, timeout: 60_000 });
    await expect(page.getByText("Extension connected")).toBeVisible({ timeout: 60_000 });
    await narrate(page, "And the extension is connected to my Gamma Consulting account. It says it does not touch any personal Kiwiply account.");
    // Cora's contact details are on her account (the extension reads them from there); put in place silently.
    await worker.evaluate(async ({ api, bio }) => {
      const a = (await chrome.storage.local.get("trackingAuth")) as { trackingAuth: { access: string } };
      await fetch(`${api}/api/profile`, { method: "PUT", headers: { authorization: `Bearer ${a.trackingAuth.access}`, "content-type": "application/json" }, body: JSON.stringify({ payload: JSON.stringify(bio) }) });
    }, { api: API, bio: BIO });

    // ---- open the job on the employer's page
    await page.goto(`${GAMMA}/w/consultant/opportunities`);
    await expect(page.locator("[data-consultant-opportunities][data-status=ready]")).toBeVisible({ timeout: 60_000 });
    await page.locator("[data-consultant-opportunities] [data-opp]").filter({ hasText: TITLE }).filter({ hasText: "Northwind Labs" }).first().locator("[data-action=view]").click();
    const sheet2 = page.getByRole("dialog", { name: TITLE }).first();
    const href = await sheet2.locator("a[data-job-link]").getAttribute("href");
    await narrate(page, "Now Open job link takes me to the employer's application page. In this demo it's a local page that stands in for the employer's site, so nothing real is contacted.");
    await sheet2.locator("a[data-job-link]").evaluate((a) => a.removeAttribute("target")); // one recording follows one tab
    await sheet2.locator("a[data-job-link]").click();
    await expect(page.getByRole("button", { name: "Submit Application" })).toBeVisible({ timeout: 30_000 });
    expect(href ?? "").toContain("greenhouse");

    // ---- the drawer
    await narrate(page, "This is the application form. It's empty. Next, I open the Kiwiply drawer from the toolbar icon.");
    await openDrawer(page, extId);
    const drawer = page.frameLocator('iframe[title="Kiwiply"]');
    await expect(drawer.getByText("Gamma Consulting · Enterprise")).toBeVisible({ timeout: 30_000 });
    await narrate(page, "It shows which account I'm using, Gamma Consulting, as an enterprise account, and my email. There's a tab for the jobs my marketer assigned, and the tab for autofill.");
    await expect(drawer.getByText("Cora Lindahl, Data Engineer")).toBeVisible({ timeout: 60_000 });
    await narrate(page, "The resume I'll apply with is picked here. It's the one I built in Kiwiply, and it came across by itself.", undefined, drawer.getByText("Cora Lindahl, Data Engineer"));

    // ---- scan and review (nothing is written yet)
    if (process.env.EXT_DEBUG) console.log("[tabs]", JSON.stringify(await worker.evaluate(async () => ({ all: (await chrome.tabs.query({})).map((t) => [t.id, t.active, t.windowId, (t.url ?? "").slice(0, 60)]), active: (await chrome.tabs.query({ active: true, currentWindow: true })).map((t) => [t.id, (t.url ?? "").slice(0, 60)]) }))), "pages:", context.pages().length);
    await drawer.getByRole("button", { name: /Scan & fill/ }).click();
    const fillSelected = page.getByRole("button", { name: "Fill selected" });
    await expect(fillSelected).toBeVisible({ timeout: 60_000 });
    await narrate(page, "Scan and fill reads the form and detects that it's a Greenhouse application. And look, it fills nothing yet. First I get a review of every answer it plans to use, and I can untick any of them.");
    await page.waitForTimeout(2500);
    await narrate(page, "My answers come from my own profile and my resume, never from guessing. Nothing is submitted, and nothing is written until I press Fill selected.", undefined, fillSelected);
    await fillSelected.click();
    await expect(page.locator("#first_name")).toHaveValue("Cora", { timeout: 30_000 });
    await narrate(page, "Now the form is filled in: my name, email, phone, city, my links, and the yes and no questions about work authorization.");
    await page.waitForTimeout(1500);

    // ---- the person finishes and presses submit herself
    await page.locator("#q_why").scrollIntoViewIfNeeded();
    await narrateDo(page, "The extension leaves the personal question to me. I'll write that one myself, in my own words.", async () => {
      await page.locator("#q_why").fill("I like building data platforms that other teams can rely on, and Northwind's analytics products are exactly that kind of work.");
    });
    await narrate(page, "I read through the form one more time. Everything looks right. Now I press the page's own Submit Application button myself. The extension never does it for me.");
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page.getByText("Thank you for applying!")).toBeVisible();
    await narrate(page, "The employer page says it went through. And Kiwiply noticed, because it saw the confirmation on the page.");
    await page.waitForTimeout(3000);

    // ---- tracked on the web board
    await page.goto(`${GAMMA}/w/consultant/applications`);
    await expect(page.locator("[data-consultant-applications][data-status=ready]")).toBeVisible({ timeout: 60_000 });
    const app = page.locator("[data-application]").filter({ hasText: "Northwind Labs" }).first();
    await expect(app).toBeVisible({ timeout: 60_000 });
    await narrate(page, "Back on the web, My Applications already lists Northwind Labs, with the stage. I didn't type any of it. The extension recorded it for me.", undefined, app);
    await narrate(page, "That's the whole loop. Kiwiply fills the form, I check it and submit, and it's tracked by itself. Kiwiply never submits an application for anyone. Thanks for watching!", 1500);
  } finally {
    await context.close();
  }
});
