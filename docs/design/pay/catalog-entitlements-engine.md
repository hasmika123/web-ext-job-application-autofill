# Catalog & entitlements engine — the `pay` view of Phase 18 (B1.*, B8.*, B9.*)

> Area `pay`. Status: design, 2026-10-11. This is the engine the admin page (A3.4) edits and the org
> designs (O3.*, O4.*) consume. Tables and the admin API are specified in `docs/design/admin/
> catalog-margin-entitlements.md` §2/§4 and are **not repeated**; this doc fixes the resolution semantics,
> the writers, the read paths every client uses, the AI-budget period, the shared gateway surface for org
> and service billing, and the migration from today's code. Stories B1.1/B1.2/B1.6 supersede A3.1/A3.2/A3.5
> (engine) so one Sonnet lane owns them; A3.4 (admin page) stays in admin.

## 1. Decisions

| # | Decision |
|---|---|
| E1 | **`EntitlementService` is the only source of truth, and after B1.2 it reads grants** (`entitlement_grant` ∪ `product_entitlement`). `isPro(login)` ≡ `has(login, "ai.server")`; `requirePro` throws the same 402 `PRO_REQUIRED`; new `require(login, featureKey)` throws 402 `PLAN_REQUIRED {feature, upgrade}`; `limit(login, key)` returns the highest value across active grants; `resolve(login)` returns the whole picture once per request (cached in the request scope only — never across requests, same reason as today's "cache nothing"). |
| E2 | **Writers of `entitlement_grant` by `source`:** `STRIPE_SUBSCRIPTION` → `BillingWebhookService` only (locked); `ORG_ASSIGNMENT` → `OrgAssignmentService` (org doc §4); `ADMIN_COMP` → `AdminCompService` (admin D7, ≤ 90 d); `SERVICE_ORDER` → `ServiceOrderService` (e.g. a rewrite order grants nothing today; reserved); `REFERRAL` → `ReferralService` (discount doc D7). A `GrantWriterGuard` (AOP/assert in the repository save) rejects any other caller by stack frame in tests, and by `source` ↔ `granted_by` convention in prod. |
| E3 | **Free is a product too** (`FREE`, zero price, entitlements `resumes.max=3, matches.per_day=3, ai.parse_resume=1`) and every user implicitly holds it — no grant row; `resolve` unions the FREE product first. So "lapse" needs no write: the paid grant ends and FREE remains. |
| E4 | **Feature keys are a closed registry** (`FeatureKey` enum in the API with type BOOLEAN|COUNT|CENTS|PER_DAY): `ai.server`, `ai.budget_cents_per_period`, `ai.parse_resume`, `resumes.max`, `answers.sync`, `inbox`, `matches.per_day`, `matches.ai_scored`, `alerts.max`, `autopilot.apps_per_month`, `autopilot.apps_per_day`, `interview.ai_practice`, `builder.ai`, `analytics.full`. Adding a key is a code change (it needs a gate somewhere anyway); its limits are catalog rows. NULL limits refused on numeric keys (admin D8). |
| E5 | **AI budget period = the grant's period.** `AiBudgetService` already uses the subscription's billing period (15.5) but has no period *start* and falls back to the calendar month; B8.2 reads `subscription.current_period_start` (lifecycle doc) for `STRIPE_SUBSCRIPTION` grants, the org subscription period for `ORG_ASSIGNMENT`, the calendar month for comps/referrals, and the **highest budget's period** when several grants apply (org doc §6 rule). A 3-month plan is one pooled budget (`ai.budget_cents_per_period` on the QUARTER price's product row; the price row carries `budget_override_cents` so monthly and quarterly prices of one product can differ — 300 vs 800). |
| E6 | **`/api/profile/version` → `{version, plan, features[], limits{}, via?}`** (18.3). The extension gates on `features` and keeps `plan` for display; `sync.js` stores both on every answered check (12.3 behaviour). Version hash unchanged (features do not enter it; a plan flip does not need a profile pull). |
| E7 | **Catalog reads are cached in-process for 60 s** (`CatalogCache`, refreshed on every catalog write through an application event) — prices and entitlement rows change rarely; grants are never cached. The public catalog endpoint sends `Cache-Control: max-age=300` and the web renders `/pricing` from it at request time with ISR 5 min (replaces `web/src/lib/catalog.ts` + `prices.ts`, B1.5). |
| E8 | **Migration is shadow-first.** B1.2 runs `resolve()` beside the old row logic for every `isPro` call behind `dossier.catalog.enabled=false`, logging mismatches with the login (no PII beyond that) for two weeks of prod traffic; flip to true; delete the old path in B1.6. The 18.2 migration test asserts `isPro` old == new for a fixture matrix of statuses × periods × overrides. |
| E9 | **Shared gateway for three scopes.** `StripeGateway` (user) grows the org/service methods the org doc lists (one-time checkout in `payment` mode, send-invoice invoices, item quantity ops, refunds) so there is *one* Stripe seam; `BillingWebhookService.applyInTx` routes by `scope` (USER | ORG | SERVICE) derived from `customer.metadata.kiwiply_scope` or the checkout's `metadata.kind`, then dispatches to `UserBillingHandler` (today's code moved), `OrgBillingWebhookHandler` (org doc §5) and `ServiceOrderWebhookHandler` (org services doc). Idempotency/ordering/record-then-apply are shared (B9.1). |

## 2. Resolution (pseudo)

```
resolve(login):
  grants  = entitlement_grant where user=login and starts_at <= now and (ends_at is null or ends_at > now) and revoked_at is null
  products = [FREE] + grants.product (distinct)
  features = {}
  for p in products: for e in product_entitlement(p):
      features[e.key] = e.type == BOOLEAN ? (features[e.key] or e.limit != 0)
                                          : max(features[e.key], priceOverride(p, grant) ?? e.limit)
  aiBudget  = the grant supplying max(ai.budget_cents_per_period); period = periodOf(that grant)   (E5)
  planLabel = AUTOPILOT if has(autopilot.apps_per_month) else PRO if has(ai.server) else FREE
             (+ "via {org}" when the winning grant is ORG_ASSIGNMENT; + "student" when product == PRO_STUDENT)
  return Resolved{features, limits, aiBudget{cents, periodStart, periodEnd, source}, planLabel, grants[]}
```
Admin AI override (`ai_quota_override`) migrates to an `ADMIN_COMP` grant on a synthetic
`ADMIN_AI_BUDGET` product (admin doc seed note) — B1.7 — after which "the override outranks the plan gate"
is just "highest wins" with no special case left in `AiBudgetService`.

## 3. Read paths (who asks what)

| caller | call | notes |
|---|---|---|
| every gated service (`AiDraftService`, `ProfileService.createResume`, `FieldCacheSyncService`, `InboxService`, `JobMatchService`, Autopilot queue, interview practice, builder AI) | `require(login, key)` / `limit(login, key)` | replaces the 10 `requirePro` sites one by one (B1.2 keeps `requirePro` as an alias so the swap is mechanical) |
| `GET /api/billing/me` | `resolve` + subscription row + usage | `PlanDTO v2` (lifecycle §7) |
| `GET /api/profile/version` | `resolve` (features/limits only) | E6 |
| extension `JAF.sync.checkAndPull` | stores `settings.plan`, `settings.features` | drawer/options gate on features (B3.6) |
| admin user page | `GET /api/admin/users/{login}/entitlements` | explains each feature's winning grant (A1.8) |
| web `(app)/layout.tsx` | one `getPlan()` per request (exists) | passes `features` down — components stop reading `plan === "PRO"` |

## 4. Seed (B1.1) — exactly today's behaviour, plus the products that exist in copy but not in code

`FREE`; `PRO` (MONTH 1999 / budget 300, QUARTER 4999 / budget 800; resumes 25, matches 20, answers.sync,
inbox, ai.server, matches.ai_scored, alerts.max 10, builder.ai); `AUTOPILOT` (MONTH 3999 / 600, QUARTER
9999 / 1600; resumes 50, autopilot 300/30, interview.ai_practice, everything in PRO); `PRO_STUDENT`
(draft, discount doc); `PRO_LITE` (draft, regional); `AI_TOPUP` (draft, B8.3); org products and services per
the admin seed list. **Prices are seeded as drafts with `stripe_price_id` copied from the env vars for PRO
(so the existing Stripe prices are reused, not recreated) and published by the migration test asserting the
ids match `STRIPE_PRICE_MONTHLY/3MO`** — nothing changes in Stripe on deploy.

## 5. Top-ups (B8.3, P2) and why they wait

A top-up is a one-time Checkout (`payment` mode) for product `AI_TOPUP` that credits the user's current
period budget (`ai_budget_credit {user_id, cents, period_end, invoice_id}`; `AiBudgetService` adds credits
to the period's budget). The guard treats it as `TOPUP`: margin = (price − credited_cents − fees) / price ≥
80 %. At $5.99 → credit $0.75: fees 17+30+4+5 = 56; cost 131 → **78.1 %** ✗; at **$6.99 → $0.75**: 57+75 =
132 → **81.1 %** ✓. So the smallest honest top-up is "$6.99 for 25 % more AI this period" — plausible for an
Autopilot user mid-sprint, odd for a Pro user. It stays P2 until the cap-hit metric (B2.3) says more than 5 %
of a plan's users hit 100 % (ROADMAP 1207 rule) — the same data decides between a top-up, a price change
and a budget change, and the user makes that call.

## 6. Failure modes (beyond the admin doc's)

| failure | behaviour |
|---|---|
| A price row's `stripe_price_id` exists in the catalog but Stripe returns 404 at checkout | 502 `STRIPE_ERROR` to the user (exists) + the price is flagged `unhealthy_at` by B10.1's reconciler (it lists Stripe prices nightly); the admin catalog shows it red |
| Two grants for the same product (webhook retry + admin comp) | union is idempotent; "highest wins"; the explainer shows both |
| A grant with `ends_at` in the past still served | `resolve` filters by clock; no job needed; the nightly reconciler also closes stale `ENDING` org assignments (org doc) |
| Shadow mismatch > 0 in prod | flip blocked by a release checklist item; mismatches are the test cases for the next fix |
| Catalog cache stale after an admin edit on another API instance | there is one API instance today (DEPLOY.md); the application-event refresh + 60 s TTL covers a second instance later |

## 7. Tests

`EntitlementResolutionTest` (matrix: FREE only; PRO month; PRO quarter budget 800; PRO + ADMIN_COMP budget
override wins; PRO + ORG Autopilot → Autopilot limits with org period; ended/revoked ignored; booleans OR;
PRO_STUDENT label), `EntitlementShadowTest` (old vs new for the 12.1 status × period matrix),
`FeatureKeyRegistryTest` (every key used in a `require(...)` call site exists in the seed for at least one
product — a reflection test over the service package), `ProfileVersionIT` (features present; version hash
unchanged by a plan flip), `GrantWriterGuardTest`, `AiBudgetPeriodTest` (period start from the mirror; quarter
pooled; org period; calendar month for comps), `CatalogSeedMigrationTest` (price ids reused; `isPro` identical).

## 8. Rollout

B1.1 schema + seed (no reads) → B4.1 period start (lifecycle) → B1.2 shadow → B1.3 grants written by the
webhook (still shadow) → flip → B1.4 features on `/version` + `/me` v2 → B3.6 extension gates on features →
B1.5 public catalog + `/pricing` → B1.6 delete the env-var prices/budgets and `catalog.ts` → B1.7 override
migration → B9.1 scope router before any org/service checkout exists.
