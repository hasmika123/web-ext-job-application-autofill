# 06 — Entitlements and enforcement: one `EntitlementService`, two readers, no stacking

> Status: design, 2026-10-15 (Fable). Implements over `24-entitlements.md` (the 11-step `check()`, reason
> codes, `@RequiresFeature`) and `25-usage-metering.md` (ledger, AI budget as the second guard). What changes:
> the **Personal** reader no longer maps features to `isPro`; it resolves the subscription's plan version +
> add-ons into the same `EntitlementSet` shape the Org reader builds from licenses. O4 makes "no stacking"
> structural (an enterprise account has no `subscription` row; a personal account has no license).

## 1. Contexts (ADR-018 + O4)
```java
sealed interface EntitlementContext permits Personal, Org {
  record Personal(long userId, String login) {}
  record Org(long orgId, long actorMemberId, long beneficiaryMemberId) {}
}
```
Resolution unchanged (24 §1): tenant host → Org; `/api/orgs/{id}/**` → Org; everything else → Personal.
An enterprise account (`jhi_user.org_id != null`) calling a personal route gets `404` (19 §1.4), so a
Personal context is always a personal account.

## 2. The resolved set (shared shape)
```java
record EntitlementSet(
  String planKey, long planVersionId, String interval, Instant periodStart, Instant periodEnd,
  Map<String, Grant> features,          // feature_key → Grant{source: PLAN_INCLUDED|ADDON|SEAT_INCLUDED|SEAT_ADDON|MODULE|ADMIN_COMP, quantity, allowance per limit row, endsAt}
  Set<String> capabilities,             // ∪ entitlement_keys_json (ai.server, answers.sync, inbox, …)
  Map<String, Long> limits,             // limit_key → max(effective allowance) (+ additive services added)
  AiBudgetWindow aiWindow,              // 25 §6 shape; period per 03 §4.1
  SubscriptionState state               // ACTIVE | PAST_DUE_ENTITLED | PAST_DUE_LAPSED | CANCEL_PENDING | NONE | SUSPENDED …
) {}
```
Built by `PlanResolver.resolve(ctx)`:
- **Personal**: `subscription` row → `plan_version` (or FREE's live version when no row / lapsed) →
  INCLUDED components + live `subscription_addon` rows (`starts_at ≤ now < coalesce(ends_at, ∞)`) +
  `ADMIN_COMP` grants (Phase 18 `entitlement_grant`, kept for comps/referrals only — see §7).
  `state` from `isProFor`'s rule generalised: `active|trialing` → ACTIVE; `past_due|canceled` before
  `current_period_end` → entitled; after → lapsed (FREE set); `unpaid|incomplete_expired` → FREE now.
- **Org**: `org_subscription.plan_version_id` → SEAT_INCLUDED components + the beneficiary's
  `consultant_license` + live `license_feature` rows + `org_module_license` (unchanged from 24 §3 step 7).
No caching of sets (24 §6); the catalog (plan versions, services, dependencies) is cached 60 s keyed by
`catalog_version`.

## 3. `check()` — the order, both contexts
Org: the 11 steps of 24 §3, unchanged, with step 7 reading the resolved set. **Personal** (replaces 24 §3's
"2' → 7' → 8b'"):

| # | Contract | Reason code |
|---|---|---|
| P1 | user active, personal account (`org_id IS NULL`) | `NOT_FOUND` 404 |
| P2 | `state` allows feature use (ACTIVE, PAST_DUE_ENTITLED, CANCEL_PENDING; FREE set otherwise) | — (falls through to P3 with the FREE set) |
| P3 | `features` contains `featureKey` **or** `capabilities` contains the legacy key the caller asked for | `PLAN_REQUIRED {feature, upgrade}` 402 — **`PRO_REQUIRED` is emitted instead when `PersonalFeatureMap.legacyCode(featureKey) == PRO_REQUIRED`** so today's clients see byte-identical bodies (24 §7 promise kept) |
| P3b | INTEGRATION deps satisfied (inbox connected, extension connected) | `INTEGRATION_REQUIRED` 409 |
| P4 | `quantity > 0` → `UsageLedgerService.reserve` against every limit row (DAY/PERIOD/MONTH on annual) in the personal ledger (`personal_usage_event`, keyed by `user_id`) | `FEATURE_ALLOWANCE_EXHAUSTED` 402 (today's `RESUME_LIMIT` body is produced for `resume.library` by the same legacy map) |
| P4b | `consumes_ai` → `AiBudgetService.decide(aiWindow, task)` | `AI_BUDGET_EXHAUSTED` 402 (today's `EXHAUSTED` verdict) |
| P5 | no `subscription_change` PENDING of kind END effective now | `SUBSCRIPTION_STATE` 402 |

`has(ctx, key)` = P1–P3 (no reservation); `limit(ctx, key)` = `limits.get(key)` (0 when absent);
`entitlementsOf(ctx)` = the set as a DTO for `/api/entitlements/me`, My plan meters, the extension and the
consultant "My Available Features" page.

## 4. Migrating today's callers (14 sites, 01 §1)
| Caller | Today | After (feature key) | Body stays |
|---|---|---|---|
| `AtsScoreService`, `ResumeAiService` | `requirePro` / verdict | `require(ctx, resume.optimization, qty 1)` | `PRO_REQUIRED` via legacy map |
| `ResumeTailorService`, `TailorDialog` path | verdict | `ai.resume_tailoring` | same |
| `JobMatchService`, `JobSearchService`, `JobFitService`, `ResumeMatchService` | `requirePro`/`isPro`/verdict | `ai.job_matching` (quantity per batch) | same |
| `InboxService`, `InboxEntitlement` | `requirePro`/`isPro` + license read | `inbox.monitoring` (Personal) / existing Org path | `PRO_REQUIRED` / `FEATURE_NOT_LICENSED` |
| `AiResource`, `AiDraftService`, `FieldCacheSyncService` | verdict / `requirePro` | `ai.autofill` (capability `ai.server`), `answers.sync` | same |
| `ProfileService.enforceResumeLimitFor`, `ResumeEntitlements` | constants | `limit(ctx, resumes.max)` + `require(resume.library, qty 1)` on create | `RESUME_LIMIT {limit, count, plan}` |
| `AiBudgetService.window` | price-id compare | `aiWindow` from the set (03 §4.1; quarterly/annual from `billing_interval`) | `Decision` unchanged |
| `BillingService` (`ALREADY_SUBSCRIBED`) | `isPro` | `state != NONE` | same |
| Autopilot (Phase 19), interview practice (Phase 20), builder AI | — | `automation.approved_apply`, `interview.ai_prep`, `builder.ai` | new |
Mechanics: `isPro(login)` stays as `has(Personal, "ai.server")` (alias, deprecated), `plan(login)` returns
`PlanDTO v3` (09 §3.3) with `plan` = the label (FREE/PRO/AUTOPILOT/…) so old readers keep working.
Shadow mode (`billing.catalog.shadow=true`, default while migrating): both the old row logic and the
resolver run; mismatches are logged with login + feature (no PII beyond that); the flip is a release
checklist item (`catalog-entitlements-engine.md` E8). `EntitlementServiceTest`'s matrix stays green
unchanged (29 §1.2).

## 5. Allowances and metering (25, extended to Personal)
- Personal reservations live in `personal_usage_event` / `personal_usage_counter` (08 §4.6 — same
  shape as doc 25, keyed by `user_id`; the org tables are untouched and tenant-only). One
  `UsageLedgerService` with two repositories chosen by context; `CrossTenantSweepIT` never sees personal rows.
- Allowance resolution (25 §3) adds one layer at the top: `plan_component.allowance_override` (the plan's
  number for an INCLUDED service) and `subscription_addon.quantity × default_allowance` for add-ons;
  **additive** services (`resume.extra_pack`, `additive=true`) add to the plan's limit instead of taking
  the max. `period_key` on annual terms with `allowance_period=MONTH` = `"M:yyyy-MM"` inside the term.
- Reservations for personal calls are implicit for synchronous handlers (`@RequiresFeature(autoCommit=true)`);
  today's callers that count (`ai_usage.draft_count`) keep writing until K7.5 removes the legacy counter.

## 6. AI budgets (second guard, unchanged mechanics)
`aiWindow` = plan cap × f(interval) + Σ add-on budgets × quantity × f(interval) per 03 §4.1, spent in
monthly sub-windows on annual terms (S-10); admin override (`ai_quota_override`, calendar month) still
outranks (lock). The soft cap and economy model are unchanged. Customers see a percentage only.
`ai_call` gains `feature_key`, `usage_event_id` (24 §7's four columns; `org_id`/`beneficiary_login` NULL on
the personal path).

## 7. What happens to Phase 18's `entitlement_grant`
Kept, narrowed: sources `ADMIN_COMP` (A2.4 comps), `REFERRAL` (B7.5), `SERVICE_ORDER` (reserved). It
references a **plan version** (`plan_version_id`, new) rather than a product, so a comp is "Pro v3 for 30
days" and resolves through the same `PlanResolver` ("highest wins" among the subscription and comp
grants **inside the Personal context only**). `STRIPE_SUBSCRIPTION` and `ORG_ASSIGNMENT` sources are
**not created**: the subscription row + add-ons, and licenses, are the truth (K7.1 marks B1.3 superseded).

## 8. Enforcement surfaces
| Surface | Reads | Rule |
|---|---|---|
| API handlers | `@RequiresFeature` (24 §5) in both contexts; `AuthzCoverageTest` extended to `/api/resumes/**`, `/api/ai/**`, `/api/inbox/**`, `/api/job-matches/**`, `/api/applications/**` tailor/fit/score routes | a gated route without the annotation fails CI |
| Schedulers / `AiRouter` | explicit `check` with a constructed context | |
| `/api/profile/version` | `{version, plan, features[], limits{}, aiPct, periodEnd}` (B1.4/E6 shape) | extension gates on `features` (K7.4), `plan` kept for display |
| Web | `getPlan()` → `PlanDTO v3` once per request; components read `features`/`limits`, never `plan === "PRO"` (lint `no-plan-string-gate` added to web ESLint) | |
| Extension | `settings.features` from the version check; options badge = `plan` label; drawer gates on features | one release of tolerance for old builds (`plan` still present) |

## 9. Reason codes (24 §4 + personal additions)
| code | HTTP | when |
|---|---|---|
| `PRO_REQUIRED` | 402 | legacy map hit (Personal only), body unchanged |
| `PLAN_REQUIRED {feature, name, upgrade{planKey, interval, amountMinor, path}}` | 402 | Personal, feature not in the set; `upgrade` = the cheapest public plan version whose INCLUDED or OPTIONAL set contains the feature (server-chosen; B3.3 contract) |
| `RESUME_LIMIT {limit, count, plan}` | 402 | legacy map for `resume.library` |
| `FEATURE_ALLOWANCE_EXHAUSTED`, `AI_BUDGET_EXHAUSTED`, `SUBSCRIPTION_STATE`, `INTEGRATION_REQUIRED` | as 24 §4 | both contexts |
| `FEATURE_NOT_LICENSED`, `CONSENT_REQUIRED`, 404 family | as 24 §4 | Org only |

## 10. Tests
`PlanResolverTest` (Personal: FREE / Pro month / Pro quarter budget 800 / Pro + 2 credits → 450 / annual
monthly sub-window / lapsed → FREE / comp highest-wins / enterprise account → 404; Org: unchanged fixtures
of 24 §9 with `plan_version_id`), `EntitlementServiceCheckTest` (P1–P5 order, each failing step with
`verifyNoInteractions` on later repositories; byte-identical `PRO_REQUIRED` and `RESUME_LIMIT` bodies),
`LegacyCallerMigrationTest` (every site of §4 asserts the same ProblemDetail as before), `ShadowCompareTest`,
`AuthzCoverageTest` (extended route families), `PersonalSubscriptionUnchangedIT` (29, unchanged + E13: a
personal add-on never appears in an org set; E14: an org seat never appears in a personal set),
`UsageLedgerPersonalTest` (personal tables; additive limits; annual monthly keys; concurrent reserve with one unit left).
