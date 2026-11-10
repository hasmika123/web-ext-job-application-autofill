import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { ROOTS } from "../../stories/consultant/_helpers";
import { assignmentFacts, bffCall, offCamera, orgId, settle } from "./_c";

/**
 * V3 VIDEO 11: Interviews and interview prep. ONE story: Anika (a consultant at Acme Staffing) keeps her interviews and her preparation in one place,
 * then Omar (her marketer) sees the same interviews and supports her, then Anika records how an interview went.
 * Stories shown: CON-36 (interviews list, calendar, join details and a private prep note), CON-37 (Interviews › Prepare: checklist, practice sessions),
 * CON-70..77 + the inbox review (interview details read from email, on the sample mailbox of the demo stack), MKT-31/32 (the marketer's interviews page).
 *
 * Honest limits: the "Gmail" is the demo stack's built-in sample mailbox (no real Gmail is contacted); practice is self-scored (AI scoring is not built);
 * the app has no calendar-file button inside the organization workspace, so the .ics step shows the file the real endpoint returns.
 * Setup off camera: Omar is made Anika's marketer through the same Assignments call the admin page makes, so the marketer's view has her interviews.
 */
const FIXTURE = JSON.parse(readFileSync(resolve(__dirname, "../../../../api/src/main/resources/demo/inbox-demo.json"), "utf8")) as { address: string };
const ADDRESS = FIXTURE.address;
const CODE = "abcdefghijklmnop"; // any 16 letters connect the demo address (a test value)
const MEETING = "https://globalmedia.zoom.us/j/84217650931";

const open = async (page: Page, go: (p: string) => Promise<void>, slug: string) => {
  await go(`/w/consultant/${slug}`);
  await expect(page.locator(`${ROOTS[slug]}[data-status=ready]`)).toBeVisible({ timeout: 45_000 });
};

/** Open a row's menu and choose an item. The menu closes when the table scrolls under it, so open it again until the item is there. */
async function rowMenuItem(page: Page, row: Locator, item: string) {
  const entry = page.getByRole("menuitem", { name: item });
  await expect(async () => {
    if (!(await entry.isVisible().catch(() => false))) await row.getByRole("button", { name: /^Actions for / }).click();
    await expect(entry).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await entry.click();
}

test("V3-11 Interviews and interview prep: a consultant prepares, her marketer supports, she records how it went", async ({ browser, flow }) => {
  // ---- off camera: a known starting point
  const sarah = await offCamera(browser, "sarah", "/w/admin");
  const org = await orgId(sarah.page);
  const anikaFacts = await assignmentFacts(sarah.page, org, "Anika Rao");
  const omar = await bffCall<{ items: { memberId: number; name: string }[] }>(sarah.page, `/api/orgs/${org}/marketing-assignments/marketers?size=100`);
  const omarId = omar.json?.items.find((m) => m.name === "Omar Haddad")?.memberId;
  if (!omarId) throw new Error("Omar is not in the marketer list");
  if (anikaFacts.marketer?.memberId !== omarId) {
    const r = await bffCall(sarah.page, `/api/orgs/${org}/marketing-assignments/reassign`, {
      method: "POST",
      headers: { "idempotency-key": `v3-11-${Date.now()}` },
      body: { consultantId: anikaFacts.consultantId, newMarketerMemberId: omarId, reason: "Interview weeks: Omar coordinates" },
    });
    expect(r.status).toBe(200);
  }
  await sarah.close();
  const anikaOff = await offCamera(browser, "anika");
  expect((await bffCall(anikaOff.page, `/api/orgs/${org}/me-workspace/inbox`, { method: "DELETE" })).status).toBe(200); // start from nothing connected
  await anikaOff.close();

  const f = await flow();
  const { page } = f;

  await f.titleCard({
    title: "Interviews and interview prep",
    roles: "Consultant (Anika)  |  Marketer (Omar)  |  Acme Staffing",
    intro:
      "Hi! In this video I'll show you how interviews work in Kiwiply Enterprise. Anika, a consultant, keeps her interviews and her preparation in one place. Then Omar, her marketer, supports her. All the names and data are made up.",
    minMs: 4000,
  });

  // =============== Anika: the interviews page
  await f.signInAs("anika");
  await open(page, f.go.bind(f), "interviews");
  await narrate(page, "I'm Anika, a consultant at Acme Staffing, and this is my Interviews page. The Schedule tab lists what's coming up, and the Prepare tab helps me get ready.");
  const first = page.locator("[data-interview]").first();
  await narrate(page, "Below is my schedule: the role, the company, and when. My marketer or the client books each one. Kiwiply never books or cancels for me.", undefined, first);
  const day = page.locator("[data-day][data-state]").nth(1);
  await narrateDo(page, "The calendar shows the same interviews by day.", async () => {
    await day.scrollIntoViewIfNeeded();
    await day.click();
    await expect(page.locator("[data-day-list]")).toBeVisible();
  });
  await page.locator("[data-interview]").first().scrollIntoViewIfNeeded();
  await narrateDo(page, "Let me open my interview at Global Media, to add how I'll join it.", async () => {
    await page.locator("[data-interview]").first().locator("[data-action=view]").click();
    await expect(page.locator("[data-interview-sheet]")).toBeVisible();
  });
  const sheet = page.locator("[data-interview-sheet]");
  await expect(sheet.locator("#iv-url")).toBeVisible();
  await narrate(page, "It is a video call, so I pick the mode and paste the meeting link. Only secure https links are accepted.", undefined, sheet.locator("#iv-mode"));
  await sheet.locator("#iv-mode").selectOption({ label: "Video" });
  await sheet.locator("#iv-url").fill(MEETING);
  await narrateDo(page, "I add who I'll meet, and a private preparation note. Only I can see that note, not my marketer or the administrators.", async () => {
    await sheet.locator("#iv-title").fill("Engineering Manager");
    await sheet.locator("#iv-note").fill("Walk through my reporting dashboard. Ask about month-end close.");
  });
  await sheet.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("[data-notice]")).toContainText("saved", { timeout: 20_000 });
  if (await sheet.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await settle(page, 800);
  }
  await narrate(page, "Saved. Now Join opens my link in a new tab, right when I need it.", undefined, page.locator("[data-interview]").first().locator("[data-action=join]"));

  // =============== Anika: interview details from email
  if (!process.env.V3_SKIP_INBOX) {
    await open(page, f.go.bind(f), "inbox");
    await narrate(page, "Interviews also arrive by email. My license includes Email Tracking, so I can connect the Gmail I apply from. This demo uses a built-in sample mailbox, so no real Gmail is touched.");
    await narrateDo(page, "I type the Gmail address and an app password. It is kept encrypted and never shown again.", async () => {
      await page.getByLabel("Gmail address").fill(ADDRESS);
      await page.getByLabel("App password").fill(CODE);
    });
    await page.getByRole("button", { name: "Check and connect" }).click();
    await expect(page.getByText("Disconnect this inbox")).toBeVisible({ timeout: 30_000 });
    await narrateDo(page, "Connected. While Kiwiply reads my mail for the first time, notice this note: only I see my mail. My organization and my marketer only ever see the stage an application reaches.", async () => {
      await page.locator("[data-inbox-privacy]").scrollIntoViewIfNeeded();
      await expect(async () => {
        await page.reload();
        await expect(page.locator("[data-consultant-inbox][data-status=ready]")).toBeVisible();
        await expect(page.locator("[data-update-interview]").first()).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 120_000 });
    });
    const orbit = page.locator("[data-update]").filter({ hasText: "Orbit Freight" });
    await narrate(page, "It found interviews. Orbit Freight sent a phone screen and then moved it. The page shows the latest date and time, and that it is a call.", undefined, orbit.locator("[data-update-interview]").first());
    if (await page.locator("[data-needs-review]").count()) {
      await narrate(page, "When an email is unclear, like a rejection, nothing changes on its own. It waits here for my decision.", undefined, page.locator("[data-needs-review]"));
    }
    const harbor = page.locator("[data-suggestion]").filter({ hasText: "Harbor Cloud" });
    await narrate(page, "Harbor Cloud invited me to a video interview for a job I don't track yet, so Kiwiply asks first. I'll add it.", undefined, harbor);
    await harbor.locator("[data-action=accept]").click();
    const harborRow = page.locator("[data-update]").filter({ hasText: "Harbor Cloud" });
    await expect(harborRow.locator("[data-update-interview]").first()).toBeVisible({ timeout: 30_000 });
    await narrate(page, "Added. The email had a calendar invitation, so the date, the time and the Zoom link were filled in for me.", undefined, harborRow.locator("[data-update-interview]").first());
    await narrate(page, "And if Kiwiply changes something I disagree with, there is an Undo right on the row.", undefined, orbit.locator("[data-update-undo]"));

    // the calendar file the real endpoint produces for the Harbor Cloud interview
    const list = await bffCall<{ id: number; company: string }[]>(page, "/api/interviews");
    const harborInterview = list.json?.find((i) => i.company === "Harbor Cloud");
    if (harborInterview) {
      const file = await page.evaluate(async (id) => (await fetch(`/api/interviews/${id}/ics`)).text(), harborInterview.id);
      // the time-zone definition at the top is boilerplate: show the event itself, as the file has it
      const ics = file.includes("BEGIN:VEVENT") ? ["BEGIN:VCALENDAR", "...", file.slice(file.indexOf("BEGIN:VEVENT"))].join("\n") : file;
      await narrateDo(page, "It can also make a calendar file for my own calendar. A download can't be shown in a recording, so here is the event inside the file: the date, the time and the link.", async () => {
        await page.evaluate((text) => {
          const box = document.createElement("div");
          box.id = "__ics_panel";
          box.setAttribute("style", "position:fixed;left:50%;top:90px;transform:translateX(-50%);z-index:2147483640;width:640px;max-height:560px;overflow:auto;background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 14px 50px rgba(0,0,0,.35);padding:18px 22px;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap");
          const h = document.createElement("div");
          h.setAttribute("style", "font:700 15px system-ui;margin-bottom:10px");
          h.textContent = "Calendar file for the Harbor Cloud interview (.ics)";
          const p = document.createElement("div");
          p.textContent = text;
          box.append(h, p);
          document.body.appendChild(box);
        }, ics);
        await settle(page, 1500);
      });
      await page.evaluate(() => document.getElementById("__ics_panel")?.remove());
    }


  }

  // =============== Anika: interview prep
  await open(page, f.go.bind(f), "interviews?tab=prepare");
  await narrate(page, "Now, preparing. The Prepare tab shows my practice score, and question sets suggested from my skills.", undefined, page.locator("[data-practice-score]"));
  const unchecked = page.locator("[data-check][aria-checked=false]");
  await narrate(page, "On the right is my Before Interview checklist. I tick things off as I go, and there is an Undo for slips.", undefined, page.getByRole("list", { name: "Before interview checklist" }));
  await unchecked.first().click();
  await expect(page.locator("[data-check-notice]")).toContainText("Marked done", { timeout: 15_000 });
  await unchecked.first().click();
  await settle(page, 1200);
  const behavioral = page.locator("[data-module]").filter({ hasText: "Behavioral Questions" });
  await narrate(page, "Then practice. Behavioral Questions covers the classics, like teamwork and problem solving.", undefined, behavioral);
  await behavioral.locator("[data-action=practice]").click();
  const practice = page.locator("[data-practice]");
  await expect(practice).toBeVisible({ timeout: 15_000 });
  await narrate(page, "I answer each question out loud, then score myself from zero to a hundred. This is my own self-assessment. AI scoring is planned for later, and the page says so.");
  const sliders = practice.locator("input[type=range]");
  const scores = ["75", "60", "85", "70", "80"];
  const n = await sliders.count();
  await narrateDo(page, "I score each answer honestly, and note what to revisit.", async () => {
    for (let i = 0; i < n; i++) await sliders.nth(i).fill(scores[i % scores.length]);
    await practice.getByPlaceholder("What went well, what to revisit").fill("Need a sharper missed-deadline example.");
  });
  await page.locator("[data-action=save-session]").click();
  await expect(page.locator("[data-history] [data-session]").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Saved. It shows in my practice history, with the score.", undefined, page.locator("[data-history]"));

  // =============== Omar: the marketer's view
  await f.switchTo("omar", "Now Omar, the marketer who looks after Anika's job search.", "/w/marketing/interviews");
  await expect(page.getByRole("heading", { name: "Interviews", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-interview-row]").first()).toBeVisible({ timeout: 30_000 });
  const anikaRow = page.locator("[data-interview-row]").filter({ hasText: "Anika Rao" }).filter({ hasText: "Global Media" }).first(); // the interview she added her join details to
  await expect(anikaRow).toBeVisible({ timeout: 30_000 });
  await narrate(page, "This is Omar's Interviews page. It lists the interviews of the consultants he looks after, and Anika's is among them. He sees the role, client and time, but never her private notes.", undefined, anikaRow);
  await narrate(page, "The row menu lets Omar support the interview: propose a new time, record a confirmation, or request a reminder. Each one records or proposes. Nothing is sent to the client, and he never submits anything for Anika.", undefined, anikaRow);
  await rowMenuItem(page, anikaRow, "Record slot confirmed");
  await expect(anikaRow.getByText("Confirmed")).toBeVisible({ timeout: 20_000 });
  await page.locator("[data-card=schedule]").locator("div.overflow-x-auto").first().evaluate((el) => el.scrollTo({ left: 0, behavior: "smooth" })).catch(() => undefined);
  await narrate(page, "He has confirmed the slot with the client, and the row now reads Confirmed.", undefined, anikaRow);
  await narrate(page, "Next he requests a reminder for Anika. A request is only recorded here, nothing is sent.", undefined, anikaRow);
  await rowMenuItem(page, anikaRow, "Request reminder");
  await settle(page, 1500);

  // =============== Anika: records how it went
  await f.switchTo("anika", "Back to Anika. One earlier interview is still waiting for her feedback.", "/w/consultant/interviews");
  await expect(page.locator("[data-consultant-interviews][data-status=ready]")).toBeVisible({ timeout: 45_000 });
  const waiting = page.locator("[data-pending-feedback]");
  await narrate(page, "Here, the Data Engineer interview at FinTech Solutions.", undefined, waiting);
  await waiting.getByRole("button", { name: /^Add feedback for / }).first().click();
  const fb = page.locator("[data-block=feedback]");
  await expect(fb).toBeVisible({ timeout: 20_000 });
  await narrateDo(page, "I choose how it went, and write a few honest lines.", async () => {
    await fb.getByRole("button", { name: "Positive" }).click();
    await fb.locator("#iv-summary").fill("Good talk about data pipelines. Waiting to hear about a second round.");
  });
  await fb.getByRole("button", { name: /^Save feedback/ }).click();
  await expect(page.locator("[data-notice]")).toContainText("Feedback saved", { timeout: 20_000 });
  if (await page.locator("[data-interview-sheet]").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await settle(page, 800);
  await narrate(page, "Saved, and it joins my feedback list. That is the whole loop: booked, prepared, supported by my marketer, and recorded afterwards. Thanks for watching!", undefined, page.locator("[data-feedback]").first());
});
