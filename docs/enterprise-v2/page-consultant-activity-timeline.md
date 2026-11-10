# Consultant workspace: Activity Timeline

Route `/w/consultant/activity-timeline` (root attribute `data-consultant-activity-timeline`), board `design/enterprise-consultant/activity-timeline.webp`.
A **read-only, derived** feed of the signed-in consultant's OWN events, merged on the API from tables the other pages already write.
**No new table, no migration, no seeder, no writes.**

## Endpoint

`GET /api/orgs/{orgId}/me-workspace/activity-timeline?type=&days=&cursor=&size=` (`ActivityTimelineResource`, `@OrgPermissionRequired`).

- Gate: `ConsultantHomeService.requireSelf` (Consultant role from data, `opportunities.respond`, own `consultant_profile`), else the generic 404. No consultant id is taken from the client.
- `type`: `ALL` (default) or one group: RESUME, JOB, APPLICATION, SUBMISSION, INTERVIEW, FEEDBACK, OFFER, AVAILABILITY, PROFILE, PLACEMENT.
- `days`: 7, 30 (default) or 90. `size`: 1 to 50 (default 20). `cursor`: opaque, from `nextCursor`. Bad values are 422 (the codebase's validation status).
- Response: `tiles`, `events` (one page), `total` (count for the chosen type and period, not the page), `nextCursor` (null on the last page), `milestones`.
- Merge: every source is read for the caller only (org id first, consultant id second), turned into events, filtered to the period, sorted newest first with the event key as a stable tiebreak. The cursor is the (time in ms, key) of the last row, so a page boundary never repeats or skips a row, including events that share a time. Events dated in the future are dropped.

## Sources (all real rows)

| Event types | Group | Source |
| --- | --- | --- |
| RESUME_UPDATED / RESUME_ADDED, RESUME_SHARED / RESUME_DOWNLOADED | RESUME | `org_resume` (updated_at when it differs from created_at by more than a minute, else created_at), `cws_resume_activity` (VIEWED is skipped as noise) |
| JOB_ASSIGNED, JOB_RESPONDED | JOB | `requirement_match` status ASSIGNED (assigned_at), `cws_opportunity_response` (responded_at) |
| APPLICATION_CREATED / _SUBMITTED / _UPDATED | APPLICATION | `talent_application_event`, **only CREATED and STAGE_CHANGE** (NOTE and any other type are never read) |
| SUBMISSION_APPROVED / _DECLINED, SUBMISSION_SENT, MARKETER_NOTE | SUBMISSION | `cws_submission` (decided_at, submitted_on, and created_at when `marketer_note` is non-blank; the note text is never copied into the feed) |
| INTERVIEW_SCHEDULED, INTERVIEW_COMPLETED | INTERVIEW | `talent_interview` (created_at; end time for a COMPLETED one; CANCELLED never produces a "scheduled" row) |
| FEEDBACK_RECEIVED | FEEDBACK | `cws_interview_feedback` (outcome only, not the summary) |
| OFFER_RECEIVED / _UPDATED / _NEGOTIATING / _ACCEPTED / _DECLINED | OFFER | `cws_offer_event` |
| AVAILABILITY_UPDATED | AVAILABILITY | `cws_availability_history` (created_at) |
| PROFILE_UPDATED | PROFILE | `cws_certification` and `cws_profile_pref` (created_at), folded per hour so a bulk save is one "Added 3 certifications and 2 preferences" row |
| PLACEMENT_MILESTONE | PLACEMENT | `cws_placement_activity` of the caller's `talent_placement` rows |

Not derived (no honest timestamp): skills (`consultant_skill` has no time column) and `consultant_profile` edits. Rows keep the owning row's `sample` flag (submissions, offers, availability history, placement activity), so demo stand-ins show the "Sample" marker.

**Marketer Note:** no marketer-note table exists. The board's type appears only when a real `cws_submission` row carries a `marketer_note`; with none, it never shows.

## Tiles (counts of events, honest deltas)

Total Activities, Application Updates (APPLICATION category: application events, submission decided/sent), Interviews (scheduled, completed, feedback) and Profile Changes (resume added/updated, availability, profile) count the **last 30 days** against the 30 days before ("vs last month"). This Week counts the last 7 days against the 7 before ("vs last week"). `deltaPct` is null when the earlier count is 0 and the page then prints the window ("Last 30 days") instead of a percentage. The sparkline is six weekly counts. Tiles ignore the filters.

## Milestones ("Recent Milestones")

Derived from all events (not the period): Application Submitted, Submission Approved, Interview Completed, Offer Received, Offer Accepted (earliest such event) and Project Start Date (the latest `talent_placement.start_date`, reached when it is today or earlier). Unreached ones are open circles with "-" (a future start date still shows its date).

## Web

- `lib/ent/consultant-ws/activityTimeline.ts` (+ test): types, tolerant parser (bad rows dropped), `mergeEvents`, `groupByDay`, `rangeLabel`, `queryString`, CSV (`csvCell` neutralizes `= + - @`), fetch.
- `components/ent/consultant-ws/ActivityTimelinePage.tsx` (+ test): five tiles, the timeline card (type and period selects, rows grouped by day with a coloured dot rail, icon tile, title and description, context chip, action button and the row menu), "Load more" (follows `nextCursor`, appends without repeats, keeps the rows on screen if the call fails), bee card, Quick Actions, Recent Milestones.
- Deep links: View Resume -> `/w/consultant/resumes`; View Job -> `opportunities`; View Application -> `applications`; View Details -> `submissions`; View Interview and View Feedback -> `interviews`; View Offer -> `offers`; View Availability -> `availability`; View Profile -> `profile`; View Placement -> `placements`. Quick Actions: View Application, Message Marketer (`marketer`), Review Feedback (`interviews`), and **Export Timeline**, a client-side CSV of the rows currently loaded (no server file).
- Route `app/(tenant)/%5Ft/w/consultant/activity-timeline/page.tsx`; BFF `app/api/orgs/[orgId]/me-workspace/activity-timeline/route.ts` (GET only; passes only type, days, size and cursor as plain tokens).

## Tests

- `ActivityTimelineResourceIT` (12): own events only (a second consultant's offer, job and application never appear and vice versa), the NOTE event never appears, order and tiebreak, cursor walk at sizes 1/3/5/7 equals the full list with no repeats (with two events at the same instant), period filter (7/30/90), type filter, tile math with literal expectations, milestones, empty consultant, bad cursor/size/days/type (422), other org / owner / admin / marketer / consultant without profile / flags off all the generic 404, POST not allowed and writes nothing.
- Vitest: lib and page tests (20).

## OrgIsolationIT route rows to add

All GET, no body:

- `GET /api/orgs/{orgId}/me-workspace/activity-timeline`
- `GET /api/orgs/{orgId}/me-workspace/activity-timeline?type=OFFER&days=90&size=5`

## Known gaps

- The feed is computed in memory from the consultant's own rows on each call (all sources, then filter and page). Fine for one consultant's volume (child reads are capped at 500 rows per source); a materialized index would be the next step if it ever grows.
- A refresh on tab focus replaces the loaded pages with page one again.
- No skills or consultant_profile edits (no timestamps); VIEWED resume activity is skipped.
- Resume "updated" is inferred from `org_resume.updated_at` (one event per resume, its latest change), not a per-edit history.
