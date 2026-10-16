import { test, expect, narrate } from "../stories/_support/story";
import { ROOTS, menuAction } from "../stories/consultant/_helpers";

/**
 * VIDEO 01: the Consultant (Anika Rao at Acme Staffing; Cora Lindahl at Gamma Consulting for the Resume Builder).
 * Stories shown: CON-01 home, CON-10 profile, CON-25/26/27 assigned opportunities and the job link, CON-32 application tracking,
 * CON-33/34 submissions approval, CON-36/37 interviews and prep, CON-80/81 create and edit a resume in the builder, CON-84 approve or send back a resume a marketer made.
 * E1: the consultant applies herself, on the employer's own site; Kiwiply never submits anything. The employer page below is a local demo fixture.
 */
const open = async (f: import("../stories/_support/story").Flow, slug: string) => {
  await f.go(slug ? `/w/consultant/${slug}` : "/w/consultant");
  await expect(f.page.locator(`${ROOTS[slug]}[data-status=ready]`)).toBeVisible({ timeout: 45_000 });
};

const EMPLOYER_PAGE = `<!doctype html><meta charset="utf-8"><title>Careers (demo employer page)</title>
<body style="font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#f8fafc;color:#0f172a">
<div style="max-width:720px;margin:70px auto;padding:36px;background:#fff;border-radius:16px;box-shadow:0 6px 30px rgba(0,0,0,.08)">
<div style="font:600 13px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Demo employer careers page, not a real employer</div>
<h1 style="margin:12px 0 6px;font-size:34px">Senior DevOps Engineer</h1>
<p style="color:#475569;line-height:1.5">Own delivery pipelines and cloud infrastructure for a growing media team. This page stands in for the employer's own site.</p>
<button id="apply" style="margin-top:14px;padding:14px 26px;font-size:18px;font-weight:700;border:0;border-radius:12px;background:#2563eb;color:#fff;cursor:pointer">Apply now</button>
<p id="done" style="display:none;margin-top:20px;padding:14px;border-radius:10px;background:#ecfdf5;color:#065f46;font-weight:600">Application sent from this page by the candidate. Kiwiply submitted nothing.</p></div>
<script>document.getElementById('apply').onclick=function(){this.disabled=true;document.getElementById('done').style.display='block'}</script></body>`;

test("VIDEO-01 Consultant: home, opportunities, applying herself, tracking, interviews, and building resumes", async ({ flow }) => {
  const f = await flow({ who: "anika" });
  const { page, context } = f;
  await context.route(/^https:\/\/jobs\.example\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/html", body: EMPLOYER_PAGE }));

  await f.titleCard({
    title: "A consultant's workspace",
    roles: "Consultant  |  Acme Staffing and Gamma Consulting",
    intro: "Welcome. In this walkthrough, a consultant follows her opportunities, applies herself, tracks every application, and builds her resume.",
    minMs: 3500,
  });

  // ---- home and profile
  await open(f, "");
  await narrate(page, "Anika is a consultant at Acme Staffing. She signs in and lands on her own Home.");
  await narrate(page, "Six numbers summarize her matches, opportunities, applications, interviews, approvals and placement. Everything on this page is her own data.");
  await page.mouse.wheel(0, 520);
  await narrate(page, "Below are her matches, her assigned jobs, her applications, interviews, tasks and resume strength.");
  await page.mouse.wheel(0, -900);
  await open(f, "profile");
  await narrate(page, "My Career Profile holds her skills, certifications and preferences. The profile guard refuses ID numbers and birth dates, because Kiwiply never stores them.");
  await page.waitForTimeout(1500);

  // ---- assigned opportunities: accept one and apply herself
  await open(f, "opportunities");
  await narrate(page, "Her marketer assigns jobs to her. Assigned Opportunities lists each one with its priority, due date and the marketer's quick notes.");
  const rows = page.locator("[data-opp]");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3);
  let chosen = -1;
  for (let i = 0; i < (await rows.count()) && chosen < 0; i++) {
    const title = ((await rows.nth(i).getByRole("button", { name: /^View / }).getAttribute("aria-label")) ?? "").replace(/^View /, "");
    await rows.nth(i).getByRole("button", { name: `More actions for ${title}` }).click();
    const express = page.getByRole("menuitem", { name: "Express Interest" });
    if (await express.isVisible({ timeout: 2000 }).catch(() => false)) {
      await narrate(page, `She likes "${title}". From the row menu she chooses Express Interest, which tells her marketer she wants it.`);
      await express.click();
      await expect(page.getByText(/Interest sent|interest/i).first()).toBeVisible({ timeout: 15_000 });
      chosen = i;
    } else {
      await page.keyboard.press("Escape");
    }
  }
  if (chosen < 0) chosen = 0;
  const title = ((await rows.nth(chosen).getByRole("button", { name: /^View / }).getAttribute("aria-label")) ?? "").replace(/^View /, "");
  await narrate(page, "Accepting only records her wish. Nothing is applied for, and nothing is sent to the employer.");
  await rows.nth(chosen).locator("[data-action=view]").click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.locator("[data-quick-info]")).toBeVisible();
  await narrate(page, "The detail shows the marketer's job notes and why she was matched. The Open job link button leads to the employer's own posting.");
  const href = await sheet.locator("a[data-job-link]").getAttribute("href");
  await narrate(page, "Now Anika applies by herself. Kiwiply never submits an application for anyone.");
  await page.goto(href ?? "https://jobs.example.com/demo");
  await expect(page.getByRole("button", { name: "Apply now" })).toBeVisible();
  await narrate(page, "This is the employer's page. In real life she applies here with her own Kiwiply browser extension, which fills the form but never submits it. Here she clicks Apply herself.");
  await page.getByRole("button", { name: "Apply now" }).click();
  await expect(page.getByText("Kiwiply submitted nothing.")).toBeVisible();
  await page.waitForTimeout(2500);

  // ---- track the application
  await open(f, "applications");
  await narrate(page, "Back in Kiwiply, My Applications tracks every application she has: its stage, its next step, and the pipeline summary.");
  const apps = page.locator("[data-application]");
  await expect.poll(() => apps.count()).toBeGreaterThanOrEqual(3);
  await apps.first().locator("[data-action=view]").click();
  const detail = page.locator("[data-detail]");
  await expect(detail).toBeVisible();
  await narrate(page, "One application opens with its stage timeline and who last updated it. The page is read-only: there is no submit button anywhere.");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");

  // ---- submissions the marketer prepared
  await open(f, "submissions");
  await narrate(page, "Submissions and Approvals: when her marketer prepares an application, it waits here for her decision.");
  const pending = page.locator("[data-submission]");
  if ((await pending.count()) > 0) {
    const stitle = ((await pending.first().getByRole("button", { name: /^Approve / }).getAttribute("aria-label")) ?? "").replace(/^Approve /, "");
    await narrate(page, `She approves "${stitle}". The dialog explains what approving means before she confirms.`);
    await pending.first().locator("[data-action=approve]").click();
    const dlg = page.getByRole("dialog", { name: "Approve this submission?" });
    await expect(dlg.locator("[data-approve-copy]")).toBeVisible();
    await page.waitForTimeout(1500);
    await dlg.getByRole("button", { name: "Yes, approve" }).click();
    await expect(page.getByText(/Nothing was sent to the client by Kiwiply/)).toBeVisible();
    await narrate(page, "Approving records her decision. Nothing is sent to the client by Kiwiply.");
  } else {
    await narrate(page, "Nothing is waiting for her approval right now. Past submissions show what happened next.");
  }

  // ---- interviews and prep
  await open(f, "interviews");
  await narrate(page, "Interviews lists what is coming up, with a calendar. She opens one to add how she will join and a private prep note.");
  await page.locator("[data-interview]").first().locator("[data-action=view]").click();
  await expect(page.locator("[data-interview-sheet]")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  await open(f, "interview-prep");
  await narrate(page, "Interview Prep has a checklist and practice sessions, so she walks in ready.");
  await page.waitForTimeout(1500);

  // ---- Gamma: Cora builds her resumes in the Resume Builder
  await f.switchTo("cora", "Now the Resume Builder. Cora works at Gamma Consulting, an organization with its own separate accounts.", "/w/consultant/resumes");
  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The organization's name, logo and menu stay around her all the time. This is My Resumes.");
  await page.locator("[data-create-resume]").click();
  const chooser = page.getByRole("dialog");
  await expect(chooser.getByText(/Your saved profile/)).toBeVisible();
  await narrate(page, "Create New Resume offers four starting points: her profile, an upload, a copy of an existing resume, or a blank page. She starts from her profile.");
  await chooser.getByRole("radio", { name: /profile/i }).first().click();
  await chooser.getByRole("button", { name: "Continue" }).click();
  await chooser.getByLabel("Resume name").fill("Cora Lindahl, Salesforce Developer");
  await chooser.getByRole("button", { name: "Create resume" }).click();
  await page.waitForURL(/\/w\/consultant\/resumes\/\d+$/, { timeout: 60_000 });
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The editor opens inside her organization's frame. It saves by itself, so there is no Save button, and it records who last changed it.");
  const headline = page.getByRole("textbox", { name: "Headline" });
  await headline.fill("Salesforce Developer, building clean integrations");
  await narrate(page, "She sharpens her headline.");
  await page.getByRole("button", { name: "Add Section" }).first().click();
  await page.getByRole("button", { name: /Professional Summary/ }).click();
  await narrate(page, "Add Section lets her add a professional summary, work experience, education, projects and more.");
  await page.getByRole("textbox", { name: "Summary" }).fill("Salesforce developer with seven years of experience building reliable integrations and clear admin tooling for growing teams.");
  const skill = page.getByRole("textbox", { name: "Skills in Skills" });
  await skill.fill("Apex");
  await skill.press("Enter");
  await narrate(page, "She writes a summary and keeps her skills current. The resume score on the right guides what to improve.");
  await page.getByRole("button", { name: "More actions", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /Save version/ }).click();
  await narrate(page, "Save version freezes this moment as a named version she can compare with or restore later.");
  const versionDialog = page.getByRole("dialog");
  const label = versionDialog.getByRole("textbox").first();
  if (await label.isVisible({ timeout: 3000 }).catch(() => false)) await label.fill("First draft");
  await versionDialog.getByRole("button", { name: /Save/ }).last().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^v\d+/ }).first().click();
  await narrate(page, "The version chip lists every version with who made it and when, with Compare and Restore.");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close editor" }).click();
  await page.waitForURL(/\/w\/consultant\/resumes$/, { timeout: 45_000 });

  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Her first resume is in the list at once, with who last modified it and when. Now a second one from scratch, for a different kind of role.");
  await page.locator("[data-create-resume]").click();
  const chooser2 = page.getByRole("dialog");
  await chooser2.getByRole("radio", { name: /Start from scratch/ }).click();
  await chooser2.getByRole("button", { name: "Continue" }).click();
  await chooser2.getByLabel("Resume name").fill("Cora Lindahl, General Consulting");
  await chooser2.getByRole("button", { name: "Create resume" }).click();
  await page.waitForURL(/\/w\/consultant\/resumes\/\d+$/, { timeout: 60_000 });
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "A blank resume has just her name and contact details. She would add the rest the same way.");
  await page.getByRole("button", { name: "Close editor" }).click();
  await page.waitForURL(/\/w\/consultant\/resumes$/, { timeout: 45_000 });
  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });

  // ---- approve, or send back, what the marketer made
  const waiting = page.locator("tbody tr", { hasText: "waiting for your approval" });
  await expect.poll(() => waiting.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await narrate(page, "Some rows read Made for you, waiting for your approval. Her marketer Marco prepared these. What a marketer writes never counts until she approves it.");
  const first = waiting.first();
  const ftitle = ((await first.getByRole("button", { name: /^Approve / }).getAttribute("aria-label")) ?? "").replace(/^Approve /, "");
  await narrate(page, `She presses Approve on "${ftitle}".`);
  await first.getByRole("button", { name: /^Approve / }).click();
  await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 20_000 });
  if ((await waiting.count()) > 0) {
    const second = waiting.first();
    const stitle = ((await second.getByRole("button", { name: /^Send back / }).getAttribute("aria-label")) ?? "").replace(/^Send back /, "");
    await narrate(page, `For another one, "${stitle}", she presses Send back and says what should change.`);
    await second.getByRole("button", { name: /^Send back / }).click();
    await page.getByLabel("What should change").fill("Please add my 2019 role at the logistics client.");
    await page.waitForTimeout(1200);
    await page.getByRole("dialog").getByRole("button", { name: "Send back" }).click();
    await page.waitForTimeout(1500);
  }
  await narrate(page, "Approving makes it ready to use. Sending back tells the marketer it needs an update, with her note. Nobody else can approve it for her.");
  const approvedRow = page.locator("tbody tr", { hasText: ftitle }).first();
  await approvedRow.getByRole("button", { name: `More actions for ${ftitle}` }).click();
  await narrate(page, "Only an approved resume can be her primary one. She sets it as primary from the row menu.");
  await page.getByRole("menuitem", { name: "Set as primary" }).click();
  await page.waitForTimeout(1800);
  await narrate(page, "That is the consultant's side: find work, apply herself, track everything, and own her resumes. Kiwiply helps, and never submits for her.", 1500);
});
