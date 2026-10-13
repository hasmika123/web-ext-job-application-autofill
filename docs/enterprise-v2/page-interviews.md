# Page: Interviews (`/w/admin/interviews`)

> Branch `ent-interviews` (cut from `ent-boards`). Board: `design/enterprise-more/interviews.png`. Data: `talent_interview` of the talent foundation
> (`talent-foundation.md`) plus the additive tables of changeset `20261020010000_ent_interviews.xml`.
> Rule E1 (CLAUDE.md): **Kiwiply never attends, runs or sends anything for an interview.** Schedule, Reschedule, Send Reminder and Add Feedback are
> RECORDS of what was arranged or what happened. A reminder is a recorded request: no message leaves the system (no existing notification
> mechanism is used by the sibling pages, so none is used here), and the toast says exactly that.

## Data added (own changeset, nothing existing was edited)

| What | Columns |
|---|---|
| `talent_interview` gains | `round_no`, `mode` (VIDEO, ONSITE, PHONE; default VIDEO), `meeting_link`, `location`, `notes`, `next_step`, `reminder_requested_at`; unique `(org_id, id)` and an index on the application |
| `talent_interview_interviewer` | the client-side interviewers: name, title, primary flag, sort order |
| `talent_interview_event` | append-only history: `CREATED`, `STATUS`, `STATUS_REVERT`, `RESCHEDULE`, `REMINDER`, `FEEDBACK`, `UPDATE` |
| `talent_interview_feedback` | rating 1-5, recommendation ADVANCE/HOLD/DECLINE, a short note, author |

Statuses: `SCHEDULED`, `IN_PROGRESS` (recorded when the interview started and feedback is still to complete), `COMPLETED`, `CANCELLED`. The foundation's
three statuses are unchanged; `IN_PROGRESS` is new. The role and its code come from the linked application (`JOB-<1000 + job id>`, `INT-<1000 + id>`
are display codes derived from the ids, no column). An interview without an application is allowed (the client is picked instead) and reads "Not linked to a job".

## Endpoints (`/api/orgs/{orgId}/interviews`, `OrgInterviewResource`)

| Route | What | Needs |
|---|---|---|
| `GET /` | table: `q` (2-80 chars: role, consultant, client, round, interviewer, `JOB-` or `INT-` code), `status` (repeatable/comma), `clientId`, `consultantId`, `round`, `mode`, `from`/`to` (scheduled day), `sort=scheduled\|role\|consultant\|client\|round\|status\|mode,asc\|desc` (400 `SORT_INVALID`), `page`, `size` 1-100; `X-Total-Count` | `pipeline.view` |
| `GET /counts` | the 4 tiles with a weekly series | `pipeline.view` |
| `GET /filters` | clients, consultants, rounds that have interviews in scope, the statuses and modes, and the organization's limits | `pipeline.view` |
| `GET /pickers?kind=consultant\|application\|client&q=&consultantId=` | candidates for Schedule Interview (20 max) | `interviews.coordinate` |
| `GET /pipeline` | four columns, total + the 20 nearest cards, same filters as the table | `pipeline.view` |
| `GET /analytics` | by status, per month (6), by mode, by round, top clients, completion rate, upcoming 7 days, per week | `pipeline.view` |
| `GET /{id}` | drawer: stepper, timeline, feedback, documents, interviewers, meeting details, `actions`, `nextStatuses`, `undo` token | `pipeline.view` |
| `POST /` | schedule (record) an interview; strict body (an unknown property is 422); `Idempotency-Key` honoured; 409 `SLOT_OVERLAP` | `interviews.coordinate` |
| `PATCH /{id}` | `nextStep`, `notes`, `meetingLink`, `mode`, `location`, `interviewers`; unknown key 422 `FIELD_UNKNOWN`; a no-op writes nothing | `interviews.coordinate` |
| `POST /{id}/reschedule` | record a new time `{scheduledAt, durationMinutes?, reason?}`; a cancelled interview comes back as Scheduled | `interviews.coordinate` |
| `POST /{id}/status` | record `{status, reason?}` or revert the caller's own latest change `{undoEventId}` | `interviews.coordinate` |
| `POST /{id}/reminder` | record a reminder request (scheduled interviews only; 409 `REMINDER_RECENT` inside the cool-down) | `interviews.coordinate` |
| `POST /{id}/feedback` | `{rating, recommendation, note?}` once the interview started | `interviews.coordinate` |

Scope: the scope `pipeline.view` is held at decides the rows (ORG = all, TEAM/DEPARTMENT = interviews whose marketer is in the caller's team,
ASSIGNED/OWN = their own). An interview belongs to the marketer of its application, or of its consultant's assignment when it has no application.
A write needs `interviews.coordinate` at a scope covering that marketer. No key, out of scope, another tenant's id, a closed organization: the same
generic **404** (never 403). Free text goes through `SensitiveContent` (no SSN, card numbers and so on). Every mutation writes one event on the interview
and one audit row (`INTERVIEW_CREATE`, `_UPDATE`, `_RESCHEDULE`, `_STATUS`, `_STATUS_UNDO`, `_REMINDER`, `_FEEDBACK`); free text never goes into the audit row.

### Status machine (`InterviewStatuses`)

`SCHEDULED` -> `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; `IN_PROGRESS` -> `COMPLETED`, `CANCELLED`; `COMPLETED` and `CANCELLED` are final except that Reschedule
brings a cancelled interview back as Scheduled. Anything else is 422 `INVALID_TRANSITION` (with the allowed statuses). **Undo** is the only way back:
the caller's own latest status change, within the organization's undo window, with nothing recorded after it, appends a `STATUS_REVERT` event.

### Limits are settings, not constants

`org.interviews.undo_minutes` (10), `org.interviews.max_interviewers` (6), `org.interviews.reminder_cooldown_minutes` (60),
`org.interviews.max_duration_minutes` (480): registered in `EnterpriseSettingKeys` (admin Settings page) and overridable per organization in
`org_setting` (`InterviewSettings`, same resolution as `MarketingSettings`). The web reads them from `GET /filters` (`limits`).

### KPI deltas

Each interview's status over time is rebuilt from its creation time, the `STATUS`/`RESCHEDULE`/`STATUS_REVERT` events and, when the row says more than the
events do, its current status at its last update. Total, In Progress and Completed compare with **thirty days ago**; "Scheduled This Week" counts the
non-cancelled interviews of the calendar week against last week ("vs last week"). An organization with no interview 30 days old gets `previous = null`
and the tile shows no delta (never an estimate); a comparison of 0 shows the plain "+N". The current value is a live count.

## Web (`web/src/components/ent/interviews`)

`InterviewsPage` (URL state: `tab`, `q`, `status`, `client`, `consultant`, `round`, `mode`, `from`, `to`, `sort`, `page`, `size`, `layout`, `month`, `iv`, `dtab`;
a link reproduces the view), `KpiTiles` (the shared `KpiTile`), `InterviewsTable` (table at desktop with row checkboxes, cards on a phone, a grid layout,
centred pager with "n per page"), `Views` (`CalendarView` month grid with an agenda list on a phone, `PipelineBoard` by status, `AnalyticsTab`),
`DetailDrawer` (docked card in the right-hand column under the bee card at 1280 px and up, `SideSheet` over the page on a tablet, `BottomSheet` on a phone;
Details with the Interview Progress stepper / Timeline / Feedback / Documents; Meeting Details with a copyable link; Interviewers with Primary; Notes;
footer Reschedule, Send Reminder, Add Feedback), `Dialogs` (Schedule Interview with searchable pickers, Reschedule, Add Feedback), `HelpBeeCard` (the page's ONE bee),
`hooks.ts` (every status change toasts "recorded as X" with an Undo). On a wide screen the board opens with its first interview in the drawer, once, unless it was closed.
BFF: one catch-all handler `web/src/app/api/orgs/[orgId]/interviews/[[...path]]` (`interviews-bff.ts`). Client and URL helpers: `web/src/lib/ent/interviews.ts`.
No Save buttons (notes, next step, meeting link, location and interviewers save as you type). Times are shown and entered in UTC, like the other pages.

## Demo data

`InterviewDemoEnricher` (demo switches only, after startup, idempotent) gives each seeded interview a round number, a mode, a meeting link or a location,
interviewers (the client's contacts plus an invented extra), notes, a next step, a recorded history and some feedback, and records the most recent
finished interviews as In Progress. It also moves a `created_at` that the foundation's seed put in the future back to now.

## Real vs empty-state

Real from the API: the four tiles, deltas and sparklines, table, filters, calendar, pipeline, analytics, drawer (stepper, timeline, feedback, documents, interviewers,
meeting details), schedule, edit, reschedule, status change with undo, reminder record, feedback. Honest gaps (nothing is faked):

- No photos or logos exist: consultants, clients and interviewers are initials tiles (the board shows photos and brand logos).
- The "Active" pill is the consultant profile's status; the purple pill is the consultant's job title.
- Documents shows the resume of the linked application; there is no other document store for interviews.
- A reminder, a reschedule and a schedule notify nobody: they are records. There is no calendar invite or email.
- "More Filters" holds Mode, Consultant and Round; the sort menu offers five columns (the header cells sort seven).
- Reschedule has no Undo toast (reschedule again to move it); status changes do.
- The mock API (`web/scripts/mock-api.mjs`) has no talent data; the page runs against the real stack only.

## Tests

- API: `OrgInterviewResourceIT` (scope, generic 404s for every outsider and B's owner, status machine, undo, create/idempotency/overlap, honest deltas, PII refusal,
  reschedule, reminder cool-down, feedback, one audit row per mutation), plus the Interviews routes in `OrgIsolationIT.COVERAGE`.
- Web: `interviews.test.ts`, `interviews-bff.test.ts`, `InterviewsPage.test.tsx` (vitest); `e2e/journeys/tenant-interviews.spec.ts` against the real stack
  (`playwright.real-interviews.config.ts`, desktop at the board's 1448 x 1086 and a 390 px phone).
