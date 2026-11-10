# Consultant workspace: Interviews (`/w/consultant/interviews`)

Board: `design/enterprise-consultant/interviews.webp`. Branch `ent-talent-consultant`. The consultant sees only their own interviews.
Kiwiply never creates, moves or cancels an interview here (the marketer or client does that) and Join only opens a link the consultant saved.

## Endpoints (`/api/orgs/{orgId}/me-workspace/interviews`)

| Verb + path | Purpose |
| --- | --- |
| GET `` | Page: tiles, upcoming table, calendar entries, recent feedback, completed interviews still waiting for feedback |
| GET `/{interviewId}` | One own interview with join details, feedback, `canEditDetails`, `canRecordFeedback` |
| PUT `/{interviewId}/detail` | Full replace of mode (VIDEO/ONSITE/PHONE), meeting link (https only, no credentials, 500), interviewer title (120), prep note (2000). Only own SCHEDULED interviews |
| POST `/{interviewId}/feedback` | Add feedback (outcome POSITIVE/NEUTRAL/NEGATIVE + summary, 1-1000). Only own COMPLETED interviews, once |
| PUT `/{interviewId}/feedback` | Edit it |

Permissions: gate `ConsultantHomeService.requireSelf` (Consultant role from data, `opportunities.respond`, own consultant_profile; generic 404 otherwise). Writes also need `interviews.manage` (OWN). Other consultant's / other org's / unknown ids: generic 404. Refusals are 422 (`TRACKER_INVALID`, or `SENSITIVE_CONTENT` from the PII scanner on link, title, note, summary).

## Real vs sample

Everything is real. Nothing is marked SAMPLE: the interviewer title shows only what the consultant stored (blank otherwise, not invented) and Mode shows "Not set" until chosen. Home's "interview mode" sample can now read `cws_interview_detail.mode`.
Tiles (UTC, weeks Sunday to Saturday): Upcoming = SCHEDULED and not yet ended (vs 30 days ago: interviews booked before then and still ahead); This Week = non-cancelled interviews this week (vs last week); Completed = COMPLETED (vs a week ago); Feedback Pending = COMPLETED without feedback. Delta is null (no chip) when the earlier value is 0. Sparklines = the same metric at six weekly points.
Status chip: Upcoming (starts within 7 days), Scheduled (later). Dates and times are rendered in the viewer's time zone.

## Tables (migration `20261103070000_ent_cws_interviews.xml`, registered by the coordinator)

- Adds the missing tenant key `uk_talent_interview_org_id (org_id, id)` on `talent_interview` (additive, guarded) so the composite FKs below can exist.
- `cws_interview_detail` (org, interview, consultant, mode, meeting_url, interviewer_title, prep_note; unique org+interview).
- `cws_interview_feedback` (org, interview, consultant, outcome, summary; unique org+interview).
Composite tenant FKs to `talent_interview` and `consultant_profile`; indexes start with org_id; empty rollback.

## Code

API: `ConsultantInterviewsResource`, `ConsultantInterviewsService`, `ConsultantInterviewsDTO`, entities `CwsInterviewDetail`/`CwsInterviewFeedback`, repos `CwsInterviewRepository` (own read queries on `talent_interview`), `CwsInterviewDetailRepository`, `CwsInterviewFeedbackRepository`.
Web: `components/ent/consultant-ws/InterviewsPage.tsx`, `InterviewSheet.tsx`; `lib/ent/consultant-ws/interviews.ts`; route `(tenant)/%5Ft/w/consultant/interviews/page.tsx`; BFF `app/api/orgs/[orgId]/me-workspace/interviews/**`.
Calendar is a hand-built month grid (arrow keys, PageUp/PageDown, Home/End, Today; dots: Upcoming blue, Scheduled amber, Completed green).

## Demo seeder

`ConsultantWsInterviewsDemoSeeder.seed()` (call after `ConsultantWsDemoSeeder`): for consultants with a member (Anika, Ben, Sam) in Acme and Beta, guarded on the two new tables only. It adds join details to upcoming interviews (example.org links; every third Onsite; demo interviewer titles, one prep note), tops up to 3 COMPLETED interviews from their applications (a marketer would create these, so they are DEMO data) and feedback on the two newest, leaving the rest pending.

## OrgIsolationIT rows to add

GET `/api/orgs/{orgId}/me-workspace/interviews`; GET `.../interviews/{id}`; PUT `.../interviews/{id}/detail`; POST `.../interviews/{id}/feedback`; PUT `.../interviews/{id}/feedback`.

## Known gaps

- "Recent Interview Feedback" has no View All (no page for it); the sheet is the detail.
- Interview Preparation rail links all go to `/w/consultant/interview-prep` (sections not deep-linked).
- Timezone for tile weeks is UTC; a consultant far from UTC may see a week boundary differ from their calendar.
- The `interviews.manage` denial path is not covered by an IT (the Consultant role always holds it).
- No Playwright journey or screenshots were run (no real stack in this task).
