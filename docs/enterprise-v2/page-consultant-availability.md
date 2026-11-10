# Consultant workspace: Availability (`/w/consultant/availability`)

Board: `design/enterprise-consultant/availability.webp`. The consultant manages when they are open to work, marks time off on a calendar and
keeps their work preferences. **Nothing here is sent to a marketer, and Kiwiply never submits or applies. Rates are recorded only; no money moves.**

## Endpoints (all `/api/orgs/{orgId}/me-workspace/availability`, gate `ConsultantHomeService.requireSelf`, generic 404 otherwise)

| Verb + path | What |
|---|---|
| GET `` | tiles, availability, work preferences, every calendar entry, history (newest 50) |
| PUT `/status` body `{status, availableFrom?}` | sets status (AVAILABLE / ON_PROJECT / NOTICE / UNAVAILABLE), the available-from date and "since" = today on `consultant_profile`, appends a history row |
| POST `/blocks` body `{kind, startDate, endDate?, reason?}` | adds a calendar entry |
| PUT `/blocks/{id}` same body | edits an own entry |
| DELETE `/blocks/{id}` | removes an own entry |
| PUT `/preferences` body `{workMode, noticeWeeks, rateMinMinor, rateMaxMinor, rateNote, travelLabel, travelPercent}` | replaces the preferences kept on this page (null clears a field) |

Every write answers with the fresh page. Errors: non-consultants, other tenants, other consultants' entries, unknown ids, flags off: generic 404.
Validation: 422 (`status` choice; `availableFrom` between today and +730 days; `kind`; dates `yyyy-MM-dd`, end not before start, span at most 366 days,
start within the last year or next two years; at most 100 entries; work mode HYBRID/REMOTE/ONSITE; notice 0..26 weeks; rate 0..1,000,000 minor units
per hour and min not above max; travel NONE/OCCASIONAL/FREQUENT/FULL with percent 0..100 (needs a choice, 0 for NONE)). Free text (`reason` 200,
`rateNote` 120) is trimmed, rejects angle brackets / control characters and goes through the PII scanner (`SENSITIVE_CONTENT` 422).
**409 `BLOCK_OVERLAP`**: an entry may not cover a day of another entry, except two AVAILABLE entries (they only paint the calendar green). Work
authorization on the page is a status choice read from the Profile tables, never a document number.

### Rules
- **Approval rule (documented stand-in).** Approving time off is the marketer's step and that role is not built. A consultant-created VACATION starts
  **PENDING**; PERSONAL, HOLIDAY and AVAILABLE start **APPROVED** (they are the consultant's own). Editing the kind or dates re-applies the rule (and clears
  `sample_data`); editing only the reason keeps the status. Nothing in this branch moves a PENDING row to APPROVED.
- **History.** `PUT /status` appends a row (effective today, status, available-from, current work mode) and flips older ACTIVE rows to EXPIRED. Sending the
  values that are already the ACTIVE row adds nothing (idempotent). Changes made on the Profile page's availability control are not recorded here.
- **Profile coupling.** `consultant_profile.availability_status / availability_since / available_from` are written exactly like
  `ConsultantProfileService.setAvailability` (since = today) plus `available_from` (the Profile page never writes it). No Profile file was edited.

## Tiles
Available From (date, "n weeks from now"; "Available now" with no date when AVAILABLE; "Not set"), Open Opportunities (the consultant's own matches that are not
DISMISSED; delta vs the same rows that already existed 30 days ago, none when there were 0; six weekly cumulative counts), Preferred Work Mode (this page's
choice, else the profile row's `work_mode` when it is one of the three), Notice Period (weeks, with the available-from date), Vacation Days (calendar
year: approved VACATION days clipped to the year; "scheduled" = the part from today on; pending vacation days are listed separately and not counted).
Counts are calendar days, inclusive.

## Data
New file `api/src/main/resources/config/liquibase/changelog/20261103130000_ent_cws_availability.xml` (NOT registered in master.xml; the coordinator adds it):
- `cws_availability_block` (kind, start_date, end_date, reason(200), status APPROVED|PENDING, `sample_data`)
- `cws_availability_history` (effective_date, availability_status, available_from, work_mode, status ACTIVE|EXPIRED, `sample_data`)
- `cws_work_preference` (one row per consultant: preferred_work_mode, notice_weeks, rate_min_minor, rate_max_minor, rate_note, travel_label, travel_percent)

All have `org_id` NOT NULL, FK to organization, composite tenant FK `(org_id, consultant_id)` to `consultant_profile`, every secondary index starts with
`org_id`, additive, empty rollback, no JSON, no PII columns. Entities `CwsAvailabilityBlock`, `CwsAvailabilityHistory`, `CwsWorkPreference`; repositories
`Cws*Repository` (all methods org id first). Read from existing tables: `consultant_profile`, `cws_profile_pref` (LOCATION, EMPLOYMENT_TYPE; the first
location is the primary), `cws_profile_detail.work_authorization`, `requirement_match`.

**Real vs sample.** Everything the consultant sees and does is real. `ConsultantWsAvailabilityDemoSeeder.seed()` (idempotent, only consultants with a
member, only if they have no row in the three tables) writes demo rows for Anika / Ben / Sam in demo-acme and demo-beta: a work preference, four entries (one
past, two approved upcoming, one PENDING vacation) and four history rows; every seeded entry / history row has `sample_data = true` and the page shows a
Sample mark next to its status. The marketer-side approval is the only part that is a stand-in.

## Web
`components/ent/consultant-ws/AvailabilityPage.tsx` + `AvailabilitySheets.tsx` (+ test), `lib/ent/consultant-ws/availability.ts` (+ test), route
`app/(tenant)/%5Ft/w/consultant/availability/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/availability/**` (shape checks only).
- Calendar: built without a library (`monthGrid`); Sunday-first, month navigation, Today; green on working days from the open date (or inside an AVAILABLE
  entry), red / blue / violet bars for vacation / personal / holiday with time off winning over green. Roving tab stop: one Tab stop, arrow keys move by
  day / week, Page Up / Down change month, every day has a full aria-label. Clicking a day opens the entry sheet (new, or edit the entry on that day).
- Sheets: entry (type, start, end, reason, delete), Update Availability (status + date), Work preferences (mode, notice, rate range in dollars, note, travel).
  Forms use `noValidate` and show their own messages; the API refusals (overlap, PII) are shown in the sheet.
- Work Preferences: Preferred Locations, Work Authorization and Employment Type link to `/w/consultant/profile` (edited there, never written here); work mode,
  rate and travel open the preferences sheet. Upcoming Unavailable Dates: next four, View All toggles; Edit and a menu with Edit / Delete (confirm dialog).
  History: newest four, View All toggles.
- Rail: bee card, Quick Actions: Update Availability (sheet), Share with Marketer (**honest note only: "Your marketer sees this on their side once the
  marketing workspace is connected. Nothing was sent."**), Set Preferred Locations (link to the profile), Add Blocked Dates (sheet).
- Layout: single-column grids use `grid-cols-[minmax(0,1fr)]`; three columns only at 2xl (calendar + upcoming | prefs + history | bee + quick), two at xl.
- No `packages/ui` change; `parts.tsx` unchanged. Static copy (bee text, notes) lives in the component.

## OrgIsolationIT rows to add
(`consultant` login of the org under test; every other login must get the generic 404)
- GET `/api/orgs/{orgId}/me-workspace/availability`
- PUT `.../availability/status` body `{"status":"AVAILABLE"}`
- POST `.../availability/blocks` body `{"kind":"PERSONAL","startDate":"2031-03-03","endDate":"2031-03-03","reason":"x"}` (pick dates inside the allowed window relative to today when the row is written)
- PUT `.../availability/blocks/{id}` same body; DELETE `.../availability/blocks/{id}`
- PUT `.../availability/preferences` body `{"workMode":"REMOTE"}`
Tables for org-first fixtures: `cws_availability_block`, `cws_availability_history`, `cws_work_preference` (any consultant row).

## Wiring for the coordinator
1. master.xml: include `20261103130000_ent_cws_availability.xml` (end).
2. EnterpriseDemoBootstrap: call `ConsultantWsAvailabilityDemoSeeder.seed()` after `ConsultantWsDemoSeeder`.
3. workspaces.json: flip `availability` live.
4. Optional (Home / Profile): the Profile page's availability control does not write `available_from` nor history; if wanted, call the same rules or link
   its card to this page. No change is required for either page to keep working.

## Known gaps
- Nothing approves a PENDING vacation (marketer role). Shown honestly with a Sample mark on seeded rows; consultant-made vacations simply stay Pending.
- Preferred locations, employment types and work authorization are read-only here by design (single owner: the Profile page).
- Calendar shows only the entries and the status of the consultant; assignments, interviews or placements are not painted on it.
- Time zone: "today" is the server's UTC date (same as the Profile page's "since").
