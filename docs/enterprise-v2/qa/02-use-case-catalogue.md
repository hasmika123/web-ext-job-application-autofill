# Use-case catalogue: index of all stories and the cross-role journeys

> **Coordinator note.** This file is a skeleton. The four story files (`stories/admin.md`, `stories/marketing.md`, `stories/consultant.md`, `stories/platform.md`) were being written by other agents while this was drafted and did not exist yet. **The coordinator regenerates the index table in section 2 once the story files land** (section 5 says how). Until then no story ID below is real. Do not copy story text into this file: it only indexes.
> Conventions (ID scheme, status vocabulary, personas) are in `00-README.md`. Product context is in `01-product-goals-features-roadmap.md`.

## 1. Areas and files

| Area | Prefix | Story file | Primary personas | Workspace routes |
|---|---|---|---|---|
| Organization administration | `ADM-` | `stories/admin.md` | Sarah Chen, Bea Turner | `/w/admin/**` |
| Talent marketing | `MKT-` | `stories/marketing.md` | Omar Haddad, Sarah Chen (manager) | `/w/marketing/**`, extension capture |
| Consultant | `CON-` | `stories/consultant.md` | Anika Rao, Ben Okafor | `/w/consultant/**`, extension apply and track |
| Platform and cross-cutting | `PLT-` | `stories/platform.md` | all, Bea for isolation | tenant host, sign-in, shell, `/admin/**`, audit, unbuilt role workspaces |

Expected size is not fixed. Number of stories per area, when known: ADM __, MKT __, CON __, PLT __ (to be filled by the coordinator).

## 2. Index table (to be regenerated)

One row per story. `Status` is exactly one of `AUTOMATED`, `BLOCKED`, `NOT-BUILT` (see `00-README.md` section 6). `Spec` is the story spec path when one exists, else `-`. `Journeys` lists the section 4 codes (J1 to J10) the story belongs to.

| ID | Title | Role (persona) | Area file | Status | Spec | Journeys |
|---|---|---|---|---|---|---|
| ADM-01 | _to be filled_ | _e.g. Org Admin (Sarah)_ | `stories/admin.md` | _ _ | `web/e2e/stories/admin/...story.ts` | |
| MKT-01 | _to be filled_ | _e.g. Marketing Specialist (Omar)_ | `stories/marketing.md` | _ _ | | |
| CON-01 | _to be filled_ | _e.g. Consultant (Anika)_ | `stories/consultant.md` | _ _ | | |
| PLT-01 | _to be filled_ | _e.g. Platform / any_ | `stories/platform.md` | _ _ | | |

Totals (to be filled): AUTOMATED __ , BLOCKED __ , NOT-BUILT __ .

## 3. Page coverage map (checks that no built page is left without a story)

Use this to find gaps once the index exists: every BUILT page should be referenced by at least one story in its area file; every DESIGNED page should have at most one `NOT-BUILT` story that asserts today's honest placeholder. Pages are listed by sidebar label; routes are `/w/<workspace>/<slug>`.

| Workspace | BUILT pages (need at least one story each) | DESIGNED pages (one `NOT-BUILT` story each, or none) | Expected area |
|---|---|---|---|
| Administration | Dashboard, Employees, Invitations, Teams, Departments, Roles & Permissions, Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Organization Branding | Subscription Overview, Consultant Licenses, Billing, Feature Usage, HR, Finance, Reports, Domains, Integrations, Audit Logs, Settings | ADM (licence and billing placeholders may live in PLT) |
| Marketing | Home, My Assigned Talent, Resumes, Job Discovery, Job Matches, Opportunities, Job Streams, Submissions, Applications, Interviews, Follow-ups, Tasks, Activity, Performance, plus extension "Save for consultant" | none | MKT |
| Consultant | Home, My Career Profile, My Resumes, My Marketer, Job Discovery, Job Matches, Assigned Opportunities, My Applications, Submissions & Approvals, Interviews, Interview Prep, Offers, My Placement, Availability, Tasks & Follow-ups, Activity Timeline, My Features, Notifications, Settings, plus extension assigned jobs and "I applied" | none | CON |
| Marketing Management | none | Home, Team, Assignments, Pipeline, Approvals, Workload, Escalations, Reports | PLT |
| HR | Employees (shared page) | Home, Onboarding, Documents (Policies), Compliance, Lifecycle, Offboarding, Candidates, Talent Pools, Reports | PLT |
| Finance | Placements (shared page) | Home, Subscriptions, Billing, Invoices, Timesheets, Approvals, Payments, Reports | PLT |
| Accounts | Clients, Interviews, Placements (shared pages) | Home, Contacts, Requirements, Submissions, Offers | PLT |
| Executive | none | Home, Reports | PLT |
| Cross-cutting | branded sign-in, Demo accounts tab, workspace switcher, 404 rule, tenant isolation (Acme vs Beta), unknown host, suspended / invited member, platform admin console `/admin/**` | custom domains, MFA, SSO, break-glass | PLT |

Notes for the story writers: (1) a shared page used inside a non-admin workspace (for example Placements under Finance) is a separate scope check and deserves its own story; (2) Sam (SUSPENDED) and Nina (INVITED) cannot sign in, so stories about them are seen from Sarah's side; (3) the Marketing Manager role has no workspace of its own: stories with "Sarah as manager" should say which workspace she uses.

## 4. Cross-role end-to-end journeys

A journey is a chain of stories across roles. Each step names the persona and the story it refers to **by pattern** (area plus subject), not by number, because the numbers do not exist yet. When the coordinator regenerates the index, replace each pattern with the real IDs and set the journey codes in the index table. A journey's own status is the weakest status among its steps (NOT-BUILT beats BLOCKED beats AUTOMATED).

Expected state today is given per journey; it comes from `01-product-goals-features-roadmap.md` and is **unverified** by a run.

### J1. Org onboarding, invite, role assignment
Goal: a new organization sets itself up and brings a person in with the right roles.
1. Sarah opens the dashboard and sees checklist, alerts and quick actions. Pattern: `ADM-*` dashboard.
2. Sarah brands the organization (logo, colours, welcome text), previews the login, publishes. Pattern: `ADM-*` branding; verify the sign-in page of Acme afterwards (`PLT-*` branded sign-in).
3. Sarah creates a team and a department, then invites a person with two roles, a team and a manager (single and bulk). Patterns: `ADM-*` teams / departments, `ADM-*` invitations.
4. The invitee accepts on the tenant host (`PLT-*` invite acceptance). **Expected: BLOCKED** for the real e-mail round trip; the seeded INVITED member (Nina) covers the "pending" view only.
5. Sarah checks the Employees page, opens the member's detail sheet, adjusts roles (ceiling rule: an Org Admin cannot grant admin-level roles). Patterns: `ADM-*` employees, `ADM-*` roles.
6. Edge cases: revoke and resend, expired invite, e-mail-match rule (409 `INVITE_EMAIL_MISMATCH`).

### J2. Job captured, assigned, consultant responds, applied, tracked (Release 1 core)
Goal: the Phase 1 pipeline from doc 60.
1. Omar opens a job page with the extension, chooses "Save for consultant...", types key info, picks Ben (and Anika), priority, due date. Pattern: `MKT-*` extension capture. **Expected: BLOCKED** for a live job site and the packed extension; the web-side substitute is `MKT-*` Job Discovery / Opportunities assign.
2. The job and the assignment appear for Omar (Opportunities, Activity). Patterns: `MKT-*` opportunities, `MKT-*` activity.
3. Ben gets a notification, opens Assigned Opportunities, marks viewed, asks a question or states interest or declines with a reason. Pattern: `CON-*` assigned opportunities, `CON-*` notifications.
4. Omar answers the question (`answer-info`); the consultant's state does not change by the marketer's action. Pattern: `MKT-*` opportunities.
5. Ben presses "Open job link", applies with his extension (or presses "I applied" where the extension does not detect). Pattern: `CON-*` apply and track. **Expected: BLOCKED** (live ATS).
6. The application appears in Ben's My Applications and, within the consent he gave, in Omar's Applications and Sarah's Applications. Patterns: `CON-*` my applications, `MKT-*` applications, `ADM-*` applications.
7. Rule checks inside this journey: a marketer can never set APPLIED or an application status (E1); at consent NONE no link or projection exists; a closed job answers 409 `JOB_NOT_OPEN`; assigning twice returns the existing opportunity.
8. Caution: two consultant "Assigned Opportunities" implementations exist (see `01` doubts, item 1). Step 3 must be run against the page the URL actually serves.

### J3. Resume approval, submission authorization, interview, offer, placement
Goal: the vendor / client track from approved resume to placement.
1. Ben (consultant) maintains a resume; Sarah or Omar reviews it in Resumes (approve / reject / reopen; no self-decision). Patterns: `CON-*` resumes, `MKT-*` resumes, `ADM-*` resumes.
2. Omar prepares a submission package for a job and requests approval; Ben approves or declines in Submissions & Approvals. Patterns: `MKT-*` submissions, `CON-*` submissions. Record-only: nothing is transmitted (E1). The consultant-side approval of vendor submissions is Phase 1b; the consultant page's rows are partly demo stand-ins.
3. The application moves through stages; interviews are scheduled (as records) and appear for Omar, Ben (with prep) and Sarah. Patterns: `MKT-*` interviews, `CON-*` interviews / interview prep, `ADM-*` interviews.
4. An offer is recorded and Ben responds. Pattern: `CON-*` offers. Accepting does not create a placement automatically (known gap).
5. A placement is created or extended; Ben sees My Placement without any bill rate; Sarah and Amara see it in Placements. Patterns: `CON-*` placement, `ADM-*` placements, `PLT-*` accounts / finance shared pages.

### J4. Assignment and workload
1. Sarah opens Marketing Assignments, sees capacity and overload (Acme demo has marketers at 90 percent and above), assigns an unassigned consultant to Omar, tries to exceed capacity and records an audited override, reassigns, unassigns, restores. Pattern: `ADM-*` marketing assignments.
2. Omar sees the new consultant in My Assigned Talent; Anika's "My Marketer" page shows her marketer. Patterns: `MKT-*` talent, `CON-*` my marketer.
3. Marketing Manager workload and approvals pages: **NOT-BUILT** (`PLT-*` marketing management).

### J5. Consent and visibility
1. Anika changes what she shares with the organization (Settings or Profile consent control). Pattern: `CON-*` settings.
2. Omar and Sarah's views change accordingly (SUMMARY versus FULL versus NONE); a request beyond consent gets `CONSENT_REQUIRED` (the only 403) and the consultant sees the request. Patterns: `MKT-*` applications / talent, `ADM-*` consultants.
3. Marketer notes are never shown to the consultant on My Applications. Pattern: `CON-*` my applications.

### J6. Licence and billing view
1. Sarah or Felix opens Subscription Overview, Consultant Licenses, Billing, Feature Usage. **Expected: NOT-BUILT** (pages are placeholders; the data layer is seeded: Acme 142 of 150 licensed). Pattern: `PLT-*` or `ADM-*` licence placeholders.
2. Anika's My Features shows allowances labelled Sample. Pattern: `CON-*` features.
3. Dashboard shows monthly spend from `org_spend_entry`, not from invoices. Pattern: `ADM-*` dashboard.
Re-classify J6 when the X5 and X6 stories ship.

### J7. Audit evidence and data lineage
1. After J2 step 1, an admin calls the per-job lineage endpoint `GET /api/orgs/{orgId}/audit/job-data` (API-level check; there is no Audit page: **NOT-BUILT** UI). The ledger shows CAPTURED then ASSIGNED with actor, extension version and payload hash, and no job text beyond the display cap. Pattern: `PLT-*` job data lineage.
2. Org audit events for roles, invitations, assignments and branding changes exist but the Audit Logs page is a placeholder; the dashboard's Recent Activity shows a slice. Pattern: `ADM-*` dashboard, `PLT-*` audit.
3. Beta's admin cannot read Acme's ledger (generic 404). Pattern: `PLT-*` isolation.

### J8. Tenant isolation and multi-role access
1. Bea signs in at Beta and sees Beta's branding and no Acme data; Sarah is refused at Beta (`NOT_A_MEMBER`); an unknown host shows the safe not-found page. Pattern: `PLT-*` isolation / unknown host.
2. Sarah holds two roles: switcher between Admin and (when live for her permissions) Marketing; menus differ by role. Pattern: `PLT-*` switcher.
3. Role boundaries: Omar typing an Admin URL gets "This isn't part of your role"; Anika cannot read marketer APIs (404 by design); the Org Admin gets 404 from consultant APIs. Pattern: `PLT-*` permission boundaries.
4. Suspended member (Sam) and invited member (Nina) are listed but cannot be opened. Pattern: `PLT-*` demo accounts.

### J9. Member lifecycle
1. Sarah suspends a member, reinstates, then runs the offboarding wizard (records kept, scheduled last day). Pattern: `ADM-*` employees lifecycle.
2. A suspended seat cannot act; sessions and licences follow (licence handling **NOT-BUILT**). Pattern: `PLT-*` lifecycle.

### J10. HR, Finance, Accounts and Executive record-only workspaces
1. Hana and Tomas (HR), Felix (Finance), Amara (Accounts), Eve (Executive) sign in and land on their workspace; built shared pages (Employees, Placements, Clients, Interviews) open; every other item shows "This page is on the way". All **NOT-BUILT** except the shared pages. Pattern: `PLT-*` role workspaces.
2. Under E2 these modules are record-only; the stories for the future pages should assert absence of identity-document, DOB and bank fields when they are built.

## 5. How to regenerate this file

1. Each story file should give every story a heading of the form `### <ID> <Title>` followed by fields `Role:`, `Status:`, `Spec:`, `Journeys:` (the format the story writers use is **unverified**; adapt the commands below if it differs).
2. Extract the rows, for example from the repo root:
   `grep -hE '^### (ADM|MKT|CON|PLT)-[0-9]+' docs/enterprise-v2/qa/stories/*.md`
   and the status lines with `grep -hE '^(Status|\*\*Status)' ...`.
3. Paste into section 2, recompute the totals, replace the pattern references in section 4 with real IDs, and set `Journeys` per story.
4. Cross-check section 3: every BUILT page appears in at least one story; every spec file named in the table exists under `web/e2e/stories/`.
5. After a Playwright run, take statuses from `web/test-results-stories/results.json` (test titles begin with the story ID) and downgrade any `AUTOMATED` story that failed or never ran to `BLOCKED (not yet run)`.
