# Consultant workspace: Tasks & Follow-ups (`/w/consultant/tasks`)

Board: `design/enterprise-consultant/tasks.webp`. The consultant's own to-do list. Tasks are the same `cws_task` rows the Home page's Tasks card and
Today's Focus read, so completing, editing or deleting one here shows on Home. Nothing here is sent to anyone; no auto-apply, no submission.

## Endpoints (all `/api/orgs/{orgId}/me-workspace/tasks`, gate `ConsultantHomeService.requireSelf`, generic 404 otherwise)

| Verb + path | What |
|---|---|
| GET `` | whole page: tiles, filtered/sorted page of tasks + tab counts, Today's Focus, Upcoming Deadlines, Insights, Reminders, job options, assigner names |
| GET `/list` | the table only (same filters), for callers that do not need the cards. The web page uses the single GET above |
| POST `` | create. Body `{title, dueOn?, priority?, type?, requirementId?}`. 201 + the row |
| PUT `/{id}` | edit: replaces title, due date, priority, type, linked job (an omitted due date / job clears it). Never changes the status |
| PUT `/{id}/status` | body `{status}` = NOT_STARTED / IN_PROGRESS / PENDING / DONE. DONE stamps `completed_at` (kept if already done); any other status clears it. Idempotent |
| DELETE `/{id}` | deletes the task (its detail row cascades). 204; a second call is a 404 |

List parameters (all optional, validated, 422 on a bad one): `tab` ALL/TODAY/WEEK/OVERDUE/COMPLETED, `type`, `priority` HIGH/MEDIUM/LOW,
`assignedBy` (`SELF` or a marketer name), `due` ANY/OVERDUE/TODAY/NEXT_7/NEXT_30/NO_DATE, `q` (title, job, company or type label, max 100),
`sort` due/title/priority/status/completed, `dir` asc/desc, `page`, `size` (default 8, **max 50**).

Writes need only the consultant gate plus own rows (no `applications.manage`). Title 3..200 characters, scanned by `SensitiveContent` (422
`SENSITIVE_CONTENT`); `dueOn` is `yyyy-MM-dd` within one year back and ten years ahead; unknown priority/type/status = 422. `requirementId` must be a job
from the caller's own matches or applications in this organization, otherwise the **generic 404** (unknown, other tenant, someone else's job all look
the same). Another consultant's / another tenant's task id = generic 404. A consultant may keep up to 500 tasks (422 beyond).

## Definitions (honest numbers, UTC calendar day like Home)
- Open = status not DONE. **Total Tasks** = all of the consultant's tasks. **Due Today** = open, due today. **Upcoming** = open, due tomorrow..today+6.
  **Overdue** = open, due before today. **Completed This Week** = completed in the last 7 days.
- Deltas: for the first four, the value now vs how many of those same tasks already existed a week ago (`created_at`); Completed This Week compares the
  last 7 days with the 7 before (`completed_at`). **No delta (null) when the earlier count is 0.** Each tile has a six-week sparkline.
- Tabs (counts always over all tasks, never the filtered set): All, Due Today, This Week (open, due today..today+6), Overdue, Completed.
- Insights ring: every task lands in exactly one of Completed / Overdue / In Progress (IN_PROGRESS or PENDING, not overdue) / Not Started (not overdue),
  so the counts add up to the total; percent = completed / total. The "great progress" note exists only when more tasks were completed this week than last
  (`"...N% more tasks than last week"`, or `"...completed N task(s) this week"` when last week was 0); otherwise `note` is null and the page claims nothing.
- Today's Focus: tasks due today (done ones shown checked, listed first) plus open overdue tasks, at most 6. The checkbox toggles DONE / NOT_STARTED.
- Upcoming Deadlines: open tasks with a due date today or later, soonest first, 4. Reminders (derived, max 5): scheduled interviews in the next 7 days,
  pending submissions (`cws_submission`), applications whose next action is due. Hrefs are workspace paths.

## Data
New table `cws_task_detail` in `api/src/main/resources/config/liquibase/changelog/20261103120000_ent_cws_tasks_v2.xml` (NOT registered in master.xml;
the coordinator adds it). Companion to `cws_task`, which is untouched: composite tenant FKs to `cws_task` (ON DELETE CASCADE), `consultant_profile`,
`client_requirement` (nullable linked job) and `org_member` (nullable `assigned_by_member_id`), unique `(org_id, task_id)`, one index starting with
`org_id`. Columns: `task_type`, `requirement_id`, `assigned_by_member_id`, `assigned_by_label`, `sample_data`. Entity `CwsTaskDetail`, repos
`CwsTaskDetailRepository` and `CwsTaskAccessRepository` (new org+consultant scoped reads of `cws_task`; the old `CwsTaskRepository` is not edited).
A task with no detail row = a general (type OTHER) self-made task. Task types: RESUME_PROFILE, SUBMISSION_APPROVAL, INTERVIEW_COORDINATION,
INTERVIEW_PREPARATION, COMMUNICATION, CLIENT_REQUIREMENTS, AVAILABILITY, OFFER_REVIEW, OTHER (labels in `tasks.ts`; a candidate to move to admin config).

**Real vs SAMPLE.** Everything the consultant does is real. "Assigned By" a marketer is a SAMPLE stand-in: the marketer role cannot assign tasks in this
branch, so `ConsultantWsTasksDemoSeeder` writes a display label (`assigned_by_label`, e.g. "Michael Park") with `sample_data = true`; the DTO carries
`assignedBy.sample` and the page shows a Sample mark plus a note. The consultant cannot set "assigned by" (creating always means "You"). If the marketer
role later writes `assigned_by_member_id`, the name is resolved from the seat and no label is needed.

## Delete and undo (choice)
Client-side delay-then-delete: the row hides, a toast offers Undo for 6 s, and `DELETE` is sent only when the window ends (or immediately, with
`keepalive`, if the consultant leaves the page inside the window). Undo therefore needs no restore endpoint and no soft-delete column (a soft delete
would have to be honoured by the Home page, which reads `cws_task` directly).

## Web
`components/ent/consultant-ws/TasksPage.tsx` (+ test), `lib/ent/consultant-ws/tasks.ts` (+ test), route `app/(tenant)/%5Ft/w/consultant/tasks/page.tsx`,
BFF `app/api/orgs/[orgId]/me-workspace/tasks/**` (shape checks only: numeric ids, short-token query values, known body fields). Filtering, sorting and
paging are API calls (the page refetches `GET ``?query`; search is debounced 300 ms). Columns below 2xl: Assigned By folds under the task name; the table
has `min-w-[680px]` in an `overflow-x-auto`; single-column grids use `grid-cols-[minmax(0,1fr)]`; rail Quick Actions are `xl:grid-cols-1 2xl:grid-cols-2`.
Right rail: bee card, Quick Actions (Update My Resume, View Job Matches, Prepare for Interview, Set My Availability: plain links), Reminders.
No `packages/ui` change.

## OrgIsolationIT rows to add
GET `/api/orgs/{orgId}/me-workspace/tasks`, GET `.../tasks/list`, POST `.../tasks` (body `{"title":"A valid title"}`), PUT `.../tasks/{id}` (body
`{"title":"A valid title"}`), PUT `.../tasks/{id}/status` (body `{"status":"DONE"}`), DELETE `.../tasks/{id}`. Table `cws_task_detail` org-first
fixtures: any row with `(org_id, consultant_id, task_id)`.

## Wiring for the coordinator
1. master.xml: add the include of `20261103120000_ent_cws_tasks_v2.xml` (end).
2. EnterpriseDemoBootstrap: call `ConsultantWsTasksDemoSeeder.seed()` after `ConsultantWsDemoSeeder` (it adds details to the five base tasks and eight more).
3. workspaces.json: flip `tasks` live.
4. Home needs no change (it already reads `cws_task`; verified in the IT that completing / creating / deleting here is reflected there).

## Known gaps
- Filtering/sorting/paging run over the consultant's own rows in memory (capped at 500 tasks), not in SQL.
- "Today" is the UTC day (same as Home); a consultant far from UTC may see a task move to Overdue a few hours early or late.
- Task type labels, the Upcoming window (6 days) and the 500 cap are static defaults that should become admin config.
- Reminders do not include the "waiting for marketer feedback" kind from the board (no such data exists yet).

## Tests
`ConsultantTasksResourceIT` (13 tests: values/tiles/tabs/insights/focus/deadlines/reminders, honest note, server-side filters/sort/paging/422s, no leak
between consultants, other org / non-consultant / flags-off 404 on every route, empty consultant, create + validation + PII + cross-tenant job 404, edit,
status + idempotency + Home reflection, delete, seeder idempotency). Web: `tasks.test.ts`, `TasksPage.test.tsx`.
