# 24 — Entitlements: `EntitlementService.check`, the 11-step order as code contracts, reason codes, contexts

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-018 (contexts, no stacking) and
> ADR-021 (one check, fixed order) on top of `05-permission-model.md` §2 (`AuthorizationService`,
> X1.7). Build-ready for **X5.6** (`check`, `@RequiresFeature`, `AuthzCoverageTest`) and **X5.8**
> (migrating the eight `isPro` callers). Existing code: `service/EntitlementService` (`isProFor`,
> `isPro`, `plan`, `requirePro`), `ProRequiredException` (402 `PRO_REQUIRED` / `RESUME_LIMIT`),
> `config/OrgPermissionInterceptor`, `web/rest/org/OrgPermissionRequired`.

## 1. Contexts (ADR-018)

```java
public sealed interface EntitlementContext permits Personal, Org {
  record Personal(String login) implements EntitlementContext {}
  record Org(long orgId, long actorMemberId, long beneficiaryMemberId) implements EntitlementContext {}
}
```
| How the context is resolved | Result |
|---|---|
| request on a tenant host (`TenantContext` set) | `Org(tenant.orgId, …)` — always; a personal feature call on a tenant host is `MODULE_OFF` |
| `kiwiply.com` + path `/api/orgs/{orgId}/**` | `Org(orgId, …)` |
| `kiwiply.com` + extension header `X-Kiwiply-Workspace: org:{id}` (Phase 9, flag `flag.enterprise.extension_workspaces`) | `Org(id, …)` after membership check; header absent → Personal |
| anything else | `Personal(login)` |

**No stacking, ever:** `Org` reads `consultant_license`/`license_feature`/`org_module_license` for
that org only; `Personal` reads `subscription` only. A user with personal Pro and an Acme license
gets Pro in her personal workspace and Acme's features in Acme's — the same call never consults both.
Joining, leaving, licensing or unlicensing never reads or writes `subscription`
(`PersonalSubscriptionUnchangedIT`, `29-…`).

## 2. Request and decision

```java
public record EntitlementRequest(
    EntitlementContext context,
    String featureKey,            // 21 §3 keys (org) or personal keys (§7)
    long quantity,                // ≥ 1 for consuming calls; 0 = access check only (no reservation)
    String idempotencyKey,        // required when quantity > 0 (25 §2); null for access checks
    String referenceType, Long referenceId,   // what the usage is for (resume id, posting id…)
    String permissionKey          // the org permission the operation needs (null in Personal)
) {}
public record EntitlementDecision(
    boolean allowed, ReasonCode reasonCode, Map<String,Object> details,
    Long allowance, Long remaining, Instant resetsAt, Long reservationId /* usage_event.id when quantity > 0 */,
    AiBudgetWindow aiWindow /* null unless consumes_ai */ ) {}
```
`check(request)` **never throws** for a business refusal (it returns `allowed=false`); `require(request)`
wraps it and throws `EntitlementException(reasonCode, details)` which `ExceptionTranslator` maps to
HTTP per §4. Both are the only gate; menus and buttons are presentation.

## 3. The order (ADR-021 / 05 §2), as contracts

Steps **stop at the first failure**. Steps 1–6 and 9–10 are delegated to `AuthorizationService`
(X1.7) — `check()` composes them, it does not re-implement them. Steps 7–8 and 11 are this service's.

| # | Contract (Org context) | Reason code |
|---|---|---|
| 1 | `TenantContext.current()` present and (token `tid` absent or `== orgId`) and path org `== orgId` | `TENANT_UNKNOWN` / `TENANT_MISMATCH` |
| 2 | actor is an `ACTIVE` `org_member` of `orgId` | `NOT_MEMBER` |
| 3 | `OrgStateRules.allows(org.status, operationKind)`: ACTIVE → all; PAST_DUE → reads, billing, account and **feature use while `now < org_billing_account.paid_through_at`**; SUSPENDED/CLOSED/DRAFT/PENDING_SETUP_FEE → no feature use | `ORG_INACTIVE` (402 `SUBSCRIPTION_STATE` when the only failure is `paid_through_at` passed, see 11) |
| 4 | actor's effective permission set contains `permissionKey` | `PERMISSION_DENIED` |
| 5 | the target (beneficiary's record) is inside the actor's scope for that permission | `OUT_OF_SCOPE` |
| 6 | the feature's module is enabled: `EnterpriseFeatureFlag` allow-list for the org **and**, when `feature_definition.category=MODULE` is commercially restricted, a live `org_module_license` | `MODULE_OFF` |
| 7 | beneficiary has a `consultant_license` with status `ACTIVE` (or `CANCEL_AT_PERIOD_END` before `ends_at`) and `starts_at ≤ now`, **and** a live `license_feature` for `featureKey` (`starts_at ≤ now < coalesce(ends_at, ∞)`); for `base.consultant` the license alone suffices; eligibility re-checked only at quote | `FEATURE_NOT_LICENSED` (details: `licensed=false|true`, `featureKey`, `canSelfServe=false`) |
| 7b | every `INTEGRATION` dependency of the feature is satisfied for the beneficiary (`integration.inbox_connected` ⇔ an active `inbox_connection` for the beneficiary's user; `integration.extension_connected` ⇔ a live extension session, Phase 9) | `INTEGRATION_REQUIRED {integrationKey}` |
| 8 | `quantity == 0` → skip; else `UsageLedgerService.reserve(...)` succeeds: `remaining ≥ quantity` across every `feature_definition_limit` row (DAY and PERIOD) under the right pool; on success `reservationId` is set | `FEATURE_ALLOWANCE_EXHAUSTED {limitKey, allowance, used, resetsAt}` |
| 8b | `consumes_ai` → `AiBudgetService.decide(window)` for the **beneficiary's org window** (25 §6) is `OK` or `ECONOMY`; the reservation from 8 is released on refusal | `AI_BUDGET_EXHAUSTED {resetsAt}` (402) |
| 9 | actor ≠ beneficiary → an open `org_assignment` (kind PRIMARY/BACKUP, or DELEGATE while valid) assignee=actor, consultant=beneficiary; skipped when actor = beneficiary | `NOT_ASSIGNED` |
| 10 | actor ≠ beneficiary → `data_share` scope of the beneficiary allows it (SUMMARY/FULL per operation; FULL must name the actor) **and** every `CONSENT` dependency has a live `org_feature_consent (member=beneficiary, feature_key, granted_to ∈ {actor, NULL})` | `CONSENT_REQUIRED {beneficiary, consentKind}` |
| 11 | no `license_change` PENDING of kind SUSPEND/END effective now for the license; license not SUSPENDED; org not PAST_DUE past `paid_through_at`; `org_subscription.status ∉ {unpaid, canceled}` (unless LOCAL mode) | `SUBSCRIPTION_STATE {state}` |

Personal context runs: 2' (user active) → 7' (`isProFor` or the personal feature map §7, and
`RESUME_LIMIT` style caps) → 8b' (`AiBudgetService.decide(login, task)` unchanged). Nothing else.

Ordering rationale (tests pin it): a non-member must never learn whether a feature exists (1–6
before 7); allowance before assignment so a marketer's refused call does not reserve usage she
cannot use — **except** that a refusal at 9/10 releases the reservation made at 8 in the same
transaction (`UsageLedgerService.release(reservationId, DENIED)`), which the test
`reservationReleasedWhenLaterStepFails` asserts.

## 4. Reason codes → HTTP (one place: `EntitlementException` + `ExceptionTranslator`)

| ReasonCode | HTTP | Body (`problem+json`, `code`) | Notes |
|---|---|---|---|
| TENANT_UNKNOWN, TENANT_MISMATCH, NOT_MEMBER, ORG_INACTIVE, PERMISSION_DENIED, OUT_OF_SCOPE, MODULE_OFF, NOT_ASSIGNED | **404** `NOT_FOUND`, message `error.org` | the isolation promise; `TENANT_MISMATCH` on a token case is 401 (X1.5) |
| FEATURE_NOT_LICENSED | **402** `FEATURE_NOT_LICENSED` | details `{featureKey, name, beneficiary, licensed, canSelfServe:false}` — the consultant UI shows "Ask your admin"; the admin UI deep-links to Configure License |
| FEATURE_ALLOWANCE_EXHAUSTED | **402** `FEATURE_ALLOWANCE_EXHAUSTED` | `{featureKey, limitKey, allowance, used, resetsAt, poolMode}` |
| AI_BUDGET_EXHAUSTED | **402** `AI_BUDGET_EXHAUSTED` | `{resetsAt}`; the personal path keeps `PRO_REQUIRED`/`EXHAUSTED` semantics via `AiBudgetService` |
| SUBSCRIPTION_STATE | **402** `SUBSCRIPTION_STATE` | `{state: PAST_DUE_LAPSED|SUSPENDED|LICENSE_SUSPENDED|PENDING_END}` |
| INTEGRATION_REQUIRED | **409** `INTEGRATION_REQUIRED` | `{integrationKey, connectUrl}` |
| CONSENT_REQUIRED | **403** `CONSENT_REQUIRED` | `{beneficiary, consentKind, requestUrl}` — the only non-404 refusal on scope/relationship (05 §2) |
| PRO_REQUIRED, RESUME_LIMIT | 402 (existing) | personal context only; untouched |

402 is used only after steps 1–6 passed, so nothing leaks across tenants.

## 5. Annotation and interceptor

```java
@Target(METHOD) @Retention(RUNTIME)
public @interface RequiresFeature {
  String value();                                   // feature key
  Beneficiary beneficiary() default Beneficiary.SELF; // SELF | PATH_MEMBER ("{memberId}") | BODY_MEMBER (field "beneficiaryMemberId")
  long quantity() default 0;                        // 0 = access check; > 0 = reserve this many units
  String idempotencyHeader() default "Idempotency-Key"; // required when quantity > 0 (400 IDEMPOTENCY_KEY_REQUIRED if missing)
  String referenceType() default "";
}
```
- `OrgPermissionInterceptor` (existing, single entry) reads `@OrgPermissionRequired` **and**
  `@RequiresFeature`, builds one `AuthzRequest` + `EntitlementRequest`, calls
  `authorizationService.authorize` then `entitlementService.check`, stores `EntitlementDecision`
  under request attribute `EntitlementDecision.ATTRIBUTE`. The handler reads `reservationId` from it
  and **must** call `usageLedger.commit(reservationId, actualQuantity)` on success; an uncommitted
  reservation is released by the sweeper after `reserve_ttl_seconds` (25 §4). A
  `UsageCommitAdvice` (`@AfterReturning`) commits automatically for handlers annotated
  `@RequiresFeature(autoCommit = true)` — default **true** for synchronous handlers; async handlers
  set `false` and commit from the job.
- Non-HTTP entry points (schedulers, `AiRouter`, mail classification, Autopilot prepare) call
  `entitlementService.check(...)` explicitly with a constructed `Org` context.
- `AuthzCoverageTest` (reflection, modelled on `OrgIsolationIT.everyOrgRouteIsListedInTheCoverageRegistry`): every handler under `/api/orgs/**` whose method or class references a `FeatureKeys.*` constant, or whose path contains `/ai/`, `/tailor`, `/match`, `/inbox`, `/autopilot`, `/interview-prep`, must carry `@RequiresFeature` or be listed in `AuthzCoverageTest.EXPLICIT_CHECK_HANDLERS` with the service method that calls `check`.

## 6. Service shape and caching

```java
@Service @Transactional(readOnly = true)
public class EntitlementService {
  // existing, untouched signatures:
  public static boolean isProFor(String status, Instant currentPeriodEnd, Instant now)
  public boolean isPro(String login); public boolean isCurrentUserPro(); public PlanDTO plan(String login); public PlanDTO currentUserPlan();
  public void requirePro(String login); public void requireCurrentUserPro();
  // new:
  public EntitlementDecision check(EntitlementRequest req);          // §3
  public void require(EntitlementRequest req);                       // throws EntitlementException
  public MemberEntitlementsDTO entitlementsOf(long orgId, long memberId); // "My Available Features" (20 §7)
  public boolean has(EntitlementContext ctx, String featureKey);     // steps 1–7 only, no reservation (menus, extension)
}
```
- **No caching of decisions** (the same reasoning as today's `isPro`: one indexed read; a cache
  means a consultant who was just licensed keeps seeing 402). The catalog (`feature_definition`,
  dependencies) is cached 60 s per instance with `catalog_version` as the key (ADR-022).
- Step 8 is the only write; it runs in `REQUIRES_NEW` through `UsageLedgerService` so a later
  rollback of the business transaction does not un-reserve silently (the handler's failure path
  releases explicitly; the sweeper is the backstop).
- `EntitlementDecision` is logged at DEBUG with `(org, actor, beneficiary, feature, reason)` and
  sampled denials go to `entitlement_decision_log` (optional table, 90-day retention) for support.

## 7. Coexistence with personal gates (X5.8)

| Caller today | Personal context (unchanged behaviour) | Org context (new) |
|---|---|---|
| `AiBudgetService.decide(login, task)` | unchanged | new overload `decide(AiBudgetWindow)` (25 §6); `check()` step 8b supplies the window |
| `AiDraftService` | `requirePro` | not an org feature in V2 (answers drafting is personal) → `MODULE_OFF` on tenant hosts |
| `ResumeAiService` | `requirePro` | `resume.optimization` |
| `FieldCacheSyncService` | `requirePro` (answers sync) | personal-only (extension mirror), unchanged |
| `JobFitService`, `JobMatchService`, `ResumeMatchService` | `requirePro` | `ai.job_matching` |
| `ResumeTailorService` | `requirePro` | `ai.resume_tailoring` |
| inbox connect (`InboxConnectionResource`) | Pro feature `inbox` | `inbox.monitoring` |
| interview practice (Phase 20) | Autopilot/Pro | `interview.ai_prep` |
| Autopilot prepare (Phase 19) | Autopilot | `automation.approved_apply` |

Migration rule: each caller replaces `entitlementService.requirePro(login)` with
`entitlementService.require(EntitlementRequests.forCurrentRequest(FeatureKeys.X, quantity))`, where
`forCurrentRequest` resolves the context per §1 and, in Personal, maps the feature key through
`PersonalFeatureMap` (`ai.* → requires Pro`, `inbox.monitoring → requires Pro`, …) and calls the
existing `isPro`. `EntitlementServiceTest`'s existing matrix stays green; new tests prove that the
Personal path produces byte-identical `ProblemDetail`s to today's (`PRO_REQUIRED`, same message).

`ai_call` gains `org_id BIGINT NULL`, `beneficiary_login VARCHAR(50) NULL`, `feature_key VARCHAR(60) NULL`,
`usage_event_id BIGINT NULL` (additive). The personal path leaves them NULL.

## 8. Worked example (requirements §20)
Sarah (MARKETING_SPECIALIST at Acme) → `POST /api/orgs/7/consultants/42/resumes/9/tailor` with
`@OrgPermissionRequired(RESUMES_EDIT_FOR, beneficiary=PATH_MEMBER)` and
`@RequiresFeature("ai.resume_tailoring", beneficiary=PATH_MEMBER, quantity=1)`:
1 tenant acme ✓ · 2 Sarah ACTIVE ✓ · 3 Acme ACTIVE ✓ · 4 `resumes.edit_for` ✓ · 5 scope ASSIGNED: Anika (42) is assigned ✓ · 6 `module.talent_marketing` licensed ✓ · 7 Anika's license ACTIVE with `ai.resume_tailoring` ✓ · 8 reserve 1 of Anika's 40/period → `usage_event(org=7, member=42, actor=Sarah, RESERVED)` ✓ · 8b Anika's org AI window 85 % used → `ECONOMY` model ✓ · 9 open PRIMARY assignment Sarah→Anika ✓ · 10 Anika's FULL share names Sarah and `org_feature_consent(42, ai.resume_tailoring, granted_to=Sarah)` live ✓ · 11 no pending suspension ✓ → allowed; `ai_call(login=sarah, beneficiary_login=anika, org_id=7, feature_key=ai.resume_tailoring, usage_event_id=…)`; on success `commit(reservation, 1)`; audit `MARKETER_AI_TAILOR` with `beneficiary_login`.
If Anika had **not** granted consent: 10 fails → 403 `CONSENT_REQUIRED` and the reservation from 8 is released (`release_reason=DENIED`).

## 9. Tests (X5.6 / X5.8)
`EntitlementServiceCheckTest` — one test per step in the exact order (each builds a fixture that passes every earlier step and fails the one under test; asserts the reason code and that **no later step's repository was touched** — Mockito `verifyNoInteractions`); `reservationReleasedWhenLaterStepFails`; `personalContextNeverReadsLicenses`; `orgContextNeverReadsSubscription`; `pastDueKeepsFeaturesUntilPaidThrough`; `cancelAtPeriodEndKeepsFeatureUntilEndsAt`; `integrationDependencyBlocksUse`; `has()` never reserves. `RequiresFeatureInterceptorIT` (annotation → 402 bodies; missing Idempotency-Key → 400). `AuthzCoverageTest`. `ExceptionTranslatorTest` additions (every reason code → status/code).
