# Consultant workspace: Interview Prep (`/w/consultant/interview-prep`)

Board: `design/enterprise-consultant/interview-prep.webp`. Branch `ent-talent-consultant`. Migration `20261103080000_ent_cws_interview_prep.xml` (not yet in `master.xml`).

## What it is
Four tiles, four preparation modules, a practice-session history, and a right rail (bee card, Before Interview Checklist, Quick Actions).
There is **no AI backend**. Start Practice opens a side sheet with a short fixed question list; the consultant scores each question 0-100
themselves, the sheet says plainly that AI-scored practice arrives later, and saving records a real session. Kiwiply submits nothing.

## Endpoints (all under `/api/orgs/{orgId}/me-workspace/interview-prep`, `@OrgPermissionRequired`)
| Verb + path | Purpose |
|---|---|
| GET `` | Page: tiles, modules, history (latest 100), checklist, next interview, weak kinds |
| GET `/sessions/{sessionId}` | Stored notes and question self-scores of one own session |
| POST `/sessions` | Record a self-scored session. Body `{moduleKey, durationMinutes 1-600, notes?, answers:[{questionId, score 0-100}]}`. Score stored = rounded average of the answers; title and question text come from the catalog, never the client |
| PUT `/checklist/{itemKey}` | Body `{checked}`; idempotent; unticking deletes the row; unknown key = generic 404 |

## Permissions and refusals
Gate `ConsultantHomeService.requireSelf` (Consultant role from data, `opportunities.respond`, own `consultant_profile`). Writes add `interviews.manage` (SELF/WRITE).
Another org, non-consultant, flags off, another consultant's session id, unknown ids: generic 404. Validation and PII-scanner (`SensitiveContent`, notes) are 422.

## Real vs SAMPLE
Everything is real; nothing is marked SAMPLE.
- Upcoming Prep Sessions = own SCHEDULED `talent_interview` rows in the future (no change figure: no baseline is stored).
- Practice Score = average of own `cws_prep_session`; `null` (shown "-") with no sessions; change = points vs the average as of 30 days ago.
- Weak Areas = session kinds whose average is below 75; change vs 30 days ago when older sessions exist.
- Suggested Question Sets = 1 behavioral + one per distinct upcoming role (max 3) + one per profile skill (max 5) + one per upcoming company (max 3).
- Technical Topics chips = own `consultant_skill` (max 6); default chips (Java, Spring Boot, Microservices, System Design) when none.
- **Module catalog, practice questions and the 8 checklist items are static default content in `InterviewPrepCatalog`. They should move to admin configuration later.**
- View Research links to `/w/consultant/interviews` and names the next interview; no scraping, no external calls.

## New tables (own rows only, migration above)
`cws_prep_session` (title, kind TECHNICAL|BEHAVIORAL|COMPANY|QUESTION_BANK, score, duration_minutes, notes, occurred_at), `cws_prep_answer`
(composite FK to the session, position, question, score), `cws_prep_check` (item_key, checked_at; unique per consultant+item). Tenant FKs, org_id first in indexes.

## Code
API: `InterviewPrepResource`, `InterviewPrepService`, `InterviewPrepDTO`, `InterviewPrepCatalog`, `ConsultantWsInterviewPrepDemoSeeder`,
entities `CwsPrepSession/CwsPrepAnswer/CwsPrepCheck`, repositories of the same names. IT: `InterviewPrepResourceIT`.
Web: `components/ent/consultant-ws/InterviewPrepPage.tsx`, `lib/ent/consultant-ws/interviewPrep.ts`, route `app/(tenant)/%5Ft/w/consultant/interview-prep/page.tsx`,
BFF `app/api/orgs/[orgId]/me-workspace/interview-prep/**` (+ `_bff/shared.ts`). Tests: `interviewPrep.test.ts`, `InterviewPrepPage.test.tsx`.
Checklist toggles are optimistic with a 6 s Undo and roll back on failure. The history score ring reuses `components/app-v2/common/ProgressRing` (read only).

## Wiring left for the coordinator
- `master.xml`: include `20261103080000_ent_cws_interview_prep.xml`.
- `EnterpriseDemoBootstrap`: call `ConsultantWsInterviewPrepDemoSeeder.seed()` (idempotent; guards on its own tables; Anika/Ben/Sam only).
- `workspaces.json`: flip the CONSULTANT `interview-prep` item live.
- `OrgIsolationIT` rows (verb + path, fixtures need a consultant of the org and one session id):
  GET `/api/orgs/{orgId}/me-workspace/interview-prep`; GET `.../interview-prep/sessions/{sessionId}`;
  POST `.../interview-prep/sessions`; PUT `.../interview-prep/checklist/review-jd`.

## Known gaps
No AI scoring or feedback; no delete/edit of a session; the checklist is per consultant, not per interview; the Upcoming tile has no month-over-month figure;
catalog is not admin-configurable yet; the 390px and 1440px layout were checked by class review and component tests, not in a browser.
