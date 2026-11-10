# Page: Consultant My Resumes (`/w/consultant/resumes`)

Board: `design/enterprise-consultant/resumes.webp`. Branch `ent-talent-consultant`. Everything on this page is the signed-in consultant's OWN data. There are no sample blocks.

## Endpoints
Base `/api/orgs/{orgId}/me-workspace/resumes` (BFF: `web/src/app/api/orgs/[orgId]/me-workspace/resumes/**`, each route shape-checks the ids and calls `forward()`).

| Method and path | What | Permission |
|---|---|---|
| `GET /` | the whole page in one call (tiles, resumes, strength, improvements, recent activity) | gate = `ConsultantHomeService.requireSelf` |
| `GET /{resumeId}/preview` | structured fields (headline, summary, skills primary-first, experience) | gate |
| `POST /{resumeId}/primary` | make primary: old primary cleared and flushed first (generated unique key allows one) | gate + `resumes.manage` (OWN) |
| `PATCH /{resumeId}` body `{name?, visibility?}` | rename / change visibility (INTERNAL, PUBLIC, PRIVATE) | gate + `resumes.manage` |
| `POST /{resumeId}/activity` body `{kind}` | record VIEWED, DOWNLOADED or SHARED, 204 | gate + `resumes.manage` |
| `POST /{resumeId}/duplicate` | copy, 201 | gate + `resumes.manage` |

- **Gate:** ACTIVE member holding `opportunities.respond` AND linked to a `consultant_profile` (`member_id`); roles flag on. Anyone else, another tenant, a resume that is not the caller's, or an unknown id: the same generic **404**. No endpoint takes a consultant id. Writes additionally call `authorization.require(resumes.manage, SELF, WRITE)`.
- **Validation (422 `ORG_INVALID`):** empty body, empty/over-200 name, `<` `>` or control characters, unknown visibility or kind. **PII (422 `SENSITIVE_CONTENT`):** the name goes through `SensitiveContent.check`.
- Code: `api/.../web/rest/ent/consultantws/ConsultantResumesResource`, `service/ent/consultantws/ConsultantResumesService` + `ConsultantResumesDTO`; entity `domain/ent/consultantws/CwsResumeActivity`, repo `CwsResumeActivityRepository`; web `components/ent/consultant-ws/ResumesPage.tsx` + `ResumesSheets.tsx`, `lib/ent/consultant-ws/resumes.ts`; route `web/src/app/(tenant)/%5Ft/w/consultant/resumes/page.tsx`.

## Real vs sample
Everything is real.

| Block | Source |
|---|---|
| Total Resumes (+1 absolute, sparkline) | `org_resume` of the consultant; "last month" = rows created before now-30d |
| Primary Resume | `primary_for_org` |
| Total Views / Downloads / Times Shared (+% vs last month, sparkline) | NEW `cws_resume_activity` counts by kind; "last month" = rows stamped before now-30d; no percentage when the earlier value is 0 |
| Resumes table | `org_resume`: title = name, subtitle = target_role, Primary pill, Last Updated, Visibility (INTERNAL shown as **Team**), `v<version_no>`, "Awaiting approval" note when `approval_status = PENDING` |
| Resume Strength | same derivation as Home: `profile_completeness` ring + five checks (contact, experience, 3+ skills, certifications, summary). The board's "Education" check is not drawn: no education data exists |
| Suggested Improvements | rules over the consultant's rows, no AI: no primary resume (Apply = set primary here), no experience, fewer than 3 skills, no summary, a resume without headline, no certifications; first four. Other Apply buttons deep-link to `/w/consultant/profile` |
| Recent Activity | latest 6 of `cws_resume_activity` plus an "updated" line per resume whose `updated_at` is later than `created_at` |

## Actions (no stored file)
- **View** = side sheet with a paper render of the structured fields; records VIEWED.
- **Download** = a generated, escaped, script-free `.html` file (client side from the preview fields); records DOWNLOADED. **Print** = browser print of the same HTML in a hidden iframe; counted as DOWNLOADED (the resume left the page as a document). **Share** = copies a plain-text version to the clipboard; records SHARED only if the copy worked.
- **Edit** = side sheet: rename, visibility, make primary (content editing is not part of this page, so the approval status never changes here).
- **Duplicate** = new `org_resume` row: name "... (copy)", `version_no` = source + 1, PRIVATE, not primary, **PENDING** (so nothing becomes approved without the organization's Resumes review), experience rows copied. Safe cap of 50 resumes per consultant (constant `MAX_RESUMES`, not admin-configured yet).
- **Create New Resume / Use a Template / Import Resume**: honest "coming soon" toast (no creation flow exists). **Tailor for a Job** links to `/w/consultant/matches`.

## New table (migration NOT registered in `master.xml`)
`api/src/main/resources/config/liquibase/changelog/20261103030000_ent_cws_resume_activity.xml`: `cws_resume_activity(id, org_id, consultant_id, resume_id, kind varchar(12), occurred_at)`, composite tenant FKs `(org_id, resume_id) -> org_resume`, `(org_id, consultant_id) -> consultant_profile`, FK to `organization`, indexes start with `org_id`, precondition-guarded, additive, empty rollback, no PII.
The integrator adds one include line to `master.xml`.

## Demo data
`ConsultantWsResumesDemoSeeder` (`@Service`, public idempotent `int seed()`, not called from the bootstrap; the integrator adds the call after `ConsultantWsDemoSeeder`). For consultants with `member_id != null` (Anika, Ben, Sam) in the two demo orgs, once per consultant (guard: no `cws_resume_activity` rows yet): tops resumes up to five using the board's titles, versions and visibilities (one primary when they have none, two experience rows each), then adds 24 views, 12 downloads and 8 shares spread over 57 days so the tiles show a change against last month. Returns the number of rows added.

## `OrgIsolationIT.COVERAGE` rows to add
Same `Case` shape as the Home row (`World::makeOwnerAConsultant`):
- `GET /api/orgs/{orgId}/me-workspace/resumes`
- `GET /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/preview`
- `POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/primary`
- `PATCH /api/orgs/{orgId}/me-workspace/resumes/{resumeId}`
- `POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/activity`
- `POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/duplicate`

## Tests
- API: `ConsultantResumesResourceIT` (10 tests): own data and every tile value, second consultant never leaks, other org / non-consultant / no-profile / flags-off 404, empty consultant, preview, and each write (success, validation, PII 422, cross-tenant 404). It needs the migration in `master.xml` (the integrator's include).
- Web: `lib/ent/consultant-ws/resumes.test.ts` (parser, sort, change text, printable output) and `components/ent/consultant-ws/ResumesPage.test.tsx` (page, empty states, Apply, View, Edit refusal, Create is "coming soon", duplicate, 404, load failure).

## Known gaps
- Permission removal of `resumes.manage` alone (holding `opportunities.respond` but not `resumes.manage`) is enforced by `authorization.require` but not covered by a dedicated IT.
- Content editing, creating, importing and templates do not exist; "Share" is a clipboard copy, not a public link.
- Activity is read in full per consultant (small volumes); add a windowed query if it ever grows.
- Playwright journey and pixel polish against the board are not done; the table scrolls inside its card on a phone (no page scroll).
- The seeder compiles but was not run end to end.
