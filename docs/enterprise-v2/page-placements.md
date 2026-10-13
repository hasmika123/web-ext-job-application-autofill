# Page: Placements (`/w/admin/placements`)

> Branch `ent-placements` (cut from `ent-boards`, `ent-final` shared layer merged). Board: `design/enterprise-more/placements.png`. Data: `talent_placement`
> (talent foundation) plus the additive changeset `20261020010000_ent_placements.xml`. Rule E2 (CLAUDE.md): **everything here is a RECORD.** The bill rate is a
> number on the record; nothing moves money, nothing is signed. An extension request, an extension, a completion and a redeployment are rows with an
> event on the placement and one audit row; no sensitive PII (no phone, date of birth, document or bank numbers) is stored or shown.

## Schema (additive, one changelog, empty rollbacks)

`talent_placement` gains `placement_type` (CONTRACT / FTE / C2C), `account_manager_member_id`, `client_contact_id`, `redeployment_pool`,
`redeployment_date`, `completed_at` (composite tenant FKs to `org_member` and `client_contact`, indexes start with `org_id`) and the unique key
`(org_id, id)`. Existing rows are backfilled (account manager = the consultant's marketer, contact = the client's first contact, type = the job's employment).
New tables, all org-owned with composite FKs: `placement_extension` (REQUESTED, APPROVED, DECLINED, CANCELLED with from / requested end date, note, who and when),
`placement_note`, `placement_event` (append-only timeline; `prev_*` columns snapshot what Undo restores, `ref_id` points at the extension or note).

Stored status stays `ACTIVE` / `PENDING_START` / `ENDED`; what a row *shows* is derived from dates, so no daily job has to flip anything:
`ENDED` once completed, `UPCOMING` while the start date is ahead, `ACTIVE` otherwise.

## Endpoints (`/api/orgs/{orgId}/placements`, `OrgPlacementResource`)

| Route | What | Needs |
|---|---|---|
| `GET /` | table: `tab` (active, upcoming, completed, extensions; default active), `q` (2-80 chars: consultant, client, role, skill), `clientId`, `role`, `status` (repeatable/comma: ACTIVE, ENDING_SOON, UPCOMING, EXTENSION_REQUESTED, IN_POOL, COMPLETED), `managerId`, `type`, `startFrom/startTo/endFrom/endTo`, `sort=end\|start\|consultant\|client\|role\|rate,asc\|desc` (400 `SORT_INVALID`; default `end,asc`), `page`, `size` 1-100; `X-Total-Count` | `placements.view` or `placements.manage` |
| `GET /counts` | the 4 tiles (Active Placements, Starting Soon, Ending Soon, Redeployment Pool: value, value 30 days ago, delta, percent, 8 weekly points), the four tab counts and the windows in use | same |
| `GET /filters` | clients, roles, account managers that have placements in scope; types; the six status filters | same |
| `GET /pickers?kind=consultant\|client\|contact\|manager&q=&clientId=` | candidates for Add Placement (20 max; consultants who are not placed right now) | `placements.manage` |
| `GET /{id}` | drawer: details, client contact, engagement timeline, extensions, availability, timeline events, notes, `actions`, `undo` token | read |
| `POST /` | add (record) a placement; `Idempotency-Key` honoured; 409 `ALREADY_PLACED` | `placements.manage` |
| `POST /{id}/extend` | record an extension `{endDate, note?}`: the end date moves, the extension is listed APPROVED | manage |
| `POST /{id}/extension-requests` | request one `{requestedEndDate, note?}`; 409 `EXTENSION_ALREADY_REQUESTED` | manage |
| `POST /{id}/extensions/{extId}/decision` | `{decision: APPROVE\|DECLINE}`; 409 `EXTENSION_NOT_PENDING` | manage |
| `POST /{id}/complete` | `{note?}`: status ENDED, end date = today when it was later; 422 `PLACEMENT_NOT_STARTED`, `PLACEMENT_ENDED` | manage |
| `POST /{id}/redeploy`, `/redeploy/cancel` | join / leave the redeployment pool (`{availableFrom?}`, default the day after the end date); 409 `ALREADY_IN_POOL`, `NOT_IN_POOL` | manage |
| `POST /{id}/notes` | add a note (1-1000 chars, PII scanner) | manage |
| `POST /{id}/undo` | `{eventId}`: take back the caller's own latest change within ten minutes (extend, request, decide, complete, redeploy); the timeline keeps both events | manage |

Every body is bound **strictly** (an unknown property such as `orgId` is 422, like `OrgJobResource`). Scope: the scope `placements.view` / `placements.manage` is held at
decides the rows (ORG = all, TEAM / DEPARTMENT = placements whose account manager is in the caller's team, narrower = the caller's own). A write needs `placements.manage`
at a scope covering the placement's account manager. No key, out of scope, another tenant's id, a closed organization: the same generic **404** (never 403).
**Bill rate** (`billRateMinor`, `rateUnit`, `currency`) is `null` for a caller who holds neither `placements.manage` nor `finance.view`.
Audit rows: `PLACEMENT_CREATE`, `_EXTEND`, `_EXTENSION_REQUEST`, `_EXTENSION_DECIDE`, `_COMPLETE`, `_REDEPLOY`, `_REDEPLOY_CANCEL`, `_NOTE` (the text is never copied), `_UNDO`.

### Next Action pill and the windows (admin-configured, never constants)

Three org settings with safe defaults (`org_setting` row, then the global registry, then the default; out-of-range overrides are ignored):
`org.placements.ending_soon_days` = 45, `org.placements.ending_urgent_days` = 14, `org.placements.starting_soon_days` = 30.
Pill, in this order: completed and in the pool = "In redeployment pool" (blue), otherwise "No action"; upcoming and inside the starting window = "Starts in N days" (blue);
an end date already past = "Ended N days ago" (red, it still has to be completed); inside the ending-soon window = "Ends in N days" (amber, red inside the urgent window);
an extension request waiting = "Schedule review" (blue); everything else "No action".

### KPI deltas

Current values are the same rows the tabs and filters select (Active = not completed and started; Starting Soon = upcoming inside the starting window; Ending Soon = active with
an end date inside the window; Pool = rows flagged `redeployment_pool`). "vs last month" and the sparkline replay history: Active / Ending Soon from start and end dates
(a placement was running on a day when `start <= day < end`; an end date is the current one, extensions are not replayed), Starting Soon additionally needs `created_at <= day`, the Pool
replays `REDEPLOY_STARTED` / `REDEPLOY_CANCELLED` events. An organization with nothing 30 days old, or a flagged placement with no pool event, gets `previous = null` and the tile shows no delta.

## Web (`web/src/components/ent/placements`)

`PlacementsPage` (URL state: `tab`, `q`, `client`, `role`, `status`, `manager`, `type`, `sf/st/ef/et`, `sort`, `page`, `size`, `view`, `pl`, `dtab`; a link reproduces the view),
`KpiTiles`, `PlacementsTable` (table at desktop, cards on a phone or in grid view, pager), `DetailPanel` (docked in the right column from 1280 px, `SideSheet` below, `BottomSheet` on a phone;
Overview / Timeline / Extensions / Notes; Request Extension, Approve / Decline, Extend Placement, Mark Complete, Start Redeployment), `ExtensionDialog`, `AddPlacementDialog`
(searchable pickers), `HelpCard` (the page's ONE bee), `hooks.ts` (`usePlacementAction`: every change toasts what was recorded with an Undo). Tokens in `placements.css`
(no colour literals in the TSX: the tenant lint rule). BFF: one catch-all handler `web/src/app/api/orgs/[orgId]/placements/[[...path]]` (`placements-bff.ts`: numeric ids,
known routes, JSON object bodies only). Client and URL helpers: `web/src/lib/ent/placements.ts`. No Save buttons (a note, Add Placement and the date dialogs are explicit sends).
On a wide screen the board opens with its first row selected, as the board shows; closing the drawer keeps it closed.

## Real vs empty-state

Real from the API: all four tiles and deltas, the four tab counts, the table, every filter, sort and page, the drawer (details, engagement timeline, extension status, availability,
timeline, notes), add, extend, request / approve / decline, complete, redeploy and leave the pool, notes, Undo. Honest gaps (nothing is faked):

- No photos or logos exist: consultants, managers, contacts and clients are initials tiles.
- The checkboxes select rows (a count with Clear); the board names no bulk action, so none is built.
- Adding, completing or redeploying does **not** change the consultant's availability on the Consultants page (the placement is a record; syncing that is a later story).
- The Pool tile counts placements flagged for redeployment (a consultant has one open placement at a time, so it is consultants in practice).
- Extension history replay uses the current end dates (see KPI deltas); "Schedule review" does not schedule anything, it flags a request that needs a decision.
- The "Ask a question..." card opens the shell help panel (no question assistant yet).
- The web mock API has no talent data; the page runs against the real stack only.

## Demo data

`PlacementDemoSeeder` (same switches as the other demo seeders, dev only, enterprise demo organizations only, idempotent per organization): gives every active placement an end date
(about 5 percent inside 14 days, 9 percent more inside 45, the rest later), fills account manager / contact / type, adds upcoming placements for free consultants, extension requests
and recorded extensions, redeployment-pool members, notes, and one CREATED event per placement.

## Tests

- API: `OrgPlacementResourceIT` (tabs, filters, sort, tiles with honest deltas and no-history case, the organization's own windows, scope, rates only for those who may see them, generic 404 for
  every outsider and another tenant, every action with its event and one audit row, Undo, idempotency, strict bodies, PII refusal), the Placements routes in `OrgIsolationIT.COVERAGE`,
  `PlacementRulesTest` (status, pill, engagement), `TalentSchemaIT` (new tables and repositories).
- Web: `placements.test.ts`, `placements-bff.test.ts`, `PlacementsPage.test.tsx` (vitest); `e2e/journeys/tenant-placements.spec.ts` against the real stack
  (`playwright.real-placements.config.ts`): tiles, tabs, filters, drawer, extend / request / complete / redeploy with Undo, add, Beta cannot see Acme, 390 px phone.
