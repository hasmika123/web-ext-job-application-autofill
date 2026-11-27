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
`mkt_submission` is the canonical record shared with the Marketing Submissions board. It is scoped to the organization and consultant,
and the marketer's duplicate guard allows one live record per consultant and requirement. The consultant endpoint reads that record directly,
so a package prepared by a marketer appears in the consultant's page without creating a second submission row. `MktSubmissionEvent` supplies
the approval decision timestamp and reason for the consultant detail view.

`cws_submission` remains a compatibility read source for installations that still have the original consultant-only rows. When a consultant has
canonical marketer records, those legacy rows are ignored, so the page cannot show the same consultant/job twice. New marketer records are not
marked as sample data. Everything the consultant does (approve, decline, reading) updates the canonical record; approving still only records the
consultant's attestation and never submits anything to a client.
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
POST `.../submissions/{id}/decline` (body `{"reason":"not for me"}`). Prefer `mkt_submission` org-first fixtures; retain a `cws_submission` fixture only when testing the compatibility fallback.

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
