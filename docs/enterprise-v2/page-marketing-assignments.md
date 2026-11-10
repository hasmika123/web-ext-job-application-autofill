# Page: Marketing Assignments (`/w/admin/marketing-assignments`)

Branch `ent-marketing` (cut from `ent-talent`). Board: `design/enterprise-talent/marketing-assignments.png`. Data: `marketer_assignment`, `marketer_capacity`,
`consultant_profile` (+ `consultant_skill`, `talent_application`, `talent_placement`, `client_account` for search and filters), all from the talent foundation
(`talent-foundation.md`). Business rule (E1): a marketer prepares, requests and records. Nothing on this page submits an application, acts as a consultant, or
touches consent; an assignment never grants `member.act_for`.

## Endpoints (all under `/api/orgs/{orgId}/marketing-assignments`)

| Route | What | Permission |
|---|---|---|
| `GET /marketers?q&status` | marketers with workload (`assigned`, `capacity`, `percent`, `overloaded`) + the footer summary | `workload.view` or `assignments.manage` |
| `GET /marketers/candidates` | active members with a marketing role and no capacity yet | `assignments.manage` at ORG |
| `POST /marketers` | add a marketer: promotes an existing member (no account is created); `{memberId, capacity, title}` | `assignments.manage` at ORG |
| `PATCH /marketers/{memberId}` | capacity (1 to 200), status (ACTIVE / PAUSED), title label | `assignments.manage` covering the marketer |
| `GET /consultants` | the table: `marketerId` or `unassigned=true`, `q` (name, job title, email, skill; client name with `clients.view`), `status`, `priority`, `clientId` (needs `clients.view`), `availability`, `noBackup`, `sort`, `page`, `size`; `X-Total-Count` | view keys |
| `GET /filters` | statuses, priorities, availabilities, clients (only with `clients.view`) | view keys |
| `GET /kpis` | four tiles with `current`, `previous` (30 days ago), `delta`, `deltaPct`, an 8-week `series` | view keys |
| `GET /workload` | report: per marketer load, high priority, paused, without backup, open applications, backup-for | view keys |
| `POST /assign` | assign / reassign `consultantIds` to `marketerMemberId` (+ backup, priority, status). 409 `OVER_CAPACITY` with `capacity/current/adding/projected` unless `allowOverCapacity`; the override is audited at MEDIUM | `assignments.manage` covering the marketer (and the old marketer of a moved consultant) |
| `POST /update` | priority, status, backup or `clearBackup` on many assignments (exactly one field) | same |
| `POST /unassign` | take the assignment away | same |
| `POST /restore` | Undo: puts rows back from an earlier answer's `previous` (no capacity check) | same |

Every change needs an `Idempotency-Key` (400 `IDEMPOTENCY_KEY_MISSING` without; a replay answers the first result with `Idempotent-Replayed: true`) AFTER the
permission wall, answers 200 with a per-consultant result (`previous` = the assignment as it was, `{}` when there was none, null when unchanged), writes one audit row
per changed consultant (`MARKETING_ASSIGN`, `MARKETING_REASSIGN`, `MARKETING_UPDATE`, `MARKETING_UNASSIGN`, `MARKETING_RESTORE`) plus one `MARKETING_BULK` summary; marketer admin
writes `MARKETER_ADD` / `MARKETER_UPDATE`. No key, another tenant, an out-of-scope marketer or a missing marketer is the generic 404; a consultant that cannot be
reached inside a bulk call is skipped as `NOT_FOUND` (never an existence oracle). A team-scoped Marketing Manager sees and edits only the marketers in their team; an Org
Admin sees everything. Free text (the title label) goes through the PII scanner. Overloaded = `assigned * 100 >= 90 * capacity` (`TalentDemoSeeder.OVERLOAD_PCT`).

## Web

- `web/src/app/(tenant)/%5Ft/w/[workspace]/marketing-assignments/page.tsx` (server: session, gate, seeds `initialSearch` from the URL).
- `web/src/components/ent/marketing/`: `MarketingAssignmentsPage` (state, URL sync, undo), `KpiRow` (4 tiles + bee help card), `MarketersPanel`, `ConsultantsPanel`
  (DataTable, filters, bulk menu, pager), `dialogs` (Assign Consultants, marketer picker for reassign / backup, Add Marketer, capacity, workload report), `parts`.
- `web/src/lib/ent/marketing-assignments.ts` (types, URL <-> query, client, undo, tile deltas) and `marketing-assignments-bff.ts` + `app/api/orgs/[orgId]/marketing-assignments/[[...path]]/route.ts`.
- URL carries the selected marketer (`m`), the left search (`mq`, `ms`), the table search/filters (`q`, `status`, `priority`, `client`, `avail`, `nb`), `sort`, `page`, `size`.
- Gen Z UX: no Save buttons; every assign / reassign / unassign / priority / status / backup shows an Undo toast (9 s) that calls `/restore`; capacity saves when you leave the box.
- Responsive: panels stack under 1280 px, the table becomes cards under `md`; theme only through `--brand-*` tokens; initials avatars; one bee (greet) in the help card.

## Real vs empty

Real: every tile, delta, sparkline, card, workload percentage, summary figure, table row, backup, priority, status, active-apps count (open `talent_application` rows),
last activity (`marketer_assignment.last_activity_at`, set on every change here), the filters, the workload report.

- "vs last month" is rebuilt from timestamps (`assigned_at`, marketer `created_at`, consultant `created_at`). Moves and unassignments are not versioned, so the past is as the rows
  stand today; the API says so in `kpis.note`. A tile with no previous figure shows no delta.
- Marketer status is "current status", not history, in the Active Marketers and Overloaded series (capacity is today's).
- No photos (initials), no phone or email columns beyond the consultant's work email in the API payload.

## Known gaps

- `EntRepositoryContractTest` (api) fails on `ent-talent` already: it scans `repository.ent.talent` (JpaRepository interfaces of the foundation). Not changed here; it hides a possible
  violation by this page's `MarketingBoardRepository` (a bare `Repository` with `orgId` first, so it conforms).
- The nav item key stays `assignments`; its `href` is now `/w/admin/marketing-assignments`, the `marketing` module gate was removed from the Admin item (module off still hid it). The
  dashboard quick action "Assign Marketer" still points to `/w/admin/assignments` (its module is off; fix when the dashboard branch merges).
- The web mock API (`web/scripts/mock-api.mjs`) has no talent data, so the page needs the real stack.
- No assignment history table: the Activity of a consultant's assignment is the org audit log only. Capacity warning level (90 %) and the 200-consultant bulk cap are code constants, not admin settings yet.
- The over-capacity override has no hard ceiling; it is always audited.
- Client filter and client search use applications and placements (a consultant's client), not a direct consultant-client link, which the foundation does not have.
