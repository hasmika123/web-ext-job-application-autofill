# 52 — State transition design (DESIGN, proposal)

> Implements ADR-024 D-6…D-11. Today's reality (V): match status is a free string; `recordStage` allows any stage → any stage; submission has a `NEXT_STATUS` map but marketer-recorded approval; consultant-side states are unwritten (no consultant endpoint). Actors: **C** = consultant (OWN), **M** = marketer (ASSIGNED, key shown), **A** = org admin (ORG), **S** = system (scheduler/event). All transitions are audited (`org_audit_event`) and append an event row; each is idempotent on retry (same target state = 200 no-op) and rejects an illegal source state with 409.

## 1. Match (`requirement_match.status`)
| From | To | Who | Condition |
|---|---|---|---|
| (none) | SUGGESTED | S (engine) / M (`matches.run` manual add) | job OPEN/IN_REVIEW, `hard_eligible` computed |
| SUGGESTED | ASSIGNED | M (`opportunities.manage`) | job open, consultant in scope + consent ≥ SUMMARY, resume approved (single gate, see D-7), creates/updates `mkt_opportunity` in one transaction |
| SUGGESTED | DISMISSED | M (`matches.run`) / C ("Not for me", `opportunities.respond`) | reason optional |
| ASSIGNED | WITHDRAWN | M (`opportunities.manage`) | only while opportunity `state ∈ {ASSIGNED, VIEWED, NEEDS_INFO}` and no submission; consultant notified; history kept |
| DISMISSED / WITHDRAWN | SUGGESTED | M | re-open |
| any | (frozen) | S | job FILLED/CLOSED/ON_HOLD ⇒ match is read-only; not deleted |
`stale_at` is orthogonal (S sets it on job/resume/profile change; recompute clears it). Concurrency: `@Version`; two marketers assigning the same pair ⇒ second call returns the existing opportunity (`alreadyAssigned=true`).

## 2. Opportunity (`mkt_opportunity.state`) — the consultant lifecycle
`ASSIGNED → VIEWED → INTERESTED | DECLINED | NEEDS_INFO → READY_FOR_SUBMISSION → CLOSED`

| From | To | Who | Notes |
|---|---|---|---|
| ASSIGNED | VIEWED | C (open the detail; `viewed_at` set once) | read side effect allowed only in the `con` API; idempotent |
| ASSIGNED/VIEWED/NEEDS_INFO | INTERESTED | C (`opportunities.respond`) | `interest` facet = INTERESTED or VERY_INTERESTED (consultant picks) |
| ASSIGNED/VIEWED/NEEDS_INFO/INTERESTED | DECLINED | C | `decline_reason` from a list + free text; M may not decline on behalf (E1) |
| ASSIGNED/VIEWED/INTERESTED | NEEDS_INFO | C | `info_request` text; M gets a follow-up task + notification |
| NEEDS_INFO | VIEWED | M (`opportunities.manage`) | after answering (`marketer_note`); consultant is notified |
| INTERESTED | READY_FOR_SUBMISSION | M | **derived guard:** consultant interested + resume approved + job open + consent ≥ SUMMARY; M sets, system re-checks on every read |
| DECLINED | INTERESTED | C | reversal allowed until CLOSED |
| any non-CLOSED | CLOSED | M/S | job closed/filled (S, `closed_reason=JOB_CLOSED`), marketer withdrew (M, `WITHDRAWN`), consultant placed elsewhere (M), application recorded (S, `APPLIED`) |
| READY_FOR_SUBMISSION | INTERESTED | M | resume changed or approval revoked (S sets `reason=RESUME_CHANGED`) |
Mapping to today's `interest` enum: VERY_INTERESTED/INTERESTED → state INTERESTED; OPEN → NEEDS_INFO if `info_request` else INTERESTED-pending; NOT_INTERESTED → DECLINED; NO_RESPONSE → ASSIGNED/VIEWED. The `interest` column stays for the marketer board and is written only by the consultant transition.
**Never implied:** ASSIGNED, INTERESTED or READY_FOR_SUBMISSION create nothing at the client; no transition creates a submission or application automatically (ADR-010, E1).

## 3. Resume approval for a submission (consent + versioning)
`org_resume.approval_status` (APPROVED/PENDING) is the *resume's* approval (today: org admin, F8). The **submission authorization** is separate and consultant-owned:

| Event | Effect |
|---|---|
| M prepares DRAFT submission with `(resume_id, version)` | `approval_state=DRAFT` |
| M "request authorization" | `AWAITING_APPROVAL`, consultant notified, `follow-up` task created |
| C authorizes (`submissions.authorize`) | `APPROVED`, `authorized_at`, `authorized_resume_version = resume_version`, `authorization_basis=CONSULTANT`; one click, shows the exact resume version and client |
| C rejects | `REJECTED` + reason |
| A override (`submissions.authorize_override`, HIGH risk, setting off by default) | `APPROVED`, `authorization_basis=ADMIN_OVERRIDE`, reason mandatory, consultant notified |
| Resume edited (new `version_no`) while submission not SUBMITTED | `STALE`; M must re-request; consultant sees the diff |
| Consultant revokes consent (`data_share` scope → NONE, or explicit "withdraw authorization") | un-submitted submissions → `REVOKED` (blocked, `authorization_revoked_at`); submissions already `SUBMITTED`+ keep their status but get `authorization_revoked_at` and a task "withdraw externally"; all `READY_FOR_SUBMISSION` opportunities → INTERESTED; marketer's access to resume content ends immediately (SUMMARY at most) |
| Marketer leaves the org / un-paired | `endPairingsTo` (existing) drops FULL→SUMMARY; same revoke rules for FULL-dependent drafts |

## 4. Client submission status (`mkt_submission.status`) — a record, never a transmission
`DRAFT → SUBMITTED → CLIENT_REVIEW → INTERVIEW_REQUESTED | REJECTED` (existing `NEXT_STATUS` map kept).
- `DRAFT → SUBMITTED` requires `approval_state = APPROVED` **and** `authorized_resume_version = resume_version` **and** consent ≥ SUMMARY **and** job open (existing `SUBMISSION_NOT_APPROVED` + new `RESUME_CHANGED`, `CONSENT_REVOKED`). Actor: **M records** that the *consultant* submitted (or that the client confirmed receipt) with `channel_label` + `external_reference`; Kiwiply transmits nothing. A consultant may record their own submission (`con` endpoint).
- `SUBMITTED → CLIENT_REVIEW → …` M records outcomes reported by the client/vendor.
- `* → WITHDRAWN` (archived) by M while DRAFT/AWAITING; after SUBMITTED only a "withdrawn from client" event with reason.
- **Identity & idempotency:** the live submission is unique `(org, consultant, requirement)` (generated key, doc 51 §2.6). A repeat create returns the existing live submission (200, `existing=true`). A new submission is allowed only after the previous is `REJECTED`/`WITHDRAWN`/`REVOKED` (archived). Same-employer-within-N-days warning is a *warning* (409 with `confirm=true` override) per doc 31.

## 5. Application (`talent_application.stage`)
`ASSIGNED → SUBMITTED → UNDER_REVIEW → INTERVIEWING → OFFER → CLOSED(closed_reason HIRED|REJECTED|WITHDRAWN|NO_RESPONSE)`; today any jump is accepted (V). Proposed table: forward moves allowed one or more steps (skip allowed only toward INTERVIEWING/OFFER with an event note, e.g. recruiter calls directly); backward only by M with reason (`CORRECTION` event); `CLOSED` is terminal except a reopen by A.
- **Entry paths (idempotent on `(org, requirement, consultant)`):** (1) **consultant direct** — C taps "I applied" (or the extension reports an application when the org opted in; Q-3) ⇒ row created with `entry_path=CONSULTANT_DIRECT`, stage SUBMITTED; (2) **marketer-assisted** — C authorizes, then C submits; on M recording `SUBMITTED` the application is created/updated `MARKETER_ASSISTED` and `submission_id` linked; (3) **client submission** recorded without authorization chain is refused (E1 requires authorization). A second path finds the row, appends an event, never creates a duplicate; if it is a different `entry_path`, the event notes the second path.
- Each move writes `talent_application_event(from_stage,to_stage,actor,detail)`; M moves need consent FULL for details (existing rule, V).

## 6. Interview → Offer → Placement
- **Interview** (`talent_interview.status` SCHEDULED/COMPLETED/CANCELLED + `mkt_interview_meta.coordination_status` CONFIRMED/SCHEDULED/AWAITING_CONFIRMATION/RESCHEDULED/PENDING_FEEDBACK): created by M proposing a slot; **C confirms** (`interviews.manage` OWN) — today M's "confirm" only *records* (acceptable until consultant API exists); COMPLETED by S after time passes + M/C records feedback.
- **Offer:** today only `talent_application.stage=OFFER`. Proposed `con`/`mkt` actions: M **records** offer details (rate band, start date) → `OFFER` event; C **responds** (`offers.respond` OWN: accept/decline/negotiate) → event; acceptance moves application to CLOSED/HIRED only when M records the placement.
- **Placement** (`talent_placement.status` ACTIVE/ENDED): created by M (record only, doc 35) after offer accepted; links `application_id`; ends by M with `end_date`; money is never moved.

## 7. Matrix: who can do what (summary)
| Action | C (OWN) | M (ASSIGNED) | A (ORG) |
|---|---|---|---|
| View job (Discovery) | yes (if setting) | yes | yes |
| Save job | yes | – | – |
| Suggest/dismiss match | dismiss own | yes | yes |
| Assign / withdraw | – | yes | yes |
| Respond (interested/decline/info) | yes | – (never on behalf) | – |
| Prepare submission / request authorization | – | yes | yes |
| Authorize submission | **yes** | – | override only |
| Record submitted / client outcome | own | yes | yes |
| Record application | own (direct) | yes (assisted) | yes |
| Interview confirm | **yes** | records/proposes | yes |
| Offer respond | **yes** | records | yes |

## 8. Failure and race rules
Unique keys are the arbiter; the service pre-checks for a friendly error, and a `DataIntegrityViolationException` is translated to the same 409/200-existing (`ConflictTranslator`). Every transition endpoint accepts `If-Match: <version>` (optimistic lock) and `Idempotency-Key`. Cross-stage side effects (opportunity READY → INTERESTED on revoke) run in the same transaction as the triggering change.
