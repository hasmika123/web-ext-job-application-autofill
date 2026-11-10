# Demo readiness - Acme Staffing (acme.localhost)

Checked 2026-10-16 on `version2` (prod build, real API + MySQL `dossier_ent_demo`), one Playwright crawl per persona: every page of each menu opened at 1440 and 390 px, console, network (4xx/5xx) and "on the way" text recorded. Pages answered in under 1 s once warm (the crawl waits 1.8 s on purpose).

## Logins
Nobody types a password. Open `http://acme.localhost:<port>/login`, tab **Demo accounts**, press **Sign in as <name>**. Persona keys (web/e2e/stories/_support/personas.ts, seeded by `EnterpriseDemoSeeder`; the demo password is seeder-owned and never shown): `sarah` (Org Admin + Marketing Manager, two workspaces), `omar` (Marketing Specialist), `anika` and `ben` (Consultants). Workspace switch: account menu (top right) -> Switch workspace (Sarah only).

## What was fixed today
| Gap | Fix |
|---|---|
| Marketing "Job Discovery" showed "This page is on the way" (the admin `jobs` route shadowed the catch-all) | Upstream routing fix kept on merge; page now shows 51 openings, tiles, filters, saved searches |
| `/tenant-assets/logo` 404 on every page (console error) | Demo seeder re-draws the published logo when its file is missing (idempotent) |
| Audit Logs placeholder / few rows | Audit demo rows seeder cherry-picked (`2932c511`) |

## Org Admin (Sarah, /w/admin)
| Page | Status |
|---|---|
| Dashboard, Employees, Invitations, Teams, Departments, Roles & Permissions, Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Branding, Settings | OK, populated (e.g. 153 consultants, 138 applications, 107 interviews), no console/API errors after the logo fix |
| Subscription, Licenses, Billing, Usage, HR, Finance, Reports, Domains, Integrations | "On the way" - out of scope; do not click in the demo |
| Audit Logs | Real page upstream; rows from the audit seeder |
| Invitations | One "Kiwiply account"-style wording hit flagged by the crawl; not changed |

## Marketing (Omar and Sarah, /w/marketing)
All 13 pages OK with data: Home, My Assigned Talent (34), Resumes, Job Discovery (51 openings), Job Matches (72), Opportunities (79), Job Streams, Submissions, Applications, Interviews, Follow-ups, Tasks, Activities, Performance. Gaps: Job Discovery "New Openings Today" is 0 (honest, jobs are 2+ days old); Job Streams and Marketing Home overflow slightly at 390 px (wide table scrolls the page) - demo at desktop width.

## Consultant (Anika, Ben, /w/consultant)
All 19 pages OK. Anika: placement page says "No active placement yet" (she is "On notice"); the seeder now also gives her one ended placement so Past Placements has a history (takes effect when the API restarts and the seeder runs; Ben stays the placed consultant). Ben has offers (5), interviews, prep score. The dead links are fixed in source (Settings points at `/me#security`; Inbox points at Anika's own Profile and the platform privacy page); the running demo build still has the Inbox `/privacy` and `/profile` links until it is rebuilt (no visible effect, 404 prefetch only).

## Suggested 15-minute order
1. Login page, Demo accounts tab, sign in as Sarah (1 min). 2. Admin Dashboard, Consultants, Resumes, Marketing Assignments, Applications, Placements, Branding (4 min). 3. Switch workspace to Marketing as Sarah, Home (1 min). 4. Sign out; as Omar: Assigned Talent, Job Discovery (search/filter, Assign), Matches, Opportunities, Submissions, Applications, Interviews (5 min). 5. Sign out; as Ben: Home, Job Discovery, Matches, Applications, Interviews, Offers, Placement (3 min). 6. Close on Anika's My Marketer page (1 min).

## Not verified
Full story suites (admin/marketing/consultant) were not run to completion: stopped on instruction. Three platform stories failed before that: PLT-05 (stale text "Org Admin" vs "Organization Admin"), PLT-10 (caption collides with the "Switch workspace" locator), PLT-12 (one transient "couldn't load your workspace" for Anika; not reproduced in the crawl).

## Resume builder (walked in a real browser 2026-10-16, demo stack :3200, Chrome, 1440 px; editor also at 390 px)
| Step | Result |
|---|---|
| Anika, My Resumes, Create New Resume, chooser with four sources | OK. Profile card counts her profile (2 roles, 5 skills), Upload says PDF, DOCX or TXT, Copy lists her resumes with Built/Record tags |
| From profile / Upload PDF / Upload DOCX / Copy / From scratch | All created a resume and opened the editor at `/w/consultant/resumes/{id}` inside the Acme shell (Acme logo and menu, no Kiwiply link). Uploads read the file in the browser ("We found 2 roles, 1 school, 5 skills") and showed the review step |
| Edit a field and wait | "Saved" chip next to "PDF updating"; the info line reads "<date> / just now by you" (there is no literal "Updated by" text); the list afterwards shows the row "by Anika Rao" |
| Menu and settings | More actions offers Rename, Duplicate, Save version, Version history, Resume settings. No Share, Delete, Rewrite, Tailor, Upgrade or Visibility text on the page |
| Editor at 390 px | Works (Edit/Layout/Insights/Preview tabs at the bottom). The top bar put "PDF updating" before the close button; fixed in source (it now follows the save chip), not visible on the running build until rebuilt |
| Console and network | No console errors and no 4xx/5xx during any step |
| Omar, Resumes, New resume for... | Opens, but all 33 assigned consultants are greyed out ("Needs an organization account"): Acme is a shared-accounts organization, so a marketer can not act for a consultant there (decision O4). The dialog now says so in one sentence instead of 33 disabled rows (source fix). **Do not demo MKT-47/48 or CON-84/85 on Acme**: they need the Gamma organization (separate accounts) and `GAMMA_DEMO_PASSWORD`, which this run did not have. Not verified in a browser. |

Leftovers on the demo database from this walk (a consultant can not delete a managed resume, by design): five resumes named "Demo profile", "Demo pdf", "Demo docx", "Demo scratch", "Demo copy" under Anika. Rename or ignore them.

## Consultant pages as Anika and Ben (20 routes each including Home, 1440 px)
All 40 loads answered 200 in under 4.3 s with no console errors, no failed API calls and no "on the way" text. Honest empty states only: Home "No messages yet", My Marketer "No shared plan yet", My Applications "No change to compare yet", Availability "no screen on their side yet", and Anika's Placement "No active placement yet". The Marketing workspace (Omar, 14 routes) has no dead links or failed calls either.
