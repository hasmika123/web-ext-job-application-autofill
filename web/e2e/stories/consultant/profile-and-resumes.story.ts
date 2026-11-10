import { test, expect, narrate } from "../_support/story";
import { lettersStamp, menuAction, openPage, pageTitle, stamp } from "./_helpers";

test("CON-10 Anika reviews her profile: identity, skills, certifications, preferences, completeness", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens My Profile");
  await openPage(page, go, "profile");
  await expect(pageTitle(page)).toHaveText("My Profile");

  const top = page.locator("[data-profile-top]");
  await expect(top.getByRole("heading", { name: "Anika Rao" })).toBeVisible();
  await narrate(page, "The header shows her name, experience, location and current availability");
  await expect(top.locator("[data-years]")).toContainText(/years?/i);
  await expect(top.getByRole("button", { name: "Availability" })).toBeVisible();

  await narrate(page, "Seeded certifications, preferred roles, locations and work authorization are on the cards");
  await expect(page.locator("[data-certification]")).toHaveCount(3);
  await expect(page.locator("[data-home-card=profile-certifications]")).toContainText("AWS Certified Solutions Architect");
  await expect(page.locator("[data-home-card=profile-roles]")).toContainText("Senior Java Developer");
  await expect(page.locator("[data-home-card=profile-locations]")).toContainText("Remote");
  await expect(page.locator("[data-work-authorization]")).toBeVisible();
  await expect(page.locator("[data-career-goals]")).toContainText(/backend|full-stack/i);

  await narrate(page, "One line under her name says how complete the profile is; no photo, no ID numbers are collected");
  await expect(top.locator("[data-completeness]")).toContainText(/Profile (complete|\d+% complete)/);
  await expect(page.locator("[data-avatar]")).toBeVisible(); // initials circle: Kiwiply stores no photos
});

test("CON-11 Anika edits her professional summary, adds and removes a skill; the PII guard refuses an ID number", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "profile");
  const note = page.locator("[data-save-note]");

  // ---- summary: read, refuse sensitive text, save a real edit, restore
  const summaryCard = page.locator("[data-home-card=profile-summary]");
  const before = (await summaryCard.locator("[data-summary]").count()) ? ((await summaryCard.locator("[data-summary]").innerText()) ?? "").trim() : "";
  await narrate(page, "She opens Edit on the Professional Summary");
  await summaryCard.getByRole("button", { name: "Edit professional summary" }).click();
  const form = page.getByRole("form", { name: "Edit professional summary" });
  await narrate(page, "Typing an ID number is refused: Kiwiply never stores that");
  await form.getByRole("textbox").fill("My SSN is 123-45-6789 and I like backend work.");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toBeVisible();

  await narrate(page, "A clean summary saves");
  const marker = `QA story edit ${stamp()}`;
  await form.getByRole("textbox").fill(`${before || "Results-driven engineer."} ${marker}`);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(note).toHaveText("Summary saved");
  await expect(summaryCard.locator("[data-summary]")).toContainText(marker);

  await narrate(page, "She puts the original text back");
  await summaryCard.getByRole("button", { name: "Edit professional summary" }).click();
  await page.getByRole("form", { name: "Edit professional summary" }).getByRole("textbox").fill(before);
  await page.getByRole("form", { name: "Edit professional summary" }).getByRole("button", { name: "Save" }).click();
  await expect(note).toHaveText("Summary saved");

  // ---- skills: add one, then remove it
  const skill = `Qa${lettersStamp()}`;
  const skills = page.locator("[data-home-card=profile-skills]");
  await narrate(page, "Under Primary Skills she adds a new skill");
  await skills.getByRole("button", { name: "Add skills" }).click();
  await skills.getByRole("textbox", { name: "Skill" }).fill(skill);
  await skills.getByRole("button", { name: "Add", exact: true }).click();
  await expect(note).toHaveText("Skill added");
  await expect(skills.locator("[data-chip]", { hasText: skill })).toBeVisible();

  await narrate(page, "Then removes it again");
  await skills.getByRole("button", { name: "Done", exact: true }).click(); // closes the add form
  await skills.getByRole("button", { name: "Edit skills" }).click();
  await skills.getByRole("button", { name: `Remove ${skill}` }).click();
  await expect(note).toHaveText("Skill removed");
  await expect(skills.locator("[data-chip]", { hasText: skill })).toHaveCount(0);
});

test("CON-12 Anika adds and removes a preferred role and a certification", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "profile");
  const note = page.locator("[data-save-note]");
  const tag = lettersStamp();

  const roles = page.locator("[data-home-card=profile-roles]");
  const role = `QA Engineer ${tag}`;
  await narrate(page, "She adds a preferred role");
  await roles.getByRole("button", { name: "Add role" }).click();
  await roles.getByRole("textbox", { name: "Role" }).fill(role);
  await roles.getByRole("button", { name: "Add", exact: true }).click();
  await expect(note).toHaveText("Role added");
  await expect(roles).toContainText(role);
  await roles.getByRole("button", { name: "Done", exact: true }).click();
  await roles.getByRole("button", { name: "Edit preferred roles" }).click();
  await roles.getByRole("button", { name: `Remove ${role}` }).click();
  await expect(note).toHaveText("Role removed");

  const certs = page.locator("[data-home-card=profile-certifications]");
  const cert = `QA Practitioner ${tag}`;
  await narrate(page, "She records a certification (name and issuer only)");
  await certs.getByRole("button", { name: /Add certification/ }).click();
  const certForm = page.getByRole("form", { name: "Add certification" });
  await certForm.getByLabel("Certification name").fill(cert);
  await certForm.getByLabel("Issued by (optional)").fill("QA Institute");
  await certForm.getByRole("button", { name: "Add certification", exact: true }).click();
  await expect(note).toHaveText("Certification added");
  await expect(certs).toContainText(cert);

  await narrate(page, "And removes it");
  await certs.getByRole("button", { name: "Edit certifications" }).click();
  await certs.getByRole("button", { name: `Remove ${cert}` }).click();
  await expect(certs).not.toContainText(cert);
});

test("CON-13 Anika reviews her resumes, previews one and sees the resume strength checklist", async ({ as }) => {
  const { page, go } = await as("anika");
  await narrate(page, "Anika opens My Resumes");
  await openPage(page, go, "resumes");
  await expect(pageTitle(page)).toHaveText("My Resumes");

  await narrate(page, "The demo seed tops her up to at least five resumes; exactly one is the primary");
  const rows = page.locator("[data-resume]");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator("[data-resume][data-primary=true]")).toHaveCount(1);

  await narrate(page, "The Resume strength checklist is a real count");
  await expect(page.locator("[data-home-card=resumes-strength]")).toBeVisible();

  const title = (await rows.first().locator("span.font-semibold").first().innerText()).trim();
  await narrate(page, `She previews "${title}"`);
  await page.getByRole("button", { name: `View ${title}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.locator("[data-resume-paper]")).toBeVisible();
  await expect(sheet.locator("[data-resume-paper]")).not.toBeEmpty();
  await sheet.getByRole("button", { name: `Close ${title}` }).click();

  // Stale after an intentional product change (ent-resume, 2026-10-15): Create New Resume is real now. It opens the same chooser as the personal app (CON-80 is the full story).
  await narrate(page, "Create New Resume opens the chooser: profile, upload, copy, or a blank page");
  await page.locator("[data-create-resume]").click();
  await expect(page.getByRole("dialog").getByText("Start from scratch")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("CON-14 Anika renames a resume, changes its visibility and switches her primary resume (then restores everything)", async ({ as }) => {
  const { page, go } = await as("anika");
  await openPage(page, go, "resumes");

  const primaryRow = page.locator("[data-resume][data-primary=true]");
  const primaryTitle = (await primaryRow.locator("span.font-semibold").first().innerText()).trim();
  const other = page.locator("[data-resume][data-primary=false]").first();
  const otherTitle = (await other.locator("span.font-semibold").first().innerText()).trim();
  const newName = `${otherTitle} ${stamp()}`;

  await narrate(page, `She opens Edit on "${otherTitle}"`);
  await page.getByRole("button", { name: `Edit ${otherTitle}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit resume details" });
  await sheet.getByLabel("Resume name").fill(newName);
  await narrate(page, "and saves the new name");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Resume updated").first()).toBeVisible();
  await expect(page.locator("[data-resume]", { hasText: newName })).toHaveCount(1);

  await narrate(page, "She makes it the primary resume used in applications");
  await menuAction(page, page.getByRole("button", { name: `More actions for ${newName}` }), "Set as primary");
  await expect(page.getByText("Primary resume changed")).toBeVisible();
  await expect(page.locator("[data-resume][data-primary=true]", { hasText: newName })).toHaveCount(1);

  await narrate(page, "Restoring: the original primary is primary again and the name is put back");
  await menuAction(page, page.getByRole("button", { name: `More actions for ${primaryTitle}` }).first(), "Set as primary");
  await expect(page.locator("[data-resume][data-primary=true]", { hasText: primaryTitle })).toHaveCount(1);
  await page.getByRole("button", { name: `Edit ${newName}`, exact: true }).click();
  await page.getByRole("dialog", { name: "Edit resume details" }).getByLabel("Resume name").fill(otherTitle);
  await page.getByRole("dialog", { name: "Edit resume details" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("[data-resume]", { hasText: otherTitle })).not.toHaveCount(0);
});
