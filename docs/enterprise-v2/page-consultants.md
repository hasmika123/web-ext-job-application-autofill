# Page: Consultants (`/w/admin/consultants`)

Branch `ent-consultants` (cut from `ent-talent`). Board: `design/enterprise-talent/consultants.png`. Data: the talent foundation (`talent-foundation.md`).
Everything on the page comes from rows; there is no sample number anywhere.

## Endpoints (`/api/orgs/{orgId}/consultants`, `OrgConsultantResource`)

| Route | Needs | Notes |
|---|---|---|
| `GET /` | `consultants.view` | server-side search (`q`: name, email, title, location, skill), `availability`, `skill`, `license`, `marketerId` (seat id or `none`), `workMode`, `status` (ACTIVE default / INACTIVE), `departmentId`, `sort` (name, experience, availability, license, profile, joined), `page`, `size` (1-100). `X-Total-Count`. 400 `SORT_INVALID` / `FILTER_INVALID`. |
| `GET /counts` | `consultants.view` | four tiles (Total, Available, On Project, Needs Review): `value`, `previous`, `delta`, `deltaPercent`, `series` (8 weekly points). |
| `GET /filters` | `consultants.view` | skills seen, marketers with `workload / capacity`, departments. |
| `GET /{id}` | `consultants.view` | drawer: row, skills, checklist, marketer, `actions` (what the caller may do), `version` (also the `ETag`). |
| `GET /{id}/assignments`, `/applications`, `/activity`, `/job-options` | view (job-options: `opportunities.manage`) | lazy drawer tabs. Activity adds audit rows about the consultant for callers with `audit.view`. |
| `POST /` | `consultants.edit` | add a consultant. `Idempotency-Key` required. 201. `CONSULTANT_CREATE`. 409 `CONSULTANT_EXISTS` (email unique per org). |
| `PATCH /{id}` | `consultants.edit` | `jobTitle, yearsExperience, locationLabel, workMode, availabilityStatus, availableFrom, licenseStatus, licenseValidUntil, departmentGroupId`; any other key 422. `If-Match` required (428 / 412). `CONSULTANT_UPDATE`, none when nothing changed. |
| `POST /{id}/marketer` | `assignments.manage` | assign or move the marketer (needs active `marketer_capacity`; a TEAM holder may only name marketers inside their team). `CONSULTANT_ASSIGN`. |
| `POST /{id}/deactivate` / `reactivate` | `consultants.edit` | deactivate needs a 10-500 character reason. `CONSULTANT_DEACTIVATE` / `CONSULTANT_REACTIVATE`. |
| `POST /{id}/applications` | `opportunities.manage` | create an application in stage ASSIGNED for an OPEN job (+ CREATED event, the match becomes ASSIGNED). `Idempotency-Key` required. 409 `APPLICATION_EXISTS`, 422 `JOB_NOT_OPEN`. `APPLICATION_CREATE`. |
| `POST /bulk/availability`, `/bulk/marketer`, `/bulk/status` | `consultants.edit` / `assignments.manage` / `consultants.edit` | `ids` (1-200). `Idempotency-Key` required (checked after the permission wall). Per-row result with `previous` for Undo. One audit row per changed consultant plus one `CONSULTANT_BULK`. |

Scope: `consultants.view` at ORG shows everyone; TEAM / DEPARTMENT the consultants whose marketer or backup is a seat in the caller's reach; ASSIGNED the
consultants whose marketer or backup is the caller; OWN the caller's own profile. Anything outside it, another tenant's id, and a missing key are all the
same generic 404. Free text on write bodies goes through `SensitiveContent` (422 `SENSITIVE_CONTENT`). No phone, no date of birth, no photo, no ID numbers.
Routes are in `OrgIsolationIT.COVERAGE`; the behaviour is in `OrgConsultantResourceIT`.

## Web

- Route `web/src/app/(tenant)/_t/w/[workspace]/consultants/page.tsx` (a real page beats the "on the way" catch-all). BFF `web/src/app/api/orgs/[orgId]/consultants/[[...path]]` (`lib/ent/consultants-bff.ts`, an allow-list of routes, passes only `If-Match` and `Idempotency-Key`).
- Client + pure helpers + URL state: `web/src/lib/ent/consultants.ts`. The address carries `q, availability, skill, license, marketer, workMode, status, sort, page, size, c (open consultant), tab`; a hand-edited address falls back to defaults.
- Components `web/src/components/ent/consultants/`: `ConsultantsPage` (state, data, flows), `KpiTiles` (sparkline + `DeltaChip`), `ConsultantsTable` (table on desktop, cards on a phone, pagination), `DetailSheet` (`SideSheet` docked at 1400px, floating on a tablet, `BottomSheet` on a phone) with `Tabs`, `Dialogs` (add, marketer, license, department, application, bulk availability), `HelpBeeCard` (the page's one bee, in the drawer when it is open), `parts`.
- Gen Z UX: availability and license are autosaved selects with an Undo toast; deactivate, bulk changes and marketer changes offer Undo; the only submit buttons are in creation / assignment dialogs.

## Real vs empty-state

| On the board | Here |
|---|---|
| Tiles, deltas, sparklines | real. Delta = now vs the same state counting only consultants created more than 30 days ago (no state history exists, `talent-foundation.md` section 5). Sparkline = eight weekly cumulative counts by `created_at`. With nobody older than 30 days there is no baseline: no delta is drawn. |
| Directory columns | all real (skills, experience, location + work mode, marketer, availability, license, profile ring = stored `profile_completeness`, active applications, next scheduled interview). |
| Avatars | initials only (no photos exist). |
| Phone number | not stored, never drawn. |
| "View Calendar" | no calendar exists: the button is "View Interviews" and opens the Applications tab. |
| "View Profile" | there is no separate profile page: the quick action is "View Applications". |
| "Add to Team" | consultants hold a department (`department_group_id`), not a team: the action is "Add to Department". |
| "Manage License" | records the status and valid-until date only; license billing is the Consultant Licenses page (not built). |
| Bee help card | present; "Ask a question..." lists where to reach a person (no assistant yet). |

## Known gaps and decisions

- The sidebar item needed the `marketing` module on: `flag.enterprise.marketing` moved from the deferred list to a live flag (`EnterpriseSettingKeys`), and the demo seeder switches it on for the two demo orgs. The five talent pages need the same edit; merge it once.
- Profile completeness is stored; it is computed (20 per ticked item: basic, skills) only when a consultant is added from this page. Seeded values are not recomputed.
- Undo of a bulk marketer assignment cannot un-assign a consultant who had no marketer before (there is no un-assign call); the toast then offers no Undo for those rows.
- No CSV export, no per-consultant license billing, no certification / preference editing (the checklist ticks come from stored flags).
- `OrgIsolationIT`: the legit-call sweep timeout moved from 90 s to 300 s (the sweep creates one world per route and now has 17 more routes).
- The web mock API (`web/scripts/mock-api.mjs`) has no talent data, so the page only runs against the real API.
