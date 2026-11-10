# Marketing > Applications (`/w/marketing/applications`)

Board: `design/enterprise-marketer/applications.webp`. Branch `mkt-applications` (off `ent-talent-marketer`). No new table: every number
is derived from existing rows, so there is no `mkt_applications` changelog and `master.xml` is untouched.

## Endpoints (`/api/orgs/{orgId}/mkt/applications`, BFF under `web/src/app/api/orgs/[orgId]/mkt/applications/**`)

| Method | Path | Key | What |
|---|---|---|---|
| GET | `` | `member.view_summary` + `pipeline.view` (ASSIGNED) | The whole board in one call: `kpis`, `tracker{items,total,page,size,tabs,filters,notShared}`, `funnel`, `overdue`, `overdueTotal`, `updates`, `perms`. Query: `q`, `consultantId`, `clientId`, `stage`, `period`, `funnelPeriod` (`1m 3m 6m 12m all`, default 3m), `sort` (`appliedOn,desc|asc`), `page` (0-based), `size` (default 8, max 100). |
| POST | `/{id}/notes` | `followups.manage` | Add a note (note row + `NOTE` event). |
| PATCH | `/{id}/next-action` | `followups.manage` | Set or clear (empty text) the next action and due date. |
| POST | `/{id}/follow-up-done` | `followups.manage` | Clear the next action, leave a timeline line. |
| POST | `/{id}/stage` | `submissions.record` | RECORD the stage the consultant reached (`STAGE_CHANGE` event). |

All gated by `MktScope.resolve` (generic 404 for non-members, flag off, missing key; ASSIGNED consultants only) plus `pipeline.view`.
An application of a consultant outside the caller's assignments, or of another tenant, is the same 404. Writes also answer 404 when
the consultant shares less than FULL. Free text goes through `SensitiveContent`; every write is audited (`MKT_APPLICATION_*`,
target `APPLICATION`, details hold the application code and the field name, never the text). `Idempotency-Key` is not used (the
writes are cheap, additive records).

## Stage map (one place: `MktApplicationStages`)

Applied = ASSIGNED + SUBMITTED, Awaiting Response = UNDER_REVIEW, Interviewing = INTERVIEWING, Offer = OFFER, Hired = CLOSED/HIRED,
Not Selected = CLOSED with REJECTED, NO_RESPONSE or WITHDRAWN (or no reason). Recording "Applied" writes SUBMITTED.

## Numbers (all from rows)

- **KPIs** (whole visible book): Active Applications = not CLOSED; Awaiting Response = UNDER_REVIEW; Interviewing; Offers. "vs last
  month" compares with the stage each application had 30 days ago, read from its `talent_application_event` history (a delta with
  nothing to compare is omitted); the sparkline is the same measure at 8 weekly points. (The board's mock shows Active = the All tab;
  honestly Active excludes closed rows, so the two differ whenever something is closed.)
- **Tabs**: counts under the current search/consultant/client/period filters, not the stage filter itself.
- **Funnel**: Applied = every application in the period; each later bar = how many reached that stage (current stage or any
  `to_stage` in their history); Hired = CLOSED/HIRED; % of the Applied total. Own period select.
- **Overdue Actions**: not CLOSED, FULL consent, `next_action_due < today`, most overdue first, top 5 (`overdueTotal` is the full count).
- **Recent Updates**: newest 5 timeline events (stage moves, notes, creation) with the board's dot colours.

## Consent (doc 38 s1)

Per consultant: no seat (`member_id` null, an org-managed profile) = FULL; a seat = `DataShareService.scopeOf` (FULL / SUMMARY / NONE).
SUMMARY shows the stage only: role, client, source, date and next action are null, the row carries a "Summary" `ConsentChip` and
dotted "Not shared" cells (tooltip), overdue shows nothing for them and updates only show stage moves without detail. NONE is left out
of every list and count and is only counted (`tracker.notShared`, shown as a one-line note under the table).

## Web

`web/src/components/ent/marketer-ws/applications/` (`ApplicationsPage`, `TrackerTable`, `RowActions`, `BottomCards`), lib
`web/src/lib/ent/marketer-ws/applications.ts`, dev mock `web/scripts/mock-mkt-applications.mjs`, art in
`web/public/ent/marketer/applications/` (8 consultant photos, Sarah Chen, 7 source logos, the bee banner; cropped from the board).
The kebab holds the four records above; the stage dialog says the consultant submits and nothing is sent to the client (E1).

## Known gaps

- `OrgIsolationIT.COVERAGE` was not edited (brief: do not touch); the owner must add the five routes there.
- ITs (`MktApplicationsIT`) need Docker and were compiled, not run.
- The mock's tab counts/KPIs are the board's static numbers; the real API computes them.
- Rows from consultants with no seat are always FULL; if the org later wants a consent for them it belongs on `consultant_profile`.
- Events for all visible applications are loaded in one IN query (fine for hundreds of rows; page it if a marketer ever sees many thousands).
- No avatar photos from the real API (`avatarUrl` null for consultants) -> initials; the mock sends the cropped photos.
