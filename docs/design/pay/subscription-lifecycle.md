# Subscription lifecycle — webhook v2, grants, invoices, renewals, dunning, lapse (B1.3, B4.*, B10.*)

> Area `pay`. Status: design, 2026-10-11. Locked: Stripe is the truth; **only webhooks write** the mirror;
> `past_due` stays entitled until `current_period_end`; cancel keeps the plan to period end; no refunds; no
> trial; 402 `PRO_REQUIRED`. Existing code this extends: `BillingWebhookService` (12.2, 440 lines, nine
> edge cases already handled), `StripeGatewayImpl.toWebhookEvent`, `Subscription`, `StripeEvent`,
> `AiBudgetService` (period window), changelog `20260921000000_subscription.xml`.

## 1. What is real today (keep every line of it)

- Idempotency by `stripe_event.id` PK; **failed applies are retried, not treated as duplicates**; lost
  insert race → 200; ordering by `last_event_at`; identity binding exempt from the ordering drop.
- Cross-app guard on a shared Stripe account (`metadata.app=kiwiply`); a checkout whose customer we did not
  create is ignored; a foreign subscription's cancellation cannot downgrade the row; only a *live* foreign
  subscription may take the row over (resubscribe).
- `invoice.payment_failed` → `past_due` + one email, decided from the row's state (so an out-of-order
  delivery still emails, a recovered subscription does not).
- `BillingService.startCheckout` asks Stripe `hasLiveSubscription` before a second checkout (double-billing
  guard found in the 12.7 run) and keeps the customer id across a failed session (`noRollbackFor`).
- `AccountDeletionService` cancels the subscription immediately and forgets the user's `stripe_event`s.

What is **not** there: a period *start*, the invoice history, the amount paid, more than one price per
customer (Autopilot), plan switches, grants (Phase 18), a reminder before renewal, a dunning cadence beyond
the first email, a "what changed" moment at lapse, a reactivation path, a reconciler, replay tooling.

## 2. Decisions

| # | Decision |
|---|---|
| L1 | **`subscription` stays one row per user and stays the fast path for `plan`**; grants (`entitlement_grant`, B1.1) become the *truth for features*, written by the same webhook transaction. `EntitlementService.isPro` reads grants once B1.2 flips; until then it reads the row. Both derive from the same event, so they can never disagree by more than one transaction. |
| L2 | **One Stripe subscription per user, one item.** Pro↔Autopilot is a *price change on the existing subscription* (`subscription.items[0].price`), never a second subscription. Monthly↔3-month likewise. This keeps `hasLiveSubscription`, the row's `stripe_subscription_id` and the customer-portal mental model intact. |
| L3 | **Upgrade now, downgrade later.** Pro→Autopilot: `proration_behavior=always_invoice` (charge the difference today, period unchanged). Autopilot→Pro, or 3-month→monthly: a **Subscription Schedule** that swaps the price at `current_period_end` — the user keeps what they paid for; nothing is refunded (locked). Interval changes monthly→3-month take effect at period end too (a mid-period jump would create a messy prorated quarter). |
| L4 | **Invoices are mirrored** (`invoice` table) from `invoice.created/finalized/paid/payment_failed/voided`. This gives: period start (`period_start`), amount paid (revenue), hosted invoice + PDF URLs (receipts in-app), the first-payment date ("Pro since"), and a realised-margin source. We store URLs, never PDFs. |
| L5 | **Renewal reminders are ours, not Stripe's.** Email + in-app notice **7 days before a 3-month renewal** and **3 days before a monthly renewal** ("$49.99 on Jan 11 · cancel any time before then, one tap"), through the notification engine (U7.1) with kind `BILLING_RENEWAL_SOON`. Surprise renewals are the #1 complaint across the benchmark (`AUDIT-pay.md` §B); the reminder is the honest, cheap answer and satisfies California's reminder rule for longer terms by construction. |
| L6 | **Dunning cadence** (Stripe Smart Retries keep running underneath): T+0 failed → email (exists) + in-app banner; T+3 d → second email ("still Pro, 2 retries left"); T+7 d → final ("Pro ends on {period_end} unless the card is updated"); at `period_end` with no `invoice.paid` → lapse (L7). Every mail has the **portal deep link** (`gateway.createPortalSession` → `flow_data.type=payment_method_update`) so "update card" is one tap. |
| L7 | **Lapse is a state, not an event.** `EntitlementService` already lapses by the clock. B4.4 adds the *experience*: the first signed-in request after lapse gets `plan=FREE, lapsedAt, lapsedFrom=PRO` on `/api/billing/me` once (flag `lapse_notice_pending`), the web shows the "What changed" sheet (resumes intact, AI paused, inbox paused, everything readable), and the extension drawer shows one line. No data is deleted (locked). |
| L8 | **Reactivate without checkout.** A subscription that is `cancel_at_period_end=true` and still inside its period is resumed with `gateway.resumeSubscription(id)` (`cancel_at_period_end=false`) — no new checkout, no new charge, confirmation email. A *lapsed* user goes through checkout again (customer reused; previous invoices still on the customer). |
| L9 | **Price-change notices**: when a catalog price retires in favour of a higher one and subscribers stay grandfathered (D2 in the admin doc), nothing is sent. If the user later decides to migrate existing subscribers (Launch 2 — open question 4), B4.2 sends a **30-day notice** with the new amount and the one-tap cancel, and the migration runs as a schedule at each user's next renewal, never mid-period. |
| L10 | **Replay and reconcile are admin tools that never write money.** B10.1's reconciler reports drift (Stripe says X, mirror says Y); B10.2's replay re-fetches an event by id from Stripe and runs it through the same handler. Both are HIGH-audited. |

## 3. State machine (per user)

```
            checkout.session.completed (binds customer, L: identity only)
                      │
   NONE ──────────────┴────► INCOMPLETE ──(invoice.paid / sub.updated active)──► ACTIVE ◄───────────────┐
    ▲                           │ incomplete_expired                                │                   │
    │                           ▼                                                   │ invoice.payment_failed
    │                         FREE                                                  ▼                   │
    │                                                                           PAST_DUE ──invoice.paid─┘
    │                                                                    (entitled until period_end)
    │                                                                               │ period_end passes / sub.updated unpaid|canceled
    │        sub.updated cancel_at_period_end=true                                   ▼
    └──── LAPSED ◄──────── CANCEL_PENDING ◄──── ACTIVE          LAPSED (Free; row kept; grant ends_at=period_end)
    (resubscribe =          │  resume (L8)  ▲
     new checkout)          └───────────────┘
```

Grant rules (B1.3), evaluated in the same transaction as the row write:
- `ACTIVE` / `PAST_DUE` / `CANCEL_PENDING` → one `STRIPE_SUBSCRIPTION` grant for the product mapped from
  `price_id` (`product_price.stripe_price_id`), `starts_at` = first `invoice.paid`, `ends_at` = NULL while
  active, set to `current_period_end` the moment the status becomes `past_due`, `canceled` or
  `cancel_at_period_end=true`, cleared again on recovery/resume.
- Price switch → the old grant gets `ends_at = switch effective date` and a new grant starts; for an
  upgrade-now both are open for the same instant and "highest wins" makes it seamless.
- `unpaid`, `incomplete_expired` → `ends_at = now`.
- The webhook is the **only writer** of `source=STRIPE_SUBSCRIPTION` (locked); `source_ref = stripe_subscription_id`.

## 4. Data (additive, `20261015000000_billing_v2.xml`)

### 4.1 `subscription` — new columns
`current_period_start TIMESTAMP NULL`, `product_code VARCHAR(40) NULL` (derived from `price_id` at write
time, so the fast path needs no join), `schedule_id VARCHAR(255) NULL` (pending downgrade/interval change),
`scheduled_price_id VARCHAR(255) NULL`, `scheduled_at TIMESTAMP NULL`, `first_paid_at TIMESTAMP NULL`
("Pro since"), `lapsed_at TIMESTAMP NULL`, `lapse_notice_pending BOOLEAN NOT NULL DEFAULT FALSE`,
`cancel_requested_at TIMESTAMP NULL`, `cancel_reason VARCHAR(40) NULL`, `cancellation_number VARCHAR(20) NULL`.

### 4.2 `invoice` (mirror)
`id BIGINT PK`, `user_id FK`, `stripe_invoice_id VARCHAR(255) UNIQUE`, `stripe_subscription_id`, `number
VARCHAR(64)`, `status VARCHAR(20)` (draft|open|paid|void|uncollectible), `billing_reason VARCHAR(40)`
(subscription_create|subscription_cycle|subscription_update|manual), `currency CHAR(3)`,
`amount_due_cents INT`, `amount_paid_cents INT`, `tax_cents INT`, `discount_cents INT`, `period_start`,
`period_end`, `paid_at`, `attempt_count INT`, `next_payment_attempt TIMESTAMP NULL`,
`hosted_invoice_url VARCHAR(1024)`, `invoice_pdf_url VARCHAR(1024)`, `last_event_at`, `created_at`.
Index `(user_id, created_at)`. Org invoices live in `org_invoice` (org doc) — same shape, different owner;
B9.1 routes by scope.

### 4.3 `billing_notice` (what we told the user, for support and for the law)
`id, user_id, kind VARCHAR(40)` (RENEWAL_SOON | PAYMENT_FAILED_1|2|3 | LAPSED | CANCEL_CONFIRMED |
RESUMED | PRICE_CHANGE | PLAN_SWITCHED | RECEIPT), `channel` (EMAIL|IN_APP|PUSH), `ref` (invoice id /
subscription id), `sent_at`, `dedupe_key VARCHAR(120) UNIQUE` (e.g. `RENEWAL_SOON:in_…`). Written by the
notification engine's billing publisher; the admin customer timeline (A2.1) reads it.

### 4.4 `stripe_event` — new columns (some exist since 9.C1)
`scope VARCHAR(10)` (USER|ORG|SERVICE), `replayed_from VARCHAR(255) NULL`, `replayed_by VARCHAR(50) NULL`.

## 5. Webhook v2 routing (extends `applyInTx`)

| event | user scope effect |
|---|---|
| `checkout.session.completed` (mode=subscription) | bind customer (exists); record `consent` fields (B3.2) |
| `customer.subscription.created/updated/deleted` | mirror status, price, period start+end, cancel flags, `schedule`; derive `product_code`; **write grant** (§3); on `cancel_at_period_end` flip → `CANCEL_CONFIRMED` notice if we did not already send it from the in-app cancel path (dedupe key) |
| `invoice.created/finalized` | upsert `invoice` (status open), `period_start/end` |
| `invoice.upcoming` (Stripe sends it `days_until_due`/renewal−N days per dashboard setting; we set 7) | publish `RENEWAL_SOON` for 3-month plans; for monthly, a scheduled job at T−3 d reads `current_period_end` (Stripe's `upcoming` lead time is one setting per account) |
| `invoice.paid` | `invoice.paid`, `amount_paid`, `first_paid_at` if null; status `active`; **clear `ends_at`** on the grant; `RECEIPT` notice (our own receipt email with the plain terms — B3.5) |
| `invoice.payment_failed` | exists; plus `attempt_count`, `next_payment_attempt` → the T+3/T+7 scheduler reads these instead of guessing |
| `customer.subscription.updated` status `unpaid` / `canceled` after retries | grant `ends_at = now` if period already passed; `LAPSED` notice; `lapse_notice_pending=true` |
| `subscription_schedule.*` | mirror `schedule_id`, `scheduled_price_id`, `scheduled_at`; `released`/`completed` → clear |
| `charge.refunded`, `charge.dispute.created` | mirror onto `invoice` (`amount_refunded_cents`, `disputed BOOLEAN`); service refunds (B9.3) use the same path; **no** entitlement change — a refund on a subscription is a support decision made in Stripe and the subscription state follows separately |
| `customer.updated` | nothing (address/tax ids are read live from Stripe when the billing page needs them) |

Events older than `last_event_at` are still dropped (exists); `invoice.*` ordering uses `invoice.last_event_at`.

## 6. Dunning & lapse — the user's timeline

```
Day 0   invoice.payment_failed      email #1 (exists: "nothing switched off") + banner "Update card"
Day 3   scheduler (BillingDunningJob, 09:00 user tz)   email #2 if still past_due: "Still Pro · we retry on {next_payment_attempt}"
Day 7   scheduler                   email #3: "Pro ends {period_end} unless…" + push (if subscribed) 
period_end  EntitlementService lapses by clock; sub.updated unpaid/canceled arrives → LAPSED notice (email: everything kept, 1-tap resubscribe)
+14 d   win-back (B5.4) — only if marketing consent; one email, ever, per lapse
```
Banner copy and the "What changed" sheet are in `checkout-upgrade-cancel-flows.md` §6.

## 7. API additions

```
GET  /api/billing/me                 -> PlanDTO v2: {plan, product, features[], limits{}, usage{aiPct, aiResetsAt, resumes{used,max}}, status,
                                        currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, scheduled{product, at}?, pastDue{attempt, nextAttemptAt}?,
                                        lapse{at, from}? (once), firstPaidAt, billingEnabled, hasCustomer}
GET  /api/billing/invoices           -> [{number, status, amountPaidCents, currency, periodStart, periodEnd, paidAt, hostedUrl, pdfUrl}] newest first, ≤ 36
POST /api/billing/switch {product, interval}   -> upgrade: {url: null, effective: now, chargedCents}; downgrade/interval: {effective: periodEnd}; 409 SAME_PRICE; 402 never (switching is for subscribers)
POST /api/billing/cancel {reason?}   -> {endsAt, cancellationNumber}  (B5.1)
POST /api/billing/resume             -> {renewsAt}                    (B5.2)
POST /api/billing/portal {flow?: "payment_method_update"|"invoices"} -> {url}
POST /api/billing/lapse-notice/ack   -> clears lapse_notice_pending
```
`StripeGateway` gains: `updateSubscriptionPrice(subId, priceId, proration)`, `createSchedule(subId, priceId,
atPeriodEnd)`, `releaseSchedule(id)`, `setCancelAtPeriodEnd(subId, bool)`, `listInvoices(customerId)`,
`createPortalSession(customerId, returnUrl, flow)`, `retrieveEvent(id)` (replay), `listSubscriptions(since)`
(reconciler), `listBalanceTransactions(since)` (realised fees). Still the only class importing `com.stripe.*`.

## 8. Failure modes

| failure | behaviour |
|---|---|
| Upgrade: Stripe price update succeeds, our response fails | the `subscription.updated` webhook writes the switch anyway; the UI polls `/me` (SuccessPoller pattern) |
| Downgrade schedule created, user cancels before it runs | cancel sets `cancel_at_period_end`; schedule stays harmless (released on `subscription.deleted`); UI shows "ends on" not "switches on" — cancel wins |
| `invoice.upcoming` never arrives (dashboard lead time changed) | the T−3/T−7 scheduler is the fallback; both dedupe on `billing_notice.dedupe_key` |
| Renewal reminder sent, then user cancels | nothing more; the cancel confirmation supersedes |
| Stripe retries succeed on day 9 after our "final" email | `invoice.paid` → active, grant `ends_at` cleared, "You're all set" email (RECOVERED) |
| Grant exists but Stripe has no live subscription (bug, manual Stripe edit) | B10.1 reconciler alerts; support ends the grant with an audited revoke; never automatic — "a leak costs $3, a wrong revoke costs a customer" |
| Mirror says PRO, Stripe says canceled months ago (missed webhook) | reconciler fetches `subscriptions.list(customer)` nightly for every row with `status in (active,past_due,trialing)` and `last_event_at < now−36h`; drift → replay the latest event through the handler (HIGH, audited) |
| Two tabs: cancel + switch at once | `POST /switch` refuses (409 CANCEL_PENDING) when `cancel_at_period_end`; resume first |
| User deletes account while `past_due` | existing: immediate cancel + forget events; invoices mirror is kept 7 years under a pseudonymous `user_id` (financial record; B6.4) |

## 9. Security / privacy

Webhook stays `permitAll` + signature; replay/reconcile endpoints are ADMIN + HIGH re-auth. The invoice
mirror holds amounts and URLs, never card data; hosted URLs are Stripe-signed and expire. `billing_notice`
holds no body text (templates are versioned in A7.4). Financial records survive account deletion
pseudonymised (`user_id` kept, join to `jhi_user` gone) for the statutory retention the trust area sets
(default 7 years) — listed in the DSAR export as "invoices" (B6.4).

## 10. Tests

- `BillingWebhookIT` (extend): invoice mirror upserts; `invoice.paid` clears grant `ends_at`; price switch
  writes two grants; schedule events mirror and clear; refund mirrors without entitlement change;
  `unpaid` after period → `lapse_notice_pending`; stale `invoice.*` dropped by invoice ordering.
- `BillingDunningJobTest`: fixtures at T+3/T+7 with/without recovery; dedupe prevents repeats; user tz.
- `RenewalReminderTest`: 3-month at T−7, monthly at T−3, none when `cancel_at_period_end`.
- `BillingServiceTest`: switch rules (upgrade now / downgrade later / same price 409 / cancel-pending 409);
  resume clears flag; cancel sets number and sends once.
- `StripeReconcilerTest`: drift detection matrix; replay goes through `handle()` and records `replayed_from`.
- **Scenario harness (B10.4):** `FakeStripeGateway` + a scripted event stream (`billing-scenarios/*.json`)
  replaying the 12.7 run and the 15.4 test-clock run (failed renewal → lapse) in CI, so the one thing the
  sandbox could not do is covered by a test forever.

## 11. Rollout

B4.1 invoice mirror + period start (no behaviour change) → B1.3 grants written in shadow (compare `isPro`
old/new, log mismatches, 2 weeks) → B4.2 reminders → B4.3 dunning cadence → B4.4 lapse experience → B3.4
switch → B4.5 resume → B10.1/10.2 ops → B5.* cancel (can run in parallel with B4.3+).
