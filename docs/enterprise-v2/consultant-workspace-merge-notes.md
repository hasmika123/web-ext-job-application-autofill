# Consultant workspace: merge notes for the first machine

Branch `ent-talent-consultant` (on GitHub), cut from `ent-talent` at `3df7a684`. All commits are authored as `hasmika123`.
Scope: all **19 consultant pages** (`/w/consultant/**`) from the boards in `design/enterprise-consultant/*.webp`, built end to end
(screen, BFF route, API, migration, demo seeder, tests). Per-page contracts: `docs/enterprise-v2/page-consultant-<slug>.md`;
the job-link flow: `consultant-job-source-flow.md`; the agent brief used to build them: `consultant-page-agent-brief.md`.

## Pages (route -> doc)
home, profile, resumes, marketer, job-discovery, matches, opportunities, applications, submissions, interviews, interview-prep, offers,
placements (board: My Placement), availability, tasks, activity-timeline, features, notifications, settings. The sidebar order and labels
follow the boards (19 items in `workspaces.json`, section 5.4 of `16-ui-ux-page-inventory.md`).

## Existing files this branch edits (everything else is new files)
| File | Change |
|---|---|
| `api/.../liquibase/master.xml` | 17 includes at the end (`20261103*_ent_cws_*.xml`, after `ent_talent`) |
| `api/.../config/EnterpriseDemoBootstrap.java` | calls the 17 `ConsultantWs*DemoSeeder`s after the talent seed (one list, dependency order) |
| `api/.../config/ent/workspaces.json` | CONSULTANT nav: 13 -> 19 items, five labels aligned to the boards |
| `docs/enterprise-v2/16-ui-ux-page-inventory.md` | section 5.4 table matches the menu (the doc-sync test requires it) |
| `api/.../WorkspaceServiceTest.java` | the consultant menu keys it pins |
| `api/.../OrgIsolationIT.java` | ~95 consultant routes in `COVERAGE`, fixtures in `World`, a few `uri()` rewrites by route prefix, helpers `Case.consultantRead/consultantWrite/consultantWriteFor` |
| `packages/ui/.../Charts.tsx` | `DonutChart`: optional `legend` (default true) and `totalSuffix` props, additive |
| `docs/enterprise-v2/progress-tracker.md` | log lines |

## Database
- 32 new `cws_*` tables, all org-owned (`org_id` NOT NULL, composite tenant FKs, org-first indexes, no PII columns, no JSON columns).
- **Two additive changes to shared talent tables** (a unique key the new composite FKs need): `uk_talent_interview_org_id` on `talent_interview`
  (`20261103070000`) and `uk_talent_placement_org_id` on `talent_placement` (`20261103150000`). Both are precondition-guarded.
- `client_requirement` is **not** changed: the marketer's job source link and quick info live in `cws_job_source`.
- Migration timestamps are `20261103xxxxxx`; if another branch used the same stamps for different files, rename ours, never edit an applied one.

## Things to replace with the real modules at merge (all marked `Sample` on screen, `sample:true` / `sample_data` in the data)
| Page | Stand-in now | Real source later |
|---|---|---|
| My Marketer | replies badge, messages, shared action plan, collaboration notes; Send Message / Schedule Call open an honest "not connected" dialog | marketing workspace messaging and plan |
| Assigned Opportunities | priority and due date are derived (score, assignment + 14 days) unless a `cws_opportunity_response` row stores them | marketer assignment |
| Submissions & Approvals | the marketer-created rows, notes and client updates are seeded in `cws_submission` | marketer "prepare submission" writes the row; nothing moves a row to "submitted to client" yet |
| Offers | offers and their timeline are seeded in `cws_offer` / `cws_offer_event`; accepting does not create a placement | employer/ops offers; placement start |
| My Placement | manager, project, schedule, milestones, meetings, checklist, activity are seeded (`cws_placement_*`); no bill rate is ever shown | employer/ops/HR side |
| Tasks | "assigned by a marketer" label is a stand-in (`cws_task_detail`) | marketer tasks |
| Availability | APPROVED/PENDING on vacation entries is a stand-in (approval is the marketer's step) | marketer approval |
| My Features | feature list, statuses, allowances, premium flags, credits tiles | `EntitlementService` / the admin catalog (`ConsultantFeaturesService.catalog()`) |
| Job Discovery / Matches / Opportunities | job source link + quick info are seeded in `cws_job_source` (`https://jobs.example.com/...`) | marketer enters the link; the extension creates the application when the consultant applies |
| Notifications | the feed is generated from the consultant's own rows (no other producer yet) | modules that publish their own notifications |

## Product decisions encoded
- Kiwiply never submits and has no auto-apply: the consultant opens the source link and applies with the extension; status comes from tracking.
  A full in-app job search is a later phase (the in-app Apply endpoint was removed).
- No sensitive PII anywhere (no phone, DOB, ID or bank data); money on Offers/Placements is record-only and the consultant never sees a bill rate.
- No SMS/email/push is ever sent; SMS preferences are not selectable; connected tools and password/2FA are not faked on Settings.

## Hard-coded defaults that should become admin config
Interview-prep module catalog, practice questions and checklist (`InterviewPrepCatalog`); the submission checklist text; task type labels and the
500-task cap; `MAX_RESUMES = 50`; the feature catalog and recommended tools/tips; the Resumes/Placement "Helpful resources" labels.

## Access model (every consultant endpoint)
`ConsultantHomeService.requireSelf`: roles-from-data on, permission `opportunities.respond`, an ACTIVE member linked to a `consultant_profile`
(`member_id`); anything else, another tenant, or flags off is the same generic 404. No endpoint takes a consultant id from the client.
Writes additionally check the family permission (`resumes.manage`, `submissions.authorize`, `offers.respond`, `interviews.manage`, `features.view`,
`self.share_scope.set`) where the page's write belongs to one.

## What to test after merging
- `OrgIsolationIT` (10 tests), `WorkspaceDocSyncTest`, `WorkspaceServiceTest`, `MeTenantResourceIT`, and each `*ResourceIT` under
  `api/src/test/.../web/rest/ent/consultantws/`.
- Web: `npx vitest run src/lib/ent/consultant-ws src/components/ent/consultant-ws` (373 tests).
- Real stack: `web/playwright.real.consultant.config.ts` (24 journeys: every page at 1440 and 390, the 19-item sidebar, Org Admin gets 404, another tenant
  cannot read). Demo logins: Anika Rao and Ben Okafor (Sam Whitfield is suspended); only they have seeded consultant data.
- Not run by me: the full Gradle `test` suite and the full web `npm test`. `mascot-isolation.test.ts` can time out under load (passes alone).

## Known gaps
Pixel-exact match against the boards is close, not exact. The extension step that turns "applied via the link" into an application is not part of this branch.
Some table filtering/paging runs in memory over one consultant's rows (Tasks, Activity Timeline, Offers compare), capped as documented per page.
