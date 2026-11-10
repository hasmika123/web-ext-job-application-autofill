# Consultant workspace: My Applications (`/w/consultant/applications`)

Board: `design/enterprise-consultant/applications.webp`. Read-only: the marketer prepares, the consultant submits outside Kiwiply. No new table, no migration, no seeder, no writes (so no PII scanner path).

## Endpoints (`/api/orgs/{orgId}/me-workspace/applications`, `@OrgPermissionRequired`)
| Verb + path | Purpose |
|---|---|
| `GET /` `?status=ALL\|ASSIGNED\|SUBMITTED\|UNDER_REVIEW\|INTERVIEWING\|OFFER\|HIRED\|REJECTED\|WITHDRAWN\|NO_RESPONSE&sort=applied\|company\|stage&page=&size=` | tiles, one page of rows, status options with counts, funnel, recent status updates. Size capped at 50 (default 10). Bad status 422, bad sort 400. |
| `GET /{applicationId}` | row, created / last stage change, stage timeline (CREATED + STAGE_CHANGE events). |

Gate: `ConsultantHomeService.requireSelf` (roles from data, `opportunities.respond`, own consultant_profile; generic 404 otherwise). Every query is orgId + own consultantId; another consultant's or tenant's application id is the generic 404.

## Numbers
- Value now = current stage. "vs last month" = stage at T-30 from `talent_application_event` (latest CREATED/STAGE_CHANGE up to T-30), total = applications created before T-30; restricted to the consultant. No delta (null, UI says "No change to compare yet") when previous is 0. Sparklines weekly, 6 points, same rule.
- Under Review = SUBMITTED + UNDER_REVIEW; Interviews = INTERVIEWING; Rejected = CLOSED with `closed_reason` REJECTED; Offers = OFFER.
- Funnel: Total, Under Review, Interview Scheduled, Offers, Rejected, share of all applications (other stages and closed reasons are only in the total).
- Recent Status Updates: the consultant's latest 5 STAGE_CHANGE events; `by` is YOU / MARKETER / TEAM, never a name.
- Notes: `talent_application_note` has no visibility flag and NOTE events can hold marketer text, so notes and NOTE events are never returned (the sheet says so). Stages are only those in the data (no "Phone Screen").

## Code
- API: `ConsultantApplicationsResource`, `ConsultantApplicationsService`, `ConsultantApplicationsDTO`, `CwsApplicationEventRepository` (read-only repo over `TalentApplicationEvent`, orgId first).
- Web: `components/ent/consultant-ws/ApplicationsPage.tsx`, `lib/ent/consultant-ws/applications.ts`, route `app/(tenant)/%5Ft/w/consultant/applications/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/applications/**` (+ `_bff/shared.ts`, whitelists the query).
- Tests: `ConsultantApplicationsResourceIT` (7), `applications.test.ts`, `ApplicationsPage.test.tsx`.

## Real vs sample
All real. Nothing is SAMPLE. Source pill: Job Match / Job Discovery / Marketer Referral / Direct Apply get their colours, any other stored label (the demo seed uses Company Website, Vendor Portal, Referral, Job Board, Direct Outreach) is shown as given.

## OrgIsolationIT rows to add
- `GET /api/orgs/{orgId}/me-workspace/applications`
- `GET /api/orgs/{orgId}/me-workspace/applications/{applicationId}`

## Known gaps
- Rail "View Application" opens the first row's sheet; Funnel "View Details" and Recent "View All" links are omitted (no target page exists).
- Submission Source column is hidden below 2xl (it is in the sheet); ⋮ menu has View details, Ask my marketer, Prepare for interview (INTERVIEWING only).
- Not verified in a browser (no next build/start allowed): 390px and 1440 layout checked by construction only.
