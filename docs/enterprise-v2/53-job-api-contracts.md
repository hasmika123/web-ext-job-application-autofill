# 53 — API contract design (DESIGN, proposal)

> Implements ADR-024 D-12/D-13. Conventions copied from the built `mkt` APIs (V `MktJobsResource.java`): `@RestController` + `@OrgPermissionRequired` (mandatory: `OrgPermissionInterceptor.java:88-92`), `OrgMembership` via `@RequestAttribute`, generic **404** for non-member / flag off / missing permission / out-of-scope id (never 403), typed `OrgException(status, code, message)` for 409/422, Bean Validation, sensitive-text scanner on free text, one `org_audit_event` per write, OpenAPI via `@Operation` (contract test `OpenApiContractIT`). Lists: `page` (0-based), `size` ≤ 100, `sort`, `q`; keyset `after` cursor for the job pool. JSON only. Every write accepts `Idempotency-Key` (24 h, `IdempotencyService`) and `If-Match: "<version>"`.

## 1. Namespaces
| Role | Base | Scope object | Permission keys |
|---|---|---|---|
| Marketer (built) | `/api/orgs/{orgId}/mkt/**` | `MktScope` (ASSIGNED consultants) | `matches.run`, `opportunities.manage`, `submissions.record`, … |
| **Consultant (new)** | `/api/orgs/{orgId}/con/**` | `ConScope` = the caller's **own** `consultant_profile` (resolved from the seat; **no consultant id is ever accepted from the client** on own-data endpoints) | `opportunities.respond`, `submissions.authorize`, `applications.manage`, `interviews.manage`, `offers.respond`, `resumes.manage`, `features.view` (all OWN, `RoleTemplates.java:155-160`) |
| Shared logic | none public | `service/ent/jobs/*` (internal) | – |
Flags: `flag.enterprise.marketing` (live) for `mkt`; new `flag.enterprise.consultant_jobs` for `con` (declare live in `EnterpriseSettingKeys`, learned from the marketing-flag miss). All `con` handlers resolve through `ConScope.resolve(me, key)`: roles-from-data on + flag on + permission + the seat has a `consultant_profile`.

## 2. Consultant API (`/api/orgs/{orgId}/con`)

### 2.1 Discovery (broad org pool, free core)
`GET /con/jobs` — query: `q`, `skills` (csv, any-of; `skillsAll=true` for all-of), `location`, `workMode` (REMOTE|HYBRID|ONSITE), `employment` (CONTRACT|FTE|C2C), `rateMin`, `rateMax` (normalised to hourly), `experience`, `postedWithin` (days), `source`, `client` (id), `saved=true`, `sort` (`posted_desc` default, `rate_desc`, `match_desc` — rule score for *this* consultant), `after` (keyset cursor) | `page,size`. Response `{items:[JobCard], total, nextCursor, facets:{workMode:{…}, employment:{…}, source:{…}, skills:[{skill,count}]}}`. **JobCard** (consultant-safe): `id, title, clientName (org setting may mask: "Confidential client"), location, workMode, employment, rateLabel (only if org shows rates, Q-4), postedAt, source, skillsTop[5], savedByMe, myMatch:{score, hardEligible}|null, myAssignment:{state}|null`. Never: contact, owner, marketer notes, other consultants' data, internal priority.
Permission: `opportunities.respond` OR `applications.manage` (discovery is a core read for a consultant). Org setting `consultants.job_discovery = ALL|ASSIGNED_ONLY` (default ALL; ASSIGNED_ONLY ⇒ this route returns only jobs the consultant is matched/assigned to).
`POST /con/jobs/{jobId}/save`, `DELETE /con/jobs/{jobId}/save` — save/unsave (idempotent); `GET /con/saved-jobs`.
`POST /con/jobs/{jobId}/interest` — "Express interest" from Discovery = creates a **self-suggested match** (`source=CONSULTANT`) + a task for the marketer; it never creates an opportunity/assignment/submission (409 if already matched/assigned: returns existing).

### 2.2 Matches (personalized view, free core; AI overlay licensed)
`GET /con/matches` — `minScore`, `hardEligible` (default true), `skills`, `client`, `fresh` (not stale), `sort=score_desc|posted_desc`, `page,size`. Item = JobCard + `score, components{skills,experience,location,availability,auth}, missingSkills[], availabilityFit, resumeNeed{needed,reason}, preferredResume{id,version,name}, calculatedAt, stale, scoredBy: "RULES"|"AI"`.
`GET /con/matches/{matchId}` — explanation (structured `explanation` + `whyYouMatch[]` + `gaps[]`), no other consultants' scores. 
`POST /con/matches/{matchId}/dismiss` ("Not for me", reason) · `POST /con/matches/{matchId}/ask-marketer` (creates a follow-up task for the assigned marketer with the question; text scanned).
`POST /con/matches/{matchId}/recompute` — enqueue an on-demand rescore of this pair (rate-limited; `ai.job_matching` licensed variant returns 402 `FEATURE_NOT_LICENSED` when `scoreWith=AI` is requested without the feature — until the feature check exists the param is rejected with 422 `AI_NOT_AVAILABLE`).

### 2.3 Assigned opportunities
`GET /con/opportunities` — `state` (csv), `priority`, `dueBefore`, `sort=due_asc|assigned_desc`, `page,size`. Item = JobCard + `opportunityId, state, priority, assignedAt, assignedBy{displayName,role}, dueAt, marketerNote (only the note addressed to *this* consultant), nextAction, resumePinned{id,name,version,stale}, submission:{approvalState,status}|null`.
`GET /con/opportunities/{id}` — detail incl. timeline (events visible to the consultant only), allowed actions list (`allowedActions[]` computed server-side from state + permission + licence: UI renders exactly these).
Writes (`opportunities.respond`, OWN): `POST /con/opportunities/{id}/viewed` (idempotent, implicit on detail open), `POST …/interest {level: INTERESTED|VERY_INTERESTED, note}`, `POST …/decline {reason, note}`, `POST …/request-info {text}`, `POST …/resume-change-request {text}` (creates a marketer task; never edits a resume). All return the new `state` + `version`.

### 2.4 Submission authorization and own application
`GET /con/submissions` (my submissions: approvalState/status, resume version, client, **no** other-consultant data) · `GET /con/submissions/{id}` (diff of the resume vs last approved if STALE).
`POST /con/submissions/{id}/authorize {resumeVersion, acknowledgeClient:true}` (`submissions.authorize`, OWN; body must repeat the exact `resumeVersion` — 409 `RESUME_CHANGED` if it moved) · `POST /con/submissions/{id}/reject {reason}` · `POST /con/submissions/{id}/revoke {reason}` (revocation semantics: doc 52 §3) · `POST /con/submissions/{id}/record-submitted {channel,externalReference}` (the consultant records their own submit).
`POST /con/opportunities/{id}/applications` — "I applied" (direct) `{appliedOn, source, note}` (`applications.manage`) ⇒ idempotent create of `talent_application` (`entry_path=CONSULTANT_DIRECT`); returns existing on repeat. `GET /con/applications`, `GET /con/applications/{id}` (own timeline).
Resumes: `GET /con/resumes` (own org resumes, versions, approval) — `resumes.manage` (OWN); approval of a marketer-edited resume (ADR-009 "consultant approves"): `POST /con/resumes/{id}/approve|reject` — **requires moving the resume approver from admin to consultant (F8)**, decision Q-7.

### 2.5 Shared job detail
`GET /con/jobs/{jobId}?context=discovery|match|assignment|submission` — one DTO shape, sections present per context (server decides): header, company, `description`, employment, compensation (if visible), skills (required/preferred), `whyYouMatch`/`gaps` (context ≥ match), `assignment` block with `marketerNote`/`dueAt`/`allowedActions` (context=assignment only, and only if `{jobId}` is assigned to the caller), `submission` block (context=submission and own submission), source/posting details (`source`, `postedAt`, `firstSeenAt`; `url` only if the org enables "show original link"). A request for `context=assignment` for a job not assigned to the caller → **404**, not an empty block.

## 3. Marketer API additions (`/api/orgs/{orgId}/mkt`) — same service core
- `GET /mkt/jobs/{jobId}/occurrences`, `POST /mkt/jobs/{jobId}/adopt-from-posting` (body `postingId`; copy-on-adopt, idempotent on `(org, posting_id)`), `GET /mkt/jobs/{jobId}/duplicates`, `POST /mkt/jobs/{jobId}/merge {intoJobId}` (`requirements.manage`, audited, one transaction, HIGH risk), `PATCH /mkt/jobs/{jobId}` (title/rate/skills → `org_job_change_event`, writes `field_overrides`).
- `GET /mkt/public-postings` — search the global `job_posting` layer (public fields only, FULLTEXT, `q/skills/location/postedWithin`), `matches.run`; items flag `alreadyAdopted`.
- `POST /mkt/opportunities` (assign) becomes the **single** assign endpoint (`OpportunityAssignmentService`); `POST /mkt/matches/{id}/assign` and `POST /mkt/jobs/{id}/assign` are kept as thin aliases for one release then removed (F5). Returns `{opportunityId, state, alreadyAssigned}`.
- `POST /mkt/submissions/{id}/request-authorization` (replaces marketer-recorded approval; the old `/approval` endpoint is removed behind the same release window and becomes admin override `POST /mkt/submissions/{id}/override-authorization {reason}` with `submissions.authorize_override`).
- `GET /mkt/consultants/{id}/marketer-history` (assignment history) and `POST /mkt/assignments/reassign` (admin/manager: `assignments.manage`) writing `marketer_assignment_event`.

## 4. Errors (HTTP, code)
404 generic (not member, flag off, no permission, out-of-scope/foreign id) · 409 `ALREADY_ASSIGNED` (returns existing) · 409 `JOB_NOT_OPEN` · 409 `OPPORTUNITY_STATE` · 409 `SUBMISSION_STATE` · 409 `SUBMISSION_EXISTS` (returns existing) · 409 `RESUME_CHANGED` · 409 `RESUME_NOT_APPROVED` · 409 `CONSENT_REVOKED` · 409 `VERSION_CONFLICT` (stale `If-Match`) · 409 `IDEMPOTENCY_IN_PROGRESS` · 422 `IDEMPOTENCY_KEY_REUSED` · 422 `ORG_INVALID` (validation/PII scanner) · 402 `FEATURE_NOT_LICENSED` / `FEATURE_ALLOWANCE_EXHAUSTED` (**planned, D/24:81-94; not before `EntitlementCheckStep`**) · 429 on recompute/save spam. Never 403.

## 5. Pagination, performance, caching
Discovery/pool: SQL filters + FULLTEXT, keyset by `(posted_at, id)`; facets computed from a bounded sample (≤ 5 000 rows) and cached 60 s per `(org, filters hash)` in the Ehcache already configured (`CacheConfiguration.java`) **keyed by orgId**; no cache is shared across orgs. KPIs on the marketer pages move to indexed `COUNT`s. Match list index `(org_id, consultant_id, hard_eligible, score)`.

## 6. BFF (Next.js)
`web/src/app/api/orgs/[orgId]/con/**/route.ts` = `forward()` proxies exactly like `mkt/**` (id-shape check only); no business logic in the BFF; cookies/tenant headers come from `serverApiFetch`. Client libs `web/src/lib/ent/consultant-ws/*.ts` with lenient parsers (same pattern as `marketer-ws/home.ts`).
