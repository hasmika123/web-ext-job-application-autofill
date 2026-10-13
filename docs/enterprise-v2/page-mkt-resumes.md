# Marketing workspace: Resumes page (`/w/marketing/resumes`, branch `mkt-resumes`)

Board: `design/enterprise-marketer/resumes.webp`. Rules: `mkt-page-brief.md`, `talent-foundation.md` (section 5, Resumes), `30-resume-management.md`.

## What it is
Four KPI tiles (Total Resumes, Profiles Ready, Resumes Need Updates, Approvals Pending), a filter row (search, Skill, Status, Date Updated, Availability, Reset),
the resume table (checkbox, consultant + role, title, version chip, last modified + "x ago", primary, profile completeness bar, approval chip, View / Edit / Download,
kebab), "Showing 1-10 of N resumes" + page buttons + page size, the bee help card and "Recent Resume Activity". Resumes are **metadata only** (no file bytes).

## Endpoints (`/api/orgs/{orgId}/mkt/resumes`, every one through `MktScope.resolve`; generic 404 for a non-member, flag off, missing permission, or a consultant outside the caller's scope)
| Method + path | Permission | What |
|---|---|---|
| `GET /` | `resumes.view_for` (ASSIGNED) | One call: `{kpis, items, total, page, size, skills, activity, canApprove}`. Query `q` (consultant / title / target role), `skill`, `status` (APPROVED / PENDING / NEEDS_UPDATE), `updated` (7d / 30d / 3m / 6m / all), `availability`, `sort` (`modified,desc` default; consultant, title, version, completeness, approval), `page` (from 0), `size` (1-100) |
| `GET /{id}` | `resumes.view_for` | Read-only preview: headline, summary, skills (primary first), `org_resume_experience`, change history |
| `GET /{id}/download` | `resumes.view_for` | Always `404 NO_FILE_STORED` ("No file is stored for this resume."): the UI shows Download disabled, tooltip "No file stored" |
| `PATCH /{id}` | `resumes.edit_for` (ASSIGNED) | Body any of `title`, `headline`, `summary`, `targetRole` (JSON null clears all but title; other keys 422). A real change bumps `version_no`, sets an APPROVED resume back to PENDING, writes a `mkt_resume_event` UPDATED row and one `MARKETER_RESUME_EDIT` audit row. No-op writes nothing. PII scanner on every text |
| `POST /{id}/approval-request` | `resumes.edit_for` | Sets PENDING + APPROVAL_REQUESTED event + `MARKETER_APPROVAL_REQUEST` audit. Never approves |
| `POST /{id}/needs-update` | `resumes.edit_for` | Optional `{note}`; MARKED_FOR_UPDATE event (the "Needs Update" chip). The next edit clears it |
| `POST /{id}/approve` | `resumes.approve_request` (ORG, org admin) | PENDING to APPROVED. 409 `SELF_APPROVAL` for whoever requested or edited it; 409 `NOT_PENDING` |

E1: nothing here submits for a consultant or signs in as one; a marketer prepares and requests, the admin approves.

## Tables
`mkt_resume_event` in `20261104080000_mkt_resumes.xml` (one `master.xml` include line, the single permitted edit): `org_id` + FK organization, composite tenant FKs to
`org_resume(org_id,id)`, `consultant_profile(org_id,id)` and `org_member(org_id,id)`, indexes lead with `org_id`, varchar kind, DATETIME(6). Kinds: CREATED, UPDATED, APPROVAL_REQUESTED,
APPROVED, MARKED_FOR_UPDATE. Metadata only (a short label, a version number). Entity `domain.ent.mkt.MktResumeEvent`; repositories `MktResumeRepository` (own JPQL over `org_resume`,
`consultant_profile`, `consultant_skill`, `org_resume_experience`) and `MktResumeEventRepository`; every method takes `orgId` first.
Demo: `MktResumesDemoSeeder` (listens to `ApplicationReadyEvent`, so it runs after `EnterpriseDemoBootstrap`; `ENT_DEMO_SEED=true` only; skips an org that already has events; one story per resume derived from its own timestamps; about one in nine flagged for update).

## Real vs derived
- Total = resumes in scope. Profiles Ready = APPROVED and not flagged. Need Updates = latest of CREATED / UPDATED / MARKED_FOR_UPDATE is MARKED_FOR_UPDATE. Approvals Pending = `approval_status = PENDING`.
- "vs last month" = the same set restricted to rows created before now-30d (no history table: foundation rule), omitted when that earlier set is empty. Sparkline = how many of the set existed at the end of each of the last 8 weeks.
- Approval chip: PENDING first ("Pending Review"), else flagged ("Needs Update"), else "Approved". Completeness = `consultant_profile.profile_completeness`.
- The list is filtered, sorted and paged in memory over the caller's scoped read (one query for ASSIGNED, all for ORG); fine for a few hundred resumes.

## Web
`web/src/components/ent/marketer-ws/resumes/{ResumesPage,ResumeDrawer}.tsx`, `web/src/lib/ent/marketer-ws/resumes.ts`, BFF `web/src/app/api/orgs/[orgId]/mkt/resumes/**`, mock `web/scripts/mock-mkt-resumes.mjs`,
photos `web/public/ent/marketer/resumes/*.png` (cropped from the board). One additive shared visual: `BandBar` in `packages/ui/src/enterprise/bandbar.tsx` (the coloured completeness bar).

## Known gaps
- The consent gate of 30 section 4 (FULL pairing + `consent.resume_edit` before a marketer edits) is not in this schema; the gate here is assignment + `resumes.edit_for`.
- No per-version history table: an edit increments `version_no` on the one row (foundation rule); the history list is the change log.
- No file storage, so Download is always disabled; no print/PDF generation yet.
- Consultant photos: the real API returns `avatarUrl: null` (initials); board photos are keyed by name for the dev mock only.
- `OrgIsolationIT.COVERAGE` was not edited (brief forbids it): add the `/api/orgs/{orgId}/mkt/resumes` routes there when merging.
- `MktResumesIT` (Testcontainers) is written and compiles but was not run (no Docker).
