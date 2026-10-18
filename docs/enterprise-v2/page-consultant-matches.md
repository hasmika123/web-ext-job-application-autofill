# Page: Consultant Job Matches (`/w/consultant/matches`)

Board: `design/enterprise-consultant/matches.webp`. Branch `ent-talent-consultant`. Everything on this page is the signed-in consultant's OWN data.

## Endpoints
All under `/api/orgs/{orgId}/me-workspace/matches` (BFF: `web/src/app/api/orgs/[orgId]/me-workspace/matches/**`). Class `JobMatchesResource`, service `JobMatchesService`, DTOs `JobMatchesDTO`.

| Method and path | Purpose |
|---|---|
| `GET /matches` | Page: 5 tiles, the ranked matched jobs, the match-quality checklist, personalised alerts |
| `GET /matches/{matchId}` | Details and insights for one own match: skill alignment, match explanation, areas to improve, interest state |
| `POST /matches/{matchId}/view` | Records that the consultant opened View Match (idempotent; first view time kept) |
| `PUT /matches/{matchId}/save`, `DELETE /matches/{matchId}/save` | Bookmark / un-bookmark (`cws_saved_job`, keyed by the match's requirement) |
| `POST /matches/{matchId}/interest` | Express Interest. Optional body `{ "note": "..." }` (max 500 chars, scanned by `SensitiveContent`; 422 `SENSITIVE_CONTENT` or `TRACKER_INVALID`). Idempotent: the first row and time are kept |

- **Gate:** `ConsultantHomeService.requireSelf(me)` (roles-from-data flag, permission `opportunities.respond`, own `consultant_profile` via `member_id`). Anyone else, another tenant, a flag that is off: the same generic **404**. No endpoint takes a consultant id.
- **Scope:** every query is `orgId` first plus the caller's own `consultant_id`. A `matchId` that is not the caller's own, or is `DISMISSED`, or does not exist: generic 404 (never 403).
- Express Interest records the wish only. It creates **no application**, changes **no match status** and submits nothing (Kiwiply never submits).

## Components
Web: `components/ent/consultant-ws/MatchesPage.tsx` (uses shared `parts.tsx`: Card, Pill, Empty, CompanyMark, BeeCard, TableHead/TD/TABLE, useWorkspaceData), `lib/ent/consultant-ws/matches.ts` (types, tolerant parser, sort/filter/compare helpers, rate and relative-time text, fetch + write calls), route `app/(tenant)/%5Ft/w/consultant/matches/page.tsx`. Tests: `lib/.../matches.test.ts`, `components/.../MatchesPage.test.tsx`, API `JobMatchesResourceIT`.

UI behaviour: sort by Match Score / Newest / Rate (jobs with no rate sort last); Filters (min score, type, work mode, saved only; options only from values present); bookmark is optimistic and rolls back with a message on failure; Compare (UI only) holds up to 3 and draws a side-by-side sheet; View Match selects the job, loads its insights and records the view; the page defaults to the best-scoring match without recording a view.

## Real vs sample
Nothing on this page is sample data.

| Block | Source | Notes |
|---|---|---|
| Total / High Match (80%+) | own `requirement_match` not DISMISSED (score >= 80) | delta = value now vs rows created before a week ago; 6-week cumulative sparkline |
| New Matches | own matches created in the last 7 days | delta = against the 7 days before; weekly counts |
| Saved Jobs | `cws_saved_job` (own) | delta from `created_at` |
| Viewed Matches | `cws_match_view` (own, NEW) | delta from `viewed_at` |
| Table | match + `client_requirement` + `client_account` | Skill Fit = share of the job's `requirement_skill` rows the consultant has (case-insensitive); **null (no bar) when the job lists no skills** |
| Skill Alignment | `requirement_skill` vs `consultant_skill` | **Present / missing, not proficiency**: 100% bar when the consultant has the skill (their primary skills listed first), 0% and a gap otherwise. The profile stores no proficiency levels |
| Match Explanation | `requirement_match.reason` + derived bullets | skills matched count; experience level (JUNIOR 0, MID 3, SENIOR 5, LEAD 8 years) vs `years_experience`; work mode / location fit |
| Areas to Improve | derived | missing skills tagged **Gap** (max 3); **Suggested**: certifications, job preferences, latest resume (only when missing) |
| Improve Your Match Quality | profile | profile up to date (`profile_completeness` >= 80), 3+ skills, a resume exists, `has_preferences`, `has_certifications` |
| Personalized Alerts | derived from real events, last 14 days | new matches (7 days), an ASSIGNED role edited after creation (`client_requirement.updated_at`), application stage change (`talent_application.stage_changed_at`); honest empty text otherwise; max 5, newest first |

## New tables (migration `20261103060000_ent_cws_matches.xml`, NOT yet in `master.xml`)
- `cws_match_view` (org_id, consultant_id, requirement_id, viewed_at); unique (org_id, consultant_id, requirement_id).
- `cws_match_interest` (org_id, consultant_id, requirement_id, note varchar(500) null, created_at); unique (org_id, consultant_id, requirement_id).
- Both: FK to `organization`, composite FK `(org_id, consultant_id)` to `consultant_profile`, composite FK `(org_id, requirement_id, consultant_id)` to `requirement_match(uk_requirement_match_pair)` (`requirement_match` has no `(org_id, id)` unique key, so the tenant-safe unique triple is the parent key). No JSON, no sensitive columns. Entities `CwsMatchView`, `CwsMatchInterest`; repositories `CwsMatchViewRepository`, `CwsMatchInterestRepository`. Reuses `cws_saved_job` (`CwsSavedJob`, `CwsSavedJobRepository`) for the bookmark.

## Demo data
`ConsultantWsMatchesDemoSeeder` (`@Service`, public idempotent `int seed()`): for consultants with a `member_id` (Anika, Ben, Sam) in the demo org slugs, adds saved jobs (3), viewed matches (4) and one interest, from their existing matches. Skips any consultant that already has a saved, viewed or interest row, and anyone without matches. Call it after `ConsultantWsDemoSeeder` (it needs their matches). Not called from the bootstrap.

## Shared-file edits needed (the parent wires these)
- `master.xml`: `<include file="config/liquibase/changelog/20261103060000_ent_cws_matches.xml" relativeToChangelogFile="false"/>` after the `cws_saved_job` include.
- `EnterpriseDemoBootstrap`: call `ConsultantWsMatchesDemoSeeder.seed()` after `ConsultantWsDemoSeeder`.
- `OrgIsolationIT.COVERAGE` rows (template-path form, matching the existing format):
  - `GET /api/orgs/{orgId}/me-workspace/matches`
  - `GET /api/orgs/{orgId}/me-workspace/matches/{matchId}`
  - `POST /api/orgs/{orgId}/me-workspace/matches/{matchId}/view`
  - `PUT /api/orgs/{orgId}/me-workspace/matches/{matchId}/save`
  - `DELETE /api/orgs/{orgId}/me-workspace/matches/{matchId}/save`
  - `POST /api/orgs/{orgId}/me-workspace/matches/{matchId}/interest`

## Marketer's source link and quick info (job source flow)
Kiwiply holds no full job posting (see [consultant-job-source-flow.md](consultant-job-source-flow.md)). Each match row (list and detail) carries `sourceUrl` (https only; null when the marketer added none or it fails the https/host check, validated on write and on read), `sourceName`, `quickInfo` and `sourceSample`, read from the companion table `cws_job_source` (migration `20261103200000_ent_cws_job_source.xml`). The page shows the marketer's quick info (with the source name and the **Sample** mark for demo stand-in rows) and an **Open job link** action in each row and in the detail (`target="_blank" rel="noopener noreferrer"`; disabled with the tooltip "Your marketer hasn't added the link yet" when there is none), plus the helper "Apply on the source site with the Kiwiply extension - your application shows up in My Applications automatically". Everything else on this page is unchanged. The link, name and note are SAMPLE in the demo (`ConsultantWsJobSourceDemoSeeder`); the marketer role writes them in the real product.

## Known gaps
- **Cross-role handoff:** Express Interest only writes `cws_match_interest`. Nothing yet tells the marketer or turns the interest into an application; when the marketer module and role branches merge, the marketer's queue should read this table (and create the application that the consultant then approves). Until then the consultant sees "Interest sent" and a note that the marketer can see it, but no marketer view exists.
- Skill alignment has no proficiency levels (no data); the bar is 100% or 0%.
- "A role you saved has been updated" from the board is not produced: alert 2 covers ASSIGNED roles only (saved jobs are keyed by requirement and `client_requirement.updated_at` is also bumped by any edit, including trivial ones).
- Match-quality checklist items are links to nothing individually; the single "Improve My Profile" link goes to `/w/consultant/profile` (page owned by another branch).
- Compare is client state only (not persisted); it resets on reload.
- Pixel polish against the board was not compared in a browser (no `next dev` was run, per the shared-build rule); the 390px layout relies on the table scrolling inside its card and the rail stacking under the content.
