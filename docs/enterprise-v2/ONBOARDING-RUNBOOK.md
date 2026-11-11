# Onboarding a consultancy: runbook

> Gap A2 (`BUILD-OUT-GAPS.md`). Written 2026-11-11 against `develop`. Every step says **who** does it and **where**. Steps marked
> **(manual)** have no screen yet; **(gap)** marks something that does not exist yet, with the gap-list item that would build it.
> Production runs older code until `develop` is promoted to `main`: on production today, only the parts shipped by 6 October exist.

## 0. Before you start (Kiwiply)
- The organization's name, its kind (consultancy), the owner's work email, and the address label it wants (`acme` → `acme.kiwiply.com`).
- What they bought, per consultant: AI tailoring, the Gmail inbox, Autopilot prepare, and so on. **Nothing is billed yet** (licences without money,
  user decision 2026-11-10); prices are agreed outside the product for now.
- **Server settings** (manual, once per environment; check them before the first organization):
  - **The AI provider key** is set on the API. Without it every AI feature answers "switched off".
  - **`DOSSIER_INBOX_KEY`**, a 32-byte base64 key, is set and **kept in the password manager**. Changing it later disconnects every inbox.
  - **The nightly off-box database backup** runs (`DEPLOY.md` §5). It has never run on the current box.

## 1. Create the organization: platform admin (kiwiply.com/admin)
1. **Organizations → Create organization.** Enter the name, the kind, the owner's email and the address label.
   - The product checks the label is free and allowed.
   - It creates the organization, its owner seat and `label.kiwiply.com`.
2. **Copy the one-time owner password** shown once, and send it to the owner through a safe channel, never in the same email as the address. If it
   is lost: the organization's page → **Reset owner password**.
3. On the organization's page:
   - **Enterprise: on.**
   - **Modules:** switch on what they use (marketing, resumes, …). Each switch asks for a reason, which is audited.
4. **If they bought Autopilot:** the platform switch `enterprise.autopilot.prepare.enabled` must be on. **(manual: API only)** It's set with
   `PUT /api/admin/settings/enterprise.autopilot.prepare.enabled` as a platform admin, with a reason. There's no screen yet (gap list D12).
5. **(gap A4–A6)** A custom domain such as `jobs.acme.com` isn't available yet; the organization uses `label.kiwiply.com`.

## 2. Set up the organization: the owner / Org Admin (`label.kiwiply.com`)
6. **Sign in** with the one-time password; the product asks for a new one.
7. **Branding:** logo, colours, title. Check the phone preview, then **Publish**.
8. **Teams & Departments:** create the departments first. The consultant import matches its `department` column to these names.
9. **Invitations:** invite the staff (admins, marketers, HR) with their roles. Each person gets an email and sets their own password.
10. **Consultants → Import from CSV:**
    - Download the template, fill one consultant per row, upload, review every row's verdict, then **Import**.
    - Ticked rows get the invitation with the Consultant role, and their profile links to it.
    - Fix the refused rows in the sheet and import again: rows already added show as "Already here".
    - At most 500 rows per file.
    - **Resumes aren't imported:** each consultant adds their own when they first sign in.
11. **Assignments:** give each consultant a primary marketer, and set each marketer's capacity.
12. **Licenses:** give each consultant a licence and switch on the add-ons they have: AI tailoring, the inbox, Autopilot prepare, and so on. The
    change works at once. The page says "Price not set — nothing is billed yet" unless the organization has contract prices.
13. **Settings → Prepare** (if they bought Autopilot): opt the organization in and set the daily and per-batch limits. A consultant can prepare only
    with the add-on on their licence **and** this switch on.
14. Optional: **Policies** (acceptable use, privacy notes), **Roles** (custom roles), **Audit Log** (to check what happened).

## 3. Each consultant
15. **Accept the invitation** from the email and set a password. The account is an *organization* account, separate from any personal Kiwiply
    account they may have (decision O4).
16. **My Resumes:** upload or build a resume and set it as primary. Complete **My Career Profile**: the extension fills applications from it.
17. **The browser extension:** install it, then **Account menu → Connect extension** (a one-time code).
    - **(gap D8)** An organization-branded extension is only a build script today (`web/scripts/brand-extension.mjs`). Publishing one per
      organization to the browser stores isn't built, so consultants use the standard extension.
    - The tenant's own `/connect` page hands the session to a build that lists the organization's address.
18. Optional, **if their licence has the inbox:** **Inbox → connect** a dedicated Gmail with an App Password. Kiwiply reads it to track
    applications; it never sends, moves or deletes mail.

## 4. Day to day (check the first week)
- **Marketers:**
  - find jobs (Job Discovery) and assign them to consultants (Opportunities);
  - on an assigned job, choose the resume for it, or **Tailor with AI**, which makes a new version that waits for the consultant's approval.
- **Consultants:**
  - review assigned jobs;
  - **Prepare selected** opens each job filled in their own browser; they review it and press the site's own Submit. **Nothing is ever submitted
    for them.**

## 5. Real accounts work without the demo shortcut (gap A7: checked)
- An invited or created enterprise account carries its organization on its user row (`user.org_id`).
- The extension connect (`AuthenticateController.connectsTo`), the account kind (`ProfileWorkspaces.accountOfCurrentUser`) and the workspace
  profile (#137) work from that alone.
- The demo check (`EnterpriseDemoSeeder.isEnterpriseDemoLogin`) is only a fallback for the seeded demo members, whose rows carry no organization.
- `ExtensionConnectEndToEndIT` covers real enterprise accounts.

## 6. Not available yet (tell the consultancy up front)
| What | Gap |
|---|---|
| Billing, invoices and payment for the organization | B3, B4 |
| Their own domain (`jobs.acme.com`) | A4–A6 |
| An extension in their own brand in the browser stores | D8 |
| Single sign-on, required two-step sign-in | D-1, D-2 |
| HR, Finance, Integrations, Executive and Marketing Manager pages | C1–C6 (the Marketing Manager backend exists; its pages don't) |
| Resumes in bulk | user decision 2026-11-11 |
