# Page: My Career Profile (`/w/consultant/profile`)

Board: `design/enterprise-consultant/profile.webp`. Branch `ent-talent-consultant`. Everything on this page is the signed-in consultant's OWN data. No sensitive PII is collected: no photo, no date of birth, no SSN/bank/tax/passport/visa numbers. Work authorization is a status CHOICE only.

## Endpoints (BFF: `web/src/app/api/orgs/[orgId]/me-workspace/profile/**`, shape-check only; the API owns every rule)
All under `/api/orgs/{orgId}/me-workspace/profile`. Each write answers `200` with the fresh profile view (same shape as GET).

| Method + path | Body | Effect |
|---|---|---|
| `GET` | | the whole page in one call |
| `PUT /availability` | `{status}` AVAILABLE / ON_PROJECT / NOTICE / UNAVAILABLE | sets `consultant_profile.availability_status` and `availability_since` = today |
| `PUT /summary` | `{text}` (blank clears, max 2000) | saved on the primary (else latest) `org_resume.summary_text`; while the consultant has NO resume it is kept in `cws_profile_detail.summary_text` |
| `PUT /career-goals` | `{text}` (blank clears, max 1000) | `cws_profile_detail.career_goals` |
| `PUT /work-authorization` | `{value}` AUTHORIZED_NO_SPONSORSHIP / AUTHORIZED_NEEDS_SPONSORSHIP / NOT_AUTHORIZED, or null | `cws_profile_detail.work_authorization` (a choice; any other text is a 422) |
| `PUT /employment-types` | `{values: []}` subset of CONTRACT, CONTRACT_TO_HIRE, FULL_TIME, PART_TIME | replaces the set (`cws_profile_pref` kind EMPLOYMENT_TYPE) |
| `POST /skills` | `{skill}` (1-60, max 30 skills, duplicates ignored) | new `consultant_skill` row, `primary_skill = true` |
| `DELETE /skills/{skillId}` | | removes the caller's skill |
| `POST /certifications` | `{name, issuer?, issuedOn?}` (`issuedOn` = `yyyy-MM`, past; max 20) | new `cws_certification` |
| `DELETE /certifications/{certId}` | | |
| `POST /prefs` | `{kind: ROLE or LOCATION, value}` (1-80, max 12 per kind, duplicates ignored) | new `cws_profile_pref` |
| `DELETE /prefs/{prefId}` | | |

- **Gate (every endpoint):** `ConsultantHomeService.requireSelf(me)`: ACTIVE member holding `opportunities.respond` (Consultant role), roles flag on, AND own `consultant_profile` via `member_id`; anyone else, another tenant, a deleted or unknown row, or another consultant's row: the same generic **404** (never 403). No path or body names a consultant.
- **Validation:** `422 ORG_INVALID` (`field`, `message`) for blank / too long / angle brackets / control characters / bad enum / bad month / limits. Every free-text field (summary, goals, skill, certification name and issuer, role, location) goes through `SensitiveContent.check`: `422 SENSITIVE_CONTENT` (`path`, `class`) and nothing is written.
- **Side effects of a write:** `consultant_profile.has_certifications` is reconciled with the certification rows, `has_preferences` with the preference rows, and `profile_completeness` is recomputed (9 equal checks: summary, 3+ skills, a certification, resume experience, a preferred role, a preferred location, an employment type, work authorization, career goals) and `updated_at` bumped. A plain GET shows the STORED `profile_completeness`; until the first write the legacy `has_certifications` flag still counts as a certification (so the number and the "Missing Details" list can differ for seeded rows, then agree after the first edit).
- Code: API `web/rest/ent/consultantws/ConsultantProfileResource`, `service/ent/consultantws/ConsultantProfileService` + `ConsultantProfileDTO`; entities `domain/ent/consultantws/{CwsCertification,CwsProfilePref,CwsProfileDetail}`, repos `repository/ent/consultantws/Cws{Certification,ProfilePref,ProfileDetail}Repository`. Web `components/ent/consultant-ws/{ProfilePage,ProfileEditors}.tsx`, `lib/ent/consultant-ws/{profile,profile-bff}.ts`, route `web/src/app/(tenant)/%5Ft/w/consultant/profile/page.tsx`.

## Real vs sample
Everything is real. There is **no sample data** on this page.
| Block | Source |
|---|---|
| Name, job title, years of experience, location | `consultant_profile` (read-only here; the directory owns them) |
| Photo | none stored: an initials circle (we never keep photos) |
| Availability pill and card | `consultant_profile.availability_status` / `availability_since` / `available_from`, editable |
| Profile Strength ring | stored `profile_completeness` |
| Missing Details | derived from what is actually absent (the 9 checks above); shows "All set" when empty |
| Professional Summary | primary resume `summary_text` (editable) |
| Primary Skills | `consultant_skill`, add/remove |
| Certifications | NEW `cws_certification` (name, issuer, month); `has_certifications` kept honest |
| Work Experience Highlights | primary/latest `org_resume_experience`, read-only (year range; the table has no month or location, so none is shown); links to My Resumes to edit |
| Preferred Roles / Locations / Employment Types | NEW `cws_profile_pref` |
| Work Authorization / Career Goals | NEW `cws_profile_detail` (one row per consultant) |
| Quick Actions, Get Profile Tips | buttons that jump to / open the matching editor; the tips button opens the shell help panel |

## New tables (migration `20261103020000_ent_cws_profile.xml`, NOT in master.xml: the integrator adds the include at the end)
`cws_certification`, `cws_profile_pref` (unique per consultant+kind+value), `cws_profile_detail` (unique per consultant). All: `org_id NOT NULL`, FK to `organization`, composite tenant FK `(org_id, consultant_id)` to `consultant_profile`, indexes start with `org_id`, precondition-guarded, additive, empty rollback, no JSON, no PII columns.

## Demo data
`ConsultantWsProfileDemoSeeder` (`service/ent/consultantws`): public idempotent `int seed()`. For consultants with `member_id != null` (Anika, Ben, Sam) in the Acme and Beta orgs: 3 certifications, 4 roles, 3 locations, 2 employment types, work-authorization choice, career goals, and a profile summary only if no resume has one. One-time guard = the consultant already has a `cws_profile_detail` row. NOT called from the bootstrap; the integrator wires it (after `ConsultantWsDemoSeeder`).

## Shared-file edits needed (the integrator)
1. `master.xml`: `<include file="config/liquibase/changelog/20261103020000_ent_cws_profile.xml" relativeToChangelogFile="false"/>` at the end.
2. `EnterpriseDemoBootstrap`: call `ConsultantWsProfileDemoSeeder.seed()`.
3. `OrgIsolationIT.COVERAGE`: one row per route, modeled on the Home row (`new Case(null, 200, null, false, null, null, 1, World::makeOwnerAConsultant)`; writes need a body and, for the by-id routes, an id, so give them the same legitimate-caller fixture as the Home row):
   - `GET /api/orgs/{orgId}/me-workspace/profile`
   - `PUT /api/orgs/{orgId}/me-workspace/profile/availability`
   - `PUT /api/orgs/{orgId}/me-workspace/profile/summary`
   - `PUT /api/orgs/{orgId}/me-workspace/profile/career-goals`
   - `PUT /api/orgs/{orgId}/me-workspace/profile/work-authorization`
   - `PUT /api/orgs/{orgId}/me-workspace/profile/employment-types`
   - `POST /api/orgs/{orgId}/me-workspace/profile/skills`
   - `DELETE /api/orgs/{orgId}/me-workspace/profile/skills/{skillId}`
   - `POST /api/orgs/{orgId}/me-workspace/profile/certifications`
   - `DELETE /api/orgs/{orgId}/me-workspace/profile/certifications/{certId}`
   - `POST /api/orgs/{orgId}/me-workspace/profile/prefs`
   - `DELETE /api/orgs/{orgId}/me-workspace/profile/prefs/{prefId}`
4. `workspaces.json`: CONSULTANT item `profile` live. `progress-tracker.md`: one Log line.

## Tests
- API: `ConsultantProfileResourceIT` (17 tests, all green): own data correct, second consultant never leaks, another org / non-consultant / no profile / unknown org / flags off all generic 404, empty consultant, and each write: success + validation + PII rejection + cross-consultant and cross-tenant 404 (skills, certifications, prefs), completeness recompute, summary resume-vs-profile.
- Web: `lib/ent/consultant-ws/profile.test.ts` (parser, helpers, calls), `components/ent/consultant-ws/ProfilePage.test.tsx` (draws real data, empty states, each inline write, PII refusal shown, failure shown, navigation).

## Known gaps
- Name, job title, years, location are not editable here (the directory owns them; "Edit Profile" jumps to the summary editor). The board's pencil next to the name and the camera badge on the photo are not drawn (no photos stored).
- Work Experience Highlights show year ranges only (the resume table has no month or location) and are read-only; edit on My Resumes.
- Employment-type and work-authorization labels are the product's wording; the board's "Part Time" etc. are matched, "Contract to Hire" is the board's "Contract to Hire".
- A plain GET shows the stored completeness, which only changes on a write on this page; edits elsewhere (e.g. resumes) do not recompute it yet.
- "Get Profile Tips" opens the shell help panel; there is no profile-specific AI tips feature yet.
- Not run: Playwright real-stack journey, 390px visual check in a browser, pixel comparison with the board (layout is responsive by construction: cards stack, no fixed widths over 390px).
