# Marketing Manager workspace (`/w/marketing-mgmt`) — build-ready design

> Status: design, 2026-10-17 (Fable, branch `ent-deferred-design`). Stories `MM-01…MM-17` in `stories.md`.
> Builds on: 16 §5.3 (page list), 31 §4 (manager approval of an assignment), 38 §4 (Workload / Approvals wireframes),
> 17 (assignments), the sprint-2 B1 build (`AssignmentLifecycleService`, `marketer_assignment_event`, handover, the
> duplicate guard: `DuplicateGuardTest`, 409 `DUPLICATE_WARNING|DUPLICATE_BLOCKED|ASSIGNMENT_CAP`), the Marketing
> workspace boards (`web/src/components/ent/marketer-ws/**`, `api/.../web/rest/ent/mkt/*Resource`), the Admin board
> `MarketingAssignmentsPage` (`/api/orgs/{orgId}/marketing-assignments/*`), the change audit (`talent_application_event`,
> `mkt_submission_event`, `mkt_opportunity_event`, `talent_interview_event`) and `OrgAuditService`.
> Rules that win: E1 (the consultant submits; a manager approves **metadata**, never a submission), O5/O6 (assignment
> gives visibility; the manager's visibility is the union of their team's), CLAUDE.md (no PII, 404 not 403, admin-configured
> limits, `@kiwiply/ui` only, Gen-Z autosave UX).

## 0. What exists today and what this adds

| Today | After this design |
|---|---|
| `workspaces.json` lists `MARKETING_MGMT` with 8 nav items (home, team, assignments, pipeline, approvals, workload, escalations, reports) gated by `workload.view`, `member.view_summary`, `assignments.manage`, `pipeline.view`, `approvals.decide`, `escalations.manage`, `reports.view`; every one renders `ComingSoon` (role audit D4 P0: 8/8 placeholders) | 8 real pages, one folder each under `web/src/components/ent/mgmt-ws/`, a `mgmtPageFor()` registry mirroring `marketer-ws/registry.tsx`, one `MgmtPageProps` |
| `EntPermissions` already defines `approvals.decide` (TEAM, MANAGER kind), `workload.view` (TEAM), `escalations.manage` (TEAM); `MARKETING_MANAGER` template holds all MARKETING_SPECIALIST keys at TEAM | no new permission keys; one new scope helper `TeamScope` (§2) |
| Manager approval hold from 31 §4 (`org.pipeline.manager_approval`) is **not built** (B1 report: "X8.4's … manager-approval hold" not built); no approval table | `mkt_approval_request` (§3.1) + `ApprovalService`; the hold is wired into `OpportunityAssignmentService.assign` and the duplicate-override path |
| No escalation table; `mkt_followup` overdue, `mkt_opportunity` stalled and `NEEDS_INFO` answers exist as rows but nobody aggregates them | `mkt_escalation` (§3.2) + `EscalationService` + `EscalationRulesJob` |
| Workload exists as a report (`GET …/marketing-assignments/workload`) on the admin board | the manager's Workload page reuses it with `scope=team` (§5.6) |
| Reports: `GET /api/orgs/{orgId}/reports/overview` (`OrgReportsService`, ADMIN only) | `?scope=team` projection for the manager (§5.8) |

Nothing here submits, applies, or edits a consultant's resume. `NoSubmitSurfaceTest` stays green: every new verb is
`approve`, `reject`, `escalate`, `resolve`, `snooze`, `assign`, `comment`.

## 1. Who the manager is and what "my team" means

A member whose **effective** permissions include `workload.view` at scope ≥ TEAM (MARKETING_MANAGER template, or an
ORG_ADMIN/OWNER who holds everything at ORG). "Team" is resolved once per request by the new
`TeamScope.resolve(OrgMembership me)` → `TeamScope.View { orgId, managerMemberId, all, marketerMemberIds, consultantIds }`:

1. If the caller holds `workload.view` at **ORG** (admins): `all = true` (every marketer, every consultant).
2. Else (TEAM/DEPARTMENT): marketers = ACTIVE members holding a marketing role whose `org_member.manager_member_id`
   is the caller **or** who share an `org_group` of kind TEAM/DEPARTMENT with the caller per the existing
   `ScopeEvaluator` TEAM/DEPARTMENT rule (05 §4) — exactly the rule `ScopeDirectory`/`JpaScopeDirectory` already apply
   per target, so no second definition of "team" is written: `TeamScope` adds one query method
   `JpaScopeDirectory.membersInScope(OrgMembership me, String permissionKey)` (the set of member ids for which
   `ScopeEvaluator.inScope(me, scope, target)` holds, computed in SQL) and the permission check goes through
   `AuthorizationService.require(AuthzRequest.of(orgId, List.of("workload.view"), Beneficiary.NONE, null, AuthzOperation.READ).withActor(me))`.
3. consultants = every `marketer_assignment` (status ≠ ENDED) whose `marketer_member_id` or `backup_member_id` is in
   `marketerMemberIds`.
4. A manager with zero marketers in scope is a valid, empty team — pages show the "Build your team" empty state, never 404.

Every read on the eight pages filters by `TeamScope.View`; a row outside it is the generic 404 (`TeamScope.require(view,
marketerMemberId)` / `requireConsultant(view, consultantId)`), never an existence oracle. `MktScope`/`MarketerAccess`
stay untouched: a manager reading a consultant's **detail** (resume, applications) still goes through the marketer
routes with `MarketerAccess`, where the manager's scope is TEAM and the areas are the union of the team's
assignment areas (O6 — once O6 is built; until then the existing `MktScope.View.all` for TEAM holders applies).

## 2. Permissions, scopes, module and flags

| Page | Permission (scope) | Module | Entitlement |
|---|---|---|---|
| Home | `workload.view` (TEAM) | `marketing` (`flag.enterprise.marketing`) | none (management reads are free; 21 §3: no feature key is consumed by a manager read) |
| Team | `member.view_summary` (TEAM) | — | — |
| Consultant Assignments | `assignments.manage` (TEAM) | `marketing` | — |
| Pipeline | `pipeline.view` (TEAM) | `marketing` | — |
| Approvals | `approvals.decide` (TEAM) | `marketing` | — |
| Workload | `workload.view` (TEAM) | `marketing` | — |
| Escalations | `escalations.manage` (TEAM) | `marketing` | — |
| Reports | `reports.view` (TEAM) | — | — |

`EntitlementService.check` is **not** called on manager reads. The one gated write is "Approve" of an
assignment whose consultant lacks the feature the match needs (e.g. `matching.ai`): the approval succeeds (it is a
decision record) and the **marketer's** next action meets the normal 402 — the approval sheet shows the chip
"Anika's license has no AI matching" from `GET …/me/entitlements` data already exposed to marketers (no new gate).

## 3. Data model (additive Liquibase `20261124010000_ent_mkt_mgmt.xml`, one guarded changeSet per table, R1–R10)

### 3.1 `mkt_approval_request`
```
id BIGINT PK · org_id BIGINT NOT NULL FK organization · kind VARCHAR(30) NOT NULL
  (OPPORTUNITY_ASSIGN | DUPLICATE_OVERRIDE | RESUME_RELEASE)
subject_type VARCHAR(30) NOT NULL (MKT_OPPORTUNITY | MKT_SUBMISSION | TALENT_APPLICATION | ORG_RESUME)
subject_id BIGINT NOT NULL · consultant_id BIGINT NOT NULL (FK consultant_profile composite (org_id, id))
requested_by_member_id BIGINT NOT NULL · requested_at DATETIME(6) NOT NULL
title VARCHAR(160) NOT NULL (metadata only: "Anika Rao → Stripe · SWE II") · note VARCHAR(500) NULL (@NoSensitiveText)
payload_json JSON NULL (the pending action's arguments, e.g. {"matchId":…,"confirmDuplicate":true,"duplicateReason":"…"}; SensitiveContent.check on write)
status VARCHAR(20) NOT NULL (PENDING | APPROVED | REJECTED | WITHDRAWN | EXPIRED)
decided_by_member_id BIGINT NULL · decided_at DATETIME(6) NULL · decision_note VARCHAR(300) NULL (@NoSensitiveText)
expires_at DATETIME(6) NOT NULL · created_at, updated_at DATETIME(6) NOT NULL
IX (org_id, status, requested_at) · IX (org_id, requested_by_member_id, status) · IX (org_id, consultant_id)
UQ active_key (generated: CONCAT(subject_type, ':', subject_id, ':', kind) when status = PENDING else NULL) → one open request per subject+kind
```
### 3.2 `mkt_escalation`
```
id · org_id · kind VARCHAR(30) NOT NULL
  (STALLED_OPPORTUNITY | OVERDUE_FOLLOWUP | UNANSWERED_QUESTION | OVERLOADED_MARKETER | MANUAL | APPROVAL_AGING)
severity VARCHAR(10) NOT NULL (LOW | MEDIUM | HIGH)
subject_type VARCHAR(30) NOT NULL (MKT_OPPORTUNITY | MKT_FOLLOWUP | CWS_QUESTION | MARKETER | MKT_APPROVAL_REQUEST | CONSULTANT)
subject_id BIGINT NOT NULL · consultant_id BIGINT NULL · marketer_member_id BIGINT NULL (the owner at creation)
title VARCHAR(160) NOT NULL · detail VARCHAR(500) NULL (@NoSensitiveText) · rule_key VARCHAR(40) NULL (which rule raised it; NULL = manual)
raised_by_member_id BIGINT NULL (manual) · raised_at DATETIME(6) NOT NULL
status VARCHAR(20) NOT NULL (OPEN | ACKNOWLEDGED | SNOOZED | RESOLVED | DISMISSED)
assignee_member_id BIGINT NULL · snoozed_until DATETIME(6) NULL
resolved_by_member_id, resolved_at, resolution VARCHAR(300) NULL (@NoSensitiveText)
created_at, updated_at
IX (org_id, status, severity, raised_at) · IX (org_id, marketer_member_id, status) · IX (org_id, consultant_id)
UQ open_key (generated: CONCAT(rule_key, ':', subject_type, ':', subject_id) when status IN (OPEN, ACKNOWLEDGED, SNOOZED) and rule_key IS NOT NULL else NULL) → a rule never raises the same thing twice while it is open
```
### 3.3 `mkt_escalation_event` (append-only, the audit trail of one escalation)
`id · org_id · escalation_id (composite FK) · kind (RAISED | ACKNOWLEDGED | ASSIGNED | SNOOZED | COMMENTED | RESOLVED | DISMISSED | REOPENED) · actor_member_id NULL · note VARCHAR(500) NULL · occurred_at`. CASCADE on delete of the parent (R4: owned detail, the parent is never hard-deleted outside org purge).

Retention (41 §11, E13): approval requests and escalations keep 36 months like `pipeline_event`; the
`EnterpriseHistoryRetentionJob` gets both tables (settings `enterprise.history.mkt_mgmt_months`, default 36).
`DataMap` rows for the three tables (B2's `DataMapIT` fails otherwise). `OpsSchemaIT`-style column scan:
`MktMgmtSchemaIT.noColumnCouldHoldSensitivePii`.

## 4. Services

### 4.1 `ApprovalService` (`service/ent/mkt/approvals/ApprovalService.java`)
```java
public record Request(String kind, String subjectType, Long subjectId, Long consultantId, String title, String note, JsonNode payload) {}
public ApprovalRequestDTO open(OrgMembership requester, Request r);            // 409 APPROVAL_PENDING if active_key exists
public Page<ApprovalRequestDTO> pending(TeamScope.View team, Filter f, Pageable p);
public ApprovalRequestDTO approve(OrgMembership manager, Long id, String note); // applies the held action (§4.1.1) in the same tx
public ApprovalRequestDTO reject(OrgMembership manager, Long id, String note);  // note required (1–300)
public ApprovalRequestDTO withdraw(OrgMembership requester, Long id);
public int expire(Long orgId, Instant now);                                     // job: PENDING past expires_at → EXPIRED
```
Guards: the manager must be in `TeamScope` of the **requester** (`TeamScope.require(view, requestedByMemberId)`); the
requester may not approve their own request even when they hold `approvals.decide` (409 `SELF_APPROVAL`); an admin
with ORG scope may. Every decision writes one `OrgAuditService` row (`MKT_APPROVAL_OPEN`, `MKT_APPROVAL_APPROVE`,
`MKT_APPROVAL_REJECT`, `MKT_APPROVAL_WITHDRAW`, risk LOW; HIGH for `DUPLICATE_OVERRIDE` approvals) and one
`mkt_opportunity_event` / `mkt_submission_event` line on the subject ("Approved by Priya N.") so the change audit
shows who/when (memory: change audit who/when).

#### 4.1.1 Held actions, by kind
| kind | opened by | what approve does | what reject does |
|---|---|---|---|
| `OPPORTUNITY_ASSIGN` | `OpportunityAssignmentService.assign` when `org.pipeline.manager_approval` (ALWAYS \| HIGH_PRIORITY \| NEVER, default NEVER; HIGH_PRIORITY = the consultant's `marketer_assignment.priority = HIGH`) says so: the opportunity stays SUGGESTED with `approval_status = PENDING` (new nullable column `mkt_opportunity.approval_request_id`) | re-runs `assign` with `Confirm.APPROVED` (skips the hold, keeps the duplicate guard) | opportunity stays SUGGESTED, event "Manager declined: {note}", marketer notified |
| `DUPLICATE_OVERRIDE` | the guarded routes when `org.pipeline.duplicate_policy = REQUIRE_APPROVAL` (new enum value next to WARN \| BLOCK): instead of the inline reason box the 409 is `DUPLICATE_APPROVAL_REQUIRED {requestId}` and the request carries `payload.duplicateReason` | re-runs the original call with `confirmDuplicate=true` under the manager's authority; writes `PIPELINE_DUPLICATE_OVERRIDE` (HIGH) naming both members | nothing happens; marketer notified |
| `RESUME_RELEASE` | `MktResumesService.requestRelease` when `org.resumes.manager_review = true` (default **false**): a marketer-made org resume version must pass a manager before the **consultant** is asked to approve it (30 §4 — the consultant's approval stays; this is an optional pre-step, never a replacement) | flips `org_resume` version to `MANAGER_REVIEWED` and sends the existing consultant approval request | version stays DRAFT with the note |

Each hold is a one-line insertion at the existing call site behind the setting; with the settings at their defaults,
**nothing changes** for today's flows (`PipelineGuardSettingsTest` extended).

### 4.2 `EscalationService` (`service/ent/mkt/escalations/`)
```java
public EscalationDTO raise(Long orgId, Raise r);                           // rules + manual; idempotent on open_key
public Page<EscalationDTO> list(TeamScope.View team, Filter f, Pageable p);  // status, severity, kind, marketer, consultant, q
public EscalationDTO acknowledge/assign(memberId)/snooze(until)/resolve(resolution)/dismiss(note)/reopen(...)
public Counts counts(TeamScope.View team);                                 // open by severity, for the badge + Home tile
```
`EscalationRulesJob` (`@Scheduled(fixedDelayString="${dossier.ent.mkt.escalation-delay-ms:900000}")`, 15 min, ShedLock
name `mkt-escalations`, per org via `TenantScoped.run`), rules and their **admin settings** (`EnterpriseSettingKeys`,
all org-overridable, all in the settings registry so the admin page edits them):

| rule_key | raises when | setting (default) | severity |
|---|---|---|---|
| `STALLED_OPPORTUNITY` | an `mkt_opportunity` in ASSIGNED/VIEWED/INTERESTED/NEEDS_INFO has no `mkt_opportunity_event` for N days | `org.pipeline.stalled_days` (7) | MEDIUM; HIGH after 2 N |
| `OVERDUE_FOLLOWUP` | `MktFollowupService.overdue` rows older than N days past due | `org.pipeline.followup_overdue_days` (3) | LOW; MEDIUM after 7 |
| `UNANSWERED_QUESTION` | a consultant question (`cws` opportunity answer of kind QUESTION / NEEDS_INFO) with no marketer `answer-info` for N hours | `org.pipeline.question_sla_hours` (48) | HIGH |
| `OVERLOADED_MARKETER` | `marketer_capacity` load ≥ `org.marketing.overload_pct` (existing, 90) for 3 consecutive runs | existing key | MEDIUM |
| `APPROVAL_AGING` | an approval request PENDING longer than N hours | `org.pipeline.approval_sla_hours` (24) | MEDIUM |
| `MANUAL` | marketer "Escalate to my manager" (opportunity, submission, consultant) or a consultant's `cws` "Ask my organization" without a marketer | — | chosen (LOW/MEDIUM/HIGH) |

Auto-resolution: a rule re-evaluates its open rows each run and resolves them with `resolution = "Cleared: {reason}"`
(`resolved_by_member_id = NULL`, actor SYSTEM) when the condition no longer holds. Notifications: HIGH → in-app `SYSTEM`
notice to the managers in scope of the marketer (`NotificationService.publish`, e-mail off, dedupe key
`escalation:{id}`); everything else only counts on the badge. No e-mail storm: one digest notice per manager per run
("3 new escalations in your team").

### 4.3 Manager Home (`MgmtHomeService.home(me)` → `MgmtHomeDTO`)
Tiles (all from `TeamScope`): marketers (active/paused), consultants covered, open opportunities, approvals waiting
(badge), escalations open by severity, pipeline this week (assigned / interested / submitted / interviews from
`mkt_opportunity_event`, `mkt_submission`, `talent_interview`, 7-day delta), workload (top-3 loaded marketers with
%), "needs you" list (oldest 5 approvals + top 5 HIGH escalations), team activity (last 10 `mkt_activity` rows of the
team). Every number is real; an empty team returns `empty: true` for the "Build your team" state.

## 5. API (all under `/api/orgs/{orgId}/mgmt`, `@OrgPermissionRequired`, every write needs `Idempotency-Key`, every route in `OrgIsolationIT.COVERAGE`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/mgmt/home` | `workload.view` | §4.3 |
| GET | `/mgmt/team` | `member.view_summary` | marketers in scope with load, status, open approvals/escalations count, last activity; `q`, `status`, `sort` |
| GET | `/mgmt/team/{memberId}` | `member.view_summary` | one marketer: consultants, 8-week series (assigned/submitted/interviews), open items |
| PATCH | `/mgmt/team/{memberId}` | `assignments.manage` | `capacity`, `status` (ACTIVE/PAUSED), `title` → delegates to `MarketingAssignmentsService.updateMarketer` (same audit) |
| GET | `/mgmt/assignments` | `assignments.manage` | = `GET …/marketing-assignments/consultants` filtered by `TeamScope` (`scope=team` added to the existing service, §5.3) |
| POST | `/mgmt/assignments/{assign\|update\|unassign\|restore}` | `assignments.manage` | thin delegates to the existing admin routes with the team guard (a marketer outside scope = 404) — no second writer |
| GET | `/mgmt/assignments/consultants/{consultantId}/history` | `assignments.manage` | delegates to `AssignmentLifecycleService.history` |
| GET | `/mgmt/pipeline` | `pipeline.view` | board columns from `mkt_opportunity.status` for the team; `marketer`, `consultant`, `client`, `stale=true`, `page/size`, `X-Total-Count` |
| GET | `/mgmt/pipeline/summary` | `pipeline.view` | counts per column + conversion (assigned→interested→submitted→interview→offer) over 30/90 days |
| GET | `/mgmt/approvals` | `approvals.decide` | `status` (default PENDING), `kind`, `marketer`, `page` |
| GET | `/mgmt/approvals/{id}` | `approvals.decide` | metadata + payload summary (no resume content, no rates) |
| POST | `/mgmt/approvals/{id}/approve` · `/reject` | `approvals.decide` | `{note}`; 409 `SELF_APPROVAL`, 409 `APPROVAL_NOT_PENDING`, 404 out of scope |
| POST | `/mkt/approvals` · `/mkt/approvals/{id}/withdraw` · GET `/mkt/approvals?mine` | marketer (`opportunities.manage`) | the requester side, lives in `MktApprovalsResource` next to the other `mkt` resources |
| GET | `/mgmt/workload` | `workload.view` | = `…/marketing-assignments/workload` with `scope=team`, plus `history=8w` series per marketer |
| POST | `/mgmt/workload/rebalance` | `assignments.manage` | `{moves:[{consultantId, toMarketerMemberId}], reason}` → one bulk reassign through `AssignmentLifecycleService.record` per move, one `MARKETING_BULK` audit; answers `previous` for Undo (`/restore`) |
| GET | `/mgmt/escalations` · `/{id}` · GET `/mgmt/escalations/counts` | `escalations.manage` | §4.2 |
| POST | `/mgmt/escalations/{id}/{acknowledge\|assign\|snooze\|resolve\|dismiss\|reopen\|comment}` | `escalations.manage` | bodies `{memberId}`, `{until}`, `{resolution}`, `{note}` (@NoSensitiveText) |
| POST | `/mkt/escalations` | marketer | manual raise `{kind:MANUAL, severity, subjectType, subjectId, title, detail}` |
| GET | `/mgmt/reports/overview?range=30\|90` | `reports.view` | `OrgReportsService.overview(me, range, TeamScope)` — the ADMIN overview projected to the team (tiles, funnel, interviews, placements of team consultants); `GET …/export` = CSV (audited `EXPORT`) |

Error codes added to `ReasonToHttp`/the error catalogue (40 §4): `APPROVAL_PENDING`, `APPROVAL_NOT_PENDING`,
`SELF_APPROVAL`, `DUPLICATE_APPROVAL_REQUIRED`, `ESCALATION_NOT_OPEN`.

### 5.3 `scope=team` on the admin assignments service
`MarketingAssignmentsService.consultants(me, Filter)` and `.workload(me)` gain an optional `TeamScope.View team`
parameter; the admin routes pass `null` (unchanged); the `mgmt` routes pass the resolved view. `OrgMarketingAssignmentsIT`
keeps its 16 tests; `MgmtAssignmentsIT` adds the team cases.

## 6. UI (`web/src/components/ent/mgmt-ws/`, one folder per page, `registry.tsx` + `mgmtPageFor(me, slug)`)

Design language: exactly the Marketing boards' (`marketer-ws/parts.tsx`: `CARD`, `TINTS`, `KpiTile`, bee help card,
`HELP_BANNER`), `PageHeader` from `shell/ShellContext`, `@kiwiply/ui` only (`Tabs`, `Badge/Pill`, `Meter`, `BarChart`,
`Sparkline`, `DeltaChip`, `SideSheet`, `BottomSheet` at 390, `EmptyState`, `ErrorState`, `Skeleton`, `useToast` for Undo,
`SavedTick` on inline edits). Tenant tokens only. Mascot poses from the eight (`welcome, greet, empty, encourage,
celebrate, warn, error, peek`). Data via a BFF route `web/src/app/api/orgs/[orgId]/mgmt/[[...path]]/route.ts` (same
pattern as `marketing-assignments`) and `web/src/lib/ent/mgmt-ws/*.ts` per page (types, fetchers, pure formatters,
URL ↔ state), each with its `*.test.ts`. Mock: `web/scripts/mock-mgmt.mjs` (acme fixtures: Sarah manages Omar + two
seeded marketers).

| Page | Component | Layout (1440 / 390) | Actions (all autosave or one tap + Undo) |
|---|---|---|---|
| Home | `MgmtHomePage` | welcome band (`Welcome`), 6 KPI tiles (2×3 at 390), "Needs you" list (approvals + HIGH escalations, each row → its page with `?id=`), Pipeline this week bar, Workload top-3 meters, Team activity feed | tile → page; "Build your team" empty state → Team |
| Team | `TeamPage` | `EmployeesPage`-style table (cards at 390): name, title, status pill, load meter `8/10`, consultants, open approvals, escalations, last active; row → `TeamMemberSheet` (SideSheet; BottomSheet at 390) with 8-week sparkline and their consultants | capacity inline number (saves on blur, `SavedTick`), Pause/Resume (Undo toast), Edit title |
| Consultant Assignments | `AssignmentsPage` | reuses `components/ent/marketing/{ConsultantsPanel, MarketersPanel, dialogs}` with `scope="team"` and the `mgmt` BFF base path (props, not copies) | identical to the admin board: assign / reassign / backup / priority / unassign with Undo |
| Pipeline | `PipelineBoardPage` | `KanbanBoard` columns Assigned · Viewed · Interested · Needs info · Applied/Submitted · Interview · Offer · Closed, horizontal snap at 390; card: consultant, job, marketer avatar, age chip, `stale` warn badge; filters marketer/consultant/client/stale; summary strip with conversion | card → read-only detail sheet (links to the marketer's board); "Escalate" (MANUAL raise); **no drag between columns** (status changes belong to the marketer/consultant flows) |
| Approvals | `ApprovalsPage` | tabs Pending · Decided; list rows: kind chip, title (metadata only), requested by, age, "why" line (duplicate findings / priority / resume display name); row → `ApprovalSheet` | Approve (one tap, Undo 8 s only for OPPORTUNITY_ASSIGN; duplicate/resume decisions are final and say so), Reject (note required), bulk approve of OPPORTUNITY_ASSIGN only; badge count in the nav (`badge: attention` already in `workspaces.json`) |
| Workload | `WorkloadPage` | 38 §4.1: one `WorkloadColumn` per marketer with capacity dots and consultant chips (drag on desktop, `Menu` on touch); cap selector (`org.marketing.capacity_max`); health flags; an 8-week load sparkline per column | drop → "Reassign Anika to Priya?" `Dialog` with reason → `/mgmt/workload/rebalance`, Undo toast calls `/restore`; "Auto-suggest" button shows a proposal list (least-loaded marketer with a matching skill tag) — the manager applies, nothing moves on its own |
| Escalations | `EscalationsPage` | tabs Open · Snoozed · Resolved; severity filter chips; rows with kind icon, title, consultant, marketer, age; row → `EscalationSheet` with the event trail and a comment box | Acknowledge, Assign to… (team picker), Snooze (1 d / 3 d / 1 w / date), Resolve (resolution text), Dismiss; Undo on resolve/dismiss (8 s, `/reopen`) |
| Reports | `ReportsPage` (existing, new props `scope="team"` and `basePath="/mgmt/reports"`) | unchanged layout | Download CSV |

Copy rules: honest states ("No approvals waiting on you" with the `greet` pose; "Nothing stalled" with `peek`); no
cheer on rejections or escalations.

Registry wiring (last story): `[[...slug]]/page.tsx` adds `if (hit.kind === "page" && workspace === "marketing-mgmt") { const page = mgmtPageFor(me, slug ?? []); if (page) return page; }`
(the explicit `[workspace]/jobs|audit|settings|policies/page.tsx` siblings do not shadow these slugs: the manager
slugs are `team, assignments, pipeline, approvals, workload, escalations, reports` — `reports` is the only name shared
with the Admin page and it is resolved by `workspace` first, exactly as the Admin branch does today).

## 7. Admin-configured settings (registry keys, all editable on the Settings page → Policies/Pipeline group)

| key | type | default | used by |
|---|---|---|---|
| `org.pipeline.manager_approval` | ENUM NEVER/HIGH_PRIORITY/ALWAYS | NEVER | §4.1.1 |
| `org.pipeline.duplicate_policy` | ENUM WARN/BLOCK/REQUIRE_APPROVAL | WARN (existing key, one value added) | §4.1.1 |
| `org.resumes.manager_review` | BOOL | false | §4.1.1 |
| `org.pipeline.approval_expiry_days` | INT 1–30 | 7 | `ApprovalService.expire` |
| `org.pipeline.approval_sla_hours` | INT 1–168 | 24 | APPROVAL_AGING |
| `org.pipeline.stalled_days` | INT 1–60 | 7 | STALLED_OPPORTUNITY |
| `org.pipeline.followup_overdue_days` | INT 0–30 | 3 | OVERDUE_FOLLOWUP |
| `org.pipeline.question_sla_hours` | INT 1–168 | 48 | UNANSWERED_QUESTION |
| `org.mgmt.escalation_digest` | BOOL | true | one notice per run |
| `enterprise.history.mkt_mgmt_months` | INT | 36 | retention |

## 8. Tests

- Unit: `TeamScopeTest` (admin = all; manager = reporting line ∪ team group; empty team), `ApprovalServiceTest`
  (open/approve/reject/withdraw/expire, SELF_APPROVAL, held action re-run per kind), `EscalationRulesJobTest` (each rule
  raises once, auto-resolves, severity escalation, open_key idempotency), `MgmtHomeServiceTest`, `PipelineGuardSettingsTest`
  (+REQUIRE_APPROVAL), `NoSubmitSurfaceTest` unchanged (ArchUnit: `service.ent.mkt.approvals|escalations` never depend
  on `ApplicationSyncService`).
- IT (second tenant = `beta`): `MgmtResourceIT` (every route 404 cross-tenant and out of team; Sarah sees Omar's rows,
  a Beta manager sees none), `MgmtApprovalsIT` (hold → approve → opportunity ASSIGNED; reject; duplicate approval path),
  `MgmtEscalationsIT`, `OrgIsolationIT.COVERAGE` rows for all 20 routes (`Case.read()` / `Case.write(body, 200, OrgAuditService.MKT_APPROVAL_APPROVE)` …), `DataMapIT` rows, `MktMgmtSchemaIT`.
- Web vitest: one `*.test.tsx` per page (renders real fixture, empty state, denied state, action → request body + Undo),
  `registry.test.tsx` (every nav slug resolves; unknown slug null), `shell.test.ts` unchanged (manager pages are not in
  `ADMIN_NOT_BUILT`), lib tests per `mgmt-ws/*.ts`.
- Stories (Sonnet QA doc `qa/stories/marketing-mgmt.md`, area key `MGM`): MGM-01…MGM-24 written with the pages.
