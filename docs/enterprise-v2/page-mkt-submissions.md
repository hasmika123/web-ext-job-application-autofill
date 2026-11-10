# Marketing workspace: Submissions page (`/w/marketing/submissions`)

Branch `mkt-submissions` (from `ent-talent-marketer`). Board: `design/enterprise-marketer/submissions.webp`. Permission `submissions.record` (ASSIGNED scope through `MktScope`).

**E1 (hard rule).** A submission here is a RECORD of a profile package a marketer prepared for a job, with an approval state. The marketer prepares, requests and records; the consultant submits. Nothing in this page or API sends anything to a client, submits for a consultant, or signs in as one. "New Submission" creates a DRAFT, "Send for approval" asks the consultant/approver, and the "Record: ..." actions note facts reported back (the consultant submitted, the client moved it to review, asked for an interview, or declined).

## Endpoints (`/api/orgs/{orgId}/mkt/submissions`, all through `MktScope.resolve(me, "submissions.record")`; 404 never 403)

| Verb + path | What |
|---|---|
| `GET ` | The whole board in one call: `kpis{pendingApprovals, submittedToday, underClientReview, rejected}` (value, deltaPct or null, 8-point sparkline), `items[]`, `total`, `page` (0-based), `size` (cap 100), `breakdown{period,total,buckets[6]}`, `activity[5]`, `filters{clients,jobTitles}`, `views[]`. Query: `q`, `status` (DRAFT/AWAITING_APPROVAL/SUBMITTED/CLIENT_REVIEW/INTERVIEW_REQUESTED/REJECTED), `approval`, `clientId`, `jobTitle`, `period` (7d/30d/90d/all, default 30d), `donutPeriod`, `sort` (consultant/jobTitle/client/date/approval/resume/status), `dir`. |
| `GET /options` | The New Submission choices: assigned consultants and open jobs. |
| `GET /{id}` | One record with its history. |
| `POST ` | Create a DRAFT `{consultantId, requirementId, resumeId?, note?}`; the resume defaults to the consultant's primary one; 409 `SUBMISSION_EXISTS` for a live duplicate. |
| `POST /{id}/request-approval` | DRAFT to AWAITING_APPROVAL. |
| `POST /{id}/approval` | Record the approver's decision `{decision: APPROVED|REJECTED, note?}` (a rejection ends the record as REJECTED). |
| `PATCH /{id}/status` | Record a fact `{status: SUBMITTED|CLIENT_REVIEW|INTERVIEW_REQUESTED|REJECTED, note?}`; SUBMITTED only after APPROVED; 409 `SUBMISSION_STATE` / `SUBMISSION_NOT_APPROVED` otherwise. |
| `DELETE /{id}` | Withdraw a draft (sets `archived_at`, history kept). |
| `POST /views`, `DELETE /views/{viewId}` | "Save View": the caller's own named filter set (max 20, same name replaces). |

Every write also passes the WRITE authorization (a past-due/closed org refuses), scans free text with the PII scanner, appends a `mkt_submission_event` and writes an audit row (`MARKETER_SUBMISSION_CREATE|REQUEST_APPROVAL|APPROVAL|STATUS|WITHDRAW`, target `SUBMISSION`). An unassigned consultant, an unknown id and another tenant's id are the same 404. `Idempotency-Key` is not used (the duplicate guard covers a double POST).

## Tables (`20261104030000_mkt_submissions.xml`)

`mkt_submission` (code `SUB-yyyy-nnn` unique per org, composite FKs to consultant / job / client / resume / member, approval_state, status, resume_version + resume_minor + resume_updated_at snapshot, submitted_on, archived_at), `mkt_submission_event` (activity feed and the state-at-a-time the KPI deltas use), `mkt_submission_view` (saved filters as plain columns, no JSON). All `org_id NOT NULL` + FK, indexes start with `org_id`.

## Real vs derived

- Rows, KPIs, donut, activity and filter options are computed from rows. Deltas come from events: the count a week ago is rebuilt from each record's events; "Submitted Today" compares against the same elapsed window yesterday; a delta with no previous value is omitted. Donut slice = AWAITING_APPROVAL while an approval is open, else the status (so the slices partition the rows).
- The board's `JOB-1001` code is derived as `JOB-(1000 + job id)` (the job table has no code column).
- Seed: `MktSubmissionsDemoSeeder` (runs on `ApplicationReadyEvent`, after the tenants and `TalentDemoSeeder`; `ENT_DEMO_SEED=true`): one record per application at SUBMITTED or later (status follows the stage), a draft or an open approval for each ASSIGNED one, a few declined approvals. No shared class was edited to hook it.

## Web

`components/ent/marketer-ws/submissions/` (`SubmissionsPage`, `SubmissionParts`, `SubmissionDialogs`), `lib/ent/marketer-ws/submissions.ts` (+ `submissions-bff.ts`), BFF routes under `app/api/orgs/[orgId]/mkt/submissions/**`, dev mock `web/scripts/mock-mkt-submissions.mjs`, art in `web/public/ent/marketer/submissions/` (10 photos, 10 client logos, help banner, cropped from the board). Reuses `KpiTile`, `DonutChart`, `Select`, `Popover`, `Menu`, `Dialog`.

## Known gaps

- Donut colours use the nearest tenant/status tokens (no orange token exists: Interview Requested uses the coral token).
- The consultant-side approval (a consultant approving in their own workspace) is not built; the marketer records the decision the consultant gave.
- The row checkboxes select rows but there is no bulk action on the board.
- Client logos for clients other than the board's ten show a letter tile; photos are initials unless the API sends `avatarUrl`.
