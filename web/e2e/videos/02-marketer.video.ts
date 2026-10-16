import { test, expect, narrate } from "../stories/_support/story";

/**
 * VIDEO 02: the Marketer's day (Omar Haddad, Acme Staffing) and "New resume for <consultant>" (Marco Bellini, Gamma Consulting).
 * Stories shown: MKT-01 home, MKT-04 assigned talent, MKT-10 resumes board, MKT-12 assign a job, MKT-30 submission package (a record, never a submit),
 * MKT-31/32 applications and interviews, MKT-33 follow-ups, MKT-34 tasks, MKT-36 performance, MKT-47/48 act-for resume (Marco and Cora, a separate-accounts organization).
 * E1: nothing here submits anything for a consultant.
 */
const root = (p: import("@playwright/test").Page, sel: string) => p.locator(`${sel}[data-status=ready]`);

test("VIDEO-02 Marketer: assigned talent, resumes, opportunities, submissions, follow-ups, tasks, and a new resume for a consultant", async ({ flow }) => {
  const f = await flow({ who: "omar" });
  const { page } = f;

  await f.titleCard({
    title: "A marketer's day",
    roles: "Marketing Specialist  |  Acme Staffing and Gamma Consulting",
    intro: "Welcome. In this walkthrough, a marketer manages assigned consultants, prepares applications, and builds a resume on a consultant's behalf.",
    minMs: 3500,
  });

  // ---- home
  await f.go("/w/marketing");
  await expect(page.getByRole("heading", { name: "Talent Marketing Dashboard", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Omar is a Marketing Specialist at Acme Staffing. He lands on the Talent Marketing Dashboard.");
  await narrate(page, "The tiles count his own assigned consultants, new job matches, pending submissions, upcoming interviews and overdue follow-ups.");
  await page.mouse.wheel(0, 520);
  await narrate(page, "Below are his talent, the job streams, top openings for his people, and what needs doing today.");
  await page.mouse.wheel(0, -900);

  // ---- assigned talent + consultant detail
  await narrate(page, "Next, My Assigned Talent.");
  await f.go("/w/marketing/talent");
  await expect(page.getByRole("heading", { name: "My Assigned Talent", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "He sees only the consultants assigned to him. Omar looks for Ben Okafor.");
  await page.getByPlaceholder("Search by name, skill, or location...").fill("Ben");
  const ben = page.locator("[data-talent-row]").filter({ hasText: "Ben Okafor" });
  await expect(ben).toHaveCount(1);
  await ben.getByRole("button", { name: "View Profile" }).click();
  const drawer = page.locator("[data-talent-drawer]");
  await expect(drawer).toBeVisible();
  await narrate(page, "The consultant detail is a summary only: skills, resumes, active applications, interviews and assigned jobs. Contact details stay with the consultant.");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");

  // ---- resumes board
  await narrate(page, "Now the Resumes board.");
  await f.go("/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Each consultant's resumes are listed with their approval state: approved, pending review, or needs an update.");
  await page.locator("tbody tr").first().click();
  await expect(page.getByText("Approval Status").first()).toBeVisible();
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");

  // ---- opportunities: assign a job to a consultant
  await narrate(page, "Now, finding work for a consultant. Job Discovery lists open jobs.");
  await f.go("/w/marketing/jobs");
  await expect(page.locator("[data-jobs-page]").first()).toBeVisible({ timeout: 45_000 });
  const rows = page.locator("[data-job-row]");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  let assignedTo = "";
  const jobCount = Math.min(await rows.count(), 8);
  // Consultants on a project are not being marketed and are refused softly; Camila Kamara is Omar's consultant who is. A job she already holds is refused too, so try the next one.
  for (let i = 0; i < jobCount && !assignedTo; i++) {
    const row = rows.nth(i);
    const label = (await row.getByRole("button", { name: /^Assign / }).first().getAttribute("aria-label")) ?? "";
    if (i === 0) await narrate(page, `Omar picks a job, ${label.replace(/^Assign /, "")}, and presses Assign.`);
    await row.getByRole("button", { name: /^Assign / }).first().click();
    const sheet = page.locator("[data-assign-sheet]");
    await expect(sheet).toBeVisible();
    if (i === 0) await narrate(page, "The sheet lists only his own consultants, and reminds him that assigning is only an invitation. The consultant applies for the job herself, never Kiwiply.");
    await sheet.getByPlaceholder("Search your consultants").fill("Camila");
    const camila = sheet.locator("[data-candidate]").filter({ hasText: "Camila Kamara" });
    if (!(await camila.first().isVisible({ timeout: 3000 }).catch(() => false))) { await page.keyboard.press("Escape"); continue; }
    await camila.click();
    await page.getByRole("button", { name: "Assign", exact: true }).last().click();
    if (await page.getByText(/^Assigned /).first().isVisible({ timeout: 6000 }).catch(() => false)) assignedTo = "Camila Kamara";
    else await page.keyboard.press("Escape");
  }
  if (assignedTo) await narrate(page, `${assignedTo} now has it in their Assigned Opportunities, assigned by Omar. Their answer stays their own.`);
  await f.go("/w/marketing/opportunities");
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The Opportunities board follows every assigned job and what each consultant answered: interested, a question, or declined.");

  // ---- submissions: a package is a record only
  await narrate(page, "Next, Submissions.");
  await f.go("/w/marketing/submissions");
  await expect(page.getByRole("heading", { name: "Submissions", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /New Submission/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("nothing is sent to the client");
  await narrate(page, "A submission package prepares a consultant's application for a job. The dialog is explicit: nothing is sent to the client. It is a record, never a submit.");
  // A pair that already has a draft is refused (409); each take simply picks the next free pair.
  const start = Date.now() % 7;
  for (let attempt = 0; attempt < 8; attempt++) {
    await dialog.getByRole("button", { name: "Consultant" }).click();
    await page.getByRole("option").nth((start + attempt) % 6).click();
    await dialog.getByRole("button", { name: "Job" }).click();
    await page.getByRole("option").nth((start * 2 + attempt) % 6).click();
    await dialog.getByLabel("Note").fill("Strong fit. Please approve before anything goes to the client.");
    await dialog.getByRole("button", { name: "Create draft" }).click();
    if (await dialog.waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false)) break;
  }
  await expect(page.getByText(/Draft prepared for/).first()).toBeVisible();
  await narrate(page, "The draft waits for the consultant's approval. The only actions on it are send for approval, or withdraw.");

  // ---- applications + interviews
  await f.go("/w/marketing/applications");
  await expect(page.getByPlaceholder(/Search applications by consultant/)).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Applications tracks every consultant's applications, with the stage, when each last changed, and who changed it.");
  await f.go("/w/marketing/interviews");
  await expect(page.getByRole("heading", { name: "Interviews", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Interviews shows the schedule, what is pending feedback, and any reschedules.");

  // ---- follow-ups
  await narrate(page, "Follow-ups keeps him honest.");
  await f.go("/w/marketing/followups");
  await expect(page.getByRole("heading", { name: "Follow-ups", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const fu = page.locator('[data-followup-table="today"] [data-followup-row]');
  if ((await fu.count()) > 0) {
    await narrate(page, "He ticks a follow-up that is due and logs the call.");
    await fu.first().locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Log Call" }).first().click();
    const dlg = page.locator("[data-followup-dialog=call]");
    await dlg.getByLabel("Call notes").fill("Spoke to the recruiter. Waiting for a reply by Friday.");
    await dlg.locator('input[type="checkbox"]').check();
    await dlg.getByRole("button", { name: "Save call" }).click();
    await expect(dlg).toHaveCount(0);
  }

  // ---- tasks
  await narrate(page, "And Tasks.");
  await f.go("/w/marketing/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add Task" }).first().click();
  const tdlg = page.locator("[data-task-dialog]");
  await tdlg.getByLabel("Task title").fill("Ask Ben for an updated resume headline");
  await narrate(page, "He adds a task for himself. Saving it only records it: nothing is emailed and nothing is submitted.");
  await tdlg.getByRole("button", { name: "Add Task" }).click();
  await expect(tdlg).toHaveCount(0);
  await page.locator('[data-task-tab="MY"]').click();
  await expect(page.locator("[data-task-row]").filter({ hasText: "Ask Ben for an updated resume headline" }).first()).toBeVisible();

  // ---- performance
  await narrate(page, "Finally, Performance.");
  await f.go("/w/marketing/performance");
  await expect(page.getByRole("heading", { name: "Performance", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Six numbers measure assigned consultants, submissions, interview and offer rates, placements, and follow-up completion.");

  // ---- Gamma: a new resume for a consultant (act-for)
  await f.switchTo("marco", "Now the most important marketer tool. Marco works at Gamma Consulting, an organization with its own separate accounts.", "/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "His consultant, Cora Lindahl, has no resume yet. Marco presses New resume for.");
  await page.locator("[data-new-resume-for]").click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await narrate(page, "He can only choose consultants assigned to him, and only ones with a real account who can approve what he makes.");
  const cora = picker.locator("[data-consultant]").filter({ hasText: "Cora Lindahl" });
  await expect(cora).toBeEnabled();
  await cora.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radio", { name: /Use my profile|Use .* profile|profile/i }).first()).toBeVisible();
  await narrate(page, "The chooser speaks about Cora: start her resume from her profile, an upload, a copy, or from scratch. He starts from her profile.");
  await sheet.getByRole("radio", { name: /profile/i }).first().click();
  await sheet.getByRole("button", { name: "Continue" }).click();
  await sheet.getByLabel("Resume name").fill("Cora Lindahl, Data Engineer");
  await sheet.getByRole("button", { name: "Create resume" }).click();
  await expect(page.getByText(/Resume created for Cora Lindahl/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit it" }).click(); // the toast is short-lived: press it before narrating
  await page.waitForURL(/\/w\/marketing\/resumes\/\d+$/);
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The resume was created under Cora's account, and it waits for her approval. It opens in the same Resume Builder, inside the organization's own frame. Next to the save state it says Pending consultant approval.");
  await expect(page.getByText("Pending consultant approval").first()).toBeVisible();
  const headline = page.getByRole("textbox", { name: "Headline" });
  await headline.fill("Data Engineer building reliable pipelines");
  await narrate(page, "Marco improves the headline. It saves by itself, and every version records him as the author.");
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await narrate(page, "He cannot share it, delete it, or make it primary. The consultant decides that. And Kiwiply never submits anything for her.");
  await page.waitForTimeout(1200);
  await f.go("/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Back on the Resumes board, Cora's new resume is listed as pending: the consultant approves it.", 1500);
});
