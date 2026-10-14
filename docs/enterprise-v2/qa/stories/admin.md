# QA use-case stories: ADM, Organization Admin workspace (`/w/admin/**`)

Area key `ADM`. Specs: `web/e2e/stories/admin/*.story.ts` (helpers in `_helpers.ts`). Run with the stories config
(`web/playwright.stories.config.ts`) against the real stack (Spring API + MySQL + `next start`, demo tenants
`acme.localhost:3200` and `beta.localhost:3200`, API started with `DEMO_ALLOW_WRITES=true`).

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
