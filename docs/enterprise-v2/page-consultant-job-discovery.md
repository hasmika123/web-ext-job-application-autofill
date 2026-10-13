# Page: Consultant Job Discovery (`/w/consultant/job-discovery`)

Board: `design/enterprise-consultant/job-discovery.webp`. Branch `ent-talent-consultant`. The jobs are the OPEN `client_requirement` rows of the caller's own organization; everything else (bookmarks, searches, scores) is the signed-in consultant's OWN data.

## Gate (every endpoint)
`JobDiscoveryService` calls `ConsultantHomeService.requireSelf(me)`: ACTIVE member holding `opportunities.respond` (Consultant role), roles-from-data flag on, linked to a `consultant_profile` (`member_id`). Anyone else, another tenant, or a missing job id: the same generic **404** (never 403). No endpoint takes a consultant id. Every repository call takes `orgId` first (`CwsJobSearchRepository` is a marker `Repository`, so there is no unscoped `findById`).

## Endpoints (`/api/orgs/{orgId}/me-workspace/job-discovery/...`, BFF mirror under `web/src/app/api/orgs/[orgId]/me-workspace/job-discovery/**`)
| Method + path | What |
|---|---|
| `GET /overview` | filter options (from what is actually open), recommended filter chips, trending skills, saved searches (with "N new results"), last 5 recent searches |
| `GET /search?q&location&jobType&workMode&experience&industry&skill&clientId&minRateMinor&sort&page&size&minScore` | paged search in the DB; `size` capped at 50 (default 10); `sort` = `match` (default) / `newest` / `rate`; `minScore` powers the Recommended tab |
| `GET /jobs/{requirementId}` | detail: description, open positions, what Apply would do. A closed job is visible only if the consultant has a match/application on it |
| `POST /saved/{requirementId}` / `DELETE /saved/{requirementId}` | bookmark toggle on the existing `cws_saved_job` table (idempotent; unknown / other-tenant id = 404) |
| `POST /jobs/{requirementId}/apply` | Apply intent only (see below) |
| `POST /saved-searches` `{name, filters}` | save a search (max 10, duplicate name 409, empty filters 422, PII 422 `SENSITIVE_CONTENT`) |
| `DELETE /saved-searches/{id}` | own saved search only, else 404 |
| `POST /saved-searches/{id}/viewed` | restarts that search's "new results" counter |
| `POST /recent-searches` `{filters}` | remembers a run search; deduplicated (same search moves to the top, latest spelling kept), keeps the latest 5 |

Code: `web/rest/ent/consultantws/JobDiscoveryResource`, `service/ent/consultantws/{JobDiscoveryService, JobDiscoveryDTO}`, `repository/ent/consultantws/{CwsJobSearchRepository, CwsSavedSearchRepository}`, entity `domain/ent/consultantws/CwsSavedSearch`. Web: `components/ent/consultant-ws/JobDiscoveryPage.tsx`, `lib/ent/consultant-ws/{jobDiscovery.ts, jobDiscovery-bff.ts}`, route `app/(tenant)/%5Ft/w/consultant/job-discovery/page.tsx`.

## How the numbers are computed (all real, none placeholder)
- **Search:** one JPQL query over `client_requirement` (`org_id = caller's`, `status = 'OPEN'`) with optional filters: text (title, description, any required skill, client name; LIKE wildcards are escaped), location (a city label; typing "Remote" means work mode REMOTE), job type, work mode, experience, client, industry (via `client_account.industry`), skill (exact), minimum hourly rate (the job's hourly ceiling is at least the value). `newest`/`rate` page in the DB. **`match` (and Recommended) scores a bounded window: the newest 500 matching jobs** are scored in memory and ordered by score, because the score is not a column; the total shown is the true DB count when no `minScore` is set (so with more than 500 matching jobs "Best Match" is "best among the newest 500").
- **Match ring:** the consultant's own `requirement_match.score` for that job when one exists (`scoreSource = MATCH`); otherwise the **share of the job's required skills the consultant has** (`consultant_skill` vs `requirement_skill`, case-insensitive; `SKILLS`). If the job has no skills or the profile has none, the score is `null` and the card says "Not scored" (no number invented). Label bands: 90+ Excellent, 80-89 Great, 70-79 Good, below Potential. The sentence under the label says where the number comes from ("You have 2 of 3 required skills").
- **Featured:** posted in the last 7 days. **Rate:** `rate_min_minor`/`rate_max_minor` with `rate_unit`, formatted client side from minor units with `formatMinor` (`$95 - $120/hr`).
- **Recommended Filters:** the consultant's preferred work mode (only if open jobs have it), the most common open employment label, an hourly-rate floor (median of open hourly rate floors, rounded down to $5, needs 3+ hourly jobs), up to 4 of the consultant's own skills that appear in open jobs (else the top 3 open skills, marked `market`), and the most common industry. Capped at 8. Clicking applies the filter (clicking again removes it).
- **Trending Skills:** the 5 most-requested skills across OPEN jobs; demand change = postings (jobs of any status carrying the skill) in the last 30 days vs the 30 days before. The change is shown only when the earlier window has at least 3 postings (else the row shows "N open jobs"); the whole card is an honest empty state when there are fewer than 5 open jobs or fewer than 3 skills.
- **Saved search "N new results":** open jobs matching it that were posted after the later of "saved" and "last viewed" (`last_used_at`). Running it from the page calls `/viewed` and restarts the count.

## Apply (documented, minimal; Kiwiply never submits)
The Apply button opens a confirm dialog that always states "Kiwiply never submits an application for you". Server rules in `JobDiscoveryService.applyIntent`:
- no `requirement_match` and no `talent_application` for this consultant and job: nothing is recorded; the answer is `NEEDS_ASSIGNMENT` ("must be assigned or approved by your marketer first"); the dialog offers no confirm button.
- a match or assignment exists: one follow-up task "Confirm application: <title> at <client>" is added to the consultant's own `cws_task` list (HIGH, due in 2 days), idempotent while that task is open. No application, submission or event row is created.
- an application already exists: `ALREADY_APPLIED`, nothing recorded.

## Components and states
`PageHeader` + `ClaimsMascot`/`ClaimsHelpCard` (one bee); tabs Search Jobs / Saved Searches / Recommended for You (`@kiwiply/ui` `Tabs`); search + location boxes; seven filter `Select`s, Clear All, More Filters (which holds "Save this search"); Recommended Filters chips; "Showing N opportunities" + Sort by; job cards (company mark, title, client, place, type, duration, rate, skills, Featured pill, ring via `DonutChart`, Save/View/Apply); View opens a `SideSheet` (full screen on phones); Apply opens a `Dialog`; right rail: `BeeCard` ("Ask a question"), Saved Searches, Trending Skills, Recent Searches (`Card`, `Pill`, `Menu`). Loading skeletons, honest empty text for every block, retry on failure, 404 -> "This page isn't part of your role". Phone (390px): cards, filters and rail stack, no horizontal page scroll.

## Real vs SAMPLE
Everything on this page is real data. There is **no SAMPLE block**: the only cross-role fact used is whether the consultant already has a `requirement_match` / `talent_application` on a job (read-only, own rows). Nothing from the marketer's module is invented.

## New table (additive)
`api/src/main/resources/config/liquibase/changelog/20261103050000_ent_cws_job_discovery.xml` (NOT registered in `master.xml`; the integrator adds one `<include>` at the end). Table `cws_saved_search`: `org_id`, `consultant_id`, `kind` (`SAVED` / `RECENT`), `name`, plain filter columns (`keyword`, `location`, `job_type`, `work_mode`, `experience`, `industry`, `skill`, `client_id`, `min_rate_minor`; no JSON), `created_at`, `last_used_at`. Composite tenant FKs to `consultant_profile` and `client_account`, index starting with `org_id`, no PII columns, empty rollback. Free text is scanned with `SensitiveContent` (422 `SENSITIVE_CONTENT`). The existing `cws_saved_job` and `cws_task` tables are reused.

## Demo data
`ConsultantWsJobDiscoveryDemoSeeder.seed()` (public, idempotent, `@Service`; the integrator calls it from `EnterpriseDemoBootstrap` after the talent seed): for Anika/Ben/Sam only (consultants with `member_id`), in the two demo orgs, if the consultant has no saved/recent search and no saved job: 3 saved searches, 4 recent searches, 2 bookmarked open jobs. Jobs, skills, matches and trending numbers come from the talent seed.

## OrgIsolationIT rows to add (`COVERAGE`, same shape as the Home row, `World::makeOwnerAConsultant` fixture)
```
GET    /api/orgs/{orgId}/me-workspace/job-discovery/overview
GET    /api/orgs/{orgId}/me-workspace/job-discovery/search
GET    /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{requirementId}
POST   /api/orgs/{orgId}/me-workspace/job-discovery/saved/{requirementId}
DELETE /api/orgs/{orgId}/me-workspace/job-discovery/saved/{requirementId}
POST   /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{requirementId}/apply
POST   /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches
DELETE /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}
POST   /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}/viewed
POST   /api/orgs/{orgId}/me-workspace/job-discovery/recent-searches
```
`JobDiscoveryResourceIT` itself already asserts the generic 404 for another org's owner/consultant, a non-consultant, a profile-less consultant seat and the flags off on all ten routes.

## Known gaps
- No pixel-polish pass against the board yet and no Playwright journey/screenshots (not run: no real stack was available to this task).
- "Best Match" ordering is over the newest 500 matching jobs (see above).
- There is no "saved jobs only" filter yet (the bookmark is shown on each card; Job Matches also reads `cws_saved_job`).
- "Rate" sort orders by the job's maximum rate regardless of unit (hourly vs yearly jobs mix); the minimum-rate filter applies to hourly jobs only.
- The Rate / Compensation filter offers fixed hourly steps ($50-$150+/hr).
- Sidebar: the nav item "Job Discovery" and the `workspaces.json` entry are for the integrator.
