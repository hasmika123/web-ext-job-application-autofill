# Marketing page: My Assigned Talent (`/w/marketing/talent`)

Branch `mkt-talent` (from `ent-talent-marketer`). Board: `design/enterprise-marketer/talent.webp`. Permission `consultants.view` (ASSIGNED for a Marketing
Specialist, ORG for admins). Gate and scope: `MktScope.resolve(me, "consultants.view")`; a consultant outside the caller's set is the generic 404.

## Endpoints (`/api/orgs/{orgId}/mkt/talent`)

| Method and path | What |
|---|---|
| `GET /` | The whole board in one call: `kpis` (5), `counts` (chips), `facets` (skills, locations), `items` + `total/page/size`, `cards` (available / needsUpdate / inInterview, 4 rows each), `views` (the caller's saved views), `canAddConsultant`. Params: `q`, `status` (AVAILABLE_NOW, IN_INTERVIEW, NEEDS_UPDATE, PENDING_APPROVAL), `skill`, `location`, `experience` (0-2, 3-5, 6-8, 9+), `availability` (AVAILABLE_NOW, IN_INTERVIEW, SOON, LATER, ON_PROJECT, UNAVAILABLE), `sort` (name, experience, location, apps, jobs, availability; `-` prefix = descending), `page`, `size` (default 8, cap 100). |
| `GET /{consultantId}` | The "View Profile" drawer: read-only summary, consent level `SUMMARY`. No e-mail, phone, birth date, document or bank number is on the wire type. 404 when the consultant is not one of the caller's. |
| `POST /views` | Save (or overwrite by name) one of the caller's own filter sets. At most 20 per marketer; 422 on a bad name or filter value or PII in the name/search text. |
| `DELETE /views/{viewId}` | Delete one of the caller's own views (404 for anyone else's). |

There is no write route for consultants or applications: nothing here submits anything for a consultant (E1). Quick Actions and row actions only navigate.

## Definitions (all computed from rows, request time UTC)

- **Available Now**: `consultant_profile.availability_status = AVAILABLE`.
- **In Interview**: a SCHEDULED `talent_interview` from now on, or an open `talent_application` at stage INTERVIEWING.
- **Needs Update**: no `org_resume` row, or the newest was updated more than 90 days ago. **Pending Approval**: at least one resume with `approval_status = PENDING`.
  The Resume Status column shows Needs Update first, then Pending Approval, else Up to date; the two chips filter on the underlying flags.
- **Active Apps**: applications not CLOSED. **Assigned Jobs**: `requirement_match` rows with status ASSIGNED.
- **Availability column**: Available Now (green) / In Interview (violet) / "1 week", "2 weeks", "1 month", "N months" from `available_from` (blue) / On Project (amber) / Unavailable.
- **KPI "vs last month"**: no history tables exist, so (as in `talent-foundation.md` s5) the previous value applies the `created_at < now-30d` cut to the same set
  (assigned, available, needs update; pending uses the pending resume's `created_at`). Active Interviews compares with consultants that had a non-cancelled interview in
  the 14 days that ended 30 days ago. A delta with no previous value is `null` and no chip is drawn. Sparklines are 8 weekly points (cumulative by the same timestamps; the interview
  tile counts consultants with an interview in each week, the last week reaching 14 days ahead).
- Counts in the status chips are over everything the caller may see (not the filtered list), like the board.

## Tables (changelog `20261104060000_mkt_talent.xml`)

`mkt_saved_view` (org_id, member_id, page_key, name, query_text, status_filter, skill_filter, location_filter, experience_filter, availability_filter, created_at, updated_at).
Composite FK `(org_id, member_id)` to `org_member`, unique `(org_id, member_id, page_key, name)`, index on `(org_id, member_id, page_key)`. Filters only: no consultant data.
Everything else is read from the talent foundation tables through the `Mkt*` repositories (`consultant_profile`, `consultant_skill`, `org_resume`, `talent_application`,
`talent_interview`, `requirement_match`, `client_requirement`, `client_account`).

Demo rows: `MktTalentDemoSeeder` (an `ApplicationRunner` at the lowest precedence, so after `EnterpriseDemoBootstrap`) gives every marketer of a demo tenant two example views;
same switches as the other demo seeds, idempotent, no shared class edited. On an empty database it needs a second start (the tenants did not exist yet).

## Web

`web/src/components/ent/marketer-ws/talent/` (`TalentPage.tsx`, `ProfileDrawer.tsx`, `SavedViewsMenu.tsx`, `chips.tsx`), `web/src/lib/ent/marketer-ws/talent.ts`,
BFF `web/src/app/api/orgs/[orgId]/mkt/talent/**`, dev mock `web/scripts/mock-mkt-talent.mjs` (the board's 28 consultants), photos `web/public/ent/marketer/talent/*.png`
(cropped from the board; the API returns `avatarUrl: null` for real data and the page falls back to initials).

"Add Consultant": a link to the org's consultant page (`/w/admin/consultants`, or `hrefs.consultants` when a menu defines one) only when the API says `canAddConsultant`
(= the caller holds `consultants.edit`); otherwise the button stays on the board, `aria-disabled`, with a tooltip. "Saved Views": per marketer, stored in `mkt_saved_view`.
Quick Actions use `hrefs`: Find Job Matches (matches), Bulk Update Resumes (resumes), Schedule Interviews (interviews), Send Follow-ups (followups), Generate Talent Report
(`performance`, else `applications`); a missing href renders the row disabled.

## Known gaps

- The Marketing module flag (`flag.enterprise.marketing`) is still in `EnterpriseSettingKeys` "deferred", so `TenantModules.isOn(MARKETING, ...)` is false for every org and `MktScope`
  answers 404 everywhere until that key is moved to the live list (shared file, not touched here). `MktTalentIT` replaces the `TenantModules` bean for that reason.
- Saved views are personal UI preferences and are not written to the audit log.
- No per-consultant consent table exists yet; the drawer always answers at level SUMMARY.
- `MktTalentIT` (Testcontainers) was written and compiled but not executed (no Docker on the author's machine).
- `OrgIsolationIT.COVERAGE` has no rows for these routes (the brief forbids editing that class); the owner should add the four routes above when merging.
