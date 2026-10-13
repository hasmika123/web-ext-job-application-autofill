# 26 — Billing provider integration: StripeGateway growth, items, coupons, webhooks, reconciler, fallback, test clocks

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-017 (one subscription per org),
> ADR-020 (coupons, 20-item fallback, test clocks) and the unchanged Phase 12 locks: **Stripe is the
> truth; only webhooks write mirrors; billing is disabled when the key is blank.** Build-ready for
> **X6.12** (billing account + setup fee), **X6.6** (gateway + webhook routing), **X6.7** (apply
> changes), **X6.8** (reconciler, dunning), **X6.11** (test-clock runbook). Existing code:
> `service/billing/StripeGateway` + `StripeGatewayImpl` (the only `com.stripe.*` importer),
> `StripeWebhookEvent` (record), `BillingWebhookService` (record-then-apply, `stripe_event` PK
> idempotency, `taggedForAnotherApp`), `StripeProperties` (`automaticTax=false`, `managedPayments`).
> **Test mode only in every environment until the user says otherwise; no real charge is ever
> initiated by this programme.**

## 1. Objects and ownership

| Kiwiply | Stripe | Rule |
|---|---|---|
| `org_billing_account` (one per org) | one **Customer** (`metadata.app=kiwiply`, `kiwiply_scope=org`, `org_id`) | never the OWNER's personal customer (billing.md D2) |
| the org's live licenses + modules | one **Subscription** (`collection_method=send_invoice`, `days_until_due=15`, `metadata.app=kiwiply, kiwiply_scope=org, org_id`, `proration_behavior=none` on every update) | created lazily on the **first** license confirm; cancelled at period end when the last item goes |
| one distinct **list price** in use | one **Subscription Item** on that `stripe_price_id`, `quantity` = units on that price across all licenses | items ≤ 20 (§6) |
| `discount_total` (22 §4) | one **Coupon** (`amount_off`, org currency, `duration=forever`, `name="Contract/volume pricing"`) attached as the subscription's discount | re-sized on every confirm and at rollover (§5) |
| proration of an addition (22 §6) | one **InvoiceItem** on the customer (`amount = proration_minor`, `currency`, `description`, `period{start,end}`, `metadata.license_change_id`) | lands on the next invoice; Kiwiply computes it |
| setup fee | one-time Checkout (`mode=payment`) **or** a Stripe Invoice (`send_invoice`, 15 days) on the org customer — billing.md §2, adopted unchanged | precedes any license |
| `org_subscription`, `org_subscription_item`, `org_invoice`, `org_invoice_line`, `org_stripe_discount` | mirrors | **written only by `OrgBillingWebhookHandler`** (and by `LocalBillingApplier` with `source=LOCAL` when Stripe is off) |

## 2. `org_billing_account` (Liquibase `202611xxxxxxxx_ent_org_billing.xml`)
`org_id` UQ, `stripe_customer_id` UQ, `currency` CHAR(3) NOT NULL (set once at creation from `enterprise.billing.default_currency`=USD or the admin's choice; immutable while any license exists), `billing_email`, `billing_contacts_json`, `collection_method` `SEND_INVOICE` (default) | `CHARGE_AUTOMATICALLY`, `tax_status` `NONE|AUTOMATIC` (C3), `status` `NONE|ACTIVE|PAST_DUE|SUSPENDED|CLOSED`, `billing_mode` `SUBSCRIPTION_ITEMS|COMPUTED_INVOICE` (default from `enterprise.billing.mode_default`), `stripe_subscription_id` UQ NULL, `stripe_coupon_id` NULL, `current_period_start`, `current_period_end`, **`paid_through_at`** (end of the last paid period; E11), `last_invoice_at`, `overage_opt_in`, `test_clock_id` NULL (test mode only), `created_at`, `updated_at`. `organization.stripe_customer_id` / `billing_email` are mirrored both ways during Phase 5–6 (dual-write, ADR-023).

## 3. `StripeGateway` growth (one interface; every new method takes an `IdempotencyKey`)

```java
// existing methods unchanged. New (all throw StripeGatewayException; all refuse when !isEnabled()):
String  createOrgCustomer(OrgCustomerSpec spec, IdempotencyKey key);                 // metadata kiwiply_scope=org, org_id; optional test_clock
String  createOneTimeCheckout(String customerId, String priceId, String clientRef, Map<String,String> metadata, String successUrl, String cancelUrl, IdempotencyKey key);
String  createInvoiceForPrices(String customerId, List<String> priceIds, int daysUntilDue, Map<String,String> metadata, IdempotencyKey key); // setup fee by bank transfer
String  createOrgSubscription(String customerId, List<ItemSpec> items, SubscriptionSpec spec, IdempotencyKey key);   // send_invoice, days_until_due, metadata, automatic_tax per C3
void    setItemQuantities(String subscriptionId, List<ItemQuantity> items, IdempotencyKey key); // add/update/delete(items with quantity 0) in ONE update call, proration_behavior=none
void    setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key);
String  createAmountOffCoupon(long amountMinor, String currency, String name, IdempotencyKey key);
void    applySubscriptionDiscount(String subscriptionId, String couponId /* null = remove */, IdempotencyKey key);
String  createInvoiceItem(String customerId, long amountMinor, String currency, String description, Period period, Map<String,String> metadata, IdempotencyKey key);
String  createAndFinalizeInvoice(String customerId, int daysUntilDue, Map<String,String> metadata, IdempotencyKey key); // COMPUTED_INVOICE mode
UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subscriptionId, List<ItemQuantity> proposed, String couponId); // read-only, no key
List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter);
String  createPortalSession(String customerId, String returnUrl);                   // existing, reused with the org customer (portal config: invoice customers, no cancel)
String  refundPaymentIntent(String paymentIntentId, long amountMinor, String reason, IdempotencyKey key);   // admin only, audited; duplicate-setup-fee case only (billing.md §8)
String  creditCustomerBalance(String customerId, long amountMinor, String currency, String reason, IdempotencyKey key); // admin only, behind flag enterprise.billing.credits (C4)
String  createTestClock(Instant frozenAt);  void advanceTestClock(String clockId, Instant to);           // test mode only; refuse when the key starts with sk_live_
```
`StripeWebhookEvent` grows: `scope` (`personal|org`, from customer/subscription metadata `kiwiply_scope`), `orgId`, `invoice{id, number, status, currency, amountDue, amountPaid, periodStart, periodEnd, dueAt, paidAt, hostedUrl, pdfUrl, lines[{priceId, quantity, amount, description, prorationFlag}]}`, `items[{itemId, priceId, quantity}]`, `discount{couponId, amountOff}`, `currentPeriodStart`, `paymentIntentId`. The personal fields stay exactly as they are.

## 4. Applying a license change batch (`LicenseChangeApplier`, X6.7)

For a confirmed batch (20 §4 rule 9), per org, in this order, each call with its idempotency key:
1. **Ensure customer** (`createOrgCustomer` if `stripe_customer_id` NULL; key `orgcust-{orgId}`).
2. **Compute the target item set** from the post-change license state: `Map<stripe_price_id, quantity>`; items with quantity 0 are deleted. If the org has no subscription yet and the set is non-empty → `createOrgSubscription` (key `orgsub-{orgId}-{batchId}`), `billing_cycle_anchor=now` → the period starts now. Else → `setItemQuantities` (key `lc-{batchId}-items`), `proration_behavior=none` **always** (Kiwiply prorates, 22 §6).
   - Additions take effect now (the item is on the subscription); **removals/cancels/suspends decrement now** with no proration — the org already paid the period, and the consultant keeps the feature in Kiwiply until `ends_at` (billing.md D5, kept).
   - Cancelling a pending removal before `ends_at` re-increments with `none` (free, already paid).
   - Last item removed → `setCancelAtPeriodEnd(true)`; next addition while still active → `setCancelAtPeriodEnd(false)` + items; after it ended → a new subscription.
3. **Proration items**: for every addition line, `createInvoiceItem(amount = payload.proration_minor, period = [effective_at, period_end], description "Prorated: {feature} for {consultant}", metadata {license_change_id})`, key `lc-{changeId}-pro`. Zero amounts are skipped.
4. **Coupon**: `discount_total` for the next period (22 §4, after pending removals, at the tier for `licensed_count_next_period`) → if it differs from the current coupon's `amount_off` → `createAmountOffCoupon` (key `orgcoupon-{orgId}-{discount_total}-{currency}` — the same amount reuses the same coupon) + `applySubscriptionDiscount`; `0` → remove the discount. Mirror in `org_stripe_discount (org_id, coupon_id, amount_off_minor, currency, applied_at, removed_at, reason: BATCH|ROLLOVER|CONTRACT)`.
5. Mark each `license_change` `APPLIED` with `stripe_ref`; the webhook later reconciles the mirrors.
6. On any `StripeGatewayException`: the batch is `FAILED` with the step; Kiwiply rows are **already applied** (the consultant has the feature) — this is the one place we accept "granted but not yet billed", because the keys make the retry safe: `LicenseChangeRetryJob` (every 5 min, max 24 h, then platform-admin alert `BILLING_APPLY_FAILED`) re-runs steps 2–5 with the **same keys**. The reconciler (§7) is the backstop. (billing.md §4 did Stripe-before-DB for single seats; with batches and coupons, exact idempotent replay is safer than partial rollbacks — recorded as a refinement of ADR-017, not a reversal: Stripe stays the truth for what was *charged*.)

Invariant tests: after any batch, `Σ item quantity × list = Σ licenses' list lines` and `coupon.amount_off = discount_total`.

## 5. Coupons, exactly (ADR-020, E9 default (a))
- Always `amount_off` in the org currency, never `percent_off` (per-unit half-even rounding in Kiwiply would not match Stripe's line rounding; an amount reproduces the quote to the minor unit — 22 §10 property 5).
- One coupon per org at a time; `duration=forever`; invoice shows list lines + one "Contract/volume pricing" discount line (E9 (a) representation; invoice footer text configurable `enterprise.billing.invoice_footer`).
- Proration invoice items are already **net** (effective price), so the coupon never has to cover them.
- Re-sized by the applier (§4 step 4), by `ContractLifecycleJob` (23 §3.5) and by `OrgPeriodRolloverJob` (§7) which runs on `invoice.upcoming` (Stripe sends it `enterprise.billing.upcoming_days`=3 days before renewal; configured in the Stripe dashboard) and re-evaluates the tier for the next period.

## 6. The 20-item limit
- Items = distinct **Stripe prices** in use (base + ≤ 11 features + modules, plus retired prices still licensed). A quote computes `stripeItemsAfter`; ≥ 18 → warning; > 20 → in SUBSCRIPTION_ITEMS mode the confirm is refused `409 STRIPE_ITEM_LIMIT` with the list of retired prices still in use (the admin can "refresh prices" — a quote line `REPRICE` that moves licenses from retired to current rows, immediate, no charge when the price is lower, prorated difference when higher).
- Platform admin may switch an org to **COMPUTED_INVOICE** (`PUT /api/admin/orgs/{id}/billing/mode`, reason sheet): the Stripe subscription is set `cancel_at_period_end`; from the next period `OrgInvoiceComposer` creates invoice items (one per license line at effective price, plus proration items and overages) and `createAndFinalizeInvoice` (`send_invoice`, 15 days) at each `period_end` Kiwiply tracks itself; the same mirrors are written by the same webhooks (`invoice.*`), and the UI is unchanged. Nightly `BillingModeGuard` alerts when an org in SUBSCRIPTION_ITEMS mode reaches 18 items.

## 7. Webhooks, routing and mirrors
- `BillingWebhookService.applyInTx(event)`: **route first** — `event.scope()=="org"` or `customerId ∈ org_billing_account` → `OrgBillingWebhookHandler.apply(event)`; else the existing personal path **unchanged** (an org event never touches `subscription`; a personal event never touches `org_*` — `PersonalSubscriptionUnchangedIT` and `OrgBillingWebhookIT` assert both). `taggedForAnotherApp` still ignores BeeCompete events. `stripe_event` gains `org_id BIGINT NULL` (billing.md §3.5).
- Idempotency and ordering: `stripe_event.id` PK (exists); each mirror row keeps `last_event_at` and ignores older `created` (existing `isStale` pattern).

| event | handler effect |
|---|---|
| `checkout.session.completed` (mode=payment, `client_reference_id=org:{id}`) / `invoice.paid` with `metadata.kind=org_setup` | `setup_fee_paid_at` once; org `PENDING_SETUP_FEE → ACTIVE`; account `ACTIVE`; audit `BILLING_SETUP_PAID`; notification `ORG_ACTIVE` |
| `customer.subscription.created/updated` | upsert `org_subscription` (status verbatim, periods, cancel flag, discount) + replace `org_subscription_item` rows from `items[]`; set `current_period_*` on the account; status `unpaid`/`canceled` → org `SUSPENDED`, every license `ENDED(ORG_SUSPENDED)` now, members notified |
| `customer.subscription.deleted` | as `canceled` |
| `invoice.created/finalized/updated` | upsert `org_invoice` + `org_invoice_line` snapshots (amount, description, price id, quantity, period, proration flag) |
| `invoice.paid` | `org_invoice.paid`; `paid_through_at = invoice.period_end`; org `PAST_DUE → ACTIVE`; if `SUSPENDED` → `ACTIVE` and licenses re-created as new rows from the last state (`license_change` kind `REACTIVATE`, reason `PAYMENT_RECEIVED`) |
| `invoice.payment_failed` | org `PAST_DUE`, account `PAST_DUE`; email billing contacts ("nothing switched off until {paid_through}") ; notification to OWNER/ADMIN/FINANCE |
| `invoice.upcoming` | `OrgPeriodRolloverJob.prepare(orgId)`: re-size the coupon for the next period; promote/expire scheduled changes whose `effective_at ≤ next period start` (they were already decremented in Stripe; this flips Kiwiply rows at `ends_at`) |
| `invoice.voided/marked_uncollectible` | mirror only |
| `customer.discount.created/deleted` | mirror `org_stripe_discount` |

## 8. Idempotency keys (every write; `IdempotencyKey.of(...)`, ≤ 255 chars, stable across retries)
`orgcust-{orgId}` · `orgsetup-{orgId}-{attempt}` · `orgsub-{orgId}-{batchId}` · `lc-{batchId}-items` · `lc-{changeId}-pro` · `orgcoupon-{orgId}-{amount}-{currency}` · `orgdisc-{orgId}-{couponId|none}-{batchId|rollover:{periodKey}}` · `orginv-{orgId}-{periodKey}` (COMPUTED_INVOICE) · `ovg-{orgId}-{periodKey}-{featureKey}` · `refund-{invoiceId}` · `credit-{orgId}-{auditId}`. The key is also stored on the row that triggered the call (`license_change.stripe_idempotency_key`, `org_stripe_discount`, `org_invoice.compose_key`).

## 9. Reconciler (`OrgSeatReconciler`, nightly 03:10 UTC, ShedLock-ready)
For every org with a Stripe subscription: fetch the subscription (one read), compare `Map<price, quantity>` with Kiwiply's expected set (live licenses, excluding rows with `ends_at ≤ now`), compare `coupon.amount_off` with `discount_total`, compare `current_period_*` with the mirror, and compare FAILED/PENDING-past-due `license_change` rows. Drift → `billing_drift (org_id, kind QUANTITY|COUPON|PERIOD|CHANGE_STUCK, expected_json, actual_json, detected_at, resolved_at, resolved_by, note)` + platform-admin attention badge + Slack/email per `ops.*` settings. **Never auto-fixes money** (billing.md D3): the admin resolves from the org billing operations page (X6.10) by replaying the batch (same keys) or editing in the Stripe dashboard and marking resolved with a reason.

## 10. Test clocks (X6.11 runbook; test mode only)
1. `stripe.test-clock.enabled=true` (refused if the key is live) → `createOrgCustomer` attaches a new clock frozen at "now".
2. Scenario C (E2E): create org → pay setup via test card (Checkout, `4242…`) → confirm quote (A: BASE+JM+RT) → assert `customer.subscription.created` mirror, 3 items, no coupon → add contract (G2) + re-quote → coupon 600 → advance clock to `period_end + 1h` → `invoice.created/finalized/paid` (send_invoice + test card autopay, or mark paid in the dashboard) → mirrors updated, `paid_through_at` advanced → remove INT, advance → next invoice excludes it; dunning: set the customer's default card to `4000 0000 0000 0341`, advance → `invoice.payment_failed` → PAST_DUE, features still on until `paid_through_at`; advance past it → `SUBSCRIPTION_STATE` 402; pay → ACTIVE.
3. Every scenario step records the Stripe object ids in `docs/enterprise-v2/runbooks/stripe-test-clock-C.md` (written by X6.11 with real ids from the test account).

## 11. Stripe off (dev/CI) — unchanged locks, extended
- `StripeGateway.isEnabled()==false` → `LicenseChangeApplier` uses `LocalBillingApplier`: it writes `org_subscription` (`status=active`, calendar-month periods), `org_subscription_item`, `org_stripe_discount` and a synthetic `org_invoice` per period with `source=LOCAL`, so every page renders and every IT runs without secrets; quotes carry `taxSource=NONE`; `paid_through_at` = period end.
- `dossier.orgs.dev-activate=true` lets an org skip the setup fee (existing branch-A flag, adopted by X5.9); prod never sets it, and `BillingConfigIT` fails if it is true while a live key is present.
- `flag.enterprise.billing` **UI-off / API-on** (Phase 5): licenses can be configured and entitlements evaluated; `GET /api/orgs/{id}/billing` returns `billingEnabled=false` and the pages show the "Billing is being set up" empty state (28 §8).

## 12. Tests (X6.6–X6.8, X6.12)
`OrgBillingWebhookHandlerTest` (table of §7; stale events ignored; personal event untouched; another app ignored; SUSPENDED → licenses ended; `invoice.paid` → `paid_through_at`), `LicenseChangeApplierTest` (target item set maths; last item → cancel at period end; coupon re-size only on change; proration items; failure → FAILED + retry with same keys; invariants), `OrgSeatReconcilerTest` (each drift kind; never writes Stripe), `OrgInvoiceComposerTest` (COMPUTED_INVOICE lines = PricingEngine lines), `StripeGatewayImplIT` (recorded fixtures: idempotency key passed on every call; live key refuses test clocks), `LocalBillingApplierTest` (parity of totals with the Stripe path, 22 §10 property 7), `BillingConfigIT`.
