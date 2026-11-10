# Marketing workspace page: Activities (`/w/marketing/activity`)

Branch `mkt-activity` (off `ent-talent-marketer`). Board: `design/enterprise-marketer/activities.webp`. Read permission `pipeline.view` (ASSIGNED for a Marketing Specialist, ORG sees all); write permission `followups.manage`.
The page is a unified, **read-mostly feed** of what the marketer's side did, normalised from the existing records plus one own table for manual "Log Activity" rows. None of the source tables or services is edited.

## Endpoints (`/api/orgs/{orgId}/mkt/activity`; non-members, flag off, missing permission, a consultant or row outside the caller's set: generic 404)
| Route | What |
|---|---|
| `GET ?from&to&consultantId&type&status&clientId&ownerId&q&sort&summaryRange&page&size` | The whole board in one call (`pipeline.view`): `kpis[total,resume,submission,followup,interview]` (value, deltaPct or null, 8 weekly buckets), `activities {items,total,page,size}`, `summary`, `upcoming` (+`upcomingTotal`), `options`, `canLog`. `from`/`to` are `yyyy-MM-dd` (UTC, inclusive, default the current month, at most 366 days). `type` is a group key (RESUME, OPPORTUNITY, SUBMISSION, FOLLOWUP, INTERVIEW, FEEDBACK, APPLICATION, OFFER, PLACEMENT). `sort` = `recent` (default) or `oldest`. `summaryRange` = THIS_MONTH, LAST_MONTH, LAST_7_DAYS, LAST_30_DAYS. `size` default 10, cap 100. |
| `POST /` | "Log Activity" (`followups.manage`): one manual row for one of the caller's consultants (optional client). Record only. Only the types flagged `manual` are accepted; `CANDIDATE_SUBMITTED` and `PLACEMENT_CONFIRMED` (facts the source records prove) and every approval type are refused (422). |
| `PATCH /{id}/status` | A manual row to COMPLETED, SCHEDULED or CANCELLED (`followups.manage`). A source-derived line has no editable id: 404. |

Why `followups.manage` for writes: logging an activity is the marketer recording their own contact work, the same key that guards recording a follow-up. A viewer that holds `pipeline.view` only (Executive Viewer) reads the feed and gets `canLog=false` (the button is hidden). Writes audit as `MARKETER_ACTIVITY_CREATE|STATUS` (target ACTIVITY). Free text (title, detail, tags) is trimmed, refused with angle brackets/control characters, and PII-scanned through `SensitiveContent`. E1: a manual row records only; nothing is submitted for a consultant, mailed, or signed in as anyone.

## Table (`20261104120000_mkt_activity.xml`)
- `mkt_activity`: id, org_id, consultant_id (composite FK consultant_profile), client_account_id null (FK client_account), activity_type (a `MktActivityTypes.Type` name), title (160), detail (200) null, tags (csv, 100) null, status COMPLETED/SCHEDULED/CANCELLED, occurred_at, actor_member_id (composite FK org_member), created_at. Unique `(org_id,id)`, every index starts with org_id.

## The feed (what is read, how it is normalised)
Own bare `Repository` classes `MktActivity*Repository` (every method org-first, each takes `all` + visible consultant ids like the sibling repos). Each source is read newest-first, capped at 2,000 rows per request, then merged in memory.
| Source | Raw kind -> type |
|---|---|
| `mkt_resume_event` | CREATED RESUME_ADDED, UPDATED RESUME_UPDATED, APPROVAL_REQUESTED, APPROVED, MARKED_FOR_UPDATE |
| `mkt_opportunity_event` | CREATED, ASSIGNED, REVIEWED, INTEREST_REQUESTED, INTEREST_CHANGED, RESUME_REQUESTED |
| `mkt_submission_event` | CREATED SUBMISSION_PREPARED, APPROVAL_REQUESTED, APPROVAL_DECIDED (APPROVED/REJECTED only), STATUS_RECORDED (SUBMITTED = CANDIDATE_SUBMITTED, CLIENT_REVIEW, INTERVIEW_REQUESTED), WITHDRAWN |
| `mkt_followup_event` | CALL_LOGGED FOLLOWUP_LOGGED, REMINDER_SENT, STATUS_CHANGED (to COMPLETED = FOLLOWUP_COMPLETED) |
| `mkt_interview_event` | SLOT_CONFIRMED INTERVIEW_SCHEDULED, RESCHEDULE_PROPOSED, REMINDER_REQUESTED, FEEDBACK_RECORDED FEEDBACK_RECEIVED |
| `talent_application_event` | CREATED, NOTE, STAGE_CHANGE by `to_stage`: ASSIGNED OPPORTUNITY_ASSIGNED, SUBMITTED CANDIDATE_SUBMITTED, OFFER OFFER_RECEIVED, other stages APPLICATION_MOVED ("Application Moved to Interview") |
| `talent_placement` | one PLACEMENT_CONFIRMED on `start_date` (actor = the consultant's marketer from `marketer_assignment`) |
| `mkt_activity` | the manual rows |
`mkt_stream_*` rows are NOT feed lines (system job alerts, not something a marketer did). An unknown raw kind is skipped, never guessed. A submission can appear twice (its submission event and the application's SUBMITTED stage move): both are real records.

**Groups** (filter, first chip, summary row): Resume, Opportunity, Submission, Follow-up, Interview, Feedback, Application, Offer, Placement. Feedback counts under Interviews in the tiles and the summary. The second chip is the type's default tag (Profile, Approval, Client Call, Technical = the interview round, Pipeline, Success, Closed/Active/Ended...) or the first tag of a manual row.

## Numbers (all from the merged rows)
- **Table total** = rows in the date range after every filter. **Tiles** = the count of their group in the range after every filter EXCEPT Type (Total = all groups, Resume Updates = RESUME, New Submissions = SUBMISSION, Client Follow-ups = FOLLOWUP, Interviews Coordinated = INTERVIEW + FEEDBACK). With no filter, Total equals the "Recent Activities (n)" count.
- **Delta** ("vs last week") = the last 7 days of the range (capped at now) against the 7 days before; null when the previous week is empty. **Sparkline** = the last 8 weekly buckets ending at the same moment.
- **Activity Summary by Type**: its own range select (default THIS_MONTH), scope-only (it ignores the table filters), count and share (%) of the window's total; the seven board rows always, plus Opportunities only when it has rows. The rows add up to the total.
- **Upcoming Activities**: open follow-ups due from now (today list + upcoming list of `MktFollowupService`, next 14 days, overdue excluded), SCHEDULED interviews in the next 14 days, and planned manual rows; soonest first, 20 returned, the card shows 5 and "View all" expands. Same follow-up rows as the Follow-ups page.
- Consent: application and placement lines follow the consultant's data-share consent exactly like the Applications page (NONE: left out, SUMMARY: stage moves only, no job or client, placements need FULL). The marketer's own work lines are not consent-gated.

## Web
`activity/ActivitiesPage.tsx` (state + layout), `ActivityTable.tsx`, `ActivityRail.tsx` (bee help card, summary, upcoming), `DateRangePicker.tsx`, `LogDialog.tsx`, `DetailsDialog.tsx`, `bits.tsx`; lib `web/src/lib/ent/marketer-ws/activity.ts`; BFF `web/src/app/api/orgs/[orgId]/mkt/activity/route.ts` + `[id]/status/route.ts`; dev mock `web/scripts/mock-mkt-activity.mjs` (the board's ten rows + filler so 148/28/36/42/18 are real counts; it does not filter by date); art cropped from the board into `web/public/ent/marketer/activity/` (13 faces, 8 client logos; the bee banner is the shared `help-banner.png` via `HelpBannerCard`).
Board quirk reproduced as drawn: the table's "Related To" cell is the client logo + name, the "Client" column holds the type chip and "Tags" the second chip.
Dates and times are shown in UTC (the same day boundaries the range filter and the API use).

## Real vs empty
Everything is drawn from real rows. An org without events gets "No activity yet" (feed and summary), "Nothing scheduled in the next two weeks." (upcoming), tiles with 0 and no delta chip.

## Demo data (`MktActivityDemoSeeder`)
Only `mkt_activity`: per marketer with assignments, 10 completed manual rows over the last 20 days and 3 planned rows in the next days (from THAT marketer's consultants). Idempotent (an org with rows is skipped), `ENT_DEMO_SEED`-gated, runs on `ApplicationReadyEvent` (no shared class edited). The rest of the feed is whatever the other pages' seeders created.

## Known gaps
- Each source is capped at 2,000 rows per request (a very long range on a very busy org truncates the oldest lines).
- Dates are UTC; the user's own timezone is not applied.
- Stream events are intentionally absent; the Offer/Placement summary rows come from application stage moves and placements only.
- The kebab offers View details and, for logged rows, status changes; there is no edit or delete of a logged row's text.
- Testcontainers IT (`MktActivityIT`) is written and compiled, not executed (no Docker on the build machine).
