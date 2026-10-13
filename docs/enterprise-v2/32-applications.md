# 32 — Applications (consultant side and the org's consented view)

> Status: design, 2026-10-12 (Session D). Implements ADR-010 (E1 answered 2026-10-12: the consultant
> submits), requirements §12 "Consultant workflow", scenario D and E. Build-ready for **X9.1–X9.4,
> X9.9, X9.10**. Reuses: `application` (person-owned; `ApplicationSyncResource` `/api/profile/applications`,
> `ApplicationPatchService`, `ApplicationEventService.record/recordStatus`, `application_note`,
> `TrackerUsers.application(user, id)`), the extension (`app-tracking.js` `pushDraft/confirmSubmission`,
> `submit-detect.js`, service-worker `confirmForTab`, `TrackingProvider` in `src/lib/tracking.js`,
> `GET /api/profile/version {version, plan}`), `ShareField` (`STAGE_COUNTS`, `LAST_ACTIVITY`,
> `APPLICATION_DETAIL`, `EMPLOYER_DETAILS`, `JOB_ASSIGNMENTS`), the inbox (`InboxParser`, `MailMatcher.next`).

## 1. Consultant workspace (X9.1) — what the consultant does, in their own session

Pages (permission nav from `CONSULTANT` template, `38-ux-talent-workspaces.md` §3): Home, My Profile
(career profile = existing user profile pages, embedded), My Resumes (existing builder list + the
org links/approvals from 30 §9), Job Matches (existing `JobMatchResource` **plus** org suggestions),
Assigned Opportunities, Applications (the existing tracker, filtered "From Acme" / "Mine"),
Interviews (33), AI Interview Preparation (X9.7), Offers, Placements, My Available Features
(Session C's entitlement view), Notifications, Settings.

The consultant workspace is the **user app with an org lens**, not a copy: on a tenant host the
shell renders the user-area routes (`/applications`, `/resumes`, `/interviews`) inside the
enterprise shell with the org's branding, and the APIs are the existing `/api/profile/**` routes
with the user's own token. Only the org-specific lists (`/api/me/orgs/{orgId}/…`) are new.

## 2. Assigned opportunities → application link (X9.2)

- `GET /api/me/orgs/{orgId}/opportunities?status=` lists the consultant's `opportunity_match` rows
  (ASSIGNED/ACCEPTED/AUTHORIZED/IN_PROGRESS/…) with the opportunity, the marketer's note and the
  pinned resume (with "approve the new version" if STALE).
- Actions: Accept / Decline (reason), Authorize (scope picker: *I'll apply myself* · *Sarah may
  present me to the client* · both — the second option is hidden for JOB_POSTING opportunities, 31 §9),
  **Apply** = opens `apply_url` in a new tab; the extension drawer (same account, own session) autofills
  with the consultant's own profile and the pinned resume (`lastResumeId` hint via
  `/api/profile/version` `hints.resumeId` — see §5). "Save to my board" = existing `POST /api/profile/applications`
  with `postingId`/`jobUrl`, `source: "org"`, `status: SAVED`.
- `pipeline_application_link(id, org_id, match_id, application_id, linked_at, source SUBMIT_DETECT|CONSULTANT|BOARD_SAVE, unlinked_at)`
  UNIQUE `(org_id, match_id)` live; UNIQUE `(org_id, application_id)` live.
- `PipelineApplicationLinker` (SYSTEM, `@TransactionalEventListener` on `ApplicationEventService`'s
  new `ApplicationStatusChanged(userId, applicationId, from, to, source)` event — add the event
  publication to `recordStatus`, additive): for the user's ACTIVE consultant memberships, find a match
  whose opportunity has the same `posting_id`, or normalised `jobUrl` host+path, or (fallback)
  `companyKey + roleTitle` (`JobSearchService.companyKey`) within 30 days of assignment; link it and
  run the match transition (31 §4). The marketer sees APPLIED live (SSE/poll on the pipeline page).
- The consultant can link/unlink manually from the application detail ("This is for Acme's Stripe
  opportunity"). Unlink keeps history (`unlinked_at`).
- Status mirror (SYSTEM only): `application.status` APPLIED → match IN_PROGRESS; REJECTED →
  CLOSED_REJECTED; WITHDRAWN → CLOSED_WITHDRAWN; OFFER → match stays IN_PROGRESS and the AM is
  nudged "Anika has an offer on her board — record it?" (`ORG_OFFER` to the AM; org offers are
  created by people, never inferred); INTERVIEW → `interview_slot` suggestion (33 §4).

## 3. Application tracking for the org (X9.3, X9.4)

| viewer scope | what `GET /api/orgs/{orgId}/applications` returns |
|---|---|
| SUMMARY (admin, manager, HR dashboards) | per consultant: stage counts for the period, last activity date, "from Acme" count vs own — `ShareField.STAGE_COUNTS`/`LAST_ACTIVITY` projection; never an employer name |
| FULL (paired marketer, the consultant) | rows: company, role, status, applied date, next action, the merged timeline (`application_event` ∪ `pipeline_event` for the linked match, ordered by time, each tagged "you"/"Sarah"/"system"), shareable notes |
| none | the honest empty state ("Anika hasn't shared her applications") |

- **Shareable notes**: `application_note` gains `shared_with_org BOOLEAN DEFAULT FALSE` (additive,
  user-area table); the consultant toggles per note; FULL viewers see only shared notes. The
  marketer's own notes live on the match (`opportunity_match.note_to_consultant` and
  `pipeline_task`), never on the consultant's application.
- **Ghost rule**: an IN_PROGRESS match with no event for `org.pipeline.no_response_days` (default 45)
  shows "no response" and auto-closes at 2× that (`OpportunityFreshnessJob`), matching the user
  app's derived "ghosted" (never stored).
- The org never sees: answers cache, custom answers, inbox mail, attachments, private notes
  (`ShareField.PRIVATE_DATA` rule, existing).

## 4. Inbox and org workflows (`inbox.monitoring`)

The inbox stays the **consultant's own Gmail over IMAP** (CLAUDE.md). The org never connects a
mailbox for anyone, never reads a consultant's mail, and Kiwiply never sends, moves or deletes.

- Consultant's inbox suggestions (`InboxParser` → `StatusChanged`) continue to move **their** application
  status; the mirror in §2 propagates to the match. The org only ever sees the resulting stage.
- **Marketer inbox** (prior art O10.9): the marketer may connect their **own** Gmail; `inbox_message.attributed_member_id`
  + `attribution` (from `marketer-workspace.md` §2) attribute vendor replies to a consultant's
  `candidate_submission` by rule (thread, requirement reference in subject, vendor contact address)
  and propose SHORTLISTED/REJECTED/INTERVIEW as a **suggestion** the marketer confirms (31 §5 SYSTEM
  row). AI classification only when rules are ambiguous, charged to the marketer's own entitlement
  (`inbox.monitoring`, beneficiary = marketer; 37). The consultant sees the resulting status with
  "from mail to Sarah — not you? tell Sarah" (no undo on their side; they never see the mail).
- Escalation **D4** in 08: whether marketer inbox attribution ships in X8 or waits for X12.

## 5. Extension workspace selector (X9.9) — E6 default (a)

- `GET /api/profile/version` → `{version, plan, workspaces: [{key: "personal"}, {key: "org:<orgId>", orgId, name, host, roles: [...], consultant: true|false}], hints: {resumeId?}}`.
  Additive fields; the extension ignores unknowns today (`tracking.js` normalises).
- Header `X-Kiwiply-Workspace: org:<orgId>` on every call from an org workspace; `WorkspaceHeaderFilter`
  validates it against the caller's ACTIVE membership (else 404 — same wall as tenant routes) and sets
  `TenantContext` for `/api/profile/**` reads that are workspace-aware (plan resolution: "Pro via Acme"
  is returned **only** inside `org:acme`; personal plan otherwise — ADR-018).
- Drawer: a workspace chip (`Personal` / `Acme`) in the header; switching re-pulls the mirror partition.
  `storage.js` partitions `bio/resumes/fieldCache/answerCache/pickCache/trackingPending` by workspace
  key (prefix `ws:<key>:`); `clearAccountData` clears all partitions; learned answers stay per account.
  The profile (bio) is the **same person** in every workspace — the partition exists for plan,
  resume list (org-approved first), assigned jobs and trackingPending, not for identity.
- In an org workspace where the user is **not** a consultant (a marketer), the drawer shows only
  "Save for consultant…" (prior art O10.7: creates a `job_opportunity` + draft match, `source_label =
  EXTENSION`) and autofill runs with the marketer's own profile — the engine never receives another
  person's bio (no endpoint returns it). `test/no_submit.test.js` covers it.
- `TrackingProvider` gains `listWorkspaces()`, `setWorkspace(key)`, `assignedJobs()`,
  `saveForConsultant({consultantMemberId, url, title, company})`. Version bump ritual applies.

## 6. API summary

| method | path | who | notes |
|---|---|---|---|
| GET | `/api/me/orgs/{orgId}/opportunities` · `/{matchId}` | consultant | §2 |
| POST | `/api/me/orgs/{orgId}/opportunities/{matchId}/accept` · `/decline` · `/authorize {scope}` · `/withdraw` | consultant | 31 §4 |
| POST | `/api/me/orgs/{orgId}/opportunities/{matchId}/link {applicationId}` · `/unlink` | consultant | §2 |
| GET | `/api/me/orgs/{orgId}/timeline` | consultant | "What Acme did" |
| GET | `/api/orgs/{orgId}/applications?consultant=&status=&period=` | `pipeline.view` / `applications.view` | §3 |
| GET | `/api/orgs/{orgId}/consultants/{memberId}/applications/{applicationId}` | FULL viewer | timeline merge |
| PATCH | `/api/profile/applications/{id}/notes/{nid}` `{sharedWithOrg}` | owner | additive |
| GET | `/api/profile/version` | extension | §5 |

## 7. Tests
`PipelineApplicationLinkerTest`, `ApplicationOrgViewTest` (SUMMARY vs FULL projections; notes shared
flag), `WorkspaceHeaderFilterIT` (forged workspace → 404; plan resolution per workspace;
`PersonalSubscriptionUnchangedIT` extended), extension `workspace.test.js` (partition keys,
switch, clear), `no_submit.test.js`, Playwright `consultant-workspace.spec.ts` (390/1440) and
`e2e-e.spec.ts` (personal compatibility).
