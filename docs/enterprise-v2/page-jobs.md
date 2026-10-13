# Page: Jobs (`/w/admin/jobs`)

> Branch `ent-jobs` (cut from `ent-talent`). Board: `design/enterprise-talent/jobs.png`. Data: `docs/enterprise-v2/talent-foundation.md` (a job is a
> `client_requirement` row, plus `requirement_skill`, `requirement_match`, `talent_application`). Owner docs: 31, 34, 38.

## What it does

KPI tiles (Open Jobs, New This Week, Assigned Opportunities, High Match Jobs: value, honest "vs last period" delta, 8-week sparkline), a searchable
filterable sortable paged list (10 per page) with skill chips, submissions, best matches, status and posted date, a row menu, bulk status change, a
Create Job dialog, and a detail drawer (Overview / Top Matches / Submissions / Activity) with Assign buttons and the help bee. On a phone the rows are
cards and the drawer is a bottom sheet. Filters, sort, page, the open job and its tab live in the address (`?status=OPEN&q=react&page=2&job=12&tab=matches`).

## API (`OrgJobResource`, all under `/api/orgs/{orgId}/jobs`)

| Call | Needs | Notes |
|---|---|---|
| `GET /` | `clients.view` or `pipeline.view` | `q`, repeatable `status`, `clientId`, `location`, `workMode`, `skill`, `employment`, `experience`, `minMatch`, `sort` (posted, title, client, status, submissions, match), `dir`, `page`, `size` (1 to 100, default 10); `X-Total-Count`. A comma is never a separator ("New York, NY"). |
| `GET /summary` | view | the four tiles + weekly series, the filter facets with counts, `clientOptions` (only for a caller who may create), `access`. |
| `GET /{jobId}` | view | facts, contact, every match (score, reason, status), submissions, activity (application events + `JOB_*` audit rows); `ETag` = version. |
| `POST /` | `requirements.manage` + `Idempotency-Key` (required) | 201; audit `JOB_CREATE`. |
| `PATCH /{jobId}` | `requirements.manage` + `If-Match` (428 / 412) | autosave; audit `JOB_STATUS` (status) and `JOB_UPDATE` (the rest); a no-op writes nothing. |
| `POST /bulk/status` | `requirements.manage` + `Idempotency-Key` (required) | up to 100 ids; other tenants' ids are skipped as `NOT_FOUND`; each result carries the previous status (Undo); audit `JOB_STATUS` per job + `JOB_BULK`. |
| `POST /{jobId}/matches/{matchId}/assign` | `opportunities.manage` (ASSIGNED scope: only consultants the caller markets) | opens a `talent_application` (stage ASSIGNED, code `APP-yyyy-nnn`) + its `CREATED` event, marks the match ASSIGNED; a replay answers the same application (`alreadyAssigned`); 409 `JOB_NOT_OPEN`, `MATCH_STATE`, `CONSULTANT_UNAVAILABLE`; audit `JOB_ASSIGN`. |
| `PATCH /{jobId}/matches/{matchId}` | `opportunities.manage` | `DISMISSED` or `SUGGESTED` (the Undo); audit `JOB_MATCH_DISMISS` / `JOB_MATCH_RESTORE`. |

Every refusal (no key, other tenant, unknown id, closed organization for a write, roles not read from data) is the generic 404. Free text goes through
the sensitive-data scanner (422), HTML angle brackets are refused, an unknown JSON property is refused, nothing carries a phone, birth date, document or
bank number. `OrgIsolationIT` has all eight routes in its registry (hostile callers, cross-tenant row ids, one audit row per mutation).

## KPI formulas (`JobKpis`, pure and unit tested; "now" = request time UTC)

- Open Jobs = status OPEN; last month = jobs open at now-30d (`posted_at <= at` and OPEN now, or FILLED / CLOSED after `at`).
- New This Week = posted in the last 7 days; last week = the 7 days before (always compared; percent is null when the previous count is 0).
- Assigned Opportunities = matches ASSIGNED; last month = those assigned before now-30d.
- High Match Jobs = jobs with a live match >= 90 (dismissed matches never count); last month = the same for jobs posted before now-30d.
- The three month-based tiles have **no previous and no delta** when the organization has no job older than 30 days (no history to compare with).
- Sparklines: 8 weekly points computed from the same rows (open-at-week-end, posted per week, assigned-by-week-end, high-match-by-week-end).

## Web

`web/src/components/ent/jobs/` (`JobsPage`, `KpiTiles`, `JobsList` + `Pagination`, `JobDrawer`, `EditForm`, `CreateJobDialog`, `HelpBeeCard`, `parts`,
`useJobDetail`), `web/src/lib/ent/jobs.ts` (types, URL mapping, helpers, client), `jobs-bff.ts` + `app/api/orgs/[orgId]/jobs/[[...path]]/route.ts`,
page `app/(tenant)/_t/w/[workspace]/jobs/page.tsx` (Admin workspace only; Marketing's "Job Discovery" keeps its "on the way" page).
Only `@kiwiply/ui` primitives and icons, tenant `--brand-*` / v2 token classes, initials avatars (no photos exist), one bee (the drawer's card, or the
list's when the drawer is closed). Inline edits autosave (selects at once, text on blur or Enter, skills after a short rest) with a status line and no
Save button; status changes and dismissals have an Undo toast; Create Job is a dialog with one Idempotency-Key per opening.

## Real vs empty state

Real: every tile, row, facet, match, submission and activity line comes from rows; every button writes through the API. Honest empty states: a job with no
matches shows "No matches yet"; no history = no delta; no contact / rate / duration = "Not set / Not stated"; the help bee's "Ask a question..." opens the
shared help list (no assistant exists yet).

## Known gaps and decisions

- The board's sidebar item is **hidden until the Marketing module flag is live**: the nav entry carries `"module": "marketing"` and `flag.enterprise.marketing`
  is still a deferred key (`EnterpriseSettingKeys`), so no organization can switch it on. The page itself works at `/w/admin/jobs`. Making the module live is
  one shared change for all five talent pages (move the key from `d` to `k`, allow-list it in `EnterpriseDemoSeeder.enableFlags`, adjust the deferred-key tests).
- "View All Matches" switches to the Top Matches tab (no separate page); a match's "..." menu offers Dismiss (with Undo), not "view consultant" (the
  Consultants page belongs to another branch).
- Assign has no Undo (it opens an application); the toast names the application code. Withdrawing is the Applications page's job.
- Sorting and paging are cut in memory after the SQL filter (fine for an organization's job board, tens to a few hundred rows); a very large board would
  need a keyset query.
- The list is not scoped per marketer: jobs are organization demand data (`clients.view` / `pipeline.view` see all of them). Assign at TEAM / DEPARTMENT scope
  is treated like ORG (consultants are mostly not seats, so the seat-based team check has nothing to evaluate); ASSIGNED scope is exact.
- The web mock API (`dev:demo`) has no jobs data: the page needs the real stack.
- Interviews, Clients and Placements pages are not part of this branch.
