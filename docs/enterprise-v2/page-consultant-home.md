# Page: Consultant Home (`/w/consultant`)

Board: `design/enterprise-consultant/home.webp`. Branch `ent-talent-consultant`. Everything on this page is the signed-in consultant's OWN data.

## Endpoint
`GET /api/orgs/{orgId}/me-workspace/home` (BFF: `web/src/app/api/orgs/[orgId]/me-workspace/home/route.ts`). One call draws the page.
- **Gate:** ACTIVE member holding `opportunities.respond` (Consultant role) AND linked to a `consultant_profile` (`member_id`). Anyone else, another tenant, or an org outside the roles flag: the same generic **404**. Org Admin / marketers have no consultant row, so they get 404.
- **Scope:** every query is `orgId` first + the caller's own `consultant_id`. No endpoint takes a consultant id.
- Code: `api/.../web/rest/ent/consultantws/ConsultantHomeResource`, `service/ent/consultantws/ConsultantHomeService` + `ConsultantHomeDTO`; web `components/ent/consultant-ws/HomePage.tsx`, `lib/ent/consultant-ws/home.ts`; route `web/src/app/(tenant)/%5Ft/w/consultant/{page,layout}.tsx` (the layout re-uses the workspace layout with the key fixed to `consultant`, so the shell is untouched).

## Real vs sample
| Block | Source | State |
|---|---|---|
| Tiles: Job Matches, Assigned Opportunities, Active Applications, Upcoming Interviews | `requirement_match`, `talent_application`, `talent_interview` (change = value now vs a week ago from row timestamps; sparkline = 6 cumulative weeks) | real |
| Active Placement | `talent_placement` ACTIVE | real |
| Recommended Job Matches | own matches not dismissed and not yet applied to, by score | real |
| Assigned Opportunities | own ASSIGNED matches; status: no application = Review Needed, application at ASSIGNED = Awaiting Approval, later stage = Interested | real (statuses derived) |
| My Applications | own `talent_application` | real |
| Upcoming Interviews | own SCHEDULED `talent_interview` | real; **mode (Video) is SAMPLE** (`talent_interview` has no mode column), flagged `modeSample` |
| Resume Strength | `profileCompleteness` ring; checks from profile email, resume experience rows, 3+ skills, `hasCertifications`, resume summary | real |
| Today's Focus | derived: new matches this week, interview within 3 days, application follow-up due, availability older than 30 days, tasks due today | real; check state is not persisted |
| Tasks & Follow-ups | NEW table `cws_task` (own, additive changelog `20261103010000_ent_cws_tasks.xml`) | real |
| **Submissions Pending Approval** tile | no table yet (Submissions & Approvals page + marketer role) | **SAMPLE** (0, marked "Sample") |
| **Messages from My Marketer** | cross-role (needs the marketer module) | **SAMPLE** (empty, marked "Sample") |

When the roles merge: replace the two sample blocks and interview mode with the shared tables/services.

## Demo data
`ConsultantWsDemoSeeder` (called from `EnterpriseDemoBootstrap` after the talent seed; idempotent, one-time per consultant who is a real seat: Anika, Ben, Sam) adds a believable pipeline (about 8 matches, 3 assigned, 6 applications across stages with CREATED events, 3 interviews) and 5 tasks. It adds rows to shared talent tables for those 3 people only. Demo login: **Anika Rao**.

## Shared-file edits (the only ones)
`api/.../config/EnterpriseDemoBootstrap.java` (one extra seeder call), `master.xml` (one include at the end), `OrgIsolationIT.COVERAGE` (one route row).

## Nav (needs the first machine; not changed here)
The boards' sidebar has 19 items; `workspaces.json` CONSULTANT has 13. Board order and labels: Home, My Career Profile, My Resumes, My Marketer, Job Discovery, Job Matches, Assigned Opportunities, My Applications, Submissions & Approvals, Interviews, Interview Prep, Offers, My Placement, Availability, Tasks & Follow-ups, Activity Timeline, My Features, Notifications, Settings. New vs today: My Marketer, Job Discovery, Submissions & Approvals, Availability, Tasks & Follow-ups, Activity Timeline (and renamed labels). Home links already point at `/w/consultant/{matches,opportunities,applications,interviews,interview-prep,resumes,availability,tasks,marketer,submissions,placements}`; those fall to the "page is on the way" state until built.

## Known gaps
Pixel polish against the board is not done (viewport screenshots through the in-app pane were too small to compare); Playwright journey `web/e2e/journeys/consultant-home.spec.ts` written, run result recorded in the progress tracker.
