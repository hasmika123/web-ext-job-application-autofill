# Consultant workspace: My Placement

Route `/w/consultant/placements` (root attribute `data-consultant-placements`), board `design/enterprise-consultant/placements.webp`.
Home's Active Placement tile already links here and counts ACTIVE `talent_placement` rows, which is the same source, so nothing on Home changes.

## What the consultant sees

The consultant's most recent ACTIVE placement (latest `start_date`, then id). Tiles: Active Placement (their ACTIVE count, "Current Engagement"),
Start Date ("n weeks ago"), Duration (planned months when there is an end date, months elapsed and "Open-ended (so far)" when there is none),
Billable Status (Active / Billable, derived from the status only), Next Check-in. Then Placement Overview, Onboarding Checklist, Key Milestones,
Upcoming Meetings, Recent Placement Activity, and the rail (bee card, Quick Actions, Helpful Resources).

With no ACTIVE placement the page says so ("No active placement yet"), links to Offers and lists the ended placements (role, client, dates).

**No rate anywhere.** `bill_rate_minor`, `rate_unit` and `currency` are never read; no DTO has a rate field (35-placements.md: `bill_rate_minor` never appears in
consultant DTOs). The IT asserts the response contains no rate text. Names are display labels only: no email, no phone. The board's Email buttons are
"Contact" links to `/w/consultant/marketer` with the tooltip "Messages go through My Marketer. Email addresses are not shown here."

## Endpoints (`/api/orgs/{orgId}/me-workspace/placements`)

| Verb | Path | Notes |
|---|---|---|
| GET | `` | the page (see `ConsultantPlacementDTO.Response`) |
| PUT | `/checklist/{itemId}` | body `{completed: true\|false}`; idempotent (a repeat tick keeps its first `completed_at`); 422 for a missing flag; 409 `PLACEMENT_NOT_ACTIVE` for an item of an ended placement |
| POST | `/status-note` | body `{note}` 3..300 characters, PII-scanned (`SENSITIVE_CONTENT` 422); stored as an `UPDATE` activity row on the current ACTIVE placement (actor = the consultant); 404 with no active placement |

Gate: `ConsultantHomeService.requireSelf` (roles from data, `opportunities.respond`, own `consultant_profile`, else the generic 404). The placement is always resolved
from the caller's own consultant id; a checklist item id resolves to its placement and must belong to the caller (else the same 404). The Consultant role holds no
`placements.*` permission, so the writes use the read gate only (like Profile). No id of a consultant or placement is ever taken from the client except the checklist item id.

Web: BFF under `web/src/app/api/orgs/[orgId]/me-workspace/placements/**` (shape-only validation, the API owns every rule), `lib/ent/consultant-ws/placements.ts`,
`components/ent/consultant-ws/PlacementsPage.tsx`, route `(tenant)/%5Ft/w/consultant/placements/page.tsx`.

## New tables (`20261103150000_ent_cws_placement.xml`)

Plus a guarded `uk_talent_placement_org_id (org_id, id)` on `talent_placement` (needed for the composite tenant FKs, same as `uk_talent_interview_org_id`).
All five have `org_id NOT NULL`, FK to `organization`, composite FK `(org_id, placement_id)` to `talent_placement`, `org_id`-first indexes, `sample_data`, no PII, no JSON.

- `cws_placement_detail` (unique per placement): end_client_name, project_name, manager_name, manager_title, location_label, work_mode, hours_per_week, schedule_label,
  engagement_status ON_TRACK|AT_RISK|NEEDS_ATTENTION, status_note, next_check_in.
- `cws_placement_checklist`: label, due_on, completed_at, sort_no. The consultant ticks and unticks.
- `cws_placement_milestone`: label, description, on_date, completed.
- `cws_placement_meeting`: label, starts_at, duration_minutes, with_label, join_url (https only; the API drops any other scheme).
- `cws_placement_activity`: activity_type MILESTONE|DOCUMENT|UPDATE, description, actor_label, occurred_at. The consultant adds UPDATE rows.

## Real vs SAMPLE

- Real: the placement itself (client, role, dates, status), the marketer (name and title from `marketer_assignment`, like the Marketer page), the consultant's ticks and
  status notes, everything the page derives (durations, tiles).
- SAMPLE (employer / ops / marketer authoring, not built yet): the whole content of the five `cws_placement_*` tables as seeded. `sample` is true on the placement
  (manager, schedule, engagement status, end client, project, milestones, meetings, checklist items) and on each activity row. The UI shows a Sample mark on the manager and
  a note on each list. Consultant-written rows (status notes) have `sample = false`.

## Demo seeder

`ConsultantWsPlacementDemoSeeder.seed()` (idempotent, own tables only): for Anika, Ben and Sam (consultants with a `member_id`) who have an ACTIVE `talent_placement`
(written by the talent demo seeder), one detail row, seven checklist items (five done), milestones relative to the placement's own start date (an "Engagement End" one
only when the placement has an end date), four meetings (two with an https link, two without), three activity rows. The seeder never edits `talent_placement`
(its demo rows have no end date, so the Duration tile shows "Open-ended (so far)").

## OrgIsolationIT route rows to add

Org A consultant (own ids), expected 404 for another org's or non-consultant caller:

- `GET /api/orgs/{orgId}/me-workspace/placements`
- `PUT /api/orgs/{orgId}/me-workspace/placements/checklist/{itemId}` body `{"completed":true}`
- `POST /api/orgs/{orgId}/me-workspace/placements/status-note` body `{"note":"Going well"}`

## Known gaps

- Helpful Resources are static default labels with no URL (shown as text with "Coming soon"); they should become admin-configured links.
- Download Documents has no documents to serve: it answers "Documents arrive with the HR workspace".
- "View All" links on the cards are omitted (no target pages exist). Join links come only from `cws_placement_meeting.join_url`, which nothing but the seeder writes yet.
- The page shows one placement (the most recent ACTIVE); a second concurrent ACTIVE one only counts in the Active Placement tile.
