# 31 — Talent marketing: the §12 lifecycle as state machines, approvals, notifications, the submission rule

> Status: design, 2026-10-12 (Session D). Implements ADR-010 (**E1 answered 2026-10-12: the consultant
> submits; marketers prepare, request approval and record; Kiwiply never submits, no auto-submit**),
> requirements §12, scenario D. Build-ready for **X8.1–X8.10** and the shared schema used by X9/X10.
> Reuses: `job_posting`/`job_source` (`service/jobs/JobIngestService`, public board APIs for
> greenhouse/lever/ashby only — never scraping), `JobSearchService.search(Request)`, `JobMatchService`
> (`JobPrefilter.select`, `AiTask.JOBS`, `MatchPreferences`), `AiBudgetService.decide` →
> `AiRouter.generate` → `AiMeteringService.record` sequence, `NotificationService.publish(kind, userId, Payload)`,
> `OrgAuditService.record`, `application` (`ApplicationStatus DRAFT|SAVED|APPLIED|IN_REVIEW|INTERVIEW|OFFER|REJECTED|WITHDRAWN`),
> `ApplicationEventService.record`, `application_event.kind` constants, the extension submit-detect
> (`PUT /api/profile/applications/{id} {status:"APPLIED", submissionConfirmed:true}`).

## 1. The eight entities and why they are separate

| entity | table | owned by | answers |
|---|---|---|---|
| job opportunity | `job_opportunity` (03 §2.4 called it `opportunity`; the table name is `job_opportunity`) | org | "a thing worth marketing someone to" — a public posting **or** a client requirement, triaged by the org |
| client requirement | `client_requirement` (34) | org | the client's/vendor's ask, with its own lifecycle independent of who we propose |
| opportunity match | `opportunity_match` | org | "we propose consultant X for opportunity Y" + the consultant's decision + authorization |
| candidate submission | `candidate_submission` | org (CRM record) | "X's approved resume vN was presented to requirement R via channel C on date D" — a **record**, never a transmission |
| job application | `application` (person-owned, existing) | consultant | the consultant's own application on a board/ATS, made in their own session; the org sees it through `pipeline_application_link` under consent |
| interview | `interview` (person-owned, existing) + `interview_slot` (org coordination) | consultant / org | the consultant's calendar row vs the org's scheduling record (33) |
| offer | `offer` | org | terms presented to the consultant for a requirement; the consultant responds |
| placement | `placement` (35) | org | the engagement that resulted; distinct from the application that led to it; feeds Timesheets (H) |

One timeline table `pipeline_event(org_id, entity_type, entity_id, kind, from_status, to_status,
actor_member_id, beneficiary_member_id, assignment_id, summary ≤ 200, created_at)` records every
transition below (mirrors `application_event`). `PipelineEventService.record(...)` is the only writer.

## 2. State machine conventions (for Sonnet)

- One registry class `service/org/pipeline/PipelineTransitions` holds every transition as data:
  `Transition(entity, from, to, actorKind, permissionKey, guards[], effects[], notifications[])`.
  `PipelineStateMachineTest` renders the registry to a table and diffs it against the tables in this
  file (same doc-sync pattern as `ShareMatrixTest`), so the doc and the code cannot drift.
- `PipelineService.transition(entity, id, to, actorMembership, body)` → loads, finds the transition,
  runs `AuthorizationService.authorize` (05 §2) with the permission key and the beneficiary, runs the
  guards (each a `Guard` returning a reason code), applies effects in one transaction, writes
  `pipeline_event`, audits, publishes notifications after commit (`@TransactionalEventListener`).
  Illegal transition → 409 `PIPELINE_TRANSITION {entity, from, to}`.
- **Actor kinds:** `MARKETER` (= holder of the named permission at ASSIGNED+), `MANAGER`
  (`approvals.decide` TEAM+), `ACCOUNT_MANAGER`, `CONSULTANT` (OWN), `SYSTEM` (jobs, submit-detect).
- Terminal states are never left except where a row says so. Nothing is deleted; "remove" = CLOSED/WITHDRAWN.
- **Module gate (09 row 13):** every transition whose actor is MARKETER or MANAGER on
  `opportunity_match`, `candidate_submission` or `pipeline_task` first passes
  `ModuleGate.isOn(orgId, "module.talent_marketing")` (20 §6) — refused as step 6 `MODULE_OFF` (404).
  The Marketing and Marketing-mgmt workspace homes render the same `MODULE_OFF` state. CONSULTANT and
  SYSTEM transitions are not module-gated (a consultant can always answer what is already in flight).
- Every transition that names a consultant as beneficiary is visible to that consultant in their
  own timeline ("What Acme did"), including the actor's name.

## 3. `job_opportunity`

Columns (final): `id, org_id, kind JOB_POSTING|CLIENT_REQUIREMENT, posting_id NULL (global job_posting),
requirement_id NULL, title (300), company (200), location (300), url (1000), apply_url (1000),
source_label (40: BOARD_API|PASTED|REQUIREMENT|EXTENSION|MATCH), description_text (consented copy from
the public API or marketer-typed; never fetched from arbitrary HTML), skills_json, status, priority
LOW|NORMAL|HIGH, closes_at, created_by_member_id, assignment_id NULL, bank_id NULL (org job bank),
dedupe_key (64), created_at, updated_at`. Exactly one of `posting_id`/`requirement_id`
(CHECK). UNIQUE `(org_id, posting_id)` and `(org_id, requirement_id)` live keys; `dedupe_key` =
`JobIngestService.dedupKey(company,title,location)` for pasted links → warning on collision.

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | NEW | MARKETER / ACCOUNT_MANAGER / SYSTEM (requirement OPEN creates one) | `opportunities.manage` | board terms (§9): pasted URL on an unsupported host stores URL + typed title only; duplicate guard (§8) | row; bank link | — |
| NEW | TRIAGED | MARKETER | `opportunities.manage` | — | priority, skills, notes | — |
| TRIAGED | ASSIGNED | SYSTEM when the first `opportunity_match` reaches ASSIGNED | — | — | — | — |
| NEW/TRIAGED/ASSIGNED | CLOSED | MARKETER / SYSTEM (`closes_at` passed, posting gone: nightly `OpportunityFreshnessJob` using `JobIngestService` freshness, never a page fetch) | `opportunities.manage` | — | open matches → WITHDRAWN(reason OPPORTUNITY_CLOSED) | consultants with ACCEPTED matches: `ORG_OPPORTUNITY` "closed" |

## 4. `opportunity_match` — the core object of scenario D

Columns (final): `id, org_id, opportunity_id, consultant_member_id, score SMALLINT NULL, reason (300),
model (80), source SUGGESTED_AI|SUGGESTED_RULE|MANUAL, status, assigned_by_member_id, assignment_id,
assigned_at, note_to_consultant (500), resume_id (org-approved org_resume.resume_id), resume_version_no,
consultant_decided_at, decline_reason (40: NOT_INTERESTED|LOCATION|RATE|ALREADY_APPLIED|OTHER) + decline_note (200),
authorization CONSULTANT_APPROVED|PENDING|DECLINED|NOT_NEEDED, authorized_at, authorization_scope
APPLY_SELF|SUBMIT_RECORD|BOTH, approval_required BOOLEAN, approved_by_member_id, approved_at,
application_id NULL (via pipeline_application_link), submission_id NULL, withdrawn_reason, created_at, updated_at`.
UNIQUE `(org_id, opportunity_id, consultant_member_id)` — **the duplicate guard** (one row per pair, ever;
re-proposing after DECLINED reopens the same row with history).

```
SUGGESTED ──assign──▶ ASSIGNED ──accept──▶ ACCEPTED ──authorize──▶ AUTHORIZED ──(submit-detect | record)──▶ IN_PROGRESS ──outcome──▶ CLOSED_*
    │                   │                     │                      │
    └─dismiss─▶ DISMISSED  └─decline──▶ DECLINED  └─decline auth──▶ DECLINED   └─withdraw──▶ WITHDRAWN
                                                   (consultant may re-accept from DECLINED while the opportunity is open)
```

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | SUGGESTED | SYSTEM (AI/rule matching, X8.3) or MARKETER (manual proposal) | `matches.run` | consultant `consultant_profile.marketing_status = ACTIVE`; feature `ai.job_matching` for AI rows (beneficiary = consultant); duplicate guard | row with score/reason | none (suggestions are the marketer's inbox) |
| SUGGESTED | DISMISSED | MARKETER | `matches.run` | — | — | — |
| SUGGESTED / — | ASSIGNED | MARKETER (single or batch) | `opportunities.manage` (ASSIGNED) | step 9 act-for; `org_resume` APPROVED/NOT_REQUIRED chosen (`ApprovalGateTest`); cap `assignments.open_max` per consultant (setting, default 100) → 409 `ASSIGNMENT_CAP`; same-employer window (§8) → 409 `DUPLICATE_WARNING` unless `confirmDuplicate`; if `approval_required` (org setting `org.pipeline.manager_approval = ALWAYS|HIGH_PRIORITY|NEVER`, default NEVER) → status stays SUGGESTED with `approval PENDING` until a MANAGER approves | `assigned_*`, `assignment_id`, `resume_id/version`; opportunity → ASSIGNED | consultant `ORG_OPPORTUNITY` — **one notification per batch** (`groupKey = batch:{uuid}`, dedupe `match:{id}:assigned`), body "Sarah assigned you 14 jobs · default resume Backend v4" |
| ASSIGNED | ACCEPTED | CONSULTANT | `opportunities.respond` (OWN) | — | `consultant_decided_at` | marketer `ORG_OPPORTUNITY` (grouped per consultant per hour) |
| ASSIGNED | DECLINED | CONSULTANT | `opportunities.respond` | reason required | — | marketer grouped |
| ACCEPTED | AUTHORIZED | CONSULTANT | `submissions.authorize` (OWN) | the pinned resume version still APPROVED (else 409 `RESUME_STALE` with "approve the new version first"); authorization_scope chosen: `APPLY_SELF` (I will apply myself), `SUBMIT_RECORD` (Sarah may present this resume to the client/vendor and record it), `BOTH` | `authorization = CONSULTANT_APPROVED`, `authorized_at` | marketer `ORG_AUTHORIZATION` "Anika authorized Stripe · SWE II" (emailWorthy) |
| ACCEPTED/ASSIGNED | DECLINED | CONSULTANT (declines authorization) | `submissions.authorize` | — | `authorization = DECLINED` | marketer |
| AUTHORIZED | IN_PROGRESS | **SYSTEM via submit-detect** (consultant's own extension → `PUT /api/profile/applications/{id}` APPLIED → `PipelineApplicationLinker` on `ApplicationEventService.recordStatus` with `postingId`/`jobUrl` match, 32 §2) **or** MARKETER records a `candidate_submission` (authorization_scope ⊇ SUBMIT_RECORD) | SYSTEM / `submissions.record` | for the record path: `candidate_submission` created (§5) | `application_id` or `submission_id` set | marketer: "Anika applied · Stripe" (`ORG_OPPORTUNITY`); consultant: "Sarah recorded your submission to Globex via TekVendor" (`ORG_OPPORTUNITY`) |
| ACCEPTED | IN_PROGRESS | SYSTEM (consultant applied without an explicit authorize — applying **is** authorizing for `APPLY_SELF`) | — | link found by submit-detect | `authorization = CONSULTANT_APPROVED`, scope APPLY_SELF | marketer |
| IN_PROGRESS | CLOSED_PLACED / CLOSED_REJECTED / CLOSED_WITHDRAWN / CLOSED_NO_RESPONSE | SYSTEM (from `application.status` REJECTED/WITHDRAWN/OFFER→placement; `candidate_submission` REJECTED; 32 §3 ghost rule after `org.pipeline.no_response_days`, default 45) or MARKETER (`followups.manage`) | | | terminal | consultant + marketer; placement → 35 |
| any non-terminal | WITHDRAWN | MARKETER (`opportunities.manage`), CONSULTANT (own, "not pursuing"), SYSTEM (opportunity closed, consent revoked → the row stays but the marketer loses the view) | | reason | terminal | the other party |

**Manager approval** (`approval_required`): `POST /matches/{id}/approve|reject` by `approvals.decide`
(TEAM), only on metadata (consultant name, opportunity title, resume display name). Pending approvals
feed the Marketing Manager "Approvals" page. Rejection returns the row to SUGGESTED with a note.

## 5. `candidate_submission` — the CRM record (never a transmission)

Columns (final): `id, org_id, match_id NULL, requirement_id NOT NULL, consultant_member_id,
submitted_by_member_id, assignment_id, resume_id, resume_version_no, org_resume_id, rate_band_label (40),
proposed_rate_minor NULL, currency, channel_label (40: VENDOR_PORTAL|EMAIL|PHONE|VMS|OTHER),
channel_note (120), external_reference (120), status, authorized_at, submitted_at (**entered by the
marketer** — the time they presented it outside Kiwiply), shortlisted_at, rejected_at, rejection_reason (200),
withdrawn_at, created_at, updated_at`. UNIQUE live key `(org_id, requirement_id, consultant_member_id)`
where status ∉ {WITHDRAWN} — **the second duplicate guard**. Free text → `SensitiveContent.check`.

```
DRAFT ──request authorization──▶ (match.authorization PENDING) ──consultant authorizes──▶ AUTHORIZED ──record submitted──▶ SUBMITTED ──▶ SHORTLISTED ──▶ (interview_slot …) ──▶ OFFERED
                                                                                                                             └──▶ REJECTED        └──▶ REJECTED
 any ──▶ WITHDRAWN (marketer with reason; consultant "withdraw me" → marketer must record it outside Kiwiply too)
```

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | DRAFT | MARKETER / ACCOUNT_MANAGER | `submissions.prepare` (ASSIGNED) | requirement OPEN; consultant has an open match for the requirement's opportunity (auto-create the match row MANUAL if absent); `org_resume` APPROVED; duplicate guard; vendor-chain guard (§8: same end client via another vendor within the window → warning) | packet = resume version pin + rate band + notes | — |
| DRAFT | AUTHORIZED | CONSULTANT (through the match's `authorize` with scope ⊇ SUBMIT_RECORD) | `submissions.authorize` | the packet shown to the consultant is exactly what will be presented (resume version, rate band, client/vendor names) | `authorized_at` | marketer `ORG_AUTHORIZATION` |
| AUTHORIZED | SUBMITTED | MARKETER / ACCOUNT_MANAGER | `submissions.record` | `submitted_at` ≤ now and ≥ `authorized_at`; `channel_label` required; attachment never (resumes are referenced by version, not uploaded) | match → IN_PROGRESS | consultant `ORG_OPPORTUNITY` "Sarah recorded: presented to Globex via TekVendor on 14 Oct" |
| SUBMITTED | SHORTLISTED / REJECTED | MARKETER / ACCOUNT_MANAGER / SYSTEM (`inbox.monitoring`, 32 §4, suggestion only — a human confirms) | `submissions.record` | — | | consultant + marketer |
| SHORTLISTED | OFFERED | SYSTEM when an `offer` is EXTENDED for this submission | — | | | — |
| any non-terminal | WITHDRAWN | MARKETER, CONSULTANT (own) | `submissions.record` / OWN | reason | match → WITHDRAWN if no application link | other party |

**What "Sarah submits through an authorized workflow" (scenario D) means under E1:** Sarah builds the
packet (DRAFT), Anika authorizes it (she sees the exact resume version and rate band), Sarah presents
it **outside Kiwiply** — from her own mailbox or the vendor's portal — and then **records** the
submission (SUBMITTED, channel label, external reference). The UI verb is "Record submission"; the
button labelled "Submit" does not exist on any org surface (`NoSubmitSurfaceTest`, §10). For a job
board the authorized workflow is "Anika applies in her own session" (X9.2) — Sarah can only
prepare the opportunity and the resume.

## 6. `job_application` (existing `application`, consultant-owned — 32)

Status machine is the existing `ApplicationStatus` with the existing writers (extension, web, inbox,
assistant). **No org actor can write it.** The org reads it through `pipeline_application_link`
under FULL (`ShareField.APPLICATION_DETAIL`) or as stage counts under SUMMARY. The only org-side
effect is `PipelineApplicationLinker` (SYSTEM) mapping `application.status` → match status (§4).

## 7. `interview` / `interview_slot` (33), `offer`, `placement` (35)

Offer machine (table in 03 §2.4 + `submission_id NOT NULL, match_id NULL, requirement_id, terms_note (500),
extended_at, expires_at, responded_at, response_note (300), decline_reason (40)`):

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | DRAFT | ACCOUNT_MANAGER / MARKETER | `offers.manage` | submission SHORTLISTED or SUBMITTED | rates as **records** (`bill_rate_minor` visible to finance/AM only; `pay_rate_minor` to the consultant) | — |
| DRAFT | EXTENDED | ACCOUNT_MANAGER / MARKETER | `offers.manage` | `expires_at` optional | submission → OFFERED | consultant `ORG_OFFER` (emailWorthy, urgent-ish: ignores grouping) |
| EXTENDED | ACCEPTED / DECLINED | CONSULTANT | `offers.respond` (OWN) | — | ACCEPTED → `placement` PENDING_START created (35 §2); the consultant's own `application` (if linked) may be set to OFFER **by the consultant** from the same screen (a user-area write with their own token) | AM + marketer `ORG_OFFER` |
| EXTENDED | EXPIRED | SYSTEM (`expires_at`) | — | | | AM |
| DRAFT/EXTENDED | WITHDRAWN | ACCOUNT_MANAGER | `offers.manage` | reason | | consultant |

Interview slot and placement machines live in 33 and 35; they are in the same `PipelineTransitions` registry.

## 8. Duplicate-submission prevention (requirements §12, ADR-010)

| rule | mechanism | response |
|---|---|---|
| same posting assigned twice in one org | `job_opportunity` live UNIQUE `(org_id, posting_id)`; pasted links dedupe via `dedupe_key` + URL normalisation (`JobBoardUrls`) | 409 `OPPORTUNITY_EXISTS {opportunityId}` → UI offers "open it" |
| same consultant proposed twice for one opportunity | `opportunity_match` UNIQUE `(org_id, opportunity_id, consultant_member_id)` | reopen the existing row (status history kept) |
| same consultant submitted twice to one requirement | `candidate_submission` live UNIQUE `(org_id, requirement_id, consultant_member_id)` | 409 `SUBMISSION_EXISTS` |
| same consultant to the same **end client** through different vendors / requirements within N days | `DuplicateGuard.sameEndClient(consultant, requirement.client_id or via chain, window org.pipeline.same_client_window_days default 90)` | 409 `DUPLICATE_WARNING {existingSubmissionId, client, days}`; proceed only with `confirmDuplicate=true` + reason (audited `PIPELINE_DUPLICATE_OVERRIDE`) |
| same employer on the consultant's **own board** (they already applied) | `PipelineApplicationLinker.findExisting(user, postingId|jobUrl|company+title)` at assign time, under FULL | match links to the existing application (status mirrors) and the marketer sees "already applied on 3 Oct" — no second application is ever suggested |
| two marketers (different consultants) chasing the same requirement | allowed; the requirement page shows all submissions; `org.pipeline.max_submissions_per_requirement` (default 3) → 409 `REQUIREMENT_CAP` | |

## 9. Respect for external job-board terms (requirements §12)

- Opportunities from a `job_posting` keep `apply_url` and the board's own `url`; the consultant is
  always sent to the board. Kiwiply never applies, never fetches the apply page server-side, never
  fills a form in anyone's session but the account holder's (CLAUDE.md, ADR-010).
- Pasted links on hosts outside the supported public-API boards (`JobBoardUrls` → greenhouse, lever,
  ashby) store the URL and whatever the marketer types; **no HTML fetch** ("never scraping"). A
  nightly HEAD-only liveness check is allowed (`OpportunityFreshnessJob`, respects `robots.txt`
  disallow by skipping; `User-Agent: KiwiplyLinkCheck/1 (+https://kiwiply.com/bot)`), with an
  org-level off switch `org.pipeline.link_check = false`. Escalation **D1** in 08 asks whether even
  the HEAD check should ship on by default.
- Boards that forbid third-party or agency applications: the opportunity card shows the board's
  "apply yourself" note (a static per-board policy table `BoardPolicy` in code, admin-editable JSON
  setting `enterprise.pipeline.board_policies`), and the marketer's packet cannot select `SUBMIT_RECORD` scope
  for a JOB_POSTING opportunity (only `APPLY_SELF`). Client requirements (vendor channels) use
  `SUBMIT_RECORD`.
- Autopilot batch-prepare for assigned jobs (X12.2) inherits every lock from
  `docs/design/ext/autopilot-orchestrator.md`: consultant's own session, stops at the final page,
  attestation lexicon untouched.

## 10. The no-submit guarantee, enforced in CI (`NoSubmitSurfaceTest`, X8.9)

Reflection over every handler under `/api/orgs/**` and `/api/ent/**`:
1. No handler method name, path segment or request-mapping contains `submit`, `apply`, `send` except
   the allow-listed `…/submissions/{id}/record` (records) and `…/matches/{id}/authorize` (consultant OWN).
2. No handler under `/api/orgs/**` references `ApplicationSyncService`, `ApplicationPatchService`,
   `ApplicationRepository.save`, `InterviewService.create` or any `Resume*Service` write method except
   through `ActForResumeService` (the audited act-for facade). Verified by scanning the handler's
   injected bean types.
3. The JWT decoder exposes no `act_as`/`impersonate` claim; `OrgAccessService.resolve` takes no login
   parameter (signature assertion).
4. `PipelineTransitions` has no transition whose actor is MARKETER/MANAGER/ACCOUNT_MANAGER with
   `to ∈ {AUTHORIZED}` on `opportunity_match`, or that writes `application.status`.
5. Extension (`job-autofill/test/no_submit.test.js`, E10.1 prior art; ships in X9.9): the drawer in an
   org workspace never calls `fill` with a profile other than the signed-in user's; `BLOCK_RE` in
   `adapters/base.js` still blocks submit-class controls; a jsdom fixture with a visible "Submit
   application" button asserts no click.
6. Web: a lint rule in `web/` forbids the literal button labels "Submit application" / "Apply for"
   under `src/app/(tenant)/**` and `src/components/ent/**` (09 row 1; the legacy `/org/*` console on
   kiwiply.com is not a marketing surface) — the only "Submit" buttons are form submits for
   org-owned records, which are named "Save"/"Record".

`MarketerScopeTest` (sees only assigned + consented consultants; another marketer's → 404) stays
from the prior art.

## 11. Notifications (new `NotificationKind` values, X8.10)

`ORG_ASSIGNMENT, ORG_CONSENT, ORG_RESUME, ORG_OPPORTUNITY, ORG_AUTHORIZATION, ORG_APPROVAL,
ORG_INTERVIEW, ORG_OFFER, ORG_PLACEMENT, ORG_HR, ORG_FINANCE` — **all registered up front by X2.10**
together with `ORG_MEMBERSHIP, ORG_DOMAIN, ORG_BILLING` (09 row 18); X4.7, X7.4, X8.10 and later
stories only *publish* them. None locked; defaults in
`NOTIFY_DEFAULTS` in-app on, email "now" for `ORG_AUTHORIZATION`, `ORG_OFFER`, `ORG_INTERVIEW`,
off otherwise. Org-side recipients are resolved member → `jhi_user.id`. Every payload carries
`link` to the tenant host of the org (`org_hostname.is_primary`, Session B) and
`groupKey = {entity}:{id}` so the inbox collapses bursts; batch assignment uses one dedupe key per
batch. Text keys live in `messages.properties` under `notif.org.*` (English only, like today).
The consultant's `notification_preference` matrix gains the new kinds automatically (unknown kind →
in-app on, email off — existing rule).

## 12. Follow-ups, tasks, activities (X8.6)

`pipeline_task(id, org_id, entity_type, entity_id, consultant_member_id, assignee_member_id, kind
FOLLOW_UP|CALL|EMAIL|PREP|CUSTOM, title (120), due_at, done_at, done_by, snoozed_until, created_by,
created_at)` — the marketer's to-do over any pipeline object. `FollowUpReminderJob` (daily 08:00
org tz) publishes `ORG_OPPORTUNITY` "3 follow-ups due today" to the assignee. Auto-suggested tasks:
7 days after SUBMITTED with no change → "Follow up with TekVendor" (setting `org.pipeline.followup_days`, default 7).
Activities = `pipeline_event` filtered by actor (My Activities) or by consultant (the consultant's
"What Acme did" timeline in the user app, consent-free because it is about actions *on* them).

## 13. Performance view (X8.7)

Per marketer (own rows only, no k-anonymity needed — the viewer is the subject or their manager):
assigned, accepted %, authorized %, submitted (records), interviews, offers, placements, median
days assign→authorize, follow-ups overdue. Manager sees the team table (TEAM scope). Org-wide
aggregates with suppression < 5 belong to X12.1.

## 14. Tests
`PipelineStateMachineTest` (doc ↔ registry), `PipelineServiceTest` (every transition's guards and
effects; illegal → 409), `DuplicateGuardTest` (five rules), `BatchAssignNotificationTest` (one per batch),
`ApprovalGateTest`, `PipelineApplicationLinkerTest` (submit-detect → IN_PROGRESS; existing application
reuse; consent revoked → link kept, view lost), `NoSubmitSurfaceTest`, `MarketerScopeTest`,
`BoardPolicyTest` (JOB_POSTING cannot take SUBMIT_RECORD), `OrgIsolationIT` registry lines,
Playwright `e2e-d.spec.ts` up to "Anika authorizes" (X8.9) and to "outcome and placement recorded" (X9.10).
