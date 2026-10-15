# 01 — Current-state review: what exists in code and in design for plans, pricing and licensing

> Status: review, 2026-10-15 (Fable, branch `subscription-design`, HEAD `48f1a7e6` of `version2`). Every
> row was checked in the files named; nothing is inferred from docs alone. `J` =
> `api/src/main/java/com/dossier/api`, `L` = `api/src/main/resources/config/liquibase/changelog`,
> `W` = `web/src`. Status vocabulary: **built** (code + tests), **partial** (code exists, not wired or
> incomplete), **design-only** (a doc, no code), **absent**.

## 0. Headline findings

1. **Personal billing is built, two-tier, and property-driven.** `subscription` is a mirror written only by
   `BillingWebhookService`; `EntitlementService.isPro` is a pure function of `(status, current_period_end)`;
   Stripe Checkout/Portal/webhook work (Phase 12.1–12.7). But the plan is `FREE|PRO` only; **Autopilot does
   not exist as a plan anywhere in code** (constant `AUTOPILOT_RESUME_LIMIT=50` is declared and never
   enforced). Prices are `STRIPE_PRICE_MONTHLY/3MO` env vars + `amountMonthly/amount3mo` properties; AI
   budgets are `AiPolicy.proMonthlyBudgetUsd/pro3moBudgetUsd` properties; resume caps are Java constants.
2. **There is no catalog in code.** None of Phase 18's `product_price`, `product_entitlement`,
   `entitlement_grant`, `bundle_item`, `promo_code`, `catalog_change` exist. The enterprise foundation branch
   created `product` and `feature_definition` **without any price column**, read by nobody but a demo seeder.
3. **Enterprise licensing exists as tables, entities, repositories and a demo seeder — nothing else.**
   21 tables in `L/20261020010000_ent_billing_data.xml` (`consultant_license`, `license_feature`,
   `license_change`, `org_contract`, `org_contract_price`, `org_billing_account`, `org_subscription`,
   `org_subscription_item`, `org_invoice`, `org_invoice_line`, `usage_event`, `usage_counter`, …). No
   `LicenseService`, `PricingEngine`, `QuoteService`, `MarginCalculator`, `UsageLedgerService`,
   `LicenseChangeApplier`, no `/api/orgs/{id}/licenses|billing|usage` routes, no tenant billing pages
   (nav items render `ComingSoon`). One reader: `InboxEntitlement.decide` checks a live license with
   `inbox.monitoring`.
4. **The design is far ahead of the code and already split in two.** Phase 18 (`docs/design/admin/
   catalog-margin-entitlements.md`, `docs/design/pay/*`) designs a **grant-based** personal engine
   (`entitlement_grant`, highest-wins) while Enterprise V2 docs 20–29 design a **license-based** org engine
   (`consultant_license` + `license_feature`, 11-step `check()`), and `21 §1` states "one catalog, never
   two" without saying how a personal plan is expressed in that catalog. Both are design-only. The seams
   overlap (two `product_price` definitions: `amount_cents` vs `amount_minor`; two margin formulas; two
   quote shapes; two webhook routers) — §4 lists every duplication.
5. **Nothing today lets an admin build a plan.** No plan entity, no composition, no versioning of anything
   but price rows (and those only on paper), no annual interval, no per-seat customisation UI, no public
   catalog endpoint; `/pricing` renders `W/lib/catalog.ts` (hard-coded, "Contact us" for everything but
   Free/Pro).

## 1. Personal plans — code

| Item | Status | Where | Notes |
|---|---|---|---|
| `subscription` table | built | `L/20260921000000_subscription.xml` | `user_id` UQ, `stripe_customer_id` UQ, `stripe_subscription_id` UQ, `plan` (FREE\|PRO), `status` (Stripe verbatim), `price_id`, `current_period_end`, `cancel_at_period_end`, `last_event_at`. **No `current_period_start`, no plan version, no items.** |
| `stripe_event` | built | same + `L/20261006010000_customer_timeline.xml` | `id` = `evt_…` PK (idempotency), status ok/failed/duplicate, customer_id, user_id, amount_cents, currency, occurred_at. No `scope`/`org_id`. |
| `EntitlementService` | built | `J/service/EntitlementService.java` | `isProFor(status, periodEnd, now)` static; `isPro(login)`, `plan(login)` → `PlanDTO(plan, status, currentPeriodEnd, cancelAtPeriodEnd, billingEnabled, hasCustomer)`; `requirePro(login)` → 402 `PRO_REQUIRED`. **No `has()`, `limit()`, `check()`, no context.** Reads the row every call (no cache). |
| 402 vocabulary | built | `J/service/ProRequiredException.java`, `J/web/rest/errors/ExceptionTranslator.java:130` | `PRO_REQUIRED`, `RESUME_LIMIT {limit, count, plan}`; `FEATURE_NOT_LICENSED` from `InboxService:135` only. |
| `isPro`/`requirePro` callers | built | `AtsScoreService`(67,82) `JobMatchService`(177,192) `InboxService`(133) via `requirePro`; `ProfileService`(354) `ResumeEntitlements`(27,37) `AiBudgetService`(132) `BillingService`(75) `JobSearchService`(310,431) `InboxEntitlement`(86) via `isPro`; `AiResource`(110) `ResumeAiService`(619) `ResumeTailorService`(152) `JobFitService`(175) `ResumeMatchService`(136) throw `PRO_REQUIRED` from the AI budget verdict | **14 call sites across 12 classes** (24 §7 said eight; the count grew with the resume builder). All are `login`-keyed, none feature-keyed. |
| Resume caps | partial | `J/service/ProfileService.java:67-76, 340-375` | `FREE_RESUME_LIMIT=3`, `PRO_RESUME_LIMIT=25`, `AUTOPILOT_RESUME_LIMIT=50` (unused); `enforceResumeLimitFor` counts non-archived. `ResumeEntitlements` is a self-described stand-in for `has("builder.ai")`/`limit("resumes.max")`. |
| `BillingService` / `BillingResource` | built | `J/service/BillingService.java`, `J/web/rest/BillingResource.java` | `GET /api/billing/me`; `POST /checkout {plan: monthly\|3mo}` (409 `ALREADY_SUBSCRIBED` after a live Stripe check, 503 `BILLING_DISABLED`, 400 `UNKNOWN_PRICE`); `POST /portal`. One line item, quantity 1, `allowPromotionCodes(true)`. |
| `StripeGateway` | built | `J/service/billing/StripeGateway.java` + `Impl` | `isEnabled`, `createCustomer`, `createCheckoutSession(customerId, priceId, userId, success, cancel)`, `hasLiveSubscription`, `cancelSubscription`, `createPortalSession`, `constructEvent`. Only importer of `com.stripe.*`. Null client when the key is blank (**billing disabled when blank — lock honoured**). |
| `BillingWebhookService` | built | `J/service/billing/BillingWebhookService.java` | record-then-apply, REQUIRES_NEW event insert, stale-event drop by `last_event_at`, `app=kiwiply` tag guard, `checkout.session.completed` binds customer, `customer.subscription.*` upserts, `invoice.paid` → active, `invoice.payment_failed` → past_due + mail. `touch()` recomputes `plan`. **Single scope**; no org routing. |
| `StripeProperties` | built | `J/service/billing/StripeProperties.java` | `secretKey`, `webhookSecret`, `priceMonthly`, `price3mo`, `amountMonthly` (19.99), `amount3mo` (49.99), urls, `managedPayments` (null), `automaticTax` (false). Amounts feed only the admin MRR tile. |
| AI budgets | built, property-driven | `J/service/AiBudgetService.java`, `J/service/ai/AiPolicy.java` | `decide(login, task)` → OK\|TASK_DISABLED\|PRO_REQUIRED\|EXHAUSTED; window = admin override (calendar month) else Pro window (3-month budget when `priceId == price3mo`, window = `current_period_end` minus 1 or 3 months) else Free parse count (`dossier.ai.free-monthly-quota` 50). Budgets `proMonthlyBudgetUsd=3.0`, `pro3moBudgetUsd=8.0` are **properties**; Autopilot's $6/$16 exist nowhere. Soft cap `ai.soft_cap_pct` (setting, enforced). |
| `ai_call` ledger | built | `L/20260922020000_ai_call.xml` | `login, task, model, tokens, cost_micros, created_at`. No `org_id`, `feature_key`, `usage_event_id`. |
| Settings registry | partial | `J/service/settings/SettingDefinitions.java` ← `AdminSettingKeys`, `EnterpriseSettingKeys`, `AiSettingKeys` | Registered **but not enforced**: `catalog.margin_floor_subscription_pct` 80 (80–95, HIGH), `catalog.margin_floor_service_pct` 20, `catalog.stripe.pct_bp` 290, `catalog.stripe.fixed_cents` 30, `catalog.cap_hit_alert_pct` 5, `admin.comp_max_days.*`, `flag.autopilot`, `flag.enterprise.billing` (OFF), `enterprise.billing.mode_default`, `enterprise.quote.ttl_minutes` 15, `enterprise.usage.retention_months` 24. **No keys for prices, price ids, plan budgets, resume caps, intervals or annual.** |
| `GET /api/profile/version` | built | `J/web/rest/ProfileResource.java:69-80` | `{version, plan, workspaces}`; `plan` is FREE\|PRO. No `features[]`. |
| Account deletion | built | `AccountDeletionService` | cancels the Stripe subscription immediately; forgets events. |

## 2. Personal plans — web and extension

| Item | Status | Where | Notes |
|---|---|---|---|
| `/pricing` | built, hard-coded | `W/app/(marketing)/pricing/page.tsx`, `W/components/pricing/PricingSections.tsx`, `W/lib/catalog.ts`, `W/lib/prices.ts` | `OfferCard`, `CompareDialog`, `ConsultancyDialog`, `RenewalNote` (honest auto-renew copy). Prices are strings; Autopilot/Consultancy/services are "Contact us". No toggle, no add-on picker, no promo field. |
| Checkout / portal BFF | built | `W/app/api/billing/{checkout,portal,me}/route.ts` | relays API codes verbatim; demo read-only. |
| Plan read | built | `W/lib/billing.ts` (`getPlan()` once in `(app)/layout.tsx`) | `Plan {plan FREE\|PRO, …}`. |
| Settings › Billing card | built | `W/components/billing/BillingCard.tsx` | states: off/Free/Pro renews/cancels/canceled/past_due; no "My plan" page, no add-ons, no invoices. |
| Upsells | built, scattered | `LockCard`, `LockPopover`, `CapDialog`, `AtsScoreDialog`, `ResumeFit`, `TailorDialog` | each links to `/pricing`; no shared `UpgradeSheet` (U15.1/B3.3 design-only). |
| Org v2 billing page | sample | `W/components/org-v2/billing/BillingPage.tsx` | 100 % sample data ("72 / 100 seats"). |
| Admin catalog / pricing / settings pages | absent | `W/components/admin-shell/AdminShell.tsx:53-66` | no nav entry; admin kit exists (`W/components/admin-v3/common`: `AdminHero`, `AdminStatTiles`, `AdminFilterBar`, `AdminTable`, `AdminTabs`, `ReasonSheet`, `ConfirmTypedSheet`, `HistoryDrawer`, `AutosaveInput`, `PlanChip`, `HBarList`, `BarLineChart`, …). |
| `packages/ui` money primitives | built, **unused by web** | `packages/ui/src/enterprise/money.tsx` (`MoneyText`, `PriceDelta`, `FeatureChip`, `AllowanceMeter`, `formatMinor`), `StatePill` + `BILLING_STATE_MAP`, `Meter`, `Switch`, `Stepper`, `BottomSheet`, `Toast`, `EmptyState`, `AnimatedNumber`, `SaveStatusChip` | everything the customer and admin UX in `04`/`05` needs already exists as primitives. |
| Extension | built | `job-autofill/src/lib/tracking.js:448-491`, `sync.js:134-163`, `entrypoints/options/actions.ts:58-78`, `panel/home-actions.ts:261,323`, `panel/services.ts:187-196` | stores `plan`, gates on `plan === "PRO"`, deep-links to `kiwiply.com/pricing`. No `features[]`. |

## 3. Enterprise licensing — code

| Item | Status | Where | Notes |
|---|---|---|---|
| Catalog tables | partial | `L/20261020010000_ent_billing_data.xml`; `J/domain/ent/billing/*`; repos `J/repository/catalog/{FeatureDefinitionRepository, ProductRepository}` | `feature_definition` (`feature_key` PK, usage_type, usage_unit, default_allowance, allowance_period MONTH, icon_key, active, demo_data) and `product` (`code`, `kind` BASE_LICENSE\|FEATURE\|ORG_ADDON, `feature_key`, `tier_rank`). **No price column, no `product_price`, no dependencies, no presets, no tiers, no versions.** |
| License tables | partial | same changelog | `consultant_license` (consultant_id **and** nullable member_id — deviates from 20 §1 "belongs to the membership"), `base_amount_minor` pinned, `contract_price_id`; `license_feature` (`unit_amount_minor` pinned, `live` + generated `live_key`); `license_change` (status default APPLIED, `amount_delta_minor`, `summary`); generated `active_key` one live license per consultant. |
| Contract tables | partial | same | `org_contract` (one ACTIVE per org), `org_contract_price` (`version_from/to`, `override_amount_minor`, `allowance_override`) — **the only place enterprise prices live today**, and only demo rows. No `org_discount`, `volume_tier`, `license_quote`, `org_module_license`. |
| Billing mirrors | partial | same | `org_billing_account` (no `stripe_customer_id`/`stripe_subscription_id`, `source` LOCAL), `org_subscription` (`plan_code`, `plan_name`, `unit_amount_minor`, `licensed_capacity`), `org_subscription_item`, `org_invoice` + `org_invoice_line`, `org_payment`, `org_payment_method` (brand/last4 only), `org_billing_adjustment`, `subscription_change`, `org_plan_feature`. |
| Usage | partial | same | `usage_event` (committed only, no reservations/idempotency/limit_key), `usage_counter`, `usage_alert`, `feature_credit`. |
| Writers | demo only | `J/service/ent/BillingDemoSeeder.java` (from `EnterpriseDemoBootstrap`) | the **only** writer of all 21 tables. |
| Readers | partial | `J/service/inbox/InboxEntitlement.java` (live license with `inbox.monitoring`); `J/service/ent/consultantws/ConsultantFeaturesService.java` (`sample=true` stub); `SubscriptionSummaryProvider` (status + setup fee only) | |
| Services / engines | absent | — | `LicenseService`, `PricingEngine`, `QuoteService`, `MarginCalculator`, `CatalogService`, `UsageLedgerService`, `LicenseChangeApplier`, `OrgBillingWebhookHandler`: no class, no reference. |
| REST | absent | — | no `/api/admin/catalog`, `/api/admin/pricing`, `/api/orgs/{id}/licenses|billing|usage|subscription`. |
| Tenant pages | absent | `W/lib/ent/shell.ts:53-56` → `ComingSoon` | past-due banner wiring exists (`shell.ts:261`); consultant "My Features" page built on the stub endpoint. |
| Isolation tests for these tables | built | `BillingSchemaIT`, `EntRepositoryContractTest` | org_id-first, composite FKs, no card-number columns, seeded counts. |

## 4. Design inventory and the duplication between the two models

| Topic | Phase 18 / `pay` docs (personal) | Enterprise V2 docs 20–29 (org) | Conflict / duplication |
|---|---|---|---|
| Price table | `product_price.amount_cents`, `audience`, `billing_interval MONTH\|QUARTER\|ONE_TIME`, immutable rows, `stripe_price_id` NULL = draft | `product_price.amount_minor`, `effective_from/until`, `catalog_version`, `active_key`; `ORG+QUARTER` refused (E17) | same table, two column names; 21 §2.2 already declares Phase 18's A3.1 superseded by X5.1 — but `pay` B1.1 still owns "catalog schema + seed". **Two stories create the same table.** |
| What a plan is | a `SUBSCRIPTION` product with `product_entitlement` rows (feature_key → limit) | no personal plan concept; `license_preset.mirrors_product_code = PRO` only for the "above individual" check | nothing composes services into a personal plan; `bundle_item` is "built but unused". |
| How a person gets features | `entitlement_grant` rows (sources STRIPE_SUBSCRIPTION, ORG_ASSIGNMENT, ADMIN_COMP, SERVICE_ORDER, REFERRAL), **highest wins across grants** | `consultant_license` + `license_feature` per membership, **no cross-context stacking** (ADR-018) | `ORG_ASSIGNMENT` grants (org doc `docs/design/org/billing.md`) are the **pre-E3 per-person-items model** — superseded in spirit by 20–22 but still referenced by B1.x/A3.x/O4.x stories. With O4 (separate accounts) "highest wins across org + personal" is moot. |
| Entitlement API | `has(login, key)`, `limit(login, key)`, `resolve(login)`, `require(login, key)` → `PLAN_REQUIRED` | `check(EntitlementRequest{context, featureKey, quantity, idempotencyKey…})`, `require`, `has(ctx, key)`, `entitlementsOf` → reason codes 402/403/404/409 | two shapes for one service; 24 §7 maps the personal path via `PersonalFeatureMap` → `isPro`, which keeps the two-tier assumption. |
| Margin guard | `fee(p)=2.9%+30¢(+email)`; `fee-model-and-margin-guard.md` adds Billing 0.7 %, MoR 3.5 %, intl blend, disputes → **Launch-1 Pro fails the 80 % floor (79.0 %)** | `fee_base`/`fee_feature` with invoicing 40 bp; per-invoice fixed-fee allocation; preset "above individual" check | three formulas; the `catalog.*` setting keys exist for the simple model only. The honest schedule is an open question (`PLAN-pay.md` §7 Q1) that **also decides whether any annual discount can pass** (`03` §7). |
| Quotes / preview | `POST /api/billing/switch/preview` (Stripe upcoming-invoice preview) | `license_quote` + `LicenseQuoteDTO` (28 fields, Kiwiply-computed, 15-min expiry, `inputs_hash`) | Stripe is the proration authority in one, Kiwiply in the other (C10 chose Kiwiply for orgs). |
| Webhooks | `BillingWebhookService` v2 with `scope USER\|ORG\|SERVICE` router (B9.1) | `OrgBillingWebhookHandler` routed by `kiwiply_scope=org` (26 §7) | same router designed twice with different names. |
| Intervals | MONTH, QUARTER; **no annual** (lock) | MONTH only for orgs (E17) | neither has YEAR; the user now asks for it (→ `decisions-for-user.md` S-01). |
| Per-seat customisation | n/a | yes: `license_feature` per consultant, presets, bulk, contracts, volume tiers | the enterprise design is the richer one; the personal side needs the same quote → confirm discipline for add-ons. |
| Pages | `/pricing`, upgrade sheet, switch sheet, cancel sheet, lapse sheet (design) | six org pages at 390/1440 (28), Platform Pricing Admin tabs | no **plan builder** anywhere; Pricing Admin edits products/prices/features/presets, never a composition. |

## 5. Gaps that block "plans built from add-ons"

| # | Gap | Blocks | Fixed in |
|---|---|---|---|
| G1 | No plan entity, version or composition; a "plan" is a string on `subscription.plan` and a `product.code` in docs | everything | `02`, `08` §2 |
| G2 | `feature_definition` is org-only in both code (`usage_type`) and design (`eligibility_json.orgTypes`); personal capabilities (`ai.server`, `answers.sync`, resume cap) have no service row | one catalog | `02` §2.1–2.4 |
| G3 | Prices, price ids, AI budgets, resume caps are properties/constants (`StripeProperties`, `AiPolicy`, `ProfileService`) | admin re-pricing, Autopilot, add-ons | K1.6 (re-home) |
| G4 | No `YEAR` interval; Stripe subscriptions share one interval across items | annual (ON — S-01 answered 2026-10-15) | `03` §5, K9 |
| G5 | Personal subscription has one item; add-ons need subscription items + a quote/confirm path for existing subscribers | individual add-ons | `07` §2, K5 |
| G6 | `subscription` has no `current_period_start`, no version, no invoice mirror | proration, grandfathering, snapshots | `08` §3 |
| G7 | No margin guard implementation; three formulas on paper; Launch-1 prices sit on the floor | any discount (annual, bundle, promo) | `03` §7, S-11 |
| G8 | Enterprise tables exist but `consultant_license` keys on `consultant_id` (foundation) vs `org_member.id` (doc 20), and `org_contract_price` is the only price source | per-seat pricing from a published catalog | `08` §4 (reconcile: keep both columns; list price from `product_price`, contract from `org_contract_price`) |
| G9 | No public catalog endpoint; `/pricing` is a TS file | pricing page from published plans | K5.1 |
| G10 | Two overlapping backlogs (B1–B3/A3 vs X5–X6) own the same tables and services | one build order | `10` (K stories supersede/relate; nothing deleted) |
| G11 | No `features[]` on `/api/profile/version`; extension gates on `plan === "PRO"` | add-on entitlements reaching the drawer | K7.4 |
| G12 | No admin settings for intervals, annual discount, seat limits, quote TTL (personal), plan builder floors | "everything admin-configured" | `08` §6 |

## 6. Risks found while reviewing

- **There are no existing subscribers today** (user, 2026-10-15, S-03): the `subscription` table holds no
  Pro rows, so every "existing subscriber" concern below is about the *future* cohort; the seed and
  backfill are a no-data migration (07 §6) and the rules stay as guard rails.

- **Margin floor at Launch-1 prices.** With Stripe Billing's 0.7 % included, Pro $19.99 computes to
  79.0 % (`fee-model-and-margin-guard.md` §3.1). Any plan builder that runs the guard honestly will refuse
  to re-publish today's Pro price without an override. This is a decision (S-11), not a bug; the design
  below makes the schedule a setting and the floor check explicit.
- **`AiBudgetService` detects the quarterly plan by comparing `price_id` to an env var.** Once prices are
  rows, this must read `subscription.plan_version_id` / `billing_interval` (K7.2) or quarterly users
  silently fall to the monthly budget.
- **`subscription.plan` is recomputed by `touch()` as PRO/FREE from status.** A third plan or add-ons
  cannot be represented until `plan_version_id` exists; the migration must keep `plan` as a derived label
  for old readers (`/api/profile/version`, extension) — `07` §6.
- **Enterprise `consultant_license.consultant_id`** vs doc 20's `member_id`: the unified model keeps the
  foundation's columns (additive rule) and treats `member_id` as the authoritative link when present.
- **Two Stripe customers can share an email** (O4); `createCustomer` must carry `user_id` metadata and
  never search by email (19 §3.4) — relevant to add-on checkout for existing customers.
- **No reconciler, no test clock, no invoice mirror** on the personal side: add-ons and annual make the
  "quote = invoice" promise testable only once `invoice`/`invoice_line` mirrors exist (K8.3).
