# Marketing workspace: Job Discovery (`/w/marketing/jobs`)

Branch `mkt-jobs` (from `ent-talent-marketer`). Board: `design/enterprise-marketer/jobs.webp`. Rules: `mkt-page-brief.md`.

## What it is
The marketer's job search: five KPI tiles, a search bar and filter row, the Job Openings table (or cards), Trending Skills, Top Clients Hiring,
Recent Job Alerts, and in the right column the bee help card, the marketer's Saved Searches and the Watched Job Streams. One call draws the board.

## Endpoints (`/api/orgs/{orgId}/mkt/jobs`, all through `MktScope`; generic 404, never 403)
| Method + path | Permission | What |
|---|---|---|
| `GET /` | `matches.run` | The board: `{kpis, items, total, page, size, canAssign, facets, trendingSkills, topClients, alerts, savedSearches, streams}`. Params: `q`, `skills` (comma list, any), `location`, `workType` (ON_SITE/HYBRID/REMOTE), `visa`, `source`, `rateMin`/`rateMax` ($/hour; a yearly rate is compared as year/2080), `sort` (`posted_desc` default, `posted_asc`, `rate_desc`, `title_asc`, `client_asc`), `page` (0-based), `size` (cap 100, default 8). |
| `GET /{jobId}` | `matches.run` | One job: description, employment, duration, experience, best matches among the consultants the caller may see. |
| `GET /{jobId}/candidates?q=` | `opportunities.manage` | The assignment picker: the caller's ACTIVE consultants (scope-filtered), best match first. |
| `POST /{jobId}/assign {consultantId}` | `opportunities.manage` | Creates or updates the consultant's `requirement_match` for the job in ASSIGNED (`assigned_by_member_id`, `assigned_at`; audit `MKT_JOB_ASSIGN`). A RECORD only (E1): no application, no submission, nothing sent to a client. Idempotent. 404 for a consultant outside the caller's scope, a missing job/consultant; 409 `JOB_NOT_OPEN`. |
| `POST /saved-searches {name, criteria}` | `matches.run` | Save the filters (<= 50 per person; name <= 80; text scanned for sensitive data; 422 `ORG_INVALID` / `ORG_LIMIT_REACHED`). |
| `POST /saved-searches/{id}/seen` | `matches.run` | The caller looked at it: "N new" counts again from now. Only the owner's own search, otherwise 404. |
| `DELETE /saved-searches/{id}` | `matches.run` | Delete the caller's own search (anyone else's: 404). |

## Tables (`20261104070000_mkt_jobs.xml`)
- `mkt_job_meta` (org_id, requirement_id UNIQUE per org, source_label, priority HIGH/MEDIUM/LOW, visa_label): the Source, Priority and Visa the shared `client_requirement` lacks. A job with no row reads as source "Client Portal", priority MEDIUM, no visa.
- `mkt_saved_search` (org_id, owner_member_id, name, criteria JSON text, created_at, last_seen_at): "N new" is counted live (open jobs matching the criteria and posted after `last_seen_at`, or `created_at` when never seen).
Both: org FK, composite tenant FK `(org_id, parent)`, every index starts with `org_id`, precondition-guarded, no sensitive data. Entities in `domain/ent/mkt`, repositories in `repository/ent/mkt` (bare `Repository`, every method takes `orgId` first: `MktJobMetaRepository`, `MktSavedSearchRepository`, `MktJobMatchRepository` over `requirement_match`).
`MktJobsDemoSeeder` (an `ApplicationRunner` after `EnterpriseDemoBootstrap`, same `DEMO_ENABLED` + `ENT_DEMO_SEED` gate, demo tenants only, idempotent): every job without meta gets a source / priority / visa; each marketer seat gets 5 saved searches (created 10-58 days ago, last seen 3-20 days ago so "N new" and "vs last month" are real).

## Real data behind the board
- **Job Openings (n)**: `client_requirement` with status OPEN (filtered in memory; fine for hundreds of jobs). Rate text is the job's own `rate_min/max_minor`, `rate_unit`, `currency`.
- **New Openings Today**: open jobs posted in the last 24 h; vs the 24 h before; sparkline = 8 daily buckets. **High-Match Openings**: open jobs with a not-dismissed match >= 90 for a consultant the caller sees; vs the same set posted a week or more ago; 8 weekly buckets. **Jobs Assigned**: ASSIGNED matches of visible consultants; vs a week ago; running total per week. **Saved Searches** (tiles 4 and 5 of the board): the caller's count, vs a month ago, running total per week. A delta whose previous value is 0 is omitted.
- **Trending Skills**: open jobs per skill (`requirement_skill`), trend = jobs posted in the last 30 days vs the 30 before. **Top Clients Hiring**: clients by open jobs, top 3 skills, trend = open now vs open 30 days ago. **Watched Job Streams**: the five clients with the most open jobs; subtitle = the client's industry ("All Openings" when blank), "n new jobs this week", status from `client_account.status`. **Recent Job Alerts**: clients that posted jobs this week, plus saved searches with new matches. Trending/Clients/Alerts return 10; the board shows 5 and "View all" opens the rest.
- Scope: jobs are the org's; everything that depends on a consultant (High-Match, Jobs Assigned, match list, picker, assign) only counts/shows consultants in `MktScope.View`.

## Web
`web/src/components/ent/marketer-ws/jobs/` (`JobDiscoveryPage.tsx`, `JobsParts.tsx` with the View and Assign drawers), `web/src/lib/ent/marketer-ws/jobs.ts`, BFF `web/src/app/api/orgs/[orgId]/mkt/jobs/**` (7 route files), dev mock `web/scripts/mock-mkt-jobs.mjs` (the board's rows, 342 openings, 12 saved searches), art in `web/public/ent/marketer/jobs/` (client and source logos, alert icons, saved-search art, bee banner: all cropped from the board).
Buttons: **View** opens the details drawer; **Match** links to `hrefs.matches?job=<id>` (the Job Matches page); **Assign** opens the picker drawer (hidden when `canAssign` is false) and POSTs only to `/assign`.

## Known gaps / decisions
- The board's 4th tile has no title and the 5th shows only its title, art and sparkline: drawn as the board shows them; tile 4 carries the saved-search count, tile 5 the weekly trend of the same data.
- The visa filter reads `mkt_job_meta.visa_label` (no visa column exists on the shared table); jobs without a meta row have none.
- A saved search stores one location string (a text match), so a board row like "Location: NY, NJ, PA" is one criteria string.
- Real client logos do not exist in `client_account`, so the API returns `logoUrl: null` and the page draws initials; the mock returns the board's cropped art.
- `Idempotency-Key` is not used: Assign is naturally idempotent (upsert on the unique match pair).
- ITs (`MktJobsIT`) were written and compiled but not executed (no Docker).
