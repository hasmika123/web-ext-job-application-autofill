# 17 — Consultant assignments: `org_assignment`, effective dates, history, delegation, workload

> Status: design, 2026-10-12 (Session D). Implements ADR-008 and requirements §10. Build-ready for
> **X4.7** and **X4.8**. Existing code this grows from: `domain/org/OrgMember.supportOwnerMemberId`
> (kept for the STAFF flow, never written for consultants), `service/org/OrgAuditService`
> (`ASSIGNMENT_CREATE`, `ASSIGNMENT_END` exist, unused), `service/org/DataShareService`
> (`full_to_member_id`, `endPairingsTo`), `05-permission-model.md` §4 (`ScopeEvaluator` ASSIGNED),
> Liquibase changelog `202610xxxxxxxx_ent_assignments.xml` (additive).

## 1. What an assignment is

An **assignment** is a dated, auditable row that says *"assignee works on consultant for this
reason"*. It is never a field on the member. It answers step 9 of the evaluation order ("may this
actor act for this beneficiary") and feeds the ASSIGNED scope. Consent (what the actor may *see*)
stays with the consultant in `data_share` and is never moved by an assignment.

| kind | meaning | who normally holds it | step-9 act-for | scope contribution |
|---|---|---|---|---|
| `PRIMARY` | the marketer accountable for the consultant's marketing | MARKETING_SPECIALIST | yes | ASSIGNED |
| `BACKUP` | covers when PRIMARY is out; same powers, lower attribution priority | MARKETING_SPECIALIST | yes | ASSIGNED |
| `MANAGER` | approves, escalates, rebalances; sees pipeline, does not act for | MARKETING_MANAGER | **no** (approvals only) | TEAM (via `approvals.decide`) |
| `DELEGATE` | temporary cover with an explicit end date (leave, vacation) | any member with marketer permissions | yes, until `ends_at` | ASSIGNED while valid |

Rules (ADR-008, enforced in `OrgAssignmentService`):
- At most **one open PRIMARY** per consultant per org (generated active key
  `primary_active_key = IF(kind='PRIMARY' AND ends_at IS NULL, CONCAT(org_id,':',consultant_member_id), NULL)` UNIQUE).
- Any number of open BACKUP/MANAGER/DELEGATE rows, but the same (consultant, assignee, kind) may
  not be open twice (`open_key` generated UNIQUE on the triple when `ends_at IS NULL`).
- `DELEGATE` **requires** `ends_at` (≤ 90 days, setting `org.assignments.delegate_max_days`) and a `reason`.
- The assignee must hold a role whose effective permissions include `submissions.prepare` (PRIMARY/BACKUP/DELEGATE) or `approvals.decide` (MANAGER). Checked at create and re-checked by a nightly job; a role change that breaks it flags the row (`health = ROLE_LOST`) and notifies the Marketing Manager — rows are never auto-ended.
- A consultant cannot be assigned to themselves; an assignee cannot be the consultant's own member row.
- **Nothing is deleted.** Reassignment = end the old row (`ends_at = now`, `end_reason`) and open a new one in the same transaction, both audited. History is a plain query over the table.

## 2. Table `org_assignment` (final DDL for X4.7)

| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | BIGINT NOT NULL FK organization | first in every index |
| consultant_member_id | BIGINT NOT NULL FK org_member | the beneficiary |
| assignee_member_id | BIGINT NOT NULL FK org_member | the actor |
| kind | VARCHAR(20) NOT NULL | PRIMARY · BACKUP · MANAGER · DELEGATE |
| starts_at | DATETIME(6) NOT NULL | effective start (may be future: scheduled handover) |
| ends_at | DATETIME(6) NULL | NULL = open; DELEGATE must set it |
| reason | VARCHAR(200) NULL | free text, `SensitiveContent.check` |
| end_reason | VARCHAR(30) NULL | REASSIGNED · DELEGATION_EXPIRED · ASSIGNEE_LEFT · CONSULTANT_LEFT · MANUAL · ROLE_LOST |
| replaced_by_assignment_id | BIGINT NULL FK org_assignment | set on the ended row when reassigned (history chain) |
| created_by_member_id | BIGINT NOT NULL | |
| created_at, updated_at | DATETIME(6) | |
| health | VARCHAR(20) NOT NULL DEFAULT 'OK' | OK · ROLE_LOST · ASSIGNEE_SUSPENDED |
| primary_active_key | VARCHAR(64) generated, UNIQUE | one open PRIMARY |
| open_key | VARCHAR(96) generated, UNIQUE | no duplicate open triple |

Indexes: `(org_id, consultant_member_id, ends_at)`, `(org_id, assignee_member_id, ends_at)`,
`(org_id, kind, ends_at)`. Entity `domain/org/OrgAssignment`, repository `OrgAssignmentRepository`
with `findOpen(orgId, consultantMemberId)`, `findOpenForAssignee(orgId, assigneeMemberId)`,
`countOpenByAssignee(orgId)` (workload), `history(orgId, consultantMemberId)`.

"Open and effective" everywhere means `starts_at <= now AND (ends_at IS NULL OR ends_at > now) AND health = 'OK'`.
`ScopeEvaluator.ASSIGNED` and `AuthorizationService` step 9 use exactly this predicate
(one helper `OrgAssignmentRepository.isActingFor(orgId, actorMemberId, consultantMemberId, kinds)`).

## 3. Effective dates and scheduled handovers

- `starts_at` in the future creates a **scheduled** row; it is visible in history and on the
  consultant card ("Priya takes over on 1 Nov") but does not grant anything until then.
- A scheduled PRIMARY may coexist with the current open PRIMARY (the active key only counts rows
  whose `starts_at <= now` — implement the generated column as
  `IF(kind='PRIMARY' AND ends_at IS NULL AND starts_at <= CURRENT_TIMESTAMP(6), …)` is **not**
  deterministic in MySQL; so instead the service ends the current PRIMARY with
  `ends_at = new.starts_at` at creation time. Two rows then never overlap and the key holds).
- `AssignmentHandoverJob` (every 15 min, ShedLock-ready per ADR-022) expires DELEGATE rows past
  `ends_at` (`end_reason = DELEGATION_EXPIRED`) and sends the "cover ended" notification.

## 4. Consent interaction (the part people get wrong)

`data_share.scope = FULL` names **one** member (`full_to_member_id`). Assignment never changes it.

| event | what happens to consent | what the actor sees meanwhile |
|---|---|---|
| PRIMARY created and the consultant has no FULL | nothing changes; the consultant gets `ORG_CONSENT` notification "Sarah is now your marketer — share your resumes with her?" with one-tap grant (existing `PUT /api/me/orgs/{orgId}/share` with `fullToMemberId`) | SUMMARY fields only (`ShareField` projection); CONSENT_REQUIRED cards on resume/board pages |
| PRIMARY reassigned (Sarah → Priya) | FULL still names Sarah. Service calls `DataShareService.endPairingsTo` **only if** Sarah holds no other open act-for assignment for this consultant; otherwise nothing. The consultant gets the **re-point prompt** (`ORG_CONSENT`, dedupe `consent:repoint:{memberId}:{newAssigneeId}`) — never silently moved (ADR-008) | Priya: SUMMARY until the consultant re-points; Sarah (if ended): scope drops to SUMMARY automatically via `endPairingsTo` |
| BACKUP / DELEGATE created | no change; consultant may extend FULL to the cover with the same prompt. **One FULL at a time** stays the rule (Phase 7 `org_feature_consent` can grant per-feature act-for to additional assignees without a second FULL) | SUMMARY + whatever `org_feature_consent` grants |
| MANAGER created | nothing; managers approve on metadata (match title, resume name, dates), never read FULL content | pipeline rows at TEAM scope, SUMMARY fields |
| assignee leaves/suspended | all their open rows end (`ASSIGNEE_LEFT`), pairings end (`endPairingsTo`), Marketing Manager notified with a one-tap "Reassign" list | — |
| consultant leaves | rows end (`CONSULTANT_LEFT`); consent rows end per existing `DataShareService.endFor` | — |

Step 10 of the evaluation order therefore reads: act-for operation on FULL data → `data_share.full_to_member_id == actor` **or** `org_feature_consent(feature, granted_to = actor or NULL)`; otherwise `CONSENT_REQUIRED` (403) with `{beneficiary, consentKind, requestable: true}`.

## 5. Workload balancing (X4.8)

- **Workload** of an assignee = open, effective PRIMARY + BACKUP + DELEGATE rows (MANAGER rows
  excluded). Cap = `min(feature allowance consultants.max for the assignee's license, org setting
  org.assignments.cap_per_marketer)`; default 10 (ADR-008). Exceeding → 409 `ASSIGNMENT_CAP`
  `{assignee, open, cap}` unless the caller holds `assignments.manage` at ORG and passes `override=true` (audited `ASSIGNMENT_CAP_OVERRIDE`).
- `GET /api/orgs/{orgId}/assignments/workload` (permission `workload.view`, TEAM/ORG scope) returns
  per assignee: open counts by kind, cap, utilisation, consultants on bench > N days (from
  `consultant_profile.bench_since`), scheduled handovers, health flags. Sorted by utilisation desc.
- Rebalance UI (`38-ux-talent-workspaces.md` §4): drag a consultant chip from one marketer column
  to another → `POST /reassign` with the dragged consultant, new assignee, kind PRIMARY, `reason`
  prefilled "Workload balance". Undo toast for 8 s calls `POST /reassign` back (a new row, never a
  delete — history shows both moves).

## 6. API (`/api/orgs/{orgId}/assignments`, all under `OrgPermissionInterceptor`, listed in the `OrgIsolationIT` registry)

| method | path | permission (scope) | body / notes |
|---|---|---|---|
| GET | `/assignments?consultant=&assignee=&kind=&open=true` | `consultants.view` (ASSIGNED+) or `assignments.manage` | paged `AssignmentDTO` |
| GET | `/assignments/history?consultant=` | `assignments.manage` (TEAM+) or the consultant themself (`self.*`) | chain with `replacedBy` |
| POST | `/assignments` | `assignments.manage` (TEAM+) | `{consultantMemberId, assigneeMemberId, kind, startsAt?, endsAt?, reason?}` → 201; 409 `ASSIGNMENT_CAP` · 409 `PRIMARY_EXISTS` (when kind=PRIMARY and `reassign` not used) · 422 `DELEGATE_NEEDS_END` · 422 `ASSIGNEE_ROLE` |
| POST | `/assignments/reassign` | `assignments.manage` (TEAM+) | `{consultantMemberId, newAssigneeMemberId, kind, reason, startsAt?}` → ends current + opens new in one tx; returns both |
| POST | `/assignments/{id}/end` | `assignments.manage` (TEAM+) | `{reason}` |
| GET | `/assignments/workload` | `workload.view` (TEAM+) | §5 |
| GET | `/assignments/mine` | any marketer permission | the caller's open rows (drives "My Assigned Talent") |

Every write → `OrgAuditService.record(actor, ASSIGNMENT_CREATE|ASSIGNMENT_END|ASSIGNMENT_REASSIGN|ASSIGNMENT_CAP_OVERRIDE, TARGET_MEMBER, consultantLogin, assignmentId, details)`
and `pipeline_event(entity_type=ASSIGNMENT)` once Phase 8 exists (before that, audit only).

Notifications (`NotificationService.publish`, new kind `ORG_ASSIGNMENT`): consultant "Sarah is now
your marketer at Acme" (dedupe `assign:{id}`), assignee "You're now PRIMARY for Anika" , previous
assignee "Anika moved to Priya", manager on health flags. `ORG_CONSENT` for the re-point prompt.

## 7. Attribution and history preservation (requirements §10, ADR-008 consequence)

Pipeline objects (`job_opportunity.assignment_id`, `opportunity_match.assigned_by_member_id`,
`candidate_submission.submitted_by_member_id`, `pipeline_event.actor_member_id`) store the **member**
and the **assignment id at the time**. Reassignment does not rewrite them; the consultant's
timeline reads "assigned by Sarah (then PRIMARY)". Performance views (X8.7) attribute by
`assignment_id`, so a marketer keeps credit for work done before a handover, and the new marketer
sees the full history of the consultant (ASSIGNED scope evaluates on the **consultant**, not on the
row's author).

## 8. Tests (X4.7/X4.8)
`OrgAssignmentServiceTest` (one open PRIMARY; reassign ends+opens atomically; delegate needs end;
cap; override audited; scheduled start ends the current at that instant), `AssignmentConsentTest`
(FULL never moves; `endPairingsTo` only when no other act-for row remains; re-point prompt deduped),
`AssignmentHandoverJobTest`, `ScopeEvaluatorAssignedTest` (effective predicate incl. health),
`OrgIsolationIT` registry lines for the seven routes, Playwright `assignments.spec.ts`
(reassign with undo at 390 px, workload board at 1440).
