# Consultant workspace: Assigned Opportunities (`/w/consultant/opportunities`)

Board: `design/enterprise-consultant/opportunities.webp`. The consultant's own `requirement_match` rows with status `ASSIGNED` as a response worklist.
Gate: `ConsultantHomeService.requireSelf` (Consultant role from data + `opportunities.respond` at OWN + own `consultant_profile`, else the generic 404);
every write adds a WRITE check on `opportunities.respond`. No endpoint takes a consultant id. Another consultant's, another org's, a SUGGESTED or an unknown
match id is the same generic 404. Nothing here creates an application or submits anything (Kiwiply never submits).

## Endpoints (`/api/orgs/{orgId}/me-workspace/opportunities`, class `OpportunitiesResource`)
| Verb | Path | What |
|---|---|---|
| GET | `` (`?sort=due\|priority\|newest&page=0&size=50`, size capped at 50) | tiles, one page of rows, `nextSteps` facts |
| GET | `/{matchId}` | detail: description, skills (present/missing), rate band (minor units), marketer, score + reason, decline/info/resume notes, timeline |
| POST | `/{matchId}/express-interest` `{note?}` | writes the same `cws_match_interest` row Job Matches uses; changes no status; idempotent; declined -> 422 (reopen first) |
| POST | `/{matchId}/need-more-info` `{message}` | 3..300 chars, PII-scanned; NEW -> AWAITING_RESPONSE (IN_REVIEW stays); declined -> 422 |
| POST | `/{matchId}/decline` `{reason}` | 3..300 chars, PII-scanned; -> DECLINED; idempotent (first reason kept) |
| POST | `/{matchId}/reopen` | undo: DECLINED -> NEW, reason cleared; idempotent |
| POST | `/{matchId}/request-resume-update` `{note?}` | optional 3..300 chars note, stored on the response row (`resume_update_note` + time); no status change; asking again replaces it |

Decision notes: "Awaiting Response" = the consultant is waiting for the marketer's answer (they asked for info). IN_REVIEW is the marketer's step, so no consultant
action sets it; Express Interest therefore changes no status (a NEW row with interest sent stops counting as "still to respond" in the next steps and shows
"Interest sent"). Request Resume Update is stored on the response row, not as a `cws_task`, because it is a note to the marketer, not the consultant's own to-do.

## One record per answer (ent-opp-unify, supersedes the status/interest text above where they differ)
The consultant's answer is the `mkt_opportunity` row the marketer's Opportunities board, its activity feed and `answer-info` read. The writes call the same transitions as `/con/opportunities`: Express Interest (state INTERESTED, board interest INTERESTED; the `cws_match_interest` row Job Matches shows is kept), Need More Info (NEEDS_INFO, shown AWAITING_RESPONSE; asking again replaces the question), Decline (DECLINED, board NOT_INTERESTED; the free text is `decline_note`, the code `OTHER`), Reopen (back to ASSIGNED), **I applied** (`POST .../{matchId}/applied`, APPLIED; the consultant's own statement, nothing is submitted). Each real transition writes one `mkt_opportunity_event` and one `org_audit_event` (`CONSULTANT_OPPORTUNITY_*`). The row's `status` is NEW / AWAITING_RESPONSE / DECLINED / APPLIED / CLOSED (IN_REVIEW is the marketer's own stage, seed-only); `infoAnswered` and the detail's `infoAnswer` show the marketer's answer; `allowedActions` lists what the page may offer (a closed job leaves only the resume note and Decline). `cws_opportunity_response` keeps the marketer's priority and due date and the resume-update note; its status, decline_reason and info_request columns are no longer written. The Open job link falls back to `client_requirement.job_url` when there is no `cws_job_source` row. `/w/consultant/opportunities/{matchId}` opens the same page with that job open.

## Web
- `web/src/components/ent/consultant-ws/OpportunitiesPage.tsx` (+ test), built on `parts.tsx`; `web/src/lib/ent/consultant-ws/opportunities.ts` (+ test).
- Route `web/src/app/(tenant)/%5Ft/w/consultant/opportunities/page.tsx`; BFF `web/src/app/api/orgs/[orgId]/me-workspace/opportunities/**`
  (`route.ts`, `[matchId]/route.ts`, `[matchId]/[action]/route.ts` with an action whitelist, `_bff/shared.ts`).
- Tiles (vs last month), table (Marketer column from 2xl, `min-w-[760px]`, wrapping action cell), View side sheet, row menu, text dialog for info/decline/resume,
  Decline toast with Undo, right rail: bee, Recommended Next Steps, Quick Actions (act on the picked row, else the first; disabled with none / declined).
- Priority pill uses a leading dot, not a flag: `@kiwiply/ui` has no FlagIcon (no shared change made).

## Real vs SAMPLE
- Real: rows, company, location, skills, marketer (who assigned the match, else the consultant's ACTIVE marketer assignment, else "-"), score, status, decline/info/resume
  text, interest, timeline, tiles and deltas, upcoming-interview and skill-gap counts.
- Marketer inputs (stand-ins until the role branches merge): `priority` and `due_on`. Where no response row / value exists, the API **derives** them: priority from the
  score (>= 85 High, >= 70 Medium, else Low), due = assignment date + 14 days; the row flags `priorityDerived` / `dueDerived` (tooltip says so). The demo seeder writes
  stored values; the page marks the header note with a SAMPLE chip.
- Tiles: Total = all assigned; High = non-declined rows with High priority; Awaiting / In Review = rows in that status; Declined = declined. Delta = count now vs the same
  kind of rows already existing 30 days ago (assigned_at, or the response row's last change); null (nothing drawn) when that was 0. Sparkline = six weekly cumulative counts.
- Next steps (derived): respond to N (NEW without interest), resume gap (rows with skills the profile lacks), interviews (`talent_interview` SCHEDULED in the future), marketer link.

## Table `cws_opportunity_response` (migration `20261103110000_ent_cws_opportunities.xml`, NOT registered in master.xml)
org_id, consultant_id, requirement_id (composite FK to the `requirement_match` triple), status, priority (nullable), due_on (nullable), decline_reason,
info_request, resume_update_note, resume_update_requested_at, responded_at, created_at, updated_at; unique (org, consultant, requirement); index (org, consultant, status).
Added beyond the brief: `resume_update_note`, `resume_update_requested_at`. No PII columns; all text goes through `SensitiveContent`.

## Seeder
`ConsultantWsOpportunitiesDemoSeeder.seed()` (idempotent, `@Transactional`, Anika/Ben/Sam only, guarded on `cws_opportunity_response` rows): up to 8 response rows over each
consultant's ASSIGNED matches (NEW/AWAITING/IN_REVIEW/DECLINED mix, stored priority + due) and an interest row for the IN_REVIEW ones. Wire after `ConsultantWsDemoSeeder`.

## OrgIsolationIT rows to add
GET `/api/orgs/{orgId}/me-workspace/opportunities`; GET `.../opportunities/{matchId}`; POST `.../opportunities/{matchId}/express-interest`; POST `.../need-more-info`;
POST `.../decline`; POST `.../reopen`; POST `.../request-resume-update`. (BFF: same paths under `/api/orgs/...` in web.)

## Tests
`OpportunitiesResourceIT` (13: values, sort/paging, detail, own-only, cross-org/non-consultant/flags 404, empty, each write success + validation + PII + cross-tenant), web lib + page vitest.

## Marketer's source link and quick info (job source flow)
Kiwiply holds no full job posting (see [consultant-job-source-flow.md](consultant-job-source-flow.md)). Each opportunity row (list and detail) carries `sourceUrl` (https only; null when the marketer added none or it fails the https/host check, validated on write and on read), `sourceName`, `quickInfo` and `sourceSample`, read from the companion table `cws_job_source` (migration `20261103200000_ent_cws_job_source.xml`). The page shows the marketer's quick info (with the source name and the **Sample** mark for demo stand-in rows) and an **Open job link** action in each row and in the detail (`target="_blank" rel="noopener noreferrer"`; disabled with the tooltip "Your marketer hasn't added the link yet" when there is none), plus the helper "Apply on the source site with the Kiwiply extension - your application shows up in My Applications automatically". Everything else on this page is unchanged. The link, name and note are SAMPLE in the demo (`ConsultantWsJobSourceDemoSeeder`); the marketer role writes them in the real product.

## Known gaps
No marketer-side write for priority/due; no messaging (notes are stored for the marketer to read later); IN_REVIEW is only reachable via seed data; no
status filter or search on the table; no FlagIcon in the UI package.
