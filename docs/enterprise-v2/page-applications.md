# Page: Applications (`/w/admin/applications`)

> Branch `ent-applications` (cut from `ent-talent`). Board: `design/enterprise-talent/applications.png`. Data: `talent_application`,
> `talent_application_event`, `talent_application_note` of the talent foundation (`talent-foundation.md` section 5 holds the KPI formulas).
> Rule E1 (CLAUDE.md): **Kiwiply never submits an application.** Marketers prepare, request and record; the consultant submits. Every stage
> change on this page is a RECORD of what happened ("Submitted" means the consultant submitted it). There is no submit action anywhere.

## Endpoints (`/api/orgs/{orgId}/applications`, `OrgApplicationResource`)

| Route | What | Needs |
|---|---|---|
| `GET /` | table: `q` (2-80 chars: job, consultant, client, code, stage, next action), `stage` (repeatable/comma), `jobTitle`, `clientId`, `marketerId`, `from`/`to` (applied date), `sort=applied\|job\|consultant\|client\|stage\|nextAction,asc\|desc` (400 `SORT_INVALID`), `page`, `size` 1-100; `X-Total-Count` | `pipeline.view` |
| `GET /counts` | 4 KPI tiles (Total, In Review = Submitted + Under Review, Interviewing, Offers): value, value 30 days ago, delta, percent, 8 weekly sparkline points | `pipeline.view` |
| `GET /filters` | the dropdown options (job titles, clients, marketers that have applications in scope; the six stages) | `pipeline.view` |
| `GET /pickers?kind=consultant\|job\|marketer&q=` | candidates for Add Application (20 max) | `submissions.prepare` or `opportunities.manage` |
| `GET /pipeline` | six columns, total + the 20 most recently moved cards, same filters as the table | `pipeline.view` |
| `GET /analytics` | counts: by stage, ever-reached funnel, per month (6), closing reasons, top clients, sources, marketers, average age of open applications | `pipeline.view` |
| `GET /{id}` | drawer: stepper dates, timeline, notes, activity, details, `actions`, `nextStages`, `undo` token | `pipeline.view` |
| `POST /` | add (record) an application; `Idempotency-Key` honoured; 409 `DUPLICATE_APPLICATION` | `submissions.prepare` / `opportunities.manage` |
| `PATCH /{id}` | `nextAction`, `nextActionDue`, `marketerMemberId` (a JSON null clears); unknown key 422 `FIELD_UNKNOWN`; a no-op writes nothing | write keys; the marketer needs `assignments.manage` |
| `POST /{id}/stage` | record a move `{stage, closedReason?}` or revert the caller's own latest one `{undoEventId}` | `submissions.record` / `followups.manage` / `offers.manage` |
| `POST /{id}/notes` | add a note (1-1000 chars) | write keys |

Scope (`ApplicationAccess`): the scope `pipeline.view` is held at decides the rows: ORG = every application, TEAM/DEPARTMENT = applications
whose marketer is in the caller's team, ASSIGNED/OWN = applications the caller is the marketer of. A write needs one of the keys at a scope that
covers the application's marketer. No key, out of scope, another tenant's id, a closed organization: the same generic **404** (never 403).
Free text goes through `SensitiveContent` (no SSN, card numbers and so on). Mutations write an event row on the application and one audit row
(`APPLICATION_CREATE`, `APPLICATION_UPDATE`, `APPLICATION_STAGE`, `APPLICATION_STAGE_UNDO`, `APPLICATION_NOTE`); notes never put their text in the audit row.

### Stage machine (`ApplicationStages`)

Assigned, Submitted, Under Review, Interviewing, Offer, Closed. Moves go forward (a stage may be skipped when the record is catching up);
any open stage may close with a reason (Hired, Rejected, Withdrawn, No response); a closed application stays closed. A backwards move is
422 `INVALID_TRANSITION` (with the allowed stages). **Undo** is the only way back: the caller's own latest move, within ten minutes, with
nothing recorded after it, appends a `STAGE_REVERT` event (history is append-only) and the stepper forgets the reverted stage's date.
"Submitted" needs `submissions.record`; an offer needs `offers.manage` or `followups.manage`.

### KPI deltas

"vs last month" is rebuilt from `talent_application_event` (`CREATED`, `STAGE_CHANGE`, `STAGE_REVERT`): every application's stage at now-30d and
at eight weekly points is replayed from its latest event up to that instant. An organization with no application 30 days old gets
`previous = null` and the tile shows no delta (never an estimate). The current value is a live count.

## Web (`web/src/components/ent/applications`)

`ApplicationsPage` (URL state: `tab`, `q`, `stage`, `job`, `client`, `marketer`, `from`, `to`, `sort`, `page`, `size`, `app`, `dtab`; a link reproduces the
view), `KpiTiles` (tile, `Sparkline`, `DeltaChip`), `ApplicationsTable` (table at desktop, cards on a phone, pager), `PipelineBoard`
(`KanbanBoard`, cards move by their menu, no dragging), `AnalyticsTab` (`DonutChart`, `BarChart`, bars), `DetailDrawer` (`SideSheet` / `BottomSheet`;
stepper, Overview / Timeline / Notes (n) / Activity, edit with autosave, "Record a move" menu), `AddApplicationDialog` (searchable pickers),
`HelpBeeCard` (the page's one bee: the promo card when no application is open, the help card in the drawer when one is), `hooks.ts`
(`useApplicationDetail`, `useStageMove`: every move toasts "recorded as X" with an Undo). BFF: one catch-all handler
`web/src/app/api/orgs/[orgId]/applications/[[...path]]` (`applications-bff.ts`: numeric ids, known routes, JSON object bodies only).
Client and URL helpers: `web/src/lib/ent/applications.ts`. No Save buttons (fields save as you type; a note and Add application are explicit sends).

## Real vs empty-state

Real from the API: all four tiles, deltas, sparklines, table, filters, pipeline, analytics, drawer (stepper dates, timeline, notes, activity, details), add,
edit, stage moves, undo, notes. Honest gaps (nothing is faked):

- No logos or photos exist: consultants, clients and marketers are initials tiles. The client second line ("Acme Corp") is the organization's name,
  as on the board.
- `View Job` / `View Profile` link to the Jobs and Consultants workspace pages when the member's menu lists them (those pages are built on other
  branches; the links carry no query string because their contract is not fixed).
- Row checkboxes and bulk actions of the board are not built (the brief names none); the row menu has View details, Record the next stage,
  Close application, Add note, Edit next action, Copy application ID.
- Marking a candidate Hired only records the closing reason; it does not create a placement (the Placements page is not part of this build).
- The "Ask a question..." card opens the shell's help panel (the assistant is not switched on yet).
- Sparklines and "vs last month" replay events in memory per request (fine for thousands of rows; a materialised history is a later optimisation).
- The web mock API (`web/scripts/mock-api.mjs`) has no talent data; the page runs against the real stack only.
- `PATCH` has no `If-Match`: edits are last-writer-wins (each field saves on its own and the history shows who changed what).

## Tests

- API: `OrgApplicationResourceIT` (scope, generic 404s for every outsider and B's owner, stage machine, undo, create/idempotency/duplicates,
  honest deltas, PII refusal, one audit row per mutation), plus the Applications routes in `OrgIsolationIT.COVERAGE`.
- Web: `applications.test.ts`, `applications-bff.test.ts`, `ApplicationsPage.test.tsx` (vitest); `e2e/journeys/tenant-applications.spec.ts`
  against the real stack (`playwright.real-applications.config.ts`).
