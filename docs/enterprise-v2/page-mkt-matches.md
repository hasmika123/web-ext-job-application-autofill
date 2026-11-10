# Marketing workspace: Job Matches (`/w/marketing/matches`)

Branch `mkt-matches` (from `ent-talent-marketer`). Board: `design/enterprise-marketer/matches.webp`. Brief: `mkt-page-brief.md`.

## Endpoints (`/api/orgs/{orgId}/mkt/matches`, all `@OrgPermissionRequired`, 404 for anything outside the caller's view)
| Call | Permission | What |
|---|---|---|
| `GET ?page&size&q&consultantId&skill&clientId&score=high\|mid\|low&sort&selected` | `matches.run` | the whole board in one call: `kpis[4]`, `filters`, `items`, `total/page/size`, `topToday[5]`, `explanation` (selected row, default first), `highConfidenceMin`, `staleDays` |
| `GET /{id}` | `matches.run` | one match with ticks, insights, missing skills (Review drawer and a clicked row) |
| `GET /compare?a&b` | `matches.run` | two details (Compare drawer) |
| `POST /{id}/assign` | `matches.run` + `opportunities.manage` (both scopes must reach the consultant) | SUGGESTED to ASSIGNED, `assigned_by_member_id`, `assigned_at`, audit `MKT_MATCH_ASSIGN`. Record only (E1). Idempotent when already ASSIGNED; 409 `MATCH_STATE` (dismissed) / `REQUIREMENT_CLOSED` |
| `POST /{id}/dismiss` | `matches.run` | SUGGESTED to DISMISSED, audit `MKT_MATCH_DISMISS` (the kebab menu) |

Scope: `MktScope.resolve` (ASSIGNED = marketer or backup on `marketer_assignment`; ORG sees all). Nothing here submits for a consultant.

## Tables
None of its own. It reads `requirement_match`, `client_requirement`, `requirement_skill`, `client_account`, `consultant_profile`, `consultant_skill`, `org_resume`, `talent_application` and updates `requirement_match` (status, assigned_by, assigned_at). `20261104090000_mkt_matches.xml` is registered (one include line in `master.xml`) and empty. Repositories: `Mkt*Repository` in `repository/ent/mkt` (`MktMatchRepository`, `MktMatchConsultantRepository`, `MktMatchRequirementRepository`, `MktMatchClientRepository`, `MktMatchResumeRepository`, `MktMatchApplicationRepository`). Demo data = the talent seeder's ~275 matches.

## Formulas (one place: `MktMatchRules`)
- Live match = status SUGGESTED or ASSIGNED on an OPEN requirement, consultant inside the caller's view.
- High confidence = `score >= 85` (`HIGH_CONFIDENCE_MIN`). Stale = SUGGESTED and `created_at` older than 7 days. Consultant-ready = SUGGESTED, availability fit Excellent/Good, no resume update.
- Availability fit: AVAILABLE = Excellent (100); NOTICE/ON_PROJECT free within 14 days = Good (85), within 30 = Fair (60), later/undated/UNAVAILABLE = Limited (30).
- Skills match = required skills the consultant holds / required. Experience = `years_experience` / years of the level (JUNIOR 1, MID 3, SENIOR 5, LEAD 8), capped 100. Location = 100 remote job or same city, 75 same state, 50 consultant works remotely, else 30. Client history = share of the consultant's earlier `talent_application`s to the same client that progressed (interviewing/offer/hired = 1, open = 0.5, rejected/withdrawn/no response = 0); no application = no value (bar shows n/a, tick omitted).
- Resume update = no resume, or primary (else newest) resume older than 180 days, or a required skill the consultant holds is absent from the resume's headline/summary/target role. A skill the consultant does not hold is a skill gap, not a resume update.
- Explanation ticks and Match Insights bars are those comparisons over the real rows; a failing comparison is drawn as a muted gap line, not a tick.
- Top Matches Today = the five best SUGGESTED matches in the caller's view (not filtered by the table filters).
- KPI deltas have no history table: previous = the same predicate over rows created before now-30d (Stale: before now-37d) using today's consultant state; no previous value = no chip. Sparklines = last 8 weekly buckets by `created_at`.
- The board draws the Stale delta red when it falls; kept as drawn (no `lowerIsBetter`).

## Web
`matches/JobMatchesPage.tsx` (board), `matches/MatchParts.tsx` (score chip, availability dot, resume cell, explanation, insights, Review and Compare drawers), `lib/ent/marketer-ws/matches.ts`, BFF `app/api/orgs/[orgId]/mkt/matches/**`, mock `web/scripts/mock-mkt-matches.mjs`, art `web/public/ent/marketer/matches/` (ten consultant photos, large Alex Morgan, bee banner, all cropped from the board).

## Known gaps
- Compare picks the second match from the matches on the current page (same consultant first).
- Assign records the match only; it does not create the `talent_application` row the Jobs page creates (that belongs to the Jobs/Opportunities pages).
- The kebab has one action (Dismiss match); the board does not show what its menu holds.
- Real consultants have no photos (initials); the board's faces are shown only for the ten board names when the API sends no `avatarUrl`.
- ITs (`MktMatchesIT`) compile but were not executed here (no Docker).
