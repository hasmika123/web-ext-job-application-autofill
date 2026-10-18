# QA use-case stories: ADM, Organization Admin workspace (`/w/admin/**`)

Area key `ADM`. Specs: `web/e2e/stories/admin/*.story.ts` (helpers in `_helpers.ts`). Run with the stories config
(`web/playwright.stories.config.ts`) against the real stack (Spring API + MySQL + `next start`, demo tenants
`acme.localhost:3200` and `beta.localhost:3200`, API started with `DEMO_ALLOW_WRITES=true`).

## Story-fix log 2026-10-16 (branch ent-story-fixes)

All 51 stories are AUTOMATED and green on a fresh database. Fixed in the specs, none weakened: **ADM-05/06** (Audit Logs is a real page since the P0 audit fixes, so it is no longer on the "on the way" list), **ADM-21 and ADM-57** (dropdowns and menus close when the page scrolls, so the spec re-opens them until the option is up; the interviews toolbar has no "Clear filters" button, the filter is cleared with "All Statuses"; at 1440 px the interview drawer is a side dialog, the docked column starts at 1680 px), **ADM-55** (passes on a clean run; it had failed from timing), **ADM-62** (the placements board lists those ending soonest first, so the first page holds no placement with nothing to do: the story asks the same API for one and opens it with `?pl=<id>`).

## Area overview



**What the role does.** The Organization Admin (Sarah Chen, who also holds Marketing Manager) runs the Acme Staffing tenant: she sees
the whole organization on one dashboard, manages the people (employees, invitations, departments, teams, roles and permissions),
oversees the talent business (consultants, resumes, marketing assignments, jobs, applications, interviews, clients, placements) and
owns the look of the tenant (branding). Bea Turner (Beta Talent owner) uses the same workspace on a different tenant and proves isolation.

**Pages that exist (own route, real data):** Dashboard (`/w/admin`), Employees, Invitations, Teams, Departments, Roles & Permissions,
Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Organization Branding.

**Pages not built yet (menu entry shows "This page is on the way", `ComingSoon`):** Subscription Overview, Consultant Licenses,
Billing, Feature Usage, HR, Finance, Reports, Domains, Integrations, Audit Logs, Settings. (They appear in the menu only when the member
holds the permission and the tenant module is on, see `workspaces.json`.) Roadmap: billing pages X-billing phase (`28-billing-pages-ux.md`),
HR/Finance `36-hr-and-finance.md`, domains X3.1, audit/settings X2.9 and later, reports/integrations later phases. These are documented as
NOT-BUILT below; ADM-05 and ADM-06 automate the honest placeholder state.

**Personas used.** sarah (Org Admin + Marketing Manager), bea (Beta owner), anika (Consultant), omar (Marketing Specialist) for denied
variants. Seeded roster (EnterpriseDemoSeeder): Sarah, Omar, Anika, Ben, Hana (HR), Felix (Finance), Amara (Account Manager), Tomas
(Talent Acquisition), Eve (Executive Viewer), Sam Whitfield (suspended), Nina Vogel (invited). Departments: Consulting, Marketing, HR,
Finance, Operations; team Bench East (lead Anika) and others. Talent data: ~150 consultants, 50+ resumes, 100+ applications, 50+
interviews, 24+ clients/jobs, 50+ active placements, 8 marketers.

**Write policy.** Stories that write create uniquely named rows (Date.now) and either undo them, delete them or restore the previous
value. Nothing removes a seeded person, role, department or client. Where a story would be destructive (offboard, publish) only the
safe half is automated and the rest is marked BLOCKED.

**Status legend.** AUTOMATED / BLOCKED:why / NOT-BUILT:roadmap. Rule check: no sensitive PII is entered anywhere (ADM-45 proves an SSN is refused); nothing is submitted to an employer (applications only record); Kiwiply never submits.

---

## Dashboard and navigation

### ADM-01 Org admin reviews the Organization Dashboard
- **Persona:** Sarah Chen (Org Admin). **Goal:** one screen that tells the admin how the whole organization is doing.
- **Preconditions/seed:** Acme demo tenant seeded with talent foundation (153 consultants, applications, placements, finance summary).
- **Steps:** 1 Sign in as Sarah (lands on `/w/admin`). 2 Read header "Organization Dashboard" and the welcome line. 3 Check the six stat tiles (consultants, employees, applications, interviews, placements, finance). 4 Compare a tile with `GET /api/orgs/{id}/dashboard`. 5 Switch Team performance range 6 to 3 months. 6 Read pipeline donut and recent activity.
- **Expected:** every tile has a value; consultants tile equals the API value and is above 100; finance shows `$NNK`; team performance draws 6 then 3 bars; recent activity rows have relative times.
- **Negative:** see ADM-04 (other tenant), ADM-07 (non-admin).
- **Pages/APIs:** `/w/admin`, `GET /api/orgs/{id}/dashboard`. **Automation:** `dashboard.story.ts` "ADM-01 ...". **Status:** AUTOMATED.

### ADM-02 Org admin jumps to a page from a quick action
- **Persona:** Sarah. **Goal:** shortcuts to the common admin jobs.
- **Steps:** 1 Open dashboard. 2 Inspect quick actions (Invite employee, Review applications). 3 Click Review applications.
- **Expected:** link targets are `/w/admin/employees` and `/w/admin/applications`; click lands on the Applications page.
- **Automation:** `dashboard.story.ts` "ADM-02 ...". **Status:** AUTOMATED.

### ADM-03 Org admin dismisses the help card and it stays dismissed
- **Persona:** Sarah. **Goal:** the bee help card is helpful, not nagging.
- **Steps:** clear the local flag, reload, see "Need help, Sarah?", dismiss, reload.
- **Expected:** card gone after dismissal and after reload (stored per browser). **Automation:** `dashboard.story.ts` "ADM-03 ...". **Status:** AUTOMATED.

### ADM-04 Beta's owner sees Beta's numbers, never Acme's
- **Persona:** Bea Turner (Beta owner) vs Sarah. **Goal:** tenant isolation on the dashboard.
- **Steps:** read Acme's consultants total as Sarah; sign in as Bea; read Beta's; call Acme's dashboard API from Bea's session.
- **Expected:** totals differ; Beta page contains neither "Sarah Chen" nor "Acme"; Acme's API answers 403/404.
- **Automation:** `dashboard.story.ts` "ADM-04 ...". **Status:** AUTOMATED.

### ADM-05 Org admin walks the Administration menu
- **Persona:** Sarah. **Goal:** the sidebar never leads to a 404.
- **Steps:** collect every `/w/admin/**` sidebar link; open each.
- **Expected:** HTTP 200 for all; built pages render their page; unbuilt pages render the "on the way" state (`data-coming-soon`); at most 11 are placeholders.
- **Pages:** all of the menu. **Automation:** `navigation.story.ts` "ADM-05 ...". **Status:** AUTOMATED.

### ADM-06 Org admin opens an unbuilt menu page
- **Persona:** Sarah. **Goal:** honest empty state instead of fake data.
- **Steps:** click Audit Logs / Reports / Settings (whichever is in her menu).
- **Expected:** "This page is on the way" with the bee. Skips when none of the three is in her menu.
- **Automation:** `navigation.story.ts` "ADM-06 ...". **Status:** AUTOMATED (conditional skip).

### ADM-07 Non-admins are told Administration is not part of their role
- **Persona:** Anika (Consultant), Omar (Marketing Specialist). **Goal:** URL guessing shows no admin data.
- **Steps:** each types `/w/admin`, `/w/admin/roles`, `/w/admin/employees`.
- **Expected:** "This isn't part of your role" (`data-not-your-role`); no employees, roles or dashboard markers on the page. The API is the real gate (covered by its ITs).
- **Automation:** `navigation.story.ts` "ADM-07 ...". **Status:** AUTOMATED.

---

## People: employees and invitations

### ADM-10 Org admin reviews the employee roster
- **Persona:** Sarah. **Goal:** know who has access and in what state.
- **Seed:** 11 people incl. Nina (invited) and Sam (suspended).
- **Steps:** 1 Click Employees in the sidebar. 2 Read tiles (total, invited = 1, suspended = 1). 3 Search "anika". 4 Filter Status = Suspended. 5 Clear.
- **Expected:** total >= 11 and shown as "of N"; search gives one row; suspended filter gives only Sam Whitfield.
- **Automation:** `people.story.ts` "ADM-10 ...". **Status:** AUTOMATED.

### ADM-11 Org admin edits an employee's job title
- **Steps:** open Anika Rao's sheet, type a new title, wait for the saved tick, reload, reopen.
- **Expected:** autosave (no Save button), value persists. **Automation:** "ADM-11 ...". **Status:** AUTOMATED.

### ADM-12 Suspend with a reason, then reinstate
- **Steps:** row menu on Ben Okafor > Suspend > reason > confirm; row shows Suspended; row menu > Reinstate.
- **Expected:** status chip changes both ways; reason is mandatory (field labelled "Reason (required)"). Ben ends Active again.
- **Risk:** if the story dies between the two steps Ben stays suspended; reinstate him by hand. **Automation:** "ADM-12 ...". **Status:** AUTOMATED.

### ADM-13 Bulk role change with Undo
- **Steps:** tick Felix Ng and Hana Petrov; bulk bar "2 selected" > Change roles > add Consultant > Apply; check "+1"; Undo.
- **Expected:** toast "Updated roles for 2 people"; "+1" appears then disappears. **Automation:** "ADM-13 ...". **Status:** AUTOMATED.

### ADM-14 Offboarding asks for a typed confirmation and a reason
- **Steps:** row menu on Tomas Berg > Delete employee; read the dialog; cancel.
- **Expected:** dialog says "Their records are kept", asks to type the name and a reason; after cancel Tomas is still listed.
- **Automation:** "ADM-14 ..." (cancel half). **Status:** AUTOMATED (cancel half). The confirm half is **BLOCKED: destructive to the seeded roster**; to test by hand use a throwaway invited member.

### ADM-15 Invite an employee, resend, revoke
- **Persona:** Sarah. **Goal:** onboard a new colleague.
- **Seed:** Nina's pending invitation.
- **Steps:** open Invitations; see Nina Pending; fill Email, Full name, Role = Consultant, Department (first), message; Send; check Pending +1 and the activity feed; row menu > Resend; row menu > Revoke; filter Revoked.
- **Expected:** toasts "Invite sent", "Invitation sent again", "Invitation revoked"; counters Pending +1 then back, Revoked +1; Revoked filter keeps the new row and drops Nina.
- **Automation:** "ADM-15 ...". **Status:** AUTOMATED. (Mail goes to example.com; no real mail is sent in demo.)

### ADM-16 Incomplete invitation is refused field by field
- **Steps:** type "not-an-email", Send. **Expected:** "That doesn't look like an email address." and "Pick at least one role."; nothing sent. **Automation:** "ADM-16 ...". **Status:** AUTOMATED.

### ADM-17 Undo "Invite sent"
- **Steps:** send an invitation, click Undo in the toast. **Expected:** "Invitation cancelled", Pending back to the earlier count, row shows Revoked. **Automation:** "ADM-17 ...". **Status:** AUTOMATED.

### ADM-18 Another tenant cannot see Acme's people
- **Persona:** Bea. **Steps:** open Beta Invitations; call Acme's members/invitations APIs.
- **Expected:** Beta shows "No invitations yet" with "Invite your first teammate"; Acme APIs answer 404 with no e-mail address in the body.
- **Automation:** "ADM-18 ...". **Status:** AUTOMATED.

**Not covered here:** Accepting an invitation as the invitee (join flow) belongs to the tenant sign-in area; changing a manager chain; employee profile photo (X2.7 NOT-BUILT).

---

## Structure: departments and teams

### ADM-20 See the real departments and teams
- **Seed:** Consulting, Marketing, HR, Finance, Operations; team Bench East.
- **Steps:** open Departments, then Teams. **Expected:** five department cards; Consulting's employee count equals `/groups/structure`; no invented "open positions" tile; Teams shows Bench East and the honest "Nothing measures team performance yet".
- **Automation:** `structure.story.ts` "ADM-20 ...". **Status:** AUTOMATED.

### ADM-21 Create a department and a team, move a person, delete the team
- **Steps:** Create Department (name, lead Hana, icon, colour); Create Team (name, parent department, lead Omar, member Ben); open the team; Delete is disabled with Ben in it; move Ben to Bench East; Delete team; API cleanup deletes the department.
- **Expected:** cards appear; "1 member"; delete guard; empty-team message; team card gone. Ben ends in Bench East, as seeded.
- **Automation:** "ADM-21 ...". **Status:** AUTOMATED.

### ADM-22 Isolation and denial for groups
- **Persona:** Bea, Anika. **Expected:** Beta sees "Group people into departments and teams" empty state; Acme groups routes (list, directory, structure, one id, POST) answer 404; Anika sees "not part of your role" and API 404.
- **Automation:** "ADM-22 ...". **Status:** AUTOMATED.

---

## Roles and permissions

### ADM-30 Review the twelve system roles with real counts
- **Steps:** open Roles & Permissions; compare each system role's user count with `/roles/overview`.
- **Expected:** 12 system roles listed; tiles Total Roles and Active Users equal the API; no "vs last month" (no invented trend). **Automation:** `roles.story.ts` "ADM-30 ...". **Status:** AUTOMATED.

### ADM-31 Build a custom role, trim a permission, hit the Owner-only ceiling, delete it
- **Steps:** Create Role "Story Night Desk ..." from template Marketing Specialist; editor shows "Matches Marketing Specialist"; set followups.manage to Not granted; Review changes shows "Removed (1)"; confirm; chip becomes "Differs from ..."; org.close row is locked "Only the Owner holds this"; API PATCH adding org.close returns 422 ROLE_CEILING; delete the role from the row menu; History drawer shows Role created and Role deleted.
- **Automation:** "ADM-31 ...". **Status:** AUTOMATED.

### ADM-32 Beta sees only Beta's roles
- **Expected:** Bea gets >= 12 roles for her org; Acme's `/roles/overview`, `/permissions`, `/roles/history` answer 404. **Automation:** "ADM-32 ...". **Status:** AUTOMATED.

**Not covered:** assigning the custom role to a member and the "used by N" delete guard (needs a member write; covered by `e2e/journeys/tenant-roles.spec.ts`); resync from template.

---

## Talent: consultants, resumes, marketing assignments

### ADM-40 Browse the consultant bench, filter, open a consultant
- **Steps:** Consultants in sidebar; tiles (total >= 150, available > 0, on project > 0); filter Availability = On Project (URL carries it; all pills On Project); clear; open first row; drawer shows 5-item checklist, "Assign Marketer" quick action; visit tabs Assignments, Applications, Activity.
- **Automation:** `talent.story.ts` "ADM-40 ...". **Status:** AUTOMATED.

### ADM-41 Flip availability with autosave and put it back
- **Expected:** toast "Availability set to X", row pill changes, survives reload, restored. **Automation:** "ADM-41 ...". **Status:** AUTOMATED.

### ADM-42 Add a consultant and deactivate with a reason
- **Expected:** total +1 after add (drawer opens on the new person), back to the original after deactivation with a reason. **Automation:** "ADM-42 ...". **Status:** AUTOMATED.

### ADM-43 Beta cannot read Acme's consultants
- **Expected:** `?c=<acme id>` on Beta opens no drawer; all Acme consultant APIs 404; Beta's own total is smaller and excludes the id. **Automation:** "ADM-43 ...". **Status:** AUTOMATED.

### ADM-44 Review the resume library
- **Steps:** Resumes; tiles; Pending Approval tab (rows say Pending); Private visibility filter; open an approved non-primary resume; toggle Primary then Undo.
- **Expected:** URL carries tab/vis/open; "is now the primary resume" toast; Undo restores. **Automation:** "ADM-44 ...". **Status:** AUTOMATED.

### ADM-45 Add a resume: an SSN is refused, the new resume starts Pending
- **Rule served:** no sensitive PII ever stored. **Steps:** Upload Resume, pick a consultant, name, role; type "My SSN is 123-45-6789" in the summary; then a clean summary; Add resume.
- **Expected:** alert "never store"; Add disabled; after clean text the resume is added and the drawer says the preparer "cannot approve it" (no Approve button).
- **Automation:** "ADM-45 ...". **Status:** AUTOMATED. (Creates one resume row per run; the library grows by one. Archive by hand if wanted.)

### ADM-46 Beta cannot read Acme's resumes
- **Expected:** list, counts, filters, one id, export and PUT primary all 404 from Beta's session. **Automation:** "ADM-46 ...". **Status:** AUTOMATED.

### ADM-47 Read the marketing workload board and drill into one marketer
- **Steps:** Marketing Assignments; four tiles numeric; marketers by load ("n / capacity"); select Jessica Davis (URL `m=`), ten rows per page; Priority = High; reload; Clear.
- **Automation:** "ADM-47 ...". **Status:** AUTOMATED. (Exact seed numbers 141/8/12/3 are deliberately not asserted; they drift after earlier runs.)

### ADM-48 Assign two unassigned consultants to a marketer, then Undo
- **Expected:** load and tiles change then return exactly. **Automation:** "ADM-48 ...". **Status:** AUTOMATED.

### ADM-49 Over-capacity assignment warns first; workload report opens
- **Expected:** warning "would have N of M consultants", "over capacity" with Assign anyway; Cancel leaves the load unchanged; Workload report table opens. **Automation:** "ADM-49 ...". **Status:** AUTOMATED. Relies on Michael Park being near full; if the capacity warning is absent the seed has drifted.

### ADM-50 Beta's marketing board is its own
- **Expected:** Beta shows marketers without Jessica Davis; Acme's marketing-assignments routes 404. **Automation:** "ADM-50 ...". **Status:** AUTOMATED.

---

## Pipeline: jobs, applications, interviews, clients, placements

### ADM-51 Filter jobs, open one, see top matches
- Status = Open count equals the tile; search "react"; open the first job; Top matches rows. **Automation:** `pipeline.story.ts` "ADM-51 ...". **Status:** AUTOMATED.

### ADM-52 Change a job's status from the drawer, Undo
- On Hold then Undo back to Open. **Automation:** "ADM-52 ...". **Status:** AUTOMATED.

### ADM-53 Create a job for a client
- Create Job with a title and client TechCorp; appears first; "New this week" +1. **Automation:** "ADM-53 ...". **Status:** AUTOMATED. (Adds one job per run.) Assumes a client named TechCorp is seeded.

### ADM-54 Applications: stage filter and honest empty search
- Stage = Interviewing agrees with the tile and every row's stage; "zzzz-nobody" gives "No applications match". **Automation:** "ADM-54 ...". **Status:** AUTOMATED.

### ADM-55 Record an application move, Undo, edit next action, add a note
- **Rule served:** Kiwiply records, the consultant submits. The menu item is literally "Record as Submitted" and Undo restores the stage. **Automation:** "ADM-55 ...". **Status:** AUTOMATED.

### ADM-56 Pipeline board and analytics funnel
- Six columns, OFFER has cards, funnel includes Hired. **Automation:** "ADM-56 ...". **Status:** AUTOMATED.

### ADM-57 Interviews: filter, record a status with Undo, reschedule
- Total >= 50; Completed filter agrees with the tile; Scheduled interview recorded In Progress then Undo; reschedule to 16:30; Timeline shows Rescheduled. **Automation:** "ADM-57 ...". **Status:** AUTOMATED. (Reschedule changes one seeded interview's time and is not reverted; a repeat run reschedules again.)

### ADM-58 Interviews as calendar, pipeline and analytics
- **Automation:** "ADM-58 ...". **Status:** AUTOMATED.

### ADM-59 Clients: health filter, search, open a client with contacts
- **Automation:** "ADM-59 ...". **Status:** AUTOMATED.

### ADM-60 Add a client; duplicate refused; private mailbox contact refused
- Total +1; same name lower-case refused ("already have a client"); gmail.com contact refused, work e-mail accepted. **Automation:** "ADM-60 ...". **Status:** AUTOMATED. (Adds one client and one contact per run.)

### ADM-61 Placements: tabs, ending soon, sort by bill rate
- **Automation:** "ADM-61 ...". **Status:** AUTOMATED.

### ADM-62 Request a placement extension, Undo
- Request disabled until a date is entered; request recorded ("An extension to ..."); Undo gives "No extension requested yet". **Automation:** "ADM-62 ...". **Status:** AUTOMATED.

### ADM-63 Beta cannot read Acme's jobs, applications, interviews, clients or placements
- Lists 404 on Acme's org, Acme ids inside Beta's own org 404, Beta's totals smaller, a bulk write to Acme 404. **Automation:** "ADM-63 ...". **Status:** AUTOMATED.

---

## Branding

### ADM-70 Draft welcome copy, compare with live, discard
- Open Organization Branding; org name read-only "Acme Staffing"; type a Welcome title; badge flips to "Draft differs from live"; Publish opens a diff listing the new title (cancelled); Discard draft returns the badge to live.
- **Automation:** `branding.story.ts` "ADM-70 ...". **Status:** AUTOMATED. Never publishes.

### ADM-71 Beta's owner sees Beta's own branding
- **Automation:** "ADM-71 ...". **Status:** AUTOMATED.

### ADM-72 Branding is permission gated
- Omar opens `/w/admin/branding` and gets the not-your-role state. **Automation:** "ADM-72 ...". **Status:** AUTOMATED.

### ADM-73 Publish branding and see the new look on the sign-in page
- **Status:** BLOCKED: publishing changes Acme's public sign-in page for every later story and run; needs a restore step or a throwaway tenant. Do by hand with Version history restore afterwards.

---

## Not built yet (documented, not automated)

| ID | Story | Status |
|---|---|---|
| ADM-80 | Org admin reviews Subscription Overview (plan, seats, period) | NOT-BUILT: billing pages (`28-billing-pages-ux.md`), module `billing` |
| ADM-81 | Org admin manages Consultant Licenses (base license + add-ons per consultant) | NOT-BUILT: `20-consultant-license-model.md` |
| ADM-82 | Org admin reads Billing (invoices, payment method via Stripe, quote add/remove at period end) | NOT-BUILT: `26-billing-provider-integration.md`, `27-subscription-lifecycle.md` |
| ADM-83 | Org admin reviews Feature Usage against limits | NOT-BUILT: `25-usage-metering.md` |
| ADM-84 | Org admin opens the HR admin entry (record-only HR) | NOT-BUILT in the admin workspace: `36-hr-and-finance.md` (the HR workspace is another area) |
| ADM-85 | Org admin opens the Finance admin entry (record-only finance) | NOT-BUILT in the admin workspace: `36-hr-and-finance.md` |
| ADM-86 | Org admin opens Reports | NOT-BUILT: reports phase |
| ADM-87 | Org admin adds a custom domain (DNS instructions, verification) | NOT-BUILT: X3.1 to X3.6 |
| ADM-88 | Org admin configures Integrations (webhooks) | NOT-BUILT: integrations phase |
| ADM-89 | Org admin reads Audit Logs | NOT-BUILT: audit page (audit events exist in the API and appear in the Roles history drawer only) |
| ADM-90 | Org admin edits Organization Settings (name, security, MFA) | NOT-BUILT: X2.9, X2.14 |
| ADM-91 | Suspended member (Sam) and invited member (Nina) sign in | BLOCKED: demo accounts cannot sign in by design; the suspended panel needs a member suspended after sign-in |

For all of 80 to 90 the only automated check is ADM-05 and ADM-06 (the menu entry opens a friendly "on the way" page, never a 404).

## Coordinator checklist (seeded assumptions to verify on the live stack)

1. Client "TechCorp" exists in Acme (ADM-53 picks it by name).
2. Michael Park is near capacity so that two more consultants trigger the warning (ADM-49); Jessica Davis and David Kim exist as marketer cards (ADM-47, 48).
3. Sarah's menu includes at least one of Audit Logs, Reports, Settings (ADM-06 skips otherwise) and no more than 11 placeholder entries (ADM-05).
4. Beta has fewer consultants, resumes, applications, interviews, clients, jobs, placements than Acme, and at least one of each (ADM-63 asserts own total is smaller and the request succeeds).
5. Branding "Organization name" input has the accessible name "Organization name" (it is rendered through the shared `Field` label); the Welcome title field is found by label text `/Welcome title/`.
6. Interviews page marker `[data-interviews-page]` (taken from the journey's `openBoard("[data-interviews-page]")`).
7. The API runs with `DEMO_ALLOW_WRITES=true`; otherwise every write story fails with a demo-sandbox refusal.

---

## Employee accounts with a temporary password (ADM-19, ADM-19b)

Spec: `web/e2e/stories/admin/employee-accounts.story.ts` (serial: the two stories share one new person; the temporary password is read from the
shown-once dialog at run time, never hard-coded or printed). The invitation panel opens in **Create account now** (default); **Send invitation**
is the unchanged flow behind ADM-15..18 (those stories now pick that mode first).

| Id | Story | Status |
|---|---|---|
| ADM-19 | Org admin adds an employee: generated password in the field, a weak one refused, role and department, Create Account, password shown once with Copy, Reset Password issues a second one once | AUTOMATED |
| ADM-19b | The employee signs in on the tenant host, is held on Choose your password (pages come back, the API answers 403 PASSWORD_CHANGE_REQUIRED), chooses a password, lands on `/w/hr`; the temporary password no longer works; Reset Password now says they chose their own | AUTOMATED |

The invitation / Create account now form now also has optional **Team** and **Manager** (reports-to) fields (ADM-96); the member detail already shows both. ADM-19 itself still sets role and department; the browser walk of the new fields is not verified.

## Tenant forgot-password and the separate account (S9, decision O4; described only, no spec yet)

### ADM-92 Forgot password on the tenant host resets only the Acme account
- **Persona:** Sam (Acme employee who also has a personal Kiwiply account with the same address). **Goal:** reset the Acme password.
- **Steps:** 1. Open `acme.localhost/login`: the subtitle says "Sign in to your Acme Staffing account" and a note says it is separate from any personal Kiwiply account. 2. Press "Forgot password?" and enter Sam's address; the confirmation says "If an account for ... exists at Acme Staffing" and is identical for an unknown address. 3. Open the emailed link (it is on the Acme address, `/reset-password?key=...`), choose a new password (rules: 4-100 characters, both fields equal). 4. Sign in at Acme with the new password.
- **Expected:** the Acme sign-in works with the new password only; the old Acme password is refused; on kiwiply.com Sam's personal password is unchanged and still works; a reset key of the personal account opened on the Acme host fails like an unknown key ("invalid or has expired"), and vice versa; the page never says whether an account exists in the other world.
- **Pages / APIs:** `/forgot-password`, `/reset-password` (tenant), `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (both forward the tenant host).
- **Status: STORY-ONLY (S10 automates and runs it on the QA stack)**

### ADM-93 The admin dialogs describe a new, separate organization account
- **Persona:** Olivia (Org Admin). **Steps:** open Invitations, mode "Create account now". **Expected:** the helper line says their account in your organization is created now with a temporary password and that it is a separate account that never touches or links to any personal account they have (it no longer names "Kiwiply account"); the result is always the shown-once temporary-password dialog (no "already has a Kiwiply account" outcome for a SEPARATE organization).
- **Status: STORY-ONLY**

## Separate accounts end to end for a person who also has a personal account (S10, decision O4; described only, no spec yet)

### ADM-94 Dana is created at Gamma, works there, is offboarded, and her personal account is never involved
- **Persona:** Gina (Owner of Gamma Consulting, `gamma.localhost`) and Dana (Gamma consultant who also has a personal Kiwiply account with the same address `dana.moreau@gamma.example.com`). **Steps:** 1. Gina opens Invitations, mode "Create account now", adds Dana (role Consultant) and copies the temporary password. 2. Dana signs in at `gamma.localhost` with her address and the temporary password and chooses a password. 3. Dana opens kiwiply.com and signs in with her personal password. 4. Gina offboards Dana from Members (reason, then type her name).
- **Expected:** step 1 looks the same for any address (no hint that a personal account exists); step 2 lands on the workspace; step 3 shows her personal account exactly as before (its resumes, no Gamma membership); after step 4 Dana's Gamma session ends on its next click and she cannot sign in at Gamma ("not a member"), while the personal account still signs in and works; Gina's audit trail shows the removal and the account being disabled, without Dana's address.
- **Pages / APIs:** Invitations, Members, `POST /api/orgs/{id}/members/account`, `POST /api/orgs/{id}/members/{seat}/offboard`, kiwiply.com `/login`.
- **Status: STORY-ONLY (the API walk is `SeparateAccountsRegressionIT`)**

## Reports and the activation checklist (demo-day gaps; described only, no spec yet)

### ADM-96 The Org Admin reads the canned reports and downloads them as CSV
- **Persona:** Sarah (Org Admin of Acme Staffing). **Goal:** see how the organization is doing in a few numbers and take the tables to a meeting.
- **Steps:** 1. Open Reports in the sidebar (`/w/admin/reports`). 2. Read the six tiles (active consultants, available and in marketing, applications in range, interviews completed, active placements, median time to first submission). 3. Read the applications-by-stage chart and table and the week-over-week column, the applications-per-week chart, the interviews scheduled-versus-completed chart, the placements started-and-ended chart for the last six months, the two consultant donuts (marketing status, availability), the top clients and the marketer workload tables. 4. Switch "Last 30 days" to "Last 90 days". 5. Press "Download CSV" and open the file.
- **Expected:** every number is computed by the API from Acme's own rows (there is no sample data and no money); marketers appear by name only, never by email; switching the range reloads with the 90-day figures and the pressed button changes; the CSV holds every table with a title row and a header row, and a client named like `=HYPERLINK(...)` is written as text (a leading quote), never as a formula; an organization with no rows yet sees "Nothing to report yet" and the download is off; at 390 px the cards stack and wide tables scroll inside their card, not the page. A member who holds `reports.view` only for their own people (a marketing specialist) never sees this page: the menu does not list it and the API answers the generic 404.
- **Pages / APIs:** `/w/admin/reports`, `GET /api/orgs/{orgId}/reports/overview?range=30|90` (`reports.view` at ORG scope).
- **Status: STORY-ONLY (API figures are checked against independent SQL counts in `OrgReportsIT`)**

### ADM-97 A new organization sees the activation checklist on the dashboard until it is set up
- **Persona:** Priya (Owner of a freshly created organization). **Goal:** know what to do first.
- **Steps:** 1. Sign in and open the Dashboard. 2. Read "Get your organization ready" (0 of 5 done: set your branding, add a department, invite or create your first employees, assign roles, assign consultants to a marketer). 3. Publish the branding and return: the step is ticked and the bar moves. 4. Press the x on the card. 5. Reload.
- **Expected:** the ticks come from the organization's real state (nobody ticks them by hand); each step links to the page where it is done; when all five are done the card disappears for good; pressing the x hides it for 7 days for that administrator only (another administrator still sees it), and a failed save brings the card back with a message; Acme Staffing, which is fully set up, never shows the card.
- **Pages / APIs:** `/w/admin` (Dashboard), the `checklist` widget of `GET /api/orgs/{orgId}/dashboard`, `POST /api/orgs/{orgId}/dashboard/alerts/CHECKLIST/dismiss`.
- **Status: STORY-ONLY (the widget is checked in `OrgReportsIT`; the card in `ChecklistCard.test.tsx`)**
### ADM-110 Gina picks a Team and a Manager when she creates or invites an employee
- **Persona:** Gina (Owner). **Steps:** 1. Invitations, mode **Create account now**: fill email and role, pick a Team and a Manager, Create Account. 2. Repeat in **Send invitation** mode. 3. Open the new member (Members / Employees): Overview. 4. Leave both on "No team" / "No manager" for a third person.
- **Expected:** the Team list narrows to the chosen department's teams; the member detail shows the team and manager; the API validates both against the same organization (a team from another organization or a manager outside it is the generic 404, a team outside the chosen department is refused); the third person has neither. The fields are hidden when the organization has no teams and no active members to choose.
- **Pages / APIs:** `/w/admin/invitations`, `GET invitations/form-options` (now teams and managers), `POST members/account`, `POST invitations` (teamGroupId, managerMemberId; API unchanged). **Automation:** none yet (web `InvitePanel.account.test.tsx`). **Status: STORY-ONLY (browser not verified)**

### ADM-111 Gina reviews which jobs were captured, by whom, with which extension version
- **Persona:** Gina. **Steps:** 1. Audit Logs, tab **Captured jobs**. 2. Narrow by a date range, a search word and a source. 3. Next page. 4. Export CSV. 5. As a member without audit.view, open the same page.
- **Expected:** one row per job with who captured it, when, source, extension version; the filters narrow it; the CSV has one line per row on screen and no cell starts with = + - or @ (it is prefixed with a quote); step 5 is the permission panel / generic 404.
- **Pages / APIs:** `/w/admin/audit`, `GET /api/orgs/{orgId}/audit/job-data` (existing). **Automation:** none yet (web `JobDataAudit.test.tsx`). **Status: STORY-ONLY (browser not verified)**
### ADM-120 The Org Admin writes the organization's privacy policy from the template and submits it for review
- **Persona:** Oscar (Org Admin of Acme Staffing). **Steps:** 1. Open Policies from the Administration menu. 2. Open "Privacy Policy" (state Draft, "Template shown") and choose "Start from template": the text appears with "Acme Staffing" and the support address merged in. 3. Edit a sentence, choose "Save draft". 4. Choose "Submit for review".
- **Expected:** the preview matches the text and takes the organization's colours; after step 4 the state reads "In review", the editor is locked and only "Withdraw from review" is offered; `acme.localhost/privacy` still shows the neutral template (a draft or an in-review text is never public); History shows the submission without the text.
- **Pages / APIs:** Policies, `POST /api/orgs/{id}/policies/PRIVACY/template`, `PUT .../draft`, `POST .../request-review`.
- **Status: STORY-ONLY (covered by `OrgPolicyResourceIT`, `PoliciesPage.test.tsx`)**

### ADM-121 The Org Admin sees the reviewer's comment, fixes the text and resubmits; or withdraws a submission
- **Persona:** Oscar. **Preconditions:** a Kiwiply reviewer sent the privacy policy back with the note "Please name your data protection contact." **Steps:** 1. The bell shows "Changes requested to your Privacy Policy". 2. Open Policies: the page shows the state "Changes requested" and the note. 3. Add the contact, save, submit again. 4. On the Terms policy, submit and then choose "Withdraw from review".
- **Expected:** step 3 puts it back in review as version 2 (version 1 stays in History as sent back); step 4 returns Terms to Draft and the reviewer's queue no longer lists it; an attempt to edit while in review is refused with a clear message; HTML, images and unsafe links in the text are refused with "HTML is not allowed" style messages and nothing is saved.
- **Pages / APIs:** Policies, bell, `POST .../request-review`, `POST .../withdraw`.
- **Status: STORY-ONLY (covered by `OrgPolicyResourceIT`)**

### ADM-122 An organization with review switched off publishes its own policy at once
- **Persona:** the app admin sets `enterprise.policies.require_review` to off; Oscar. **Steps:** 1. Oscar saves a Terms text and chooses "Publish". 2. Open `acme.localhost/terms` signed out.
- **Expected:** the button reads "Publish" instead of "Submit for review"; the public page shows Oscar's text at once, with "Last updated"; History of the organization shows `POLICY_SUBMIT` and `POLICY_APPROVE` by Oscar's login; turning the setting back on restores the review step for the next change (the live text stays).
- **Pages / APIs:** Policies, Settings (platform admin), `GET /api/public/tenant/policies/TERMS`.
- **Status: STORY-ONLY (covered by `OrgPolicyResourceIT`)**

### ADM-123 Oscar sets the organization's time zone, display name and support contact
- **Persona:** Oscar, the Owner of Acme. **Steps:** 1. Open Settings (`/w/admin/settings`). 2. In General, change the display name to "Acme Talent", pick another time zone, choose "en-GB", enter `support@acme.example` as the contact e-mail, press Save changes. 3. Open the public Support page of the organization's host.
- **Expected:** the legal name is shown but cannot be edited; a toast says the settings were saved; the support page shows the contact e-mail; a made-up time zone or an invalid e-mail is refused with a message naming the field and nothing is saved; History of the organization shows one "changed the organization settings" row naming the fields (not the values).
- **Pages / APIs:** Settings, `GET /api/orgs/{id}/org-settings`, `PUT /api/orgs/{id}/org-settings/general`.
- **Status: STORY-ONLY (covered by `OrgSettingsIT`, `GeneralSecuritySettings.test.tsx`); browser walk not verified**

### ADM-124 Oscar tightens the password minimum and the idle timeout, with a reason
- **Persona:** Oscar. **Steps:** 1. In Settings, Security, enter a minimum password length of 12 and an idle timeout of 120 minutes. 2. Leave the reason empty: the Review and save button stays disabled. 3. Type a reason, press Review and save, read the confirm dialog, confirm. 4. A member then tries to reset their password to 8 characters on the organization's host.
- **Expected:** values outside the platform bounds shown beside each field are refused; the confirm dialog says what changes; the reset with 8 characters is refused; sessions on the organization's host renew for at most 120 idle minutes; History shows one row with old value, new value and the reason; clearing a field returns to the platform default (this also needs a reason); the extension's long-lived connection is unaffected.
- **Pages / APIs:** Settings, `PUT /api/orgs/{id}/org-settings/security`, `POST /api/account/reset-password/finish`.
- **Status: STORY-ONLY (covered by `OrgSettingsIT`); enforcement on the reset path and on token issue is code-only, browser walk not verified**

### ADM-125 Only an organization settings manager can open or change Settings
- **Persona:** Pat (plain member), Sam (marketing specialist), Hannah (HR), the Owner of another organization. **Steps:** each calls the settings URLs of Acme.
- **Expected:** every one of them gets the generic "not found", whether reading or writing; nothing changes.
- **Pages / APIs:** `/api/orgs/{id}/org-settings`, `OrgIsolationIT` rows.
- **Status: STORY-ONLY (covered by `OrgSettingsIT`, `OrgIsolationIT`)**

### ADM-126 Gina downloads the audit log as a CSV
- **Persona:** Gina, who holds audit.view. **Steps:** 1. Open Audit Logs, filter to "invited a member" and a date range. 2. Press Download CSV. 3. Open the file in a spreadsheet.
- **Expected:** the file holds exactly the filtered rows, newest first, with names (never logins or free text); a person whose name starts with `=` shows as plain text, no formula runs; the export is cut at the admin-set row limit with a line saying so; History then shows an "EXPORT" row for the download; HR and Finance (row-filtered audit grants) cannot download it.
- **Pages / APIs:** Audit Logs, `GET /api/orgs/{id}/audit/export`.
- **Status: STORY-ONLY (covered by `OrgAuditEventsIT`, `CsvSafeTest`); browser walk not verified**

### ADM-127 A consultant's password-reset and notice e-mails look like their organization
- **Persona:** Anika, a consultant with an enterprise account. **Steps:** 1. On the organization's host, press Forgot password. 2. Later, an interview is scheduled and Anika has e-mail notices on.
- **Expected:** both e-mails carry the organization's logo (or its name when there is no logo), its colour and "this workspace" wording; every link, including the footer's Privacy, Terms and Support, points at the organization's own host; no link to kiwiply.com; with no host yet the footer shows no policy links. A personal user's e-mails are unchanged. An invitation to a separate-accounts organization never shows a "pays for: Pro" line.
- **Pages / APIs:** reset e-mail, notification e-mail, invite e-mail.
- **Status: STORY-ONLY (covered by `EnterpriseAccountMailTest`, `OrgInvitePaysStripTest`); real e-mail delivery not verified**
### ADM-130 The admin sets the duplicate policy, the open-opportunity limit and the handover switch (Sprint 2 / B1)
- **Personas:** platform admin (Settings page), Org Admin (per-organization override stored in `org_setting`). **Goal:** every switch and limit of the assignment guards is configuration, never code.
- **Steps:** 1. Open the platform Settings page and find `org.pipeline.duplicate_policy` (WARN or BLOCK, default WARN), `org.pipeline.same_client_window_days` (default 90), `org.pipeline.max_submissions_per_requirement` (default 0 = off), `org.pipeline.open_matches_max` (default 0 = off) and `org.assignments.handover_open_work` (default on). 2. Change one; repeat the matching story (MKT-61, MKT-62, MKT-63).
- **Expected:** the new value applies on the next request without a restart; an organization value in `org_setting` wins when valid and is ignored when malformed or out of range; the defaults ask (WARN) and never refuse, and the limits are off.
- **Pages / APIs:** platform Settings. **Automation:** none yet (Java `PipelineGuardSettingsTest`, `PipelineGuardIT`). **Status: STORY-ONLY**
