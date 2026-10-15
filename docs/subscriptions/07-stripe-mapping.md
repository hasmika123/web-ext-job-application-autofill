# 07 — Stripe mapping: products, prices, items, quantities, coupons, webhooks, reconciliation, migration

> Status: design, 2026-10-15 (Fable). Locks kept verbatim: **Stripe is the truth; only webhooks write
> mirrors; billing is disabled when the key is blank; no trial; no refunds, cancel anytime; `past_due`
> entitled until period end; Kiwiply prorates (C10); one subscription per org (ADR-017).** Extends
> `26-billing-provider-integration.md` (org) and `docs/design/pay/subscription-lifecycle.md` (personal
> webhook v2). **Test mode in every environment until the user says otherwise.**

## 1. Objects

| Kiwiply | Stripe | Rule |
|---|---|---|
| `product` (SUBSCRIPTION, FEATURE, BASE_LICENSE, ORG_MODULE, FEE, SERVICE) | one **Product** per `product` row (`metadata.app=kiwiply`, `product_code`, `feature_key`) | created at first publish, idempotency `prod-{code}` |
| `product_price` row (per audience × interval × currency, incl. derived YEAR rows) | one **Price** (`recurring.interval = month`, `interval_count = 1|3|12`; or one-time), `metadata.price_row_id`, `audience`, `catalog_version` | created at publish with `price-{id}` (Phase 18 D3); never edited; retired = `active=false` in Stripe too |
| personal `subscription` + `subscription_addon` rows | one **Subscription** per user; **item 0 = plan base price**, one item per add-on price, `quantity` = add-on quantity | all items share the interval |
| org licenses + modules | one Subscription per org; one item per distinct price in use, `quantity` = units (26 §1) | unchanged |
| annual discount | **baked into the YEAR Price amount** (03 §5) | no coupon; invoices show the annual price |
| promo code (individual) | Coupon + Promotion Code (B7.1), `allow_promotion_codes` per price (`accepts_promos`) | validated on the net price at creation |
| contract / volume (org) | one amount-off Coupon per org (26 §5) | unchanged |
| proration of an addition | one **InvoiceItem** (both worlds) | Kiwiply-computed (03 §6.1) |
| quote | `metadata.quote_id` on Checkout Sessions and on subscription updates | the webhook marks the quote APPLIED |

## 2. Personal subscription operations (`StripeGateway` growth — one interface, every write with an `IdempotencyKey`)

```java
// existing: createCustomer, createCheckoutSession(customerId, priceId, userId, success, cancel), hasLiveSubscription,
//           cancelSubscription, createPortalSession, constructEvent, isEnabled
String createCheckoutSession(CheckoutSpec spec, IdempotencyKey key);           // NEW overload: line_items[] = quote lines {price, quantity}, metadata {quote_id, plan_version_id, app}, consent/custom_text per B3.1; allow_promotion_codes from the quote
void   setSubscriptionItems(String subId, List<ItemQuantity> items, IdempotencyKey key);   // add/update/delete in ONE update, proration_behavior=none  (shared with 26 §3 setItemQuantities)
void   setCancelAtPeriodEnd(String subId, boolean cancel, IdempotencyKey key);  // 26 §3
String createInvoiceItem(String customerId, long amountMinor, String currency, String description, Period p, Map<String,String> md, IdempotencyKey key); // 26 §3
String createSchedule(String subId, List<ItemQuantity> phaseItems, Instant at, IdempotencyKey key);   // interval/plan change at period end (lifecycle L3)
void   releaseSchedule(String scheduleId, IdempotencyKey key);
UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subId, List<ItemQuantity> proposed, String couponId); // read-only; tax estimate only (C3)
List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter);
String createProduct(ProductSpec spec, IdempotencyKey key);  String createPrice(PriceSpec spec, IdempotencyKey key);  void deactivatePrice(String priceId, IdempotencyKey key);
```
`StripeGatewayImpl` stays the only importer of `com.stripe.*`. Every method refuses when `!isEnabled()`.

### 2.1 New subscriber (checkout)
`POST /api/billing/quotes/{id}/checkout` → `createCheckoutSession(spec)` with `line_items` = the quote's
`(price_id → stripe_price_id, quantity)` list, `mode=subscription`, `client_reference_id=userId`,
`metadata {quote_id, plan_version_id, app=kiwiply}`, key `co-{quoteId}`. On `checkout.session.completed`
+ `customer.subscription.created` the webhook writes `subscription` (+ `plan_version_id`, `billing_interval`,
`current_period_start`) and one `subscription_addon` per non-base item (matched by `stripe_price_id` →
`product_price` → `feature_key`), `stripe_item_id` stored; the quote → APPLIED. The success page polls as
today.

### 2.2 Existing subscriber: add / remove / change quantity
`POST /api/billing/quotes/{id}/confirm` (Idempotency-Key) → in one transaction write `subscription_change`
rows (PENDING) + `subscription_addon` rows (adds now; removals `ends_at = period_end`) → `SubscriptionChangeApplier`:
1. `setSubscriptionItems(subId, targetItems)` with key `sc-{batchId}-items`, `proration_behavior=none`
   (adds +n now; **removals −n now**, the customer keeps the add-on until period end in Kiwiply — C9);
2. `createInvoiceItem(amount = proration_minor, period [effective_at, period_end], description "Prorated:
   Extra AI credits ×1", metadata {subscription_change_id})`, key `sc-{changeId}-pro`, skipped when 0;
3. mark APPLIED; the next `customer.subscription.updated` reconciles mirrors (items ↔ addon rows).
Failure → FAILED + `SubscriptionChangeRetryJob` with the same keys (26 §4 step 6 pattern); the customer
has the feature already (entitlements read Kiwiply rows).

### 2.3 Interval and plan changes
- **Upgrade now** (Pro → Autopilot, same interval): `setSubscriptionItems` swapping the base price
  (old −1, new +1, none) + proration invoice item of the new base; add-ons that the new plan INCLUDES get
  `ends_at = period_end` (their items −n now).
- **Downgrade / interval change at period end**: `createSchedule(subId, phaseItems, at = period_end)`
  (lifecycle L3); mirrored on `subscription_schedule.*` events; `releaseSchedule` on cancel. Stripe
  permits interval changes inside a schedule phase; when a phase cannot change the interval of an
  existing subscription (Stripe rejects mixed intervals on one subscription), the applier instead
  schedules **cancel at period end + a new Checkout-less subscription** created from the saved payment
  method at `period_end` (`createSubscription(customerId, items, billing_cycle_anchor = period_end,
  trial_end = period_end)` — `trial_end` here is the Stripe mechanism for "start billing at that
  instant", **not** a free trial: no access is granted before payment that was not already paid for; the
  mirror shows one subscription id replacing another; tests assert no entitlement gap and no double charge).
- YEAR → MONTH: scheduled at term end (S-04). MONTH → YEAR: at the next monthly period end.

### 2.4 Org (26 §4, unchanged) + annual
Items per price with quantities; when the org is on YEAR the items are YEAR prices; proration invoice items
on the annual unit; seat transfer = no Stripe call; interval switch for an org = a BULK quote that
schedules the swap at term end (same mechanism as 2.3).

## 3. Catalog publish → Stripe
`PlanService.publish` creates missing Products/Prices **before** the DB commit with keys `prod-{code}`,
`price-{row id}`; derived YEAR rows get their own Price (`interval_count=12`). Retired rows →
`deactivatePrice` (subscribers on them keep being billed — Stripe keeps items on inactive prices).
`CatalogReconcileJob` (nightly) lists Stripe prices with `metadata.app=kiwiply` and flags unknown or
amount-mismatched ones (`billing_drift kind=CATALOG`); never writes money.

## 4. Coupons and discounts
| Discount | Stripe representation | Who computes |
|---|---|---|
| annual | YEAR Price amount | catalog (derived row) |
| promo (individual) | Coupon + Promotion Code at Checkout (`allow_promotion_codes` only on prices with `accepts_promos`) | Stripe applies; `promo_code` mirror; guard validated net |
| contract / volume (org) | one amount-off Coupon per org, re-sized by the applier and at rollover | `PricingEngine` (22 §4 `discount_total`) |
| referral | 100 %-off one-period coupon created by the system (B7.5 D7) | system |
| comps | no Stripe object (grant) | admin |
Never two coupons on one subscription (Stripe enforces one discount; our engine enforces one promotional discount).

## 5. Webhooks (one router, two handlers — B9.1 and 26 §7 merged)
`BillingWebhookService.applyInTx(event)`: `scope = customer.metadata.kiwiply_scope ?? (customer ∈ org_billing_account ? org : user)`
→ `UserBillingHandler` (today's code + the rows below) or `OrgBillingWebhookHandler` (26 §7). `stripe_event`
gains `scope`, `org_id` (additive). Personal handler additions:

| event | effect |
|---|---|
| `checkout.session.completed` | bind customer (exists); `quote_id` → quote APPLIED; consent record (B3.2) |
| `customer.subscription.created/updated` | mirror status, periods (**start + end**), cancel flags, `schedule_id`; `plan_version_id` + `billing_interval` from item 0's price → `product_price` → plan version (`subscription.plan` label derived for old readers); **replace `subscription_addon` rows from `items[]`** (adds missing, closes rows whose item vanished with `ends_at = period_end` unless already scheduled) |
| `invoice.created/finalized/updated/paid/payment_failed/voided` | upsert `invoice` + `invoice_line` snapshots (03 §10): per line `price_id`, `plan_version_id`, `feature_key`, quantity, unit, amount, period, `proration` flag; `paid` → status active, `first_paid_at`, `paid_through_at = period_end` |
| `invoice.upcoming` | renewal reminder (B4.2); personal period rollover: flip scheduled removals at `period_end` (`PersonalLifecycleJob` is the backstop) |
| `subscription_schedule.created/updated/released/completed` | mirror schedule columns; `completed` → new base/interval visible on the next `subscription.updated` |
| `customer.discount.created/deleted` | mirror promo application on `subscription.promo_code_id` |
Ordering and idempotency unchanged (`stripe_event.id` PK, `last_event_at`; `invoice.last_event_at`).
An org event never touches `subscription`; a personal event never touches `org_*` (29 §1.6).

## 6. Migration of existing personal subscribers (no behaviour change)
1. K2.1 seeds plan versions FREE v1, PRO v1, AUTOPILOT v1 (02 §3.3). PRO v1's base `product_price` rows are
   created with `stripe_price_id = STRIPE_PRICE_MONTHLY / STRIPE_PRICE_3MO` (**reused, not recreated**) and
   `published_at = now`; `CatalogSeedMigrationTest` asserts the ids match the env.
2. Backfill (Liquibase `customChange`, idempotent): `subscription.plan_version_id = PRO v1` where `price_id
   ∈ {monthly, 3mo}`, `billing_interval` from the price, `plan_version_id = FREE v1` for rows with no Pro
   price; `current_period_start = NULL` (filled by the next webhook or by `BackfillPeriodStartJob` reading
   Stripe once, read-only). No `subscription_addon` rows exist → no items change in Stripe.
3. `subscription.plan` keeps being derived (`touch()` → label from the plan version), so `/api/profile/version`,
   the extension and `PlanDTO.plan` are byte-identical.
4. Shadow mode (06 §4) for two weeks of prod traffic; flip `billing.catalog.shadow=false`.
5. `AiBudgetService.window` reads `billing_interval` (K7.2) — assert the quarterly users keep the 800 budget
   (`AiBudgetPeriodTest`).
6. Delete the env-var price path only after B1.6/K1.6 — `StripeProperties.priceMonthly/price3mo` remain
   readable one release for the seed assertion.

## 7. Regression IT list (CI job `personal-billing-regression`, extends 29)
| test | asserts |
|---|---|
| `BillingResourceIT`, `BillingWebhookIT`, `EntitlementServiceTest` | **unchanged files, still green** |
| `PersonalSubscriptionUnchangedIT` E0–E12 (29 §2) | unchanged + E13/E14 (06 §10) |
| `CatalogSeedMigrationTest` | reused price ids; `isPro` identical before/after for the status × period matrix |
| `SubscriptionBackfillTest` | every existing row gets the right version/interval; rerun = no-op |
| `LegacyReadersUnchangedIT` | `GET /api/billing/me`, `GET /api/profile/version` bodies byte-identical for a Pro-monthly, Pro-quarterly and Free fixture before/after the flip (fields added only) |
| `AddonCheckoutIT` | quote → session line items equal the quote; webhook with two items → `subscription_addon` rows; `/me` lists add-ons |
| `AddonChangeIT` | confirm → items update with `proration_behavior=none`; proration invoice item amount = quote's; removal keeps the feature until period end; retry with same keys is a no-op |
| `IntervalSwitchIT` | monthly → yearly schedule at period end; yearly → monthly at term end; no double charge, no entitlement gap (two-subscription path) |
| `OrgEventsNeverTouchPersonalIT` / vice-versa | row counts before/after |
| `WebhookScopeRouterTest` | scope resolution table; unknown customer ignored; BeeCompete tag ignored |
| `StripeReconcilerTest` (personal) | items vs addon rows; prices vs catalog; drift rows only, never writes |
| `FakeStripeGateway` scenario harness (B10.4) | replays: checkout with add-ons, add/remove, interval switch, failed renewal → lapse, resubscribe |
| Test clock runbook (K8.6) | scenario P (personal) and C (org, 26 §10) recorded with object ids |

## 8. Billing disabled (blank key)
`isEnabled()==false` → quotes still work (prices from the catalog), checkout/confirm return `503
BILLING_DISABLED` for individuals (today's rule), orgs use `LocalBillingApplier` (26 §11); plan publish is
refused (drafts editable); the pricing page renders prices with "Payments open soon". `BillingConfigIT`
asserts all of it.
