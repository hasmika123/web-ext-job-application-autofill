# Marketing Home board (`/w/marketing`) — backend

Branch `mkt-home` (off `ent-talent-marketer`). Web page, lib (`web/src/lib/ent/marketer-ws/home.ts`), BFF and dev mock already existed; this adds the real endpoint.

## Endpoint
`GET /api/orgs/{orgId}/mkt/home` → `MktHomeResource` → `MktHomeService`. Permission `consultants.view` through `MktScope.resolve` (ASSIGNED scope; non-members, flag-off and missing key are the generic 404). Read-only; no write route (E1).

JSON (exactly what `parseHome` reads): `kpis[6]` (assigned, profilesReady, newMatches, pendingSubmissions, upcomingInterviews, overdueFollowups: `value`, `deltaPct` or null, 8-point `sparkline`), `talent[5]`, `streams[5]`, `openings[5]`, `pipeline{total,deltaPct,stages[review,submitted,interviewing,offer,placed]}` or null, `tasks[5]`, `interviews[4]`, `activity[5]`.

## Where each number comes from (Home reuses the pages' services, so numbers equal the pages')
| Card | Source | Notes |
|---|---|---|
| Assigned Consultants | `MktTalentService.list` tile `assigned` | |
| Profiles Ready | Talent tiles `assigned` − `needUpdates` | series = pointwise difference; delta against 4 weeks ago (series index 3) |
| New Job Matches | `MktMatchesService.list` tile `matched` | needs `matches.run` |
| Pending Submissions | `MktSubmissionsService.board` tile `pendingApprovals` | needs `submissions.record`; same definition as the Submissions page |
| Upcoming Interviews | Home's own count (`MktHomeInterviewRepository`) | live interviews in the next 7 days; delta against the 7 days before; weekly series; needs `interviews.coordinate` |
| Overdue Follow-ups | `MktFollowupService.view` tile `overdue` | needs `followups.manage` |
| My Assigned Talent | Talent page's first 5 rows | Next Action below |
| Job Stream Monitor | `MktStreamsService.get` (active streams, 5) | status title-cased; org-wide (streams are not per consultant); needs `matches.run` |
| Top Openings | `MktMatchesService.list` sorted `-score` | SUGGESTED only, best match per job, own consultants; location from `MktHomeRequirementRepository`; `id` = match id |
| Submission Pipeline | `MktApplicationsService.get` funnel "3m" | the five cumulative funnel steps read positionally as Review/Submitted/Interviewing/Offer/Placed; delta = 3-month total vs the 3 months before (6m total − 3m total); null when no applications |
| Today's Follow-ups | `MktFollowupService.view` `today` bucket | channel → kind (PHONE→CALL, EMAIL, CHAT/TEAMS→CHAT, else NOTE) |
| Upcoming Interviews card | `MktInterviewsService.overview().upcoming` (first 4) | Type = round label, else interview type |
| Recent Activity | application updates + resume activity + interview events, newest first | interview events via `MktHomeInterviewEventRepository` |

A section whose source page the caller may not read (sibling answers 404) is empty, its tile is `0` with no delta. Every row naming a consultant is filtered again with `view.sees(...)`.

## Next Action (one place: `MktHomeNextAction`)
First rule wins: resume NEEDS_UPDATE → "Request Resume" red; available now and ≥1 ASSIGNED opportunity → "Submit to Job" blue (only opens the page; the consultant submits); ≥1 SUGGESTED match → "Review Matches" blue; upcoming SCHEDULED interview → "Schedule Interview" blue; follow-up due today/overdue → "Follow Up" violet; otherwise "No action" blue.

## Tables
None. Own repositories (bare `Repository`, `orgId` first): `MktHomeInterviewRepository`, `MktHomeMatchRepository`, `MktHomeRequirementRepository`, `MktHomeInterviewEventRepository`.

## Tests
- `MktHomeServiceTest`, `MktHomeNextActionTest`, `MktHomeResourceTest` (no Docker): scope filtering, empty org, KPI math, caps/ordering, unreadable section, 404 gate.
- `MktHomeIT` (Testcontainers; cross-tenant 404): compiled only, not executed (no Docker).

## Known gaps
- Interviews/streams/matches sections need those pages' keys; callers with only `consultants.view` see them empty.
- Tasks card shows open items due from now to end of day (UTC); completed ones are not listed.
- The Home call runs the sibling boards (Applications twice), so it costs about the sum of those pages; cache later if needed.
- `avatarUrl` is null unless a source provides one.
