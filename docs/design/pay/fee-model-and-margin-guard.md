# Fee model & margin guard — the one formula every price is checked against (B2.*)

> Area `pay`. Status: design, 2026-10-11. Locked inputs: `CLAUDE.md` → Expansion floors (≥ 80 % subscriptions,
> ≥ 20 % services, nothing unlimited), `ROADMAP.md` → "Cost controls" (lines 1178–1227) and Phase 18.4.
> Reconciles `docs/design/admin/catalog-margin-entitlements.md` §3 (D5: 2.9 % + 30 ¢ only) with
> `docs/design/org/billing.md` §7 (per-invoice allocation). Existing code it extends:
> `api/.../service/billing/StripeProperties.java` (`managedPayments`, `automaticTax`), `AiPolicy.java`
> (`proMonthlyBudgetUsd`, `pro3moBudgetUsd`), `AdminAnalyticsService` (MRR from `amountMonthly/amount3mo`).

## 1. Why this document exists

Three documents today compute "worst-case margin" three different ways, and none of them includes two
fees Stripe actually charges us:

| Source | Fee model | Pro $19.99 result |
|---|---|---|
| `ROADMAP.md` 1215 | 2.9 % + 30 ¢ | 81 % |
| admin catalog doc D5 | 2.9 % + 30 ¢ (+ email cents) | 80.6 % |
| org billing doc §7 | 2.9 % + 30 ¢ ÷ lines + 0.4 % invoicing | n/a (org only) |
| **Stripe pricing page, checked 2026-10-11** | 2.9 % + 30 ¢ **+ 0.7 % Stripe Billing** on recurring volume, **+ 3.5 % Managed Payments** if on, + 0.5 % Stripe Tax if used instead, + 1.5 % international card, + 1 % FX | see §3 |

Source: <https://stripe.com/pricing> (fetched 2026-10-11): "2.9% + 30¢ per successful domestic card
transaction", Billing "Pay-as-you-go is 0.7% of Billing volume", "Managed Payments: 3.5% per successful
transaction, in addition to Payments fees", Tax Basic "0.5% per transaction where you're registered",
"1.5% extra on international cards", "1% extra when conversion is required", disputes "$15.00 per dispute".

`StripeProperties.managedPayments` documents a **user decision (2026-09-21) to use Managed Payments** at
+3.5 %. That decision and the 80 % floor at the locked prices **cannot both hold** (§3). This doc does not
pick — it makes the guard honest and puts the choice in `PLAN-pay.md` open question 1.

## 2. Decisions

| # | Decision |
|---|---|
| F1 | **One `MarginCalculator` in the API** (`service/billing/MarginCalculator.java`), pure, table-driven, used by the catalog publish path, the admin live calculator, the promo-code check, the student/regional price checks and the unit-economics report. Nobody else does margin arithmetic — not the web, not a spreadsheet. |
| F2 | **The fee model is configuration, not constants.** `FeeSchedule` is bound from runtime settings (A5.1) with these keys and defaults: `card_pct=2.9`, `card_fixed_cents=30`, `billing_pct=0.7`, `mor_pct=3.5`, `mor_enabled=false`, `tax_pct=0.5`, `tax_enabled=false`, `intl_pct=1.5`, `fx_pct=1.0`, `intl_share=0.25`, `dispute_cents=1500`, `dispute_rate=0.002`, `email_cents=2`. Changing a number is an audited admin action, never a deploy. |
| F3 | **Worst case = every variable cost spent, at the blended-international fee.** Subscription cost = `ai_budget + card + billing + (mor or tax) + intl_share × (intl + fx) + dispute_rate × dispute + email`. "Worst" on AI (100 % of budget), "expected" on the geographic mix — a 100 %-international assumption would fail every price and tell us nothing. The admin page shows both **worst** (guard) and **typical** (AI at the p50 of the ledger) so nobody mistakes one for the other. |
| F4 | **Fixed fees are allocated per invoice, by amount share.** For an individual subscription the invoice has one line, so the 30 ¢ lands on it whole. For org invoices (≥ 2 lines in practice: the guard assumes the item sits next to one Pro seat) the 30 ¢ is split by amount share. This is the org designer's rule made exact; it is why the $9.99 AI Interview Practice item passes (§3.4) — and only just. |
| F5 | **The floor is tested on the price the customer pays, after every discount that can apply.** A promo code, a student price or a regional price is checked at its own net amount with its own AI budget. Discounts that break the floor are refused at creation, not discovered in the P&L. Consequence: **percentage coupons on Pro are nearly impossible** at $19.99 (§3.5) — discounts have to be *products with smaller budgets*, see `discounts-regional-student.md`. |
| F6 | **Services: margin = (net − payout − fees − ai) / net ≥ 20 %**, net = list × (1 − subscriber discount) — unchanged from the admin doc. |
| F7 | **A one-time fee (org setup, top-up) is checked at ≥ 80 % after fees only** (no AI unless the product carries a budget, as a top-up does). |
| F8 | **The guard never raises an AI budget to pass.** When a price fails, the admin sees three levers in order — raise the price, lower the budget, override with a reason — and the override is HIGH-audited (`CATALOG_MARGIN_OVERRIDE`). Lowering a budget below the ledger p95 for that product shows a warning ("8 % of users would hit the cap"). |

## 3. Worked examples (cents; `FeeSchedule` defaults; `intl_share` 0.25 ⇒ +0.625 % blended; dispute 0.2 % × $15 = 3 ¢; email 2 ¢)

### 3.1 Standard card + Billing, no Managed Payments (recommended baseline)

| Price | AI budget | card | billing 0.7 % | intl/fx blend | dispute+email | total cost | **margin** |
|---|---|---|---|---|---|---|---|
| Pro $19.99 | 300 | 88 | 14 | 12 | 5 | **419** | **79.0 %** ✗ |
| Pro $49.99 / 3 mo | 800 | 175 | 35 | 31 | 5 | **1046** | **79.1 %** ✗ |
| Autopilot $39.99 | 600 | 146 | 28 | 25 | 5 | **804** | **79.9 %** ✗ (0.1 pt) |
| Autopilot $99.99 / 3 mo | 1600 | 320 | 70 | 62 | 5 | **2057** | **79.4 %** ✗ |
| Pro L2 $24.99 | 300 | 102 | 17 | 16 | 5 | 440 | **82.4 %** ✓ |
| Pro L2 $54.99 / 3 mo | 800 | 189 | 38 | 34 | 5 | 1066 | **80.6 %** ✓ |

Without the blended-international and dispute lines (the ROADMAP's model plus Billing 0.7 %): Pro $19.99 →
79.9 %, $49.99 → 79.8 %, Autopilot $39.99 → 80.6 %, $99.99 → 80.1 %.

**Reading:** at Launch-1 prices the subscriptions sit *at* the floor, not above it; the 0.7 % Billing fee
alone pushes Pro monthly under by a tenth of a point. The Launch-2 prices pass comfortably. The floor was
locked with the ROADMAP's 2.9 % + 30 ¢ model; this doc does not change prices — it reports the honest
number and lets the user decide (open question 1) whether the floor is measured with the baseline fee set
(then Launch-1 Pro fails by ~1 pt and needs either the Launch-2 price sooner or a $2.75 AI budget) or with
the ROADMAP's simpler model (then everything passes as recorded).

### 3.2 Managed Payments on (+3.5 %, replaces Stripe Tax and dispute fees)

| Price | AI | card+billing | MoR 3.5 % | intl/fx blend | total | **margin** |
|---|---|---|---|---|---|---|
| Pro $19.99 | 300 | 102 | 70 | 12 | 486 | **75.7 %** ✗ |
| Pro $49.99 | 800 | 210 | 175 | 31 | 1218 | **75.6 %** ✗ |
| Autopilot $39.99 | 600 | 174 | 140 | 25 | 941 | **76.5 %** ✗ |
| Autopilot $99.99 | 1600 | 390 | 350 | 62 | 2404 | **76.0 %** ✗ |
| Pro L2 $24.99 | 300 | 119 | 87 | 16 | 524 | **79.0 %** ✗ |
| Pro L2 $54.99 | 800 | 227 | 192 | 34 | 1255 | **77.2 %** ✗ |

**Every locked price fails the 80 % floor with Managed Payments on.** It is a merchant-of-record product
(it carries global VAT/sales-tax liability, fraud and disputes), which has real value, but at a $19.99
price point its 3.5 % costs more than the AI budget headroom allows. Options for the user, none taken here:
(a) Managed Payments off, Stripe Tax Basic on (0.5 %) — §3.3; (b) keep it and measure the floor *before*
MoR, treating the 3.5 % as "tax + dispute handling" rather than a payment fee; (c) raise the AI headroom by
moving to the Launch-2 prices at launch. `StripeProperties.managedPayments` defaults to `null`
("leave the account's setting"), so **the launch checklist (B0.6) must check which state the live account is
in** — today nobody knows.

### 3.3 Standard card + Billing + Stripe Tax Basic (0.5 %)

Pro $19.99: 419 + 10 = 429 → **78.5 %**; Pro L2 $24.99: 440 + 12 = 452 → **81.9 %** ✓; Autopilot $39.99:
804 + 20 = 824 → **79.4 %**. Stripe Tax is only charged where we are registered to collect, so at launch
(US nexus in a handful of states at most) the effective rate is a fraction of 0.5 %. The guard takes
`tax_enabled` + `tax_share` (default 0.3) for that reason.

### 3.4 Org AI Interview Practice at $9.99 (the dispute the org designer found)

Naive (whole 30 ¢ on the line): 150 + 29 + 30 + 7 + 6 + 5 = 227 → **77.3 %** ✗ (the org doc's 78.1 %).
Per-invoice allocation (F4), conservative 2-line invoice next to one Pro seat: amount share =
9.99 / 34.98 = 28.6 % ⇒ fixed 9 ¢: 150 + 29 + 9 + 7 + 6 + 5 = 206 → **79.4 %** ✗ still.
With the org invoice's realistic shape (setup fee already paid, ≥ 5 seats on the invoice, share ≤ 10 %
⇒ 3 ¢) and intl share 0 (US orgs pay by domestic card/ACH): 150 + 29 + 3 + 7 + 5 = 194 → **80.6 %** ✓.

**Reconciliation:** the org doc's conclusion ("$9.99 stands under per-invoice allocation") holds only under
its optimistic assumptions. The guard will show the item at **79–81 % depending on the fee schedule**. Two
clean fixes, either a one-line catalog change: price **$10.99** (margin 82.5 % at the conservative
assumption) or budget **$1.25** (81.9 %). Recorded as open question 3; until decided, the seed keeps
$9.99 / $1.50 and the guard will require the override reason on publish — which is the guard doing its job.

### 3.5 Why a percentage coupon on Pro breaks

`PROMO20` (20 % off, 3 months) on Pro $19.99 → net $15.99; cost = 300 + card 76 + billing 11 + blend 10 +
5 = 402 → **74.9 %** ✗. Even 10 % off (net $17.99) → 76.7 % ✗. A promo can only pass if it is sold as a
product with a smaller budget (a "Pro Starter" at $14.99 with a $2 budget → 80.3 % ✓) or as a **fixed
amount off the quarterly plan** ($5 off $49.99 → net $44.99, cost 1046 − 18 = 1028 → 77.2 % ✗ — still no).
Conclusion: **at Launch-1 prices there is no coupon that passes the floor on Pro.** Promo codes at Launch 1
are therefore limited to services (20 % floor leaves room) and to the Launch-2 Pro price ($24.99 with
10 % off → net $22.49 → 80.0 %, borderline). This is a finding, not a recommendation to change prices.

### 3.6 Services (unchanged, for completeness)

Resume review $79, payout $50, subscriber discount 10 % → net 7110; fees card 236 + billing 0 (one-time)
+ blend 44 + dispute 3 → 283; margin = (7110 − 5000 − 283) / 7110 = **25.7 %** ✓. Mock interview $129 /
$85 → net 11610, fees 367 + 73 + 3 → (11610 − 8500 − 443) / 11610 = **23.0 %** ✓. Coaching $119 / $80 →
net 10710, fees 341 + 67 + 3 → **21.9 %** ✓ (1.9 pt headroom — a payout raise to $85 fails).

## 4. API

```
GET  /api/admin/catalog/margin?kind=SUBSCRIPTION|SEAT|SERVICE|FEE|TOPUP&amountCents=&aiBudgetCents=&payoutCents=&discountPct=&audience=INDIVIDUAL|ORG&invoiceLines=1
     -> { worst: {marginPct, costCents, lines:[{key, cents}]}, typical: {marginPct, aiP50Cents}, floorPct, ok, headroomPt }
GET  /api/admin/catalog/fee-schedule          -> the active FeeSchedule + who changed it last (A5.1 runtime setting `billing.fees`)
PUT  /api/admin/catalog/fee-schedule          -> ADMIN|FINANCE; HIGH; re-evaluates every active price and lists the ones that fall below the floor
POST /api/admin/catalog/prices/{id}/publish   -> 422 MARGIN_BELOW_FLOOR {marginPct, floorPct, levers:[...]} unless overrideReason (≥ 20 chars)
```

`MarginCalculator.evaluate(PriceSpec, FeeSchedule, Floors) -> MarginResult` is the pure core; the web form
calls the GET with a 300 ms debounce (admin A3.4 already specifies the UI).

## 5. Data

No new tables beyond the catalog (`docs/design/admin/catalog-margin-entitlements.md` §2). Two column
additions on `product_price`: `margin_pct_typical DECIMAL(5,2)` next to the existing `margin_pct_worst`,
and `fee_schedule_version INT` so a stored margin can be re-read against the schedule it was computed
with. `catalog_change` records fee-schedule edits with `entity='fee_schedule'`.

## 6. Realised margin (B2.4) — closing the loop

The guard predicts; `UnitEconomicsReport` measures. Nightly, per product and billing period: revenue from
the `invoice` mirror (B4.1, `amount_paid_cents` net of refunds), AI spend from the metering ledger
(`ai_usage`, grouped by the user's grant source), Stripe fees from `balance_transaction.fee` (one
`gateway.listBalanceTransactions(since)` call, mirrored into `stripe_fee_daily`). Output: a row per
product per period → `metric_daily` keys `margin.realised.{product}`, `ai.cap_hit_pct.{product}`,
`fees.effective_pct`. The admin unit-economics page (A2.8) reads these; a realised margin under the floor
for two consecutive periods raises the "decide with data" banner (ROADMAP 1207) — never a silent cap change.

## 7. Failure modes

| failure | behaviour |
|---|---|
| Fee schedule edited to nonsense (card_pct = 0) | bounds in the settings registry (0–15 %, 0–100 ¢); edit is HIGH and shows the before/after margin table |
| Stripe changes fees | a runtime-setting edit + the re-evaluation list; the realised report (§6) catches it first |
| Price passes at publish, fails later because the budget was raised | `product_entitlement` edits re-run the guard for every active price of that product; a failing price blocks the budget edit without an override |
| Realised margin disagrees with predicted by > 5 pt | report flags the product; usual causes: international share above `intl_share`, disputes, refunds for services |

## 8. Tests

`MarginCalculatorTest` — table-driven with every row of §3 (asserting the exact cents and the pass/fail);
boundary 79.99 fails / 80.00 passes; per-invoice allocation with 1, 2 and 10 lines; `mor_enabled` flips
every Launch-1 row to fail; coupon on Pro fails, product-with-smaller-budget passes.
`FeeScheduleSettingsTest` — bounds, audit row, re-evaluation list. `CatalogResourceIT` — publish below
floor → 422 with `levers`; with reason → 201 + `CATALOG_MARGIN_OVERRIDE` audit. `UnitEconomicsReportTest`
— fixture invoices + ledger → realised margin; two periods under floor → banner metric set.

## 9. Rollout

B2.1 calculator + schedule (no UI) → B2.2 wired into publish (catalog B1.x) → A3.4 admin page shows it →
B2.3 cap-hit metric → B2.4 realised report after the invoice mirror (B4.1) exists.

## 10. Wireframe — admin price editor, 390 px (extends the admin doc's)

```
┌──────────────────────────────┐
│ ← Pro · Monthly (new price)  │
│ Amount        [$ 19.99     ] │
│ AI budget     $3.00  (Pro)   │
│ Fees (sched. v3)   −$1.19    │
│   card 2.9%+30¢    $0.88     │
│   billing 0.7%     $0.14     │
│   intl/fx blend    $0.12     │
│   disputes+email   $0.05     │
│ ─────────────────────────────│
│ Worst-case  ███████████░ 79.0%│  <- red: 1.0 pt BELOW the 80 % floor
│ Typical (AI p50 $0.41) 92 %  │
│ Levers: price ≥ $20.99 ·     │
│         budget ≤ $2.79 ·     │
│         override (reason)    │
│ [ Save draft ] [ Publish… ]  │
└──────────────────────────────┘
```
