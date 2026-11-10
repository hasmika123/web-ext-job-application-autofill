# 27 — Subscription lifecycle: org billing and license state machines, quotes → changes, mid-cycle rules, dunning, refunds

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-019 and the Phase 12 locks (`past_due`
> keeps access until the paid period ends; **no trial; no refunds, cancel anytime**). Build-ready for
> **X5.4** (Kiwiply side), **X6.7** (Stripe side), **X6.8** (dunning). E11 default (a) applied.
> Escalations C1 (enterprise refunds/credits) and C2 (suspension billing) sit in `08-decisions-for-user.md`.

## 1. Org billing account — state machine

```
NONE ──setup fee paid (webhook)──► ACTIVE ──invoice.payment_failed──► PAST_DUE ──invoice.paid──► ACTIVE
                                     ▲                                     │ Stripe gives up (status unpaid/canceled)
                                     │ invoice.paid (new period)           ▼
                                     └─────────────────────────────── SUSPENDED ──org closed──► CLOSED
```
| State | Licenses | Feature use | Quotes | Reads/billing pages |
|---|---|---|---|---|
| NONE (DRAFT/PENDING_SETUP_FEE org) | none allowed | — | refused `409 ORG_STATE` | billing page shows the setup-fee card |
| ACTIVE | all | yes | yes | yes |
| PAST_DUE | kept | **yes while `now < paid_through_at`**, then `SUBSCRIPTION_STATE` | removals/cancels only (`PAST_DUE_REMOVE_ONLY`) | yes, with the "payment overdue" banner |
| SUSPENDED | all `ENDED(ORG_SUSPENDED)` | no | refused | yes; "pay the open invoice to resume" |
| CLOSED | all `ENDED(ORG_CLOSED)` | no | refused | read-only invoices for 7 years |

`organization.status` mirrors the account (`PAST_DUE`/`SUSPENDED` already exist in `OrgStatus`).
Re-activation from SUSPENDED after `invoice.paid` re-creates licenses as **new rows** copied from the
rows ended by the suspension (feature set preserved, `starts_at=now`, new price ids = current catalog;
the org is told if any price changed) — history stays honest.

## 2. Mid-cycle rules (the whole table)

| Change | Kiwiply effect | Stripe effect | Money |
|---|---|---|---|
| create license / add feature / quantity up / apply preset | now (`PENDING` only if future-dated or member INVITED) | item quantity +n now, proration none | Kiwiply proration invoice item (22 §6) on the next invoice; recurring from next period |
| upgrade base | new base now; old base `ends_at = period_end` | new item +1 now; old item −1 now (no proration) | proration of the new base only; old base already paid |
| remove feature / quantity down | row `ends_at = period_end` (feature keeps working) | item −n **now**, proration none | nothing; next invoice excludes it |
| cancel license | `CANCEL_AT_PERIOD_END`, `ends_at = period_end` | base and all feature items −1 now | nothing |
| suspend (admin) | `SUSPENDED`, entitlement off now, `paid_through_at` stored | items −1 now | nothing (C2: no credit, by the no-refund rule) |
| reactivate from CANCEL_AT_PERIOD_END before `ends_at` | `ACTIVE`, `ends_at=null` | items +1 now, proration none | nothing (already paid) |
| reactivate from SUSPENDED while `now < paid_through_at` | `ACTIVE` | items +1 now | nothing |
| reactivate after `paid_through_at` | treated as a new add | items +1 | prorated from now |
| cancel a pending removal | row `ends_at=null` | item +n now, none | nothing |
| member leaves/removed/erased | `ENDED` now, features off now | items −n now | nothing (documented in the org terms) |
| org PAST_DUE → paid | no change | — | — |
| contract/discount/tier change | nothing mid-period | coupon re-sized for the next period | next invoice |
| price retired in the catalog | nothing | nothing (item stays on the retired price) | unchanged until the license changes |

Every row above is a `license_change` with `effective_at` = now or `period_end_at`, and every
change was first a `license_quote` the admin saw (shortcuts create and confirm a one-line quote in
the same call, still stored).

## 3. License state machine (full)

| From | Event | To | Guard |
|---|---|---|---|
| — | confirm CREATE, member ACTIVE, effective now | ACTIVE | org ACTIVE |
| — | confirm CREATE, member INVITED or future `effective_at` | PENDING | |
| PENDING | member accepts / `effective_at` reached (`LicenseLifecycleJob`) | ACTIVE | |
| PENDING | invite expires / member removed / admin cancels | ENDED(`REMOVED`) | items −1 (was billed from confirm — the Licenses page warns "billed while waiting on the invite") |
| ACTIVE | admin suspend (reason) | SUSPENDED | `licenses.manage` |
| ACTIVE | admin cancel | CANCEL_AT_PERIOD_END | |
| ACTIVE | member leaves/removed/erased · org SUSPENDED/CLOSED | ENDED(reason) | |
| SUSPENDED | reactivate | ACTIVE | |
| SUSPENDED | `ends_at` (= `paid_through_at`) passed and not reactivated | stays SUSPENDED (billing already stopped); after `enterprise.license.suspended_max_days` (90) → ENDED(`REMOVED`) | job |
| CANCEL_AT_PERIOD_END | reactivate before `ends_at` | ACTIVE | |
| CANCEL_AT_PERIOD_END | `ends_at` reached | ENDED(`REMOVED`) | job |
| ENDED | — | terminal; a new license is a new row | |

`license_feature`: `live` until `ends_at`; removal rows are flipped by `OrgPeriodRolloverJob`/`LicenseLifecycleJob` at `ends_at` (same instant the entitlement stops).

## 4. `paid_through_at` (the one timestamp that makes PAST_DUE exact)
- Account level: set on every `invoice.paid` to that invoice's `period_end`; in LOCAL mode = calendar month end.
- License level: set on suspend/cancel to the account's `paid_through_at` at that moment (so a reactivation knows whether the time was paid for).
- Entitlement step 3/11 uses the account value; the quote's "effective at period end" uses `current_period_end` (they coincide when the org is paid up).

## 5. Dunning and grace (E11 answered by default (a); Stripe Smart Retries configured in the dashboard, ~3 weeks)
1. `invoice.payment_failed` → PAST_DUE; email to billing contacts and OWNER/ADMIN/FINANCE notifications: "Invoice {n} for {amount} is overdue. Nothing is switched off until {paid_through_at}." (template `orgPaymentFailed.html`), repeated at each retry (Stripe fires the event per attempt).
2. While PAST_DUE and before `paid_through_at`: everything works; the Subscription Overview shows the banner and a "Pay now" link to the hosted invoice page.
3. `paid_through_at` passed and still PAST_DUE: feature use → 402 `SUBSCRIPTION_STATE{PAST_DUE_LAPSED}`; consultants see "Your organisation's plan is paused — your own Kiwiply plan is unaffected"; reads, billing, exports continue.
4. Stripe marks the subscription `unpaid`/`canceled` → SUSPENDED (§1); licenses ENDED; the Stripe subscription is left as Stripe left it (unpaid keeps the invoice open; our next activation creates a new subscription if needed).
5. `invoice.paid` at any point → ACTIVE (+ re-creation when coming from SUSPENDED).
Settings: `enterprise.billing.days_until_due` (15), `enterprise.billing.past_due_reminder_days` (`[3,7,12]` — Kiwiply reminders in addition to Stripe's emails, sent by `DunningReminderJob` to billing contacts; never to consultants).

## 6. Cancellation of the whole org subscription
"Cancel our subscription" = cancel every license (period end) through one BULK quote; the Stripe
subscription reaches zero items → `cancel_at_period_end`. Closing the org (`org.close`, existing
flow) ends everything now and cancels the Stripe subscription immediately (no credit; the confirmation
lists who loses what). The Stripe Customer Portal for orgs is configured **without** cancel (billing.md §9).

## 7. Refunds and credits (locked: no refunds, cancel anytime)
- Kiwiply never refunds a subscription charge. Removal at period end is the mechanism (nobody loses time they paid for).
- `refundPaymentIntent` exists only for the duplicate-setup-fee case (billing.md §8), platform admin, audited.
- Enterprise contracts sometimes require **credits** (service failure, contractual SLA). This is **escalation C1**: safe default = no credits; the gateway method `creditCustomerBalance` ships behind `enterprise.billing.credits=false`, platform-admin only, two-person rule, HIGH audit, and shows on the org's Billing & Invoices page as "Credit applied by Kiwiply: {reason}". No code path issues a credit automatically.

## 8. Quote → confirm, as a sequence (ADR-019, exact)

```
Org admin (Configure License)                 API                                        Stripe
 ── POST /licenses/quotes {lines, confirmedCommercialDeps} ─►  PricingEngine → license_quote OPEN (expires +15 min)
 ◄── LicenseQuoteDTO (22 §8) ─────────────────────────────────
 [admin reviews; UI shows every field; COMMERCIAL deps need the confirmation dialog, 28 §9]
 ── POST /licenses/quotes/{id}/confirm  Idempotency-Key ──►  verify OPEN, not expired, inputs_hash/catalog/contract match
                                                             tx: license rows + license_feature rows + license_change rows (PENDING→APPLYING), quote APPLIED, audit HIGH, notifications
                                                             LicenseChangeApplier (sync when Stripe on; LOCAL otherwise) ──items/invoice items/coupon──► (keys 26 §8)
 ◄── ChangeBatchDTO {batchId, changes[], applied, failed, stripe: {itemsAfter, couponMinor}} ─
 [failed lines: UI shows "Billing sync pending — nothing else to do"; retry job; reconciler]
```
Entitlements are effective the instant the Kiwiply transaction commits (step 7 of `check()` reads
the rows), i.e. **before** Stripe acknowledges — acceptable because the keys make the Stripe side
converge (26 §4 step 6) and the reconciler reports if it does not.

## 9. Jobs (all idempotent, ShedLock-ready, tenant MDC per org)
`LicenseLifecycleJob` (every 5 min: PENDING→ACTIVE at effective_at; CANCEL_AT_PERIOD_END→ENDED and feature rows `live=false` at `ends_at`; SUSPENDED expiry) · `LicenseChangeRetryJob` (5 min) · `OrgPeriodRolloverJob` (on `invoice.upcoming` and nightly as backstop: coupon/tier for the next period) · `ContractLifecycleJob` (nightly) · `DunningReminderJob` (daily) · `OrgSeatReconciler` (nightly) · `UsageSweeperJob` (60 s) · `QuotePurgeJob` (daily: OPEN → EXPIRED after `expires_at`; delete non-applied quotes after 90 days).

## 10. Tests
`LicenseStateMachineTest` (every row of §3 incl. guards), `MidCycleRulesTest` (every row of §2 — asserts the Kiwiply rows, the `ItemQuantity` list sent to the gateway, and the money: proration present only for adds/upgrades/late reactivations), `PaidThroughTest` (PAST_DUE before/after), `DunningIT` (webhook sequence of §5 with the LOCAL and the Stripe fixtures), `OrgReactivationTest` (new rows, price changes reported), `QuoteConfirmIT` (stale/expired/idempotent; sequence §8 with a failing gateway → FAILED + retry).
