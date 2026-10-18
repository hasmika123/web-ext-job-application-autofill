# Marketing workspace: Interviews (`/w/marketing/interviews`)

Branch `mkt-interviews` (from `ent-talent-marketer`). Board: `design/enterprise-marketer/interviews.webp`. Rules: `mkt-page-brief.md`, `talent-foundation.md`, `33-interviews.md`.
Permission `interviews.coordinate` (ASSIGNED; ORG sees all) through `MktScope.resolve`. **E1:** every write records or proposes; the consultant confirms and attends; nothing submits for a consultant.

## Endpoints (`/api/orgs/{orgId}/mkt/interviews`)

| Verb + path | What |
|---|---|
| `GET /` | The whole board in one call: `kpis[4]`, `schedule{items,total,page,size,from,to}`, `upcoming[<=5]`, `pendingFeedback[<=5]`, `checklist` (the next interview's), `reminders[<=5]`, `clients[]`. Query: `from`, `to` (yyyy-MM-dd; default = the viewer's current Sunday-Saturday week), `status`, `clientId`, `q`, `sort` (date, consultant, client, role, status, round), `dir`, `page`, `size` (cap 100), `tzOffsetMinutes` (local minus UTC). |
| `GET /{id}/prep` | The Preparation Checklist of one interview; the seven board items are created on first read. |
| `PATCH /{id}/prep/{itemId}` `{done}` | Tick or untick. |
| `POST /{id}/reschedule` `{proposedAt, note?}` | A **proposal**: meta becomes RESCHEDULED, `reschedule_count + 1`, `proposed_for` set; the slot keeps its time. |
| `POST /{id}/confirm` | Record that the slot was confirmed; applies a pending proposal's time. |
| `POST /{id}/feedback` `{outcome, note?}` | PASSED / REJECTED / NO_SHOW / PENDING. 409 `INTERVIEW_NOT_DONE` while the interview is still in the future; a finished but unmarked slot becomes COMPLETED. Note goes through `SensitiveContent`. |
| `POST /{id}/remind` | A reminder **request** (an event row; nothing is sent). A second request within the hour is a no-op. |

Another tenant, a non-member, a missing id and an unassigned consultant's interview are all the generic 404. Writes also answer 409 `INTERVIEW_NOT_OPEN` (finished or cancelled slot) and 422 `ORG_INVALID` (bad outcome, past time). Each write writes one `org_audit_event` (`MARKETER_INTERVIEW_RESCHEDULE | _CONFIRM | _FEEDBACK | _REMIND`, target `INTERVIEW`).

## Tables (`20261104050000_mkt_interviews.xml`)

`mkt_interview_meta` (type VIDEO/ONSITE/TECHNICAL/PANEL/CLIENT, recruiter_name, coordination_status CONFIRMED/SCHEDULED/AWAITING_CONFIRMATION/RESCHEDULED, feedback_due_at, reschedule_count, proposed_for; unique per interview),
`mkt_interview_prep_item` (label, done, done_at, position; unique per interview+position), `mkt_interview_feedback` (outcome, note, recorded_by_member_id),
`mkt_interview_event` (kind RESCHEDULE_PROPOSED / SLOT_CONFIRMED / FEEDBACK_RECORDED / REMINDER_REQUESTED, actor, occurred_at; the source of the Reschedules KPI and of the reminder de-duplication).
All org-scoped with composite tenant FKs to `talent_interview (org_id, id)`. That key did not exist, so the first changeSet adds `uk_talent_interview_org_id` (additive, precondition-guarded).
`MktInterviewsDemoSeeder` fills meta/feedback/events for the demo orgs' existing interviews (hooked on `ApplicationReadyEvent`, same switches as the other demo seeds, idempotent).

## Derived status and KPI math

Status is never stored as such. A finished slot (COMPLETED, or its end has passed) is PENDING_FEEDBACK until feedback exists, then COMPLETED; an open slot shows its coordination status (SCHEDULED when there is no meta row). Cancelled slots are off the board.
Weeks start on Sunday in the viewer's offset. Tiles use the **current calendar week**, not the picker range, and compare with the previous week (chip omitted when that was zero; sparkline = last 8 weekly buckets):
Interviews This Week = live slots starting in the week; Confirmed = those with coordination status CONFIRMED; Pending Feedback = finished slots with no feedback (previous = the same count as of 7 days ago from the feedback timestamps); Reschedules = RESCHEDULE_PROPOSED events in the week.
Pending Feedback card: oldest first, days overdue = whole days since `feedback_due_at` (default: end + 24 h); 2+ red, 1 amber, under a day green.

## Web

`InterviewsPage.tsx` (+ `ScheduleCard`, `CalendarWeeks`, `DateRangePicker`, `Cards`, `Dialogs`, `bits`) in `components/ent/marketer-ws/interviews/`; `lib/ent/marketer-ws/interviews.ts`; BFF `app/api/orgs/[orgId]/mkt/interviews/**` (the `[action]` route whitelists reschedule/confirm/feedback/remind); dev mock `scripts/mock-mkt-interviews.mjs`.
New shared visual: `CodeBracketsIcon` (`packages/ui/src/enterprise/interviewIcons.tsx`). Art: `public/ent/marketer/interviews/*.png` (ten consultant photos cropped from the board; the bee banner is the shared one). Photos are reached only through `avatarUrl` (mock); the real API returns null and the avatar falls back to initials.

## Real vs empty, known gaps

- Every number and row comes from real rows; every card has its empty copy.
- The board's checklist has **seven** items (the task text said six); seven are created.
- The date-tile colours of the reminders follow the interview type (the board's tones follow no visible rule). The KPI delta chips use the shared chip, so a falling Pending Feedback / Reschedules draws the shared "down" look (the board colours those two inconsistently).
- "View all" on Upcoming, Checklist and Reminders moves the schedule to the next 30 days; on Pending Feedback it filters the last year to pending feedback. There is no separate page behind them.
- Recruiter / Contact: the meta recruiter name, falling back to the slot's interviewer name.
- The week grid shows hour rows (8 AM to 5 PM, widened to fit) and at most five weeks of the picked range.
- Marketer writes use the page's one permission through `MktScope.resolve` (READ-style gate); the ASSIGNED scope check is per interview. Testcontainers ITs (`MktInterviewsIT`) are written and compile but were not run here (no Docker).
- `OrgIsolationIT.COVERAGE` rows for these routes are NOT added (the brief says not to edit that file): add `GET/PATCH/POST /api/orgs/{orgId}/mkt/interviews/**` when merging.
