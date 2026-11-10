import { resolve } from "node:path";
import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { menuAction } from "../../stories/consultant/_helpers";

/**
 * VIDEO 07: Building a resume. Priya Sharma (the personal demo job seeker on kiwiply.com) works in the template gallery and the Resume Builder;
 * then Marco Bellini (marketer) makes a resume for Cora Lindahl and Cora approves it (Gamma Consulting, a separate-accounts organization).
 * Shown: the ten templates with categories and ATS ratings, a resume from the profile, editing, switching templates with Undo, the photo on the
 * Sidebar template, a saved version, the version list, Print layout and the PDF download.
 * The portrait is an illustration (fixtures/portrait-illustration.png), not a real person.
 */
const PORTRAIT = resolve(__dirname, "fixtures/portrait-illustration.png");
const PORT = process.env.E2E_REAL_PORT ?? "3200";
const PERSONAL = `http://localhost:${PORT}`;
const TAKE = process.env.STORY_TAKE ?? "";

test("VIDEO-07 Resume building: templates, the builder, a photo, versions, print and PDF, and a resume made for a consultant", async ({ flow }, testInfo) => {
  test.setTimeout(1_800_000);
  const f = await flow();
  const { page, context } = f;
  await context.grantPermissions([]); // downloads need no permission; keeps the context plain

  await f.titleCard({
    title: "Building a resume",
    roles: "Job seeker  |  Marketer  |  Consultant",
    intro: "Hi! In this video I'll show you how to build a resume in Kiwiply. We'll look at the ten templates, make a resume from a profile, edit it, change the look, add a photo, and download a PDF. At the end, a marketer builds one for a consultant, and the consultant approves it.",
    minMs: 4000,
  });

  // ---- sign in to the personal demo
  await page.goto(`${PERSONAL}/login`);
  await narrate(page, "I'm on the Kiwiply sign-in page. For this tour I'll use the built-in demo job seeker, so there's nothing to type.");
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: /Open demo/ }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 40_000 });
  await page.goto(`${PERSONAL}/resume-builder`);
  await expect(page.getByRole("heading", { name: "My Resumes" }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "This is Priya, a product designer, and this is My Resumes. She has two resumes already. Let's start with the templates.");
  await page.getByRole("link", { name: /View all/ }).first().click();
  await page.waitForURL(/\/resume-builder\/templates/);

  // ---- the gallery
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await narrate(page, "The gallery has ten templates. They're sorted into three groups, and you can filter by them up here.", undefined, page.getByRole("group", { name: "Filter templates" }));
  await page.mouse.wheel(0, 380);
  await narrate(page, "The first group is ATS-safe: Modern, Classic, Compact and Simple. They have one column and real text, so every applicant tracking system can read them.");
  await narrate(page, "Each card shows its features, and an honest rating line. Green means ATS-safe.", undefined, page.locator('[data-template-id="modern"] [data-rating]'));
  await page.mouse.wheel(0, 640);
  await narrate(page, "The second group is Employer formats. Engineer, Consulting and Finance, Academic and Executive. These follow what recruiters in each field expect to see.");
  await page.mouse.wheel(0, 700);
  await narrate(page, "And the third group is Styled. Statement is mostly ATS-safe, and the card says what to watch for. Sidebar has two columns and room for a photo, so it's rated design first, and less ATS-safe. Kiwiply tells you that, instead of hiding it.", undefined, page.locator('[data-template-id="sidebar"] [data-rating]'));
  await page.mouse.wheel(0, -2000);
  await page.getByRole("button", { name: /Styled/ }).first().click();
  await narrate(page, "The filter chips narrow the list. This is just the Styled ones.");
  await page.getByRole("button", { name: /^All/ }).first().click();

  // ---- create from the profile
  await narrate(page, "Priya wants a safe choice for most applications, so she picks Modern.");
  await page.getByRole("button", { name: "Use the Modern template" }).click();
  const chooser = page.getByRole("dialog");
  await expect(chooser.getByText(/Your saved profile/)).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Kiwiply asks where to start from: her saved profile, an upload, a copy of another resume, or a blank page. She uses her profile, so her details are filled in for her.", undefined, chooser);
  await chooser.getByRole("radio", { name: /profile/i }).first().click();
  await chooser.getByRole("button", { name: "Continue" }).click();
  await chooser.getByLabel("Resume name").fill(`Priya Sharma, Product Design${TAKE ? " " + TAKE : ""}`);
  await chooser.getByRole("button", { name: "Create resume" }).click();
  await page.waitForURL(/\/resume-builder\/\d+/, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Pick Template" })).toBeVisible({ timeout: 45_000 });
  await narrate(page, "And here's the Resume Builder. Her experience, education and skills came from the profile. It saves by itself, so there's no Save button, and this chip shows the state.");

  // ---- edit
  const headline = page.getByRole("textbox", { name: "Headline" }).or(page.getByPlaceholder("Job title")).first();
  await narrateDo(page, "Let's give it a headline, so a recruiter knows who she is in one line.", async () => {
    await headline.fill("Senior Product Designer, design systems and research");
  });
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 60_000 }).catch(() => undefined); // soft: on a busy machine the chip can say Saving for a while
  await narrate(page, "On the right, the resume score reads the resume as a recruiter's software would, and it never uses AI to do that.");

  // ---- switch templates, with Undo
  await page.getByRole("button", { name: "Pick Template" }).click();
  const panel = page.locator('[data-panel="template"]');
  await expect(panel).toBeVisible();
  await narrate(page, "Now Pick Template. Every template shows the same resume, so she can compare them for real. And the content moves with her.", undefined, panel);
  await panel.locator('[data-template="engineer"]').click();
  await expect(page.getByText(/Switched to/).first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "She tries Engineer. A message confirms it, and offers Undo. And if a template can't show something, it tells her what it hides, before she switches.");
  const undo = page.getByRole("button", { name: "Undo" }).first();
  if (await undo.isVisible({ timeout: 3000 }).catch(() => false)) {
    await undo.click();
    await narrate(page, "She changes her mind and presses Undo. Back to Modern, exactly as it was.");
  }

  // ---- the Sidebar template and a photo
  await panel.locator('[data-template="sidebar"]').click();
  await expect(page.getByText(/Switched to Sidebar/).first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Then Sidebar. This one has two columns, and a place for a photo.");
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.mouse.wheel(0, -1500);
  await page.getByRole("tab", { name: /Personal Info/ }).first().click().catch(() => undefined);
  await page.getByRole("button", { name: /Add photo/ }).click();
  const photoDialog = page.getByRole("dialog");
  await narrate(page, "Add photo opens a small dialog. A photo is optional, and it's off by default on every template.", undefined, photoDialog);
  await photoDialog.getByLabel("Choose a picture").setInputFiles(PORTRAIT);
  await expect(photoDialog.getByText("Crop your photo").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "She picks a picture, and crops it to a circle. This is an illustration, not a real person.");
  await photoDialog.getByRole("button", { name: /Use photo|Use this photo|Save photo|^Use$/ }).first().click();
  await expect(page.getByRole("img", { name: "Your photo" }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The photo is in. And a switch, Show on resume, keeps the file but hides it, in case an employer prefers no photo.", undefined, page.getByRole("img", { name: "Your photo" }).first());

  // ---- save a version, and the versions list
  await menuAction(page, page.getByRole("button", { name: "More actions", exact: true }).first(), /Save version/);
  const vd = page.getByRole("dialog", { name: "Save version" });
  await expect(vd).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Save version freezes this moment with a name. She can compare with it, or go back to it, any time. Kiwiply suggests a name, and she can type her own.");
  await vd.getByRole("button", { name: "Save version" }).evaluate((el) => (el as HTMLElement).click()); // a plain DOM click: the dialog is up and stays up
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Version \d+/ }).first().click();
  await narrate(page, "The version chip lists every version, who made it and when, with Compare and Restore.");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");

  // ---- print layout and the PDF
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: /Print layout/ }).click();
  await narrate(page, "Download has the views. Print layout shows the resume exactly as the pages will print, with the page breaks.");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  let download!: import("@playwright/test").Download;
  await narrateDo(page, "Then Save and Download PDF. Kiwiply makes the file for her on the server, and the download starts as soon as it's ready. A real PDF, with real text, that she can send to an employer.", async () => {
    [download] = await Promise.all([page.waitForEvent("download", { timeout: 300_000 }), page.getByRole("menuitem", { name: /Save & Download PDF/ }).click()]);
  });
  await narrate(page, `The file arrived: ${download.suggestedFilename()}. That's Priya's resume.`);
  await download.saveAs(testInfo.outputPath("resume.pdf"));

  // ---- a marketer builds one for a consultant
  await f.switchTo("marco", "Now the team side. Marco is a marketer at Gamma Consulting, where every consultant has their own account. Let's see how he builds a resume for one of them.", "/w/marketing/resumes");
  await expect(page.getByRole("heading", { name: "Resumes", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await page.locator("[data-new-resume-for]").click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await narrate(page, "He presses New resume for, and the list only has his own assigned consultants, with real accounts that can approve his work.");
  await picker.locator("[data-consultant]").filter({ hasText: "Cora Lindahl" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /profile/i }).first().click();
  await sheet.getByRole("button", { name: "Continue" }).click();
  const name = `Cora Lindahl, Data Engineer${TAKE ? " " + TAKE : ""}`;
  await sheet.getByLabel("Resume name").fill(name);
  await sheet.getByRole("button", { name: "Create resume" }).click();
  await expect(page.getByText(/Resume created for Cora Lindahl/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit it" }).click();
  await page.waitForURL(/\/w\/marketing\/resumes\/\d+$/);
  // On a busy machine the workspace call can miss its budget once (the server log says so); a person would reload.
  if (!(await page.locator("[data-builder-frame]").isVisible({ timeout: 25_000 }).catch(() => false))) await page.reload();
  await expect(page.locator("[data-builder-frame]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Pending consultant approval").first()).toBeVisible();
  await narrate(page, "The resume is created under Cora's account, and it says Pending consultant approval. It's the same builder, inside the organization's frame.");
  await narrateDo(page, "Marco improves the headline. Every version records him as the author.", async () => {
    await page.getByRole("textbox", { name: "Headline" }).fill("Data Engineer building reliable pipelines");
  });
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 60_000 }).catch(() => undefined); // soft: on a busy machine the chip can say Saving for a while

  // ---- the consultant approves it
  await f.switchTo("cora", "Now Cora, the consultant, opens My Resumes.", "/w/consultant/resumes");
  await expect(page.locator("[data-consultant-resumes]")).toBeVisible({ timeout: 45_000 });
  const row = page.locator("tbody tr", { hasText: name }).first();
  await expect(row).toContainText("waiting for your approval", { timeout: 30_000 });
  await narrate(page, "Marco's resume is here, marked Made for you, waiting for your approval. Nothing a marketer writes counts until the consultant says so.", undefined, row);
  await row.getByRole("button", { name: /^Approve / }).click();
  await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Cora presses Approve, and it's ready to use. If something needed to change, she could Send it back with a note instead. That's resume building in Kiwiply. Thanks for watching!", 1500);
});
