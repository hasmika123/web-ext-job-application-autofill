# Page: Resumes (`/w/admin/resumes`)

> Branch `ent-resumes` (cut from `ent-talent`). Board: `design/enterprise-talent/resumes.png`. Data: `org_resume`, `org_resume_experience`, `consultant_profile`,
> `consultant_skill`, `marketer_assignment` (see `talent-foundation.md`). No new tables and no Liquibase change: the foundation already holds every column the page needs.

## What it does

KPI tiles (Total, Primary, Needs Approval, Updated This Week) with sparkline and an honest delta; tabs All Resumes / Pending Approval / Recent Updates; Upload Resume;
search, department / visibility / status filters and a More Filters row (primary, owner, last modified); sort menu and header sorts; list and grid views; table (cards
on a phone); a right drawer (a bottom sheet on a phone) with a generated preview, the facts, the Primary toggle, the Visibility select, the approval status and the
Preview / Download / Print / Set as Primary buttons. Tab, filters, sort, page, view and the open resume are all in the URL, so any view can be shared.

Autosave, no Save buttons: the Primary toggle, the Visibility select, Approve / Reject and the bulk bar save at once and offer an Undo toast. Upload Resume is a creation form,
so it has an explicit Add button.

## Endpoints (`/api/orgs/{orgId}/resumes`, `OrgResumeResource`)

| Route | Needs | Notes |
|---|---|---|
| `GET /` | `resumes.view_for` | `tab`, `q`, `departmentId`, `visibility`, `status`, `primary`, `ownerId`, `consultantId`, `updated`, `sort`, `page`, `size` (max 100). `X-Total-Count`. 400 `SORT_INVALID`. |
| `GET /counts` | `resumes.view_for` | four tiles: `value`, `previous`, `delta`, `deltaPercent`, 8 weekly `series` points. |
| `GET /filters`, `GET /consultants` | view / `resumes.edit_for` | department and owner options in scope; the picker of the upload form. |
| `GET /{id}` | `resumes.view_for` | row + preview data (headline, summary, skills, experience) + `actions` (what the caller may do). |
| `PUT /{id}/primary` | `resumes.edit_for` | one primary per consultant (cleared in the same transaction); only an APPROVED resume (409 `NOT_APPROVED`); answers `previousPrimaryId` for Undo. Audit `RESUME_PRIMARY`. |
| `PUT /{id}/visibility` | `resumes.edit_for` | INTERNAL / PUBLIC / PRIVATE; answers `previous`. Audit `RESUME_VISIBILITY`. |
| `POST /{id}/decision` | `resumes.approve_request` | APPROVE / REJECT (PENDING only, 409 `NOT_PENDING`), REOPEN (the Undo). The person who prepared a resume cannot decide it (422 `SELF_DECISION`). Audit `RESUME_APPROVE` / `RESUME_REJECT` / `RESUME_REOPEN`. |
| `POST /` | `resumes.edit_for` + `Idempotency-Key` | creates a PENDING v1 record for a consultant in scope. Free text goes through `SensitiveContent`; the file name is a plain label (no folders). Audit `RESUME_CREATE`. |
| `POST /bulk` | edit (VISIBILITY) or approve (APPROVE / REJECT / REOPEN) + `Idempotency-Key` | up to 100 ids; per-row APPLIED / SKIPPED with a reason and `previous` for Undo. One audit row per change + `RESUME_BULK`. |
| `GET /{id}/export?format=txt\|html` | `resumes.view_for` | generated copy of the structured resume (attachment / script-free printable page with a sandbox CSP). Audit `RESUME_EXPORT`. |

Scope: `ORG` = every resume; `TEAM` / `DEPARTMENT` = consultants whose marketer or backup sits in the caller's team or department; `ASSIGNED` = the caller's own consultants. A missing key, a row outside
the scope, a closed organization and another tenant's id all answer the same generic 404. Every JPQL query starts with `r.orgId = :orgId` and joins the consultant on the same org
(`ResumeBoardSearchRepository`).

## Components

`web/src/components/ent/resumes/`: `ResumesPage` (URL state, data, bulk), `ResumeKpiTiles`, `ResumesTable` (+ `Pagination`), `ResumeDrawer`, `ResumePaper` (the generated preview), `UploadResumeDialog`,
`ResumeHelpCard` (the page's one bee), `parts`. Client and pure helpers: `web/src/lib/ent/resumes.ts`; BFF: `resumes-bff.ts` behind `app/api/orgs/[orgId]/resumes/[[...path]]`.
Page route: `(tenant)/_t/w/[workspace]/resumes/page.tsx` (flips the sidebar item from "on the way" to live). Mock: `web/scripts/mock-resumes.mjs` (honest empty answers only).

## Real versus empty state

Real: every tile value, delta (where history exists), sparkline, row, filter, owner, preview, export and write comes from the rows.

- **Primary tile has no delta.** The primary flag is not versioned, so the earlier figure cannot be rebuilt: the tile shows the value and the trend only. Needs Approval's earlier figure is rebuilt from `created_at`
  and `approved_at` (pending then = existed then and is pending now, or was decided after that moment). Updated This Week compares the 7 days to the 7 before, using each resume's latest `updated_at`.
- **No file store.** Upload Resume records metadata and the structured fields; if a file is chosen only its NAME is kept (the content is never read). The existing resume parse/upload flow is person-owned and not tenant-scoped, so it is not reused.
  Preview, Download and Print are generated from the record. Seeded `file_size_kb` values are seed data; a resume created here has no size ("Not stored").
- **Phone, address, date of birth** do not exist in a resume record and are not drawn (the board shows a phone number: left out on purpose).
- **Preview paper** draws only what exists (headline, summary, skills, experience); nothing is padded with placeholder lines.

## Known gaps / decisions

- `REJECTED` is a third approval value (the foundation lists PENDING / APPROVED); the column is a plain varchar. `approved_at` / `approved_by_member_id` carry the decision time and person for both.
- Approval is recorded by an `resumes.approve_request` holder (Org Admin today), who must not be the person who prepared the resume. The doc 30 consultant-attests flow and consent gates (`consent.resume_edit`, FULL pairing) are not built in this foundation, so
  setting primary / visibility needs only `resumes.edit_for` in scope.
- No resume history table: one row per resume with its current version number; the drawer says "vN (Latest)". There is no new-version action.
- "Recent Updates" = changed in the last 30 days (`RECENT_DAYS`, a constant, not yet an admin setting).
- Row menu offers View details / Download / Print; Set as Primary and approval live in the drawer and the bulk bar.
- The foundation's `EntRepositoryContractTest` fails on `ClientAccountRepository` (it extends `JpaRepository`): not touched here.
- `OrgIsolationIT.World` now creates one consultant profile and one resume per world (`resumeId`, `consultantProfileId`), plus 10 COVERAGE rows.

## Tests

API: `OrgResumeResourceIT` (scope per role, filters/sort/tabs, tiles, detail, primary rule + Undo, visibility, approval incl. self-decision, create + idempotency + sensitive text + file-name rules, bulk, exports, cross-tenant 404),
`OrgIsolationIT` coverage rows. Web: `resumes.test.ts`, `resumes-bff.test.ts`, `ResumesPage.test.tsx`. Journey: `web/e2e/journeys/tenant-resumes.spec.ts` with `playwright.real.resumes.config.ts`
(`E2E_REAL_PORT=3205 PW_CHANNEL=chrome npx playwright test -c playwright.real.resumes.config.ts`).
