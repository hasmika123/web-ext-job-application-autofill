# Consultant workspace: Submissions & Approvals (`/w/consultant/submissions`)

Board: `design/enterprise-consultant/submissions.webp`. This is the consultant's side of the marketer-to-consultant approval handshake (E1: the
marketer prepares, the consultant authorizes and submits for themself). **Kiwiply never submits and has no auto-apply. Approving only records the
consultant's attestation; nothing is sent to a client.**

## Endpoints (all `/api/orgs/{orgId}/me-workspace/submissions`, gate `ConsultantHomeService.requireSelf`, generic 404 otherwise)

| Verb + path | What | Extra permission |
|---|---|---|
| GET `` (`?status=&page=&size=`) | tiles, all pending rows (soonest due first), first page of past rows | - |
| GET `/past` (`?status=&page=&size=`) | one page of past submissions (default size 5, max 50), newest first, optional status | - |
| GET `/{id}` | detail: job, location, work mode, description, resume summary, marketer note, outcome | - |
| POST `/{id}/approve` | PENDING_APPROVAL -> APPROVED, records `decided_at` | `submissions.authorize` |
| POST `/{id}/decline` body `{reason}` | PENDING_APPROVAL -> DECLINED; reason 3..300 chars, PII-scanned | `submissions.authorize` |

Errors: unknown / other consultant's / other tenant's id, non-consultants, flags off: generic 404. Bad status/page/size or reason: 422. A second
decision (or deciding a row the client side already moved on): **409 `SUBMISSION_NOT_PENDING`** with "You already approved/declined this submission."
The decision is one atomic conditional UPDATE (`status = PENDING_APPROVAL` in the WHERE), so two concurrent calls cannot both win.

## Tiles
Pending Approvals (pending rows, vs last week), Approved Submissions (every row not pending and not declined, vs last month, stamped `decided_at`),
Submitted to Client (rows with `submitted_on`, vs last month), Needs Attention (**pending rows due within 24 hours or already past due**, vs last week).
Each delta compares the value now with how many of those same rows were already stamped before the window; no delta when that earlier count is 0.
Each tile carries `vs` ("week"/"month") so the label is honest.

## Data
New table `cws_submission` in `api/src/main/resources/config/liquibase/changelog/20261103100000_ent_cws_submissions.xml` (NOT registered in master.xml; the
coordinator adds it). Composite tenant FKs to consultant_profile, client_requirement, org_resume, org_member; unique (org_id, consultant_id,
requirement_id) = a job is submitted once per consultant; extra `sample_data` boolean marks demo stand-ins. Entity `CwsSubmission`, repo `CwsSubmissionRepository`.

**Real vs sample.** Rows are created by the marketer in the real product and the client side later writes `submitted_on`, `client_update`,
CLIENT_INTERVIEW / NOT_SELECTED. Neither role exists in this branch, so `ConsultantWsSubmissionsDemoSeeder.seed()` writes stand-in rows
(`sample_data = true`) for Anika / Ben / Sam in demo-acme and demo-beta: 3 pending (due in 3 h, 22 h, 4 days) plus past rows in several statuses with
client updates. The page shows a "Sample" mark whenever a shown row is a stand-in. Everything the consultant does (approve, decline, reading) is real.
Gap (documented): after APPROVED nothing in this product moves a row to SUBMITTED_TO_CLIENT; that is the marketer role's job.

## Web
`components/ent/consultant-ws/SubmissionsPage.tsx` (+ test), `lib/ent/consultant-ws/submissions.ts` (+ test), route
`app/(tenant)/%5Ft/w/consultant/submissions/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/submissions/**` (list/past forward only
status/page/size). Approve and Decline open a confirm dialog (approve shows the attestation copy; decline needs a reason). Review / View Details
opens a side sheet. Status filter and pager call `/past` (API-side pagination). Below 2xl the Marketer Note and Client Update columns fold under the
title/status so the actions stay reachable; single-column grids use `grid-cols-[minmax(0,1fr)]`.
Right rail: bee card, Quick Actions (My Resumes, My Marketer, Job Matches, Availability: plain links), Submission Checklist.
**The checklist copy and the approve attestation text are static defaults in `submissions.ts`; they should become admin config.**
The resume version links to `/w/consultant/resumes` (that page has no deep link for a specific preview yet).
No `packages/ui` change.

## OrgIsolationIT rows to add
GET `/api/orgs/{orgId}/me-workspace/submissions`, GET `.../submissions/past`, GET `.../submissions/{id}`, POST `.../submissions/{id}/approve`,
POST `.../submissions/{id}/decline` (body `{"reason":"not for me"}`). Table `cws_submission` org-first fixtures: any consultant row.

## Wiring for the coordinator
1. master.xml: add the include of `20261103100000_ent_cws_submissions.xml` (end).
2. EnterpriseDemoBootstrap: call `ConsultantWsSubmissionsDemoSeeder.seed()` after `ConsultantWsDemoSeeder`.
3. workspaces.json: flip `submissions` live.
4. **Home tile** (`ConsultantHomeService`, currently line ~178 `Tile submissionsPending = new Tile(0, null, null, List.of(), true);`): inject
   `CwsSubmissionRepository` and replace with
   `List<CwsSubmission> pend = submissionRepo.findByOrgIdAndConsultantIdAndStatusOrderByDueAtAscIdAsc(org, c.getId(), CwsSubmission.PENDING);`
   `Tile submissionsPending = tile(pend.size(), pend.stream().map(CwsSubmission::getCreatedAt).toList(), now, false);`
   (`sample=false` makes the Home page drop its Sample mark automatically; the Home web code needs no change).

## Tests
`ConsultantSubmissionsResourceIT` (values, detail, paging/filter/validation, no leak between consultants, other org / non-consultant / flags-off 404,
empty consultant, approve + decline success, validation, PII rejection, 409 on repeats and on rows already moved on, no application created).
Web: `submissions.test.ts`, `SubmissionsPage.test.tsx`.
