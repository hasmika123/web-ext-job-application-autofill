# 55 — Security, tenant isolation and entitlements review (DESIGN, proposal)

> Verified mechanics are cited (`V`); designed-but-unbuilt items are labelled **DESIGN-ONLY**. Companion: `04-tenancy-and-security.md`, ADR-001/003/004/021, `24-entitlements.md`, `37-entitlement-hooks.md`.

## 1. How tenant context reaches a `con`/`mkt` query (verified chain)
1. Browser hits `careers.acme.com` or `acme.kiwiply.com`; `web/src/proxy.ts:34-38` resolves the host (`requestHost()`/`resolveHost()`), a tenant host goes to `tenantRequest` (login-first, tid-bound `__Host-` cookies, same-origin check on unsafe methods, `:72-74` the proxy never decides the org id) (V).
2. The API re-resolves the host authoritatively (`TenantResolver.java:27-54`: fixed rule order, 60 s cache, negative cache, per-IP miss limit) and binds the session `tid` (ADR-003/004) (V).
3. `OrgPermissionInterceptor` refuses any handler lacking `@OrgPermissionRequired`/`@OrgUnscoped` (`:88-92`), requires path `orgId` = tenant org on tenant hosts (`:98`), then `AuthorizationService.require` (order: 1 tenant, 2 active member, 3 org state, 4 permission, 5 scope, 6–8 hooks, 9 assignment, 10–11 hooks) (V).
4. Services take `orgId` explicitly; repositories enforce `orgId`-first by `EntRepositoryContractTest`; async work uses `TenantScoped` (V).
5. Page-level gate: `MktScope` (marketer) / **new `ConScope`** (consultant) = roles-from-data + module flag + permission + scope object.

## 2. Permission matrix (new/changed in bold)
| Operation | Permission key (scope) | Actor | Notes |
|---|---|---|---|
| `con` discover jobs / save / interest | `opportunities.respond` or `applications.manage` (OWN) | consultant | Discovery visibility setting; self-interest creates a *suggested* match only |
| `con` read my matches/assignments/submissions/applications | OWN via `ConScope` (own `consultant_profile`) | consultant | consultant id never taken from the request |
| respond to an assignment | `opportunities.respond` (OWN) | consultant | no one else may respond (E1) |
| authorize / reject / revoke a submission | **`submissions.authorize` (OWN)** | consultant | marketer cannot (F1 fix) |
| authorization override | **`submissions.authorize_override` (ORG, HIGH)** | org admin | off by default, reason + audit + notify |
| record submitted / outcomes | `submissions.record` (ASSIGNED) | marketer | or consultant for own |
| assign / withdraw | `opportunities.manage` (ASSIGNED) | marketer | single service |
| adopt/merge/edit job | **`requirements.manage` (ORG)** (exists) / `opportunities.manage` for adopt | admin/marketer | merge is HIGH |
| edit resume for consultant | `resumes.edit_for` (ASSIGNED) + **FULL pairing + `edit_allowed`** (F7/ADR-009) | marketer | check `data_share.full_to_member_id` |
| approve resume | **`resumes.approve` (OWN) by consultant**, admin override | consultant | moves F8 to ADR-009 |
Every authorization decision remains **404 not 403**. All permission keys named exist except `submissions.authorize_override`, `resumes.approve`, `consultants.see_rate` (settings), which need `EntPermissions` + `RoleTemplates` + `RoleTemplateDocSyncTest` updates (backlog J-S1).

## 3. Threat cases and mitigations (cross-tenant and cross-consultant)
| # | Threat | Vector | Mitigation (design) | Test |
|---|---|---|---|---|
| T1 | Public posting adoption leaks tenant data to the global table | write path from org → `job_posting` | adoption is **one-way copy**; no code path writes `job_posting` from tenant services; no tenant FK to global | static check + IT |
| T2 | Global/NULL-org job row reachable by org queries | `visibility`/NULL org approach | **rejected** (ADR-024 D-5); contract tests keep `org_id NOT NULL` | `TalentSchemaIT`, `EntRepositoryContractTest` |
| T3 | Consultant sees other consultants' scores/names via shared DTO | reusing marketer `JobDetail.matches` (V `jobs.ts:40`) | separate `con` DTOs; DTO classes contain no field for it (type-level); contract test lists forbidden field names | DTO reflection test |
| T4 | Consultant reads another consultant's assignment by id | `GET /con/opportunities/{id}` | id resolved **through the caller's consultant id** in the query (`where consultantId = :me`) → generic 404 | IT cross-consultant |
| T5 | Marketer reaches an unassigned consultant | stale `marketer_assignment` (F9 ignores `status`) | `MktScope` filters `status = ACTIVE` and (when implemented) `starts_at/ends_at`; reassign writes history | unit + IT |
| T6 | Marketer keeps access after consent revoked | consent not checked in submissions/opportunities (F7) | `ConsentGate` helper checked in every marketer write/read of consultant-specific data; revoke triggers state changes (doc 52 §3) | IT matrix by `data_share.scope` |
| T7 | Double assign/submit via race | check-then-insert | unique keys + `@Version` + `ConflictTranslator` + `Idempotency-Key` | concurrent IT (two threads) |
| T8 | Stale approval submitted after resume edited | F6 | approval pinned to version; `DRAFT→SUBMITTED` re-checks; edit → `STALE` | unit + IT |
| T9 | IDOR on shared job id across tenants | numeric ids | all lookups `findByOrgIdAndId`; foreign id = 404; `OrgIsolationIT` rows for every `con`/new `mkt` route | isolation sweep |
| T10 | Cache poisoning/leak across tenants | Ehcache/SWR keyed by id only | keys include `orgId` (+ role for DTO variants); tenant-switch clears client caches | unit |
| T11 | Background recompute reads wrong tenant | `TenantContextHolder` is thread-local (V `:8`) | per-org jobs always through `TenantScoped.run(orgId, …)`; scorer takes explicit `orgId` | unit |
| T12 | Source sync overwrites org edits or injects HTML | adopt sync | `field_overrides`; description sanitised on write and render; payload stored hashed + capped | unit |
| T13 | PII in notes/free text | marketer_note/info_request/decline text | existing `SensitiveContent` scanner (SSN, bank, DOB patterns) on every free-text write; 422 | unit |
| T14 | Scraping / TOS | connectors | only ATS public APIs + licensed aggregator (CLAUDE.md), never scrape; `url` shown only if org enables | policy |
| T15 | Over-exposed rate/client | consultant DTO | `consultants.see_rate` setting default off; client name maskable | unit |

## 4. Shared public pool vs tenant-private: the rule
Public (global): `job_source`, `job_posting` — public ATS fields only (title, company name, location, URL, description, posted date). Tenant-private: everything in `client_requirement` and every relationship table. A consultant of org X only ever receives rows that are (a) org X's `client_requirement` rows or (b) not at all: a consultant never browses `job_posting` directly in the enterprise workspace (Q-5: public search is a marketer tool in v1; consultants see only what their org adopted). This removes the whole class of "which public jobs may tenant X see" questions.

## 5. Licensing and entitlements (verified state)
- **Implemented:** role permissions + scope (`EntPermissions.java:93-105`), module flags (flag-only `TenantModules.java:34-38`), `EntitlementService` = **personal Stripe Pro only** (`:16-80`). (V)
- **DESIGN-ONLY (no code):** `consultant_license`, `license_feature`, `feature_definition`, `usage_event`, `EntitlementService.check`, `@RequiresFeature`, `AuthzCoverageTest`, steps 6–8/10–11 of `AuthorizationService` (zero `AuthzStep` implementers). `ai.job_matching` exists only in docs (`D/21`, `D/37:30`). (V)
- **Policy chosen (ADR-024 D-14):** *free core* = rule-ranked discovery/matching, assigned opportunities, application tracking (D/21:76, D/37:31). *Licensed overlays* = `ai.job_matching`, `ai.resume_tailoring`, `automation.approved_apply`, etc.
- **Consistency requirement (UI = API = metering = billing):** a single `FeatureGate` call at the *service* boundary (`featureGate.require(orgId, consultantId, "ai.job_matching")` ⇒ 402 `FEATURE_NOT_LICENSED`), the UI renders from the server's `allowedActions[]`/`license` block and never decides alone; metering emits `usage_event(RESERVED→COMMITTED)` per AI score; billing reads `usage_event`. **Until these exist, AI-scored matching is not exposed** in `con`; the `scoreWith=AI` parameter is rejected (422). Core pages work without a license; a consultant without AI matching keeps discovery + manual assignments, exactly as the brief requires.
- Interim safety valve: org-level setting `consultant_jobs.ai_scoring_enabled=false` (default) read by the scorer — prevents accidental AI cost before metering exists.

## 6. Residual risks and monitoring
- Multi-instance scheduled work duplicates (no ShedLock, V): per-org recompute jobs must be idempotent and use `SELECT … FOR UPDATE SKIP LOCKED`-style claiming or a DB lease row; documented in J-P2.
- Tenant-host cache lag across instances (≤ 60 s; V `TenantResolver.java:50-54`): acceptable for suspend/close.
- Metrics (Micrometer, V): `con.jobs.discovery.latency`, `matches.recompute.count/failures`, `assign.conflict.count`, `submission.authorize.count`, tenant tag on logs via MDC (V `OrgPermissionInterceptor.java:112-115`).
- Audit: every write → `org_audit_event`; authorization, override, revoke, merge, adopt are HIGH-risk audited.
