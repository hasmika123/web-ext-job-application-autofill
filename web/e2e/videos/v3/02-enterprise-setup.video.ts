import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { ADMIN_LOGIN, ADMIN_PASSWORD, PLATFORM, loadOrg, makeBrandImages, shellReady, tenantHost, tenantSignIn, openPage } from "./_v3";

/**
 * V3 VIDEO 02: Enterprise setup. The owner of Brightline Talent Group (made in video 01) sets the organization up: settings (general and security),
 * branding (logo, favicon, colours with the contrast guard, welcome copy, live preview, phone preview, publish diff), the privacy policy (template,
 * draft, review by Kiwiply), what the modules and licences look like today, and where licence status shows (Acme's Consultants page).
 * Stories shown: ADM-05/06 settings, ADM-70 branding, policies (X5), PLT-14 on-the-way pages.
 */
test("V3-02 Enterprise setup: settings, branding, policies, modules and licences", async ({ flow, browser }) => {
  const org = loadOrg();
  const host = tenantHost(org.label);
  const images = makeBrandImages();
  const POLICY = process.env.V3_POLICY ?? "Privacy Policy"; // dev only: a repeat take on an organization whose privacy policy is already live uses another one

  // an unrecorded clean start for a re-take: no draft left over, no policy still waiting for review
  const prep = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": "10.31.0.1" } });
  const p0 = await prep.newPage();
  await p0.goto(`${host}/login`);
  await tenantSignIn(p0, host, org.ownerEmail, org.ownerPassword);
  await p0.goto(`${host}/w/admin/policies`);
  await expect(p0.locator("[data-policies-page]")).toBeVisible({ timeout: 45_000 });
  for (const kind of [POLICY]) {
    await p0.getByRole("navigation", { name: "Policies" }).getByRole("button", { name: new RegExp(kind) }).click();
    const withdraw = p0.getByRole("button", { name: "Withdraw from review" });
    await expect(withdraw.or(p0.getByRole("button", { name: "Submit for review" }))).toBeVisible({ timeout: 20_000 });
    if (await withdraw.isVisible().catch(() => false)) {
      await withdraw.click();
      await expect(p0.getByText("Submission withdrawn")).toBeVisible({ timeout: 20_000 });
    }
  }
  await prep.close();

  const f = await flow();
  const { page } = f;

  await f.titleCard({
    title: "Setting up the organization",
    roles: "Organization owner  |  Brightline Talent Group",
    intro: "Hi! In this video the owner of Brightline finishes setting up the organization: settings, branding, policies, and what the modules and licences look like today.",
    minMs: 3500,
  });

  // ---- sign in as the owner
  await openPage(page, `${host}/login`, () => expect(page.getByLabel("User Name")).toBeVisible({ timeout: 45_000 }));
  await narrate(page, "We're back at Brightline's own address. Maya, the owner, signs in with the password she chose in the last video.");
  await tenantSignIn(page, host, org.ownerEmail, org.ownerPassword);
  await shellReady(page);
  await expect(page.locator("[data-dashboard]")).toBeVisible({ timeout: 45_000 });

  // dev only: V3_SKIP=settings,branding skips those parts when a take is repeated on an organization that already has them
  const skip = (part: string) => (process.env.V3_SKIP ?? "").split(",").includes(part);

  // ---- settings: general
  if (!skip("settings")) {
  await narrate(page, "First, Settings, at the bottom of the menu. This is where the organization's defaults live.");
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/settings/, { timeout: 30_000 });
  await expect(page.locator("[data-org-settings]")).toBeVisible({ timeout: 45_000 });
  const general = page.locator("[data-org-general]");
  await narrate(page, "The legal name is fixed, because it's the name on the agreement. Only Kiwiply support can change that. Everything else here is ours.", undefined, general);
  const displayName = general.getByLabel("Display name");
  await narrateDo(page, "The display name is what people see on the sign-in page and in emails. I'll make it a little friendlier.", async () => {
    await displayName.fill("Brightline Talent");
  });
  await narrate(page, "Next, the time zone, so every date and time in the workspace matches where the team works. Brightline is in New York.");
  await page.getByRole("button", { name: "Time zone" }).click();
  await page.getByRole("option", { name: "America/New_York", exact: true }).click();
  await narrateDo(page, "And a shared contact email, shown on the support page, so people know where to write.", async () => {
    await general.getByLabel("Contact e-mail").fill("support@brightline.example");
  });
  await page.locator("[data-save-general]").click();
  await expect(page.locator("[data-save-general]")).toBeDisabled({ timeout: 20_000 });
  await narrate(page, "Saved. The page remembers it, and the audit log records who changed what.");

  // ---- settings: security
  const security = page.locator("[data-org-security]");
  await security.scrollIntoViewIfNeeded();
  await narrate(page, "Below that is Security. Brightline wants stronger passwords than the platform default, so I'll set the minimum length to twelve.", undefined, security);
  await security.getByLabel("Minimum password length").fill("12");
  await security.getByLabel(/Reason for the change/).fill("Client contracts require longer passwords");
  await narrate(page, "Changes to security always need a reason of at least ten characters. It goes into the audit log, and it's shown before anything is saved.");
  await page.locator("[data-save-security]").click();
  await expect(page.locator("[data-confirm-security-copy]")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2200);
  await page.locator("[data-confirm-security]").click();
  await expect(page.locator("[data-save-security]")).toBeDisabled({ timeout: 20_000 });
  await narrate(page, "Done. From now on, nobody can pick a password shorter than twelve characters.");

  }

  // ---- branding
  if (!skip("branding")) {
  await narrate(page, "Now the part everyone notices: branding. Organization Branding is in the menu.");
  await page.getByRole("link", { name: "Organization Branding", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/branding/, { timeout: 30_000 });
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-draft-badge]")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Everything here is a draft first. The live sign-in page only changes when I publish, and a live preview on the right shows exactly what people will get.");
  const logoBox = page.locator('[data-asset-drop="logo"]');
  await logoBox.scrollIntoViewIfNeeded();
  await narrateDo(page, "I'll upload the Brightline logo. It has to be a normal image, PNG, JPEG or WebP, and a transparent PNG looks best.", async () => {
    await page.locator('[data-asset-input="logo"]').setInputFiles(images.logo);
  });
  await expect(page.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 30_000 });
  await narrateDo(page, "And a small square icon for the browser tab, the favicon.", async () => {
    await page.locator('[data-asset-input="favicon"]').setInputFiles(images.favicon);
  });
  await page.waitForTimeout(1500);
  const secondary = page.getByLabel("Secondary colour", { exact: true });
  await secondary.scrollIntoViewIfNeeded();
  await narrateDo(page, "Colours next. The primary teal is already in. For the secondary colour, let me try a bright amber.", async () => {
    await secondary.fill("#f59e0b");
  });
  await expect(page.locator("[data-colour-field=secondary]")).toContainText("too light for white text");
  await narrate(page, "Kiwiply won't take it. White text on that amber would be hard to read, so it suggests a darker amber instead. That keeps every button readable, whatever colours a customer picks.", undefined, page.locator("[data-colour-field=secondary]"));
  await page.getByRole("button", { name: /^Use #/ }).click();
  await page.waitForTimeout(1500);
  const title = page.getByLabel(/Welcome title/);
  await title.scrollIntoViewIfNeeded();
  await narrateDo(page, "Then the welcome words on the sign-in page. A title, and one friendly line underneath.", async () => {
    await title.fill("Welcome to Brightline");
    await page.getByLabel(/Welcome message/).fill("Sign in to see your consultants, jobs and interviews.");
  });
  await page.locator("[data-publish]").scrollIntoViewIfNeeded();
  await narrate(page, "The preview follows every change as I type. Let me check how it looks on a phone, because plenty of consultants will sign in from one.");
  const device = page.getByRole("group", { name: "Preview device" });
  const buttons = device.getByRole("button");
  if ((await buttons.count()) > 1) await buttons.nth(1).click();
  await page.waitForTimeout(2500);
  if ((await buttons.count()) > 0) await buttons.first().click();
  await page.waitForTimeout(800);
  await narrate(page, "When I press Publish, it first shows me exactly what will change. Nothing goes live by surprise.");
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-diff]")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await narrate(page, "That's right, so I confirm.");
  await page.locator("[data-publish-confirm]").click();
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Published. The logo is already in the corner of the workspace, and the new sign-in page is live for everyone.");
  await page.getByRole("button", { name: "History" }).first().click().catch(() => undefined);
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");

  }

  // ---- policies
  await narrate(page, "Next, Policies. Every organization publishes its own privacy policy, terms and support page on its own address.");
  await page.getByRole("link", { name: "Policies", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/policies/, { timeout: 30_000 });
  await expect(page.locator("[data-policies-page]")).toBeVisible({ timeout: 45_000 });
  await narrate(page, "There are four: the privacy policy, terms of use, the acceptable use policy, and the support and contact page. Right now each one shows a standard template.");
  await page.getByRole("navigation", { name: "Policies" }).getByRole("button", { name: new RegExp(POLICY) }).click();
  await narrate(page, "I'll start with the privacy policy. Kiwiply gives me a template to begin from, so nobody has to write one from scratch.");
  await page.getByRole("button", { name: "Start from template" }).click();
  await expect(page.getByText("Template loaded into the draft")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The text is on the left, in plain markdown, and the formatted preview on the right. The template already promises that Brightline never collects government ID numbers, bank details or dates of birth.", undefined, page.locator("[data-policy-preview]"));
  const text = page.locator("#policy-text");
  await text.click();
  await page.keyboard.press("Control+End");
  await narrateDo(page, "I'll add one line of my own at the end, with a privacy contact.", async () => {
    await page.keyboard.type("\n\nPrivacy questions: privacy@brightline.example", { delay: 45 });
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "I save the draft. A privacy policy is a legal page, so it doesn't go live by itself. I submit it, and a Kiwiply reviewer approves it first.");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Waiting for review/)).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Now it says Waiting for review, and the text is locked while it is. I can withdraw it any time if I change my mind.");

  // ---- platform admin approves
  await narrate(page, "Let's look at the other side. A Kiwiply platform admin sees the submission in Policy reviews.");
  await page.goto(`${PLATFORM}/login`);
  await page.getByLabel("Email address").fill(ADMIN_LOGIN);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.goto(`${PLATFORM}/admin/policy-reviews`);
  const submission = page.getByRole("button", { name: new RegExp(`Brightline Talent.*${POLICY}`, "s") }).last(); // the newest one waits last
  await expect(submission).toBeVisible({ timeout: 45_000 });
  await submission.click();
  await expect(page.getByRole("button", { name: "Approve and publish" })).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The reviewer reads the full text. For a first publication, everything is new. For later edits, it shows what changed against the live version.");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await narrate(page, "Approved and published. If something were wrong, the reviewer could request changes with a note instead.");
  await page.waitForTimeout(1500);

  await page.goto(`${host}${POLICY === "Privacy Policy" ? "/privacy" : "/terms"}`);
  await expect(page.getByRole("heading", { name: POLICY }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "And here is the live page on Brightline's own address, with their name and their branding. Anyone can read it, even before signing in.");
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, -900);

  // ---- modules and licences
  await page.goto(`${host}/w/admin`);
  await shellReady(page);
  await narrate(page, "Finally, modules and licences. The menu on the left only shows the modules Kiwiply switched on for Brightline in the first video: roles and permissions, talent marketing and consultant jobs.");
  await narrate(page, "Subscription, Consultant Licenses, Billing, Feature Usage and HR are marked Soon. Let me open Consultant Licenses to show what that looks like today.", undefined, page.locator("[data-shell-sidebar]"));
  await page.getByRole("link", { name: /Consultant Licenses/ }).first().click();
  await expect(page.locator("[data-coming-soon]")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "It says, plainly, that the page is on the way. Licences and billing are managed with Kiwiply for now, and this is where they will live.", undefined, page.locator("[data-coming-soon]"));
  await narrate(page, "What does exist today is licence status on each consultant. Brightline has no consultants yet, so let me show how it looks in Acme Staffing, a bigger organization, as its admin Sarah.");
  await f.switchTo("sarah", "Switching over to Sarah at Acme Staffing.", "/w/admin/consultants");
  await expect(page.getByRole("heading", { name: "Consultants", exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The Consultants directory has a License column, with Active, Expiring or Needs Review for every consultant, and a filter for it.", undefined, page.getByRole("columnheader", { name: "License" }));
  await page.getByRole("button", { name: /License Status/ }).first().click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  await options.filter({ hasText: /Expiring/ }).first().click();
  await page.waitForTimeout(2500);
  await narrate(page, "Filtering by Expiring gives an admin a short list to act on before a licence runs out.");
  await page.locator("tbody tr").first().click();
  const licence = page.getByRole("region", { name: "License Status" });
  await expect(licence).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Opening a consultant shows a License Status card with the date it is valid until.", undefined, licence);
  await licence.getByRole("button", { name: "Manage License" }).click();
  const manage = page.getByRole("dialog", { name: "Manage License" });
  await expect(manage).toBeVisible({ timeout: 15_000 });
  await narrate(page, "Manage License records the status and the valid-until date. It says so right here: billing for licences will live on the Consultant Licenses page, once that opens.", undefined, manage);
  await manage.getByRole("button", { name: "Cancel" }).click();
  await narrate(page, "So that's setup: settings, branding, policies, and where modules and licences stand today. In the next video, Maya invites the team. Thanks for watching!", 1500);
});
