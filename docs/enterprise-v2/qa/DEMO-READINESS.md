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
All 19 pages OK. Anika: placement page says "No active placement yet" (she is "On notice"; demo Ben for a placed consultant). Ben has offers (5), interviews, prep score. Settings page logs one 404 (`/settings` prefetch) and Inbox two (`/privacy`, `/profile` links) - invisible to the audience.

## Suggested 15-minute order
1. Login page, Demo accounts tab, sign in as Sarah (1 min). 2. Admin Dashboard, Consultants, Resumes, Marketing Assignments, Applications, Placements, Branding (4 min). 3. Switch workspace to Marketing as Sarah, Home (1 min). 4. Sign out; as Omar: Assigned Talent, Job Discovery (search/filter, Assign), Matches, Opportunities, Submissions, Applications, Interviews (5 min). 5. Sign out; as Ben: Home, Job Discovery, Matches, Applications, Interviews, Offers, Placement (3 min). 6. Close on Anika's My Marketer page (1 min).

## Not verified
Full story suites (admin/marketing/consultant) were not run to completion: stopped on instruction. Three platform stories failed before that: PLT-05 (stale text "Org Admin" vs "Organization Admin"), PLT-10 (caption collides with the "Switch workspace" locator), PLT-12 (one transient "couldn't load your workspace" for Anika; not reproduced in the crawl).
