# Marketing workspace page: Tasks (`/w/marketing/tasks`)

Branch `mkt-tasks` (off `ent-talent-marketer`). Board: `design/enterprise-marketer/tasks.webp`. Permission `followups.manage` (ASSIGNED for a Marketing Specialist, ORG sees all).
A task is a record of work the marketer owes (a note to self). Nothing here emails anyone, signs in as a consultant or submits an application (E1).

## Endpoints (`/api/orgs/{orgId}/mkt/tasks`, every one through `MktScope.resolve(me, "followups.manage")`; non-members, flag off, missing permission, a consultant or task outside the caller's reach: generic 404)
| Route | What |
|---|---|
| `GET ?tab=&category=&priority=&status=&owner=&due=&q=&page=&size=&sort=` | The whole board in one call: `kpis[total, overdue, dueThisWeek, completedThisWeek]` (value, deltaPct or null, 8-day sparkline), `tabs{all,my,team,overdue,dueThisWeek,completed}`, `tasks{items,total,page,size}` (default size 10, cap 100), `upcoming` (next 4 open deadlines), `options{consultants,clients,owners}`, `wide`. `tab` = ALL / MY / TEAM / OVERDUE / DUE_WEEK / COMPLETED; `owner` = member id or `me`; `due` = `yyyy-MM-dd` (UTC day); `sort` = dueAt / priority / title / status / owner / related, optional `,desc`. |
| `GET /calendar?month=yyyy-MM` | The days of the month that have tasks: `{date,total,open,topPriority}` (the coloured dots). |
| `GET /{id}/assignees` | Who the task can be handed to. |
| `POST /` | Create (own task, or for another marketer who can see the consultant). |
| `PATCH /{id}` | Edit the fields sent (title, detail, category, priority, status, dueAt, relatedLabel). COMPLETED stamps `completed_at`; leaving COMPLETED clears it. |
| `POST /{id}/complete`, `POST /{id}/reopen` | Complete / back to PENDING. |
| `POST /{id}/reassign {ownerMemberId}` | Hand over to the marketer or backup of the task's consultant (any marketer with assignments when the task has no consultant); anyone else: 404. |
| `DELETE /{id}` | Only the caller's OWN OPEN task (someone else's: 404; completed: 422). |

Writes audit as `MARKETER_TASK_CREATE|UPDATE|COMPLETE|REOPEN|REASSIGN|DELETE` (target TASK). Free text (title, detail, label) is trimmed, refused with angle brackets/control characters, and goes through `SensitiveContent` (422). Every reply carries `emailed: false`.

## Tables (`20261104110000_mkt_tasks.xml`)
- `mkt_task`: id, org_id, consultant_id null (composite FK consultant_profile), client_account_id null (composite FK client_account), related_label null ("All Consultants", an ATS name: for tasks about neither), title, detail (the sub line), category JOB_OPPORTUNITY/RESUME/CLIENT/JOB_MATCH/APPLICATION/JOB_STREAM/INTERVIEW/CONTENT/MARKETING/FOLLOW_UP, priority HIGH/MEDIUM/LOW, status NOT_STARTED/PENDING/IN_PROGRESS/COMPLETED, due_at, completed_at, owner_member_id (composite FK org_member), created_by_member_id, created_at, updated_at. Unique `(org_id,id)`, every index starts with org_id.
- `mkt_task_event`: id, org_id, task_id (composite FK), kind CREATED/UPDATED/COMPLETED/REOPENED/REASSIGNED, note, occurred_at, by_member_id. Deleting a task deletes its events first.
- Repositories (bare `Repository`, orgId first): `MktTaskRepository`, `MktTaskEventRepository`, `MktTaskConsultantRepository` (names for rows and the Add Task picker).

## Reach, tabs and formulas (UTC, "now" from the request clock)
- **Reach:** an ORG-scope caller (`MktScope.View.all()`) sees every task. A narrower caller (ASSIGNED) sees only the tasks they OWN, and only those about a consultant they may see (or about none). So **Team Tasks is 0 for a Marketing Specialist**; a manager/admin sees teammates' tasks there. TEAM scope is treated like ASSIGNED (`MktScope` does not widen it).
- **Open** = not COMPLETED. **All / My / Team** tabs and **Total Tasks** count open tasks (the board's "All Tasks 24"); My = owner is the caller; Team = open and owned by someone else. **Overdue** (derived) = open and due before now. **Due This Week** = open and due in `[now, now+7d)`. **Completed** / **Completed This Week** = completed in the last 7 days. Default list order: due ascending (Completed tab: newest first).
- **Deltas** compare with the same moment a week ago, from `created_at`/`completed_at` (no history table): Total = open then vs now; Overdue = open and already past due then; Due This Week = tasks open then and due in the 7 days after; Completed = the previous 7 days. No previous value: delta omitted (no chip). Sparklines are 8 daily points (open at the end of each day, overdue at, due that day, completed that day).
- **Upcoming Deadlines** = the next 4 open tasks due from now on. **Calendar** dots use the highest priority among that day's tasks (any status).

## Demo data (`MktTasksDemoSeeder`)
Runs on `ApplicationReadyEvent` after the tenants and talent exist (no shared class edited); same switches as the other demo seeds (`DEMO_ENABLED`, `ENT_DEMO_SEED`, never prod). Per marketer with assignments: 24 open tasks (5 overdue, 8 due within 7 days, 11 later) and 16 completed in the last 7 days, all owned by that marketer and, when about a consultant, one of THAT marketer's consultants; the board's ten titles/subtitles/types cycle. Idempotent (an org that already has tasks is skipped).

## Web
- Page `web/src/components/ent/marketer-ws/tasks/` (`TasksPage`, `TaskKpiTile`, `TaskTable`, `TasksRail`, `TaskDialog`), lib `web/src/lib/ent/marketer-ws/tasks.ts`, BFF `web/src/app/api/orgs/[orgId]/mkt/tasks/**`, dev mock `web/scripts/mock-mkt-tasks.mjs` (the board's rows; the mock caller is "wide" so My 18 / Team 6 appear), art `web/public/ent/marketer/tasks/` (hero illustration, 5 consultant faces, 2 owner faces, AWS logo, all cropped from the board).
- New shared visuals in `packages/ui/src/enterprise/task-visuals.tsx` (`MiniBars` = the KPI tiles' bar chart, `AlarmClockIcon`) plus one export block at the end of `enterprise/index.ts`.
- Send Reminder / Log Call open the member's Follow-ups page (`hrefs.followups`) and Schedule opens Interviews (`hrefs.interviews`); when the member's menu lacks the page they open the Add Task form with that kind of task. Calendar "View All" resets the filters; Upcoming "View All" opens the Due This Week tab; a calendar day sets the Due Date filter. The list-view button toggles compact rows. Checked rows get a small "Mark complete" bar.

## Real vs empty
Everything is real rows. An org with no tasks draws zero tiles with no chips, "No tasks yet. Add one to get started.", "No upcoming deadlines." and "Showing 0 of 0 tasks". `avatarUrl` is always null from the real API (initials); the mock returns the board's cropped faces.

## Known gaps
- Calendar days and the Due Date filter use UTC days on the server and local days in the browser; near midnight a task can sit on the neighbouring day.
- The Overdue tile uses a new alarm-clock glyph; the Total Tasks tile uses the clipboard icon, not the board's exact clipboard-with-lines.
- The header search box is the shell's global search, not a task filter (`q` is supported by the API).
- `OrgIsolationIT.COVERAGE` was not extended (brief says not to edit that file): the owner should add the `/api/orgs/{orgId}/mkt/tasks/**` rows.
- `MktTasksIT` (Testcontainers) is written and compiles but could not be run here (no Docker).
