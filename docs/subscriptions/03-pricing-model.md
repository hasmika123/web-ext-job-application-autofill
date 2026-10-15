# 03 — Pricing model: base + add-ons, per-seat, monthly/quarterly/annual, discounts, proration, margin guard

> Status: design, 2026-10-15 (Fable). Extends `docs/enterprise-v2/22-pricing-calculation.md` (precedence,
> rounding, proration, golden tables G1–G14 — **all still valid**) and `docs/design/pay/
> fee-model-and-margin-guard.md` (fee schedule). Money is `long` minor units + ISO currency; percentages
> are basis points; the only rounding function is `Minor.mulDivHalfEven` (22 §1). **Annual billing is an
> admin-switchable option that defaults OFF** (`decisions-for-user.md` S-01); every annual rule below is
> inert until `billing.annual.enabled=true`.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| `interval` | `MONTH` · `QUARTER` · `YEAR` · `ONE_TIME`. Factor `f(MONTH)=1, f(QUARTER)=3, f(YEAR)=12`. |
| `unit_list(product, audience, interval, currency, at)` | the active `product_price` row amount (22 §2) |
| component | a `plan_component` of the plan version the customer is on (02 §3.2) |
| line | one priced component on a subscription: `(price_id, quantity)`; for orgs one line per seat per component |
| `plan_total` | the recurring amount of one individual subscription or one org subscription per interval |
| `seat_total` | the recurring amount of one consultant license (seat base + seat add-ons) |

## 2. Settings (all admin-configured, registry keys; defaults are safe)

| key | type / range | default | risk | used by |
|---|---|---|---|---|
| `catalog.stripe.pct_bp`, `catalog.stripe.fixed_cents`, `catalog.stripe.invoicing_bp` | exist / new (0–200) | 290 / 30 / 40 | LOW | guard |
| `billing.fees.schedule` (B2.1 `FeeSchedule`: `billing_pct_bp` 70, `mor_enabled` false, `tax_enabled` false, `intl_share_bp` 2500, …) | JSON | as B2.1 | HIGH | guard, when `billing.fees.model = SCHEDULE` |
| `billing.fees.model` | `SIMPLE` \| `SCHEDULE` | `SIMPLE` (290 bp + fixed, the model the locked prices were set with) | HIGH | guard — **S-11** |
| `catalog.margin_floor_subscription_pct` / `_service_pct` | exist | 80 / 20 | HIGH | guard |
| `catalog.org_above_individual_pct` | 0–100 | 25 | MEDIUM | preset check (21 §5) |
| `billing.intervals.individual` | subset of MONTH,QUARTER,YEAR | `["MONTH","QUARTER"]` | HIGH | plan builder, public catalog |
| `billing.intervals.org` | subset | `["MONTH"]` (E17) | HIGH | same |
| `billing.annual.enabled` | bool | **false** | HIGH | everything annual (S-01) |
| `billing.annual.default_discount_bp` | 0–3000 | 1000 | HIGH | derived YEAR prices (§5) |
| `billing.annual.allowance_period` | `MONTH` \| `PERIOD` | `MONTH` | HIGH | allowances and AI budget on annual terms (S-10) |
| `billing.annual.switch_to_monthly` | `AT_TERM_END` | `AT_TERM_END` (only value; placeholder for S-04) | HIGH | interval switch |
| `billing.annual.seat_transfer_free` | bool | true | MEDIUM | org seat transfer (§6.4) |
| `billing.quote.ttl_minutes` | 1–240 | 15 | LOW | personal quotes (org: `enterprise.quote.ttl_minutes`, exists) |
| `billing.future_dated_max_days` | 0–60 | 30 | LOW | future-dated changes |
| `enterprise.license.max_seats` | 1–5000 | 500 | MEDIUM | seat rules |
| `billing.proration.authority` | `KIWIPLY` | `KIWIPLY` (C10) | HIGH | engine; Stripe `proration_behavior=none` always |
| `billing.default_currency`, `billing.currencies` | ISO list | USD, `["USD"]` (C4) | HIGH | catalog |

## 3. Per-unit effective price (precedence — 22 §3 unchanged, stated for both worlds)

```
unit_list      = product_price(product, audience, interval, currency, at).amount_minor      -- YEAR rows per §5
unit_contract  = ORG only: contract row REPLACES (override_amount_minor) or REDUCES (pctOff by override_pct_off_bp)
unit_discount  = ORG: the one best eligible org_discount (23 §5), skipped under a non-stackable contract
               | INDIVIDUAL: list (promotional coupons are applied by Stripe at checkout and mirrored; the
                 guard validated them on the NET price at creation, B7.1 — never computed by the engine)
unit_effective = ORG: volume tier pctOff when (uncontracted || contract.volume_applies)   | INDIVIDUAL: unit_discount
```
No double discounts (22 §3 rules 1–5). **The annual discount is not a discount in this chain: it is the
YEAR list price** (§5). So list → contract → one promo → tier stays exactly one chain, and an annual
contract row overrides the annual list price like any other.

## 4. Totals

### 4.1 Individual
```
base_line        = unit_effective(plan.base_product, INDIVIDUAL, interval)                          (0 for FREE)
addon_line(a)    = unit_effective(a.product, INDIVIDUAL, interval) × quantity(a)                    (quantity ≤ max_quantity)
plan_total       = base_line + Σ addon_line
ai_window_cents  = plan_version.ai_budget_cap_cents × f(interval)  +  Σ a.ai_budget_cents × quantity(a) × f(interval)
```
Annual `ai_window` is spent in 12 monthly sub-windows when `billing.annual.allowance_period=MONTH`
(default): the monthly budget is `cap + Σ addon budgets`, resetting each calendar month of the term —
the worst case per term is identical, the cash-flow risk is bounded month by month.

### 4.2 Organization
```
seat_total(s)    = unit_effective(seat_base) + Σ unit_effective(addon) × quantity          (per consultant_license s, 22 §4)
module_lines     = Σ org_module_license unit_effective × quantity                           (FEE components with a quantity basis)
platform_fee     = unit_effective(plan.platform_fee_product, ORG, interval)                 (0 when the plan has none — the default)
org_recurring    = platform_fee + Σ seat_total + module_lines
setup_fee        = unit_list(ORG_SETUP_FEE, ORG, ONE_TIME)                                   (once, before activation — E3)
first_invoice    = setup_fee (own invoice) ; then org_recurring + prorations on the subscription invoice
discount_total   = Σ (unit_list − unit_effective) × quantity                                (the amount-off coupon, 26 §5)
```

### 4.3 Monthly-equivalent and savings (display only; computed server-side, never in the web)
```
monthly_equiv(interval)  = mulDivHalfEven(total(interval), 1, f(interval))      -- "≈ $17.99/mo billed yearly"
savings_vs_monthly       = total(MONTH) × f(interval) − total(interval)          -- "save $35.97 a year"
savings_pct_bp           = mulDivHalfEven(savings, 10000, total(MONTH) × f(interval))
```
Both are fields of the quote DTO (`monthlyEquivalentMinor`, `savingsMinor`, `savingsBp`).

## 5. Annual prices (only when `billing.annual.enabled`)

### 5.1 Where the annual price comes from (precedence, highest first)
1. An **explicit** `product_price` row with `billing_interval=YEAR` (`annual_source=EXPLICIT`) — admin typed it.
2. A **derived** row the plan builder creates at publish (`annual_source=DERIVED`, `derived_from_price_id` =
   the MONTH row), amount = `mulDivHalfEven(month_amount × 12, 10000 − disc_bp, 10000)` where
   `disc_bp = plan_component.component_discount_bp ?? plan_version.annual_discount_bp ?? billing.annual.default_discount_bp`.
3. No MONTH row → the component is not sellable annually → the plan cannot list YEAR in `intervals_json`
   (invariant 02 §7.1).

Derived rows are **real, immutable price rows** (with their own Stripe Price, 07 §3) so invoices, quotes
and grandfathering work the same way for every interval. Changing the discount = publishing a new plan
version with new derived rows; existing subscribers keep theirs.

### 5.2 Rules
- All lines of one subscription share one interval (Stripe constraint): add-ons on an annual plan are
  priced from their YEAR rows; an add-on with no YEAR row is not offered to annual subscribers (the
  picker says "monthly plans only").
- QUARTER rows stay explicit (today's $49.99 is not 3 × $19.99 × 0.83); the derivation rule is for YEAR only.
  Admin may still type an explicit YEAR amount (rule 1) — the builder shows the implied discount and runs
  the guard either way.
- The guard runs on every YEAR row with `ai = ai_cents × 12` (§7). **At the locked Launch-1 prices the
  simple fee model allows at most an 11.5 % annual discount on Pro and 11.9 % on Autopilot** (§8.3); the
  builder shows the maximum passing discount per component as a lever.
- Allowances on annual terms: `allowance_period=MONTH` (default) — every per-period allowance resets
  monthly; `PERIOD` would pool 12× for the year (S-10 default MONTH).
- Mid-term adds are prorated on the **annual** unit over the remaining seconds of the term (§6.1);
  removals/downgrades take effect at **term end**; annual → monthly switches at term end (S-04); monthly
  → annual switches at the next monthly renewal (no partial-period mixing, no credit).

## 6. Mid-cycle changes and proration (22 §6 is the authority; extended)

### 6.1 Formula (both worlds, every interval)
```
period_seconds    = epoch(period_end) − epoch(period_start)         -- the subscription's current period (MONTH, QUARTER or YEAR)
remaining_seconds = max(0, epoch(period_end) − epoch(effective_at))
proration(line)   = mulDivHalfEven(unit_effective × quantity_added, remaining_seconds, period_seconds)   -- additions and upgrades only
proration_total   = Σ proration(line)                                                                      -- removals, downgrades, cancels: 0
```
Quote stores `proration_estimate_minor`; confirm recomputes at confirm time and the result is ≤ the estimate
(22 §6). Stripe never prorates (`proration_behavior=none`); Kiwiply writes one invoice item per addition
(26 §4 step 3), also for individuals (07 §4).

### 6.2 The change table (individual; org rows are 27 §2 unchanged)

| Change | Kiwiply effect | Stripe effect | Money |
|---|---|---|---|
| add add-on / quantity up | `subscription_addon` row now | item +n now, proration none | Kiwiply proration invoice item; recurring from next period |
| remove add-on / quantity down | `ends_at = period_end`, works until then | item −n **now**, none (C9 rule) | nothing; next invoice excludes it |
| upgrade plan (Pro → Autopilot), same interval | new base now, old base `ends_at = period_end` | base item swapped now (old −1, new +1), none | proration of the **difference** (new base proration − 0; the old base is already paid — no credit); add-ons not in the new plan's INCLUDED set stay as lines; add-ons now INCLUDED are ended at period end with a notice |
| downgrade plan | scheduled at period end | item swap at period end (`subscription_change` PENDING, applied by `PersonalLifecycleJob`) | nothing |
| interval MONTH → QUARTER/YEAR | scheduled at period end | new-interval items replace at period end (a new Stripe subscription when Stripe refuses an in-place interval change — `07` §2.3) | nothing today; the first long-interval invoice at period end |
| interval YEAR → MONTH | scheduled at **term end** | as above at term end | nothing (no refund, S-04) |
| cancel | `cancel_at_period_end` (exists) | exists | nothing |
| plan version migration (admin sunset) | only on customer confirm, at period end | item swap at period end | nothing |

### 6.3 Org seats on annual terms
Seat add = prorated on the annual unit (§6.1); seat remove = term end; **seat transfer** (`license_change.kind
= TRANSFER`, `billing.annual.seat_transfer_free=true`): the old license ENDS now, a new license with the
same component set starts now on the same paid lines, Stripe quantities unchanged, proration 0, HIGH audit
with both members. Transfer is also allowed on monthly terms (it is simply free). A transfer may not change
the component set (that is a transfer + a quote).

### 6.4 Future-dated changes
`effective_at ≤ now + billing.future_dated_max_days`; prorates from that date (22 §6).

## 7. The margin guard (one formula, every price, every composition)

### 7.1 Inputs
`p` = amount_minor of the price row; `ai` = worst-case AI cost for the row's interval = `ai_budget_cents ×
f(interval) × quantity` (plan base: `plan_version.ai_budget_cap_cents × f`); fees from the active fee model
(`billing.fees.model`): SIMPLE → `pct_bp=290`, `fixed=30`, `invoicing_bp=40` on `send_invoice` (orgs);
SCHEDULE → B2.1's `FeeSchedule` (card + billing + optional MoR/tax + intl blend + disputes + email).

### 7.2 Formula (21 §5 generalised; basis points, floor division)
```
fee_base(p)     = mulDivHalfEven(p, pct_bp [+ invoicing_bp for ORG], 10000) + fixed_cents    -- the line that carries the invoice
fee_feature(p)  = mulDivHalfEven(p, pct_bp [+ invoicing_bp for ORG], 10000)                  -- an add-on always sits on an invoice with a base
margin_bp(p,ai,fee) = (p − fee − ai) × 10000 / p
floor_bp        = catalog.margin_floor_subscription_pct × 100   (service products: _service_pct; FEE/ONE_TIME: informational, 21 §5)
pass            = margin_bp ≥ floor_bp
```
**What is checked, per currency, per interval in `intervals_json`:**
1. every BASE / SEAT_BASE price with the plan's included AI cap: `margin(p, ai_cap, fee_base)`;
2. every OPTIONAL / SEAT_OPTIONAL price alone: `margin(p, ai, fee_feature)` (× `max_quantity` for stackable — linear, so quantity 1 suffices but the builder shows max);
3. the **composition worst case**: `margin(Σp, Σai, fee_base)` for base + every optional at max quantity;
4. for ORG: every preset's sum (21 §5 "above individual" + whole-preset margin) and the deepest active volume tier (`TIER_BELOW_FLOOR`);
5. for YEAR rows: the same with `ai × 12` and the derived amount.
A failing row → `422 MARGIN_BELOW_FLOOR {featureKey, interval, currency, marginBp, floorBp, levers}` where
`levers = {minPriceMinor, maxAiBudgetCents, maxDiscountBp}`; publish proceeds only with `overrideReason`
(≥ 20 chars) → HIGH audit `CATALOG_MARGIN_OVERRIDE` (Phase 18 D4, unchanged). **Discounts never get an
override** (`org_discount`, `promo_code`, derived annual rows): a discount that fails is refused.

### 7.3 Levers (closed form, SIMPLE model, for the builder's hints)
```
pct                 = pct_bp (+ invoicing_bp for ORG audience)
minPrice(ai)        = ceil((ai + fixed) × 10000 / (10000 − pct − floor_bp))               -- fixed = 30 for base rows, 0 for features
maxAiBudget(p)      = p − fee(p) − mulDivHalfEven(p, floor_bp, 10000)
maxAnnualDiscountBp = 10000 − ceil(minPrice(ai×12) × 10000 / (month_amount × 12))
```

## 8. Worked examples (USD, SIMPLE fee model, draft prices of 21 §6 for org rows; individual add-on prices are drafts an admin would type — nothing is seeded)

Shorthand: PRO base 1999 (MONTH) · 4999 (QUARTER) · AUTOPILOT 3999 · `ai.credits_extra` 499/unit (ai 75) ·
org rows: BASE 1499 · JM 499 (ai 75) · RT 799 (ai 125) · INB 499 (ai 60) · MKT 699 (ai 75) · INT 999 (ai 150) ·
ALR 199 (ai 0). Consultants A = BASE+JM+RT, B = BASE+INB+MKT+INT, C = BASE (22 §9).

### 8.1 Individual, monthly — Pro + 2 × Extra AI credits (golden S1)
| line | unit | qty | total |
|---|---|---|---|
| PRO base | 1999 | 1 | 1999 |
| ai.credits_extra | 499 | 2 | 998 |
| **plan_total / MONTH** | | | **2997** |
| ai_window | 300 + 2×75 | | **450 ¢ / month** |
| guard: base | fee 58+30=88 · (1999−88−300)/1999 | | **8059 bp ✓** |
| guard: credit (each) | fee 14 · (499−14−75)/499 | | **8216 bp ✓** |
| guard: composition | fee 87+30=117 · (2997−117−450)/2997 | | **8108 bp ✓** |
Quarter variant: base 4999 (fee 145+30=175, ai 800 → 8050 bp ✓); credits 3 × 499 = 1497 per unit per quarter
(explicit QUARTER row required; if absent → credits not offered on quarterly plans).

### 8.2 Individual, annual — same basket, annual enabled, global discount 1000 bp (golden S2)
| line | derivation | annual unit | qty | total |
|---|---|---|---|---|
| PRO base YEAR (derived) | 1999×12 = 23988 × 0.9 = 21589.2 | **21589** | 1 | 21589 |
| credits YEAR (derived) | 499×12 = 5988 × 0.9 = 5389.2 | **5389** | 2 | 10778 |
| **plan_total / YEAR** | | | | **32367** |
| monthly_equivalent | 32367 / 12 = 2697.25 | | | **2697** |
| savings_vs_monthly | 2997×12 − 32367 = 35964 − 32367 | | | **3597** (1000 bp) |
| ai_window | (300 + 150) × 12 | | | 5400 ¢ / year, spent as 450 ¢ / month (S-10) |
| guard: base YEAR | fee 626+30=656 · ai 3600 · (21589−656−3600)/21589 | | | **8028 bp ✓** |
| guard: credit YEAR | fee 156 · ai 900 · (5389−156−900)/5389 | | | **8040 bp ✓** |
| guard at 1500 bp instead | base 20390, fee 591+30=621 · (20390−621−3600)/20390 | | | **7929 bp ✗ → refused; lever maxDiscountBp = 1150** |

### 8.3 Maximum annual discount the floor allows (SIMPLE model, locked prices; ORG rows carry 290 + 40 bp invoicing as in 21 §6)
| product | audience · fee bp | month | ai/yr | minPrice(yr) | max discount |
|---|---|---|---|---|---|
| PRO | INDIVIDUAL · 290 (+30 fixed) | 1999 | 3600 | 21229 | **11.50 %** |
| PRO @ Launch 2 | INDIVIDUAL | 2499 | 3600 | 21229 | **29.2 %** |
| AUTOPILOT | INDIVIDUAL | 3999 | 7200 | 42281 | **11.9 %** |
| org BASE | ORG · 330 (+30 fixed) | 1499 | 0 | 180 | 99 % (bounded by "above individual" instead) |
| org JM | ORG · 330 (no fixed) | 499 | 900 | 5390 | **9.99 %** (a 1000 bp row gives 5389 — one cent short) |
| org RT | ORG · 330 | 799 | 1500 | 8982 | **6.3 %** |
| org INT | ORG · 330 | 999 | 1800 | 10779 | **10.1 %** |
Reading: a global 10 % annual discount passes for the personal plans by a few tenths of a point, passes
`interview.ai_prep` by one cent, and fails `ai.job_matching` (by one cent) and `ai.resume_tailoring` on org
seats — the builder's per-component discount and the `maxDiscountBp` lever exist for exactly this.

### 8.4 Organization, monthly — ORG_STANDARD, 3 seats, no contract (golden G1 restated)
| | amount |
|---|---|
| setup fee (own one-time invoice, before activation) | **49900** |
| platform fee | 0 (no price published) |
| seat A 1499+499+799 | 2797 |
| seat B 1499+499+699+999 | 3696 |
| seat C 1499 | 1499 |
| **org_recurring / MONTH** | **7992** |
| Stripe items | BASE×3, JM, RT, INB, MKT, INT = 6 items; coupon none |
Mid-month changes: G11 (add RT to C, preset to D, remove INT from B) → proposed **9989**, proration **1448**,
next invoice **11437** — unchanged.

### 8.5 Organization, annual — same org, annual enabled for ORG, plan discount 1000 bp, component discounts `ai.job_matching` **900 bp** and `ai.resume_tailoring` **600 bp** (the levers of §8.3) (golden S3; ORG fee 330 bp)
| component | month | ×12 | disc | annual unit | guard |
|---|---|---|---|---|---|
| BASE | 1499 | 17988 | 1000 | **16189** | fee 534+30=564 · (16189−564)/16189 = 9651 bp ✓ |
| JM | 499 | 5988 | **900** | **5449** (5449.08) | fee 180 · ai 900 → (5449−180−900)/5449 = 8018 bp ✓ (at 1000 bp: 5389 → 7999 bp ✗) |
| RT | 799 | 9588 | **600** | **9013** (9012.72) | fee 297 · ai 1500 → 8006 bp ✓ (at 1000 bp: 8629 → 7931 bp ✗) |
| INB | 499 | 5988 | 1000 | **5389** | fee 178 · ai 720 → 8333 bp ✓ |
| MKT | 699 | 8388 | 1000 | **7549** | fee 249 · ai 900 → 8477 bp ✓ |
| INT | 999 | 11988 | 1000 | **10789** | fee 356 · ai 1800 → 8001 bp ✓ |
| seat A | | | | 16189+5449+9013 = **30651** | |
| seat B | | | | 16189+5389+7549+10789 = **39916** | |
| seat C | | | | **16189** | |
| **org_recurring / YEAR** | | | | **86756** | monthly_equiv 7229.67 → **7230** |
| savings vs 12 × 7992 = 95904 | | | | **9148** (954 bp) | |
| first subscription invoice | | | | 86756 (setup fee 49900 invoiced separately, earlier) | |
Mid-term seat add (term 365 d, add seat D = JOB_SEARCH_ESSENTIALS annual = BASE 16189 + JM 5449 + ALR 2149 (2388 × 0.9) = 23787 on day 100):
`remaining = 265 × 86400 = 22 896 000 s`, `period = 31 536 000 s` → proration = mulDivHalfEven(23787, 22896000, 31536000)
= 17 270.04 → **17270** today; `org_recurring` → **110543** from the next term. Seat transfer C → E: **0**, no Stripe change.

### 8.6 Rounding rows (added to G10)
| amount | op | exact | result |
|---|---|---|---|
| 23988 | ×0.9 | 21589.2 | **21589** |
| 9588 | ×0.92 | 8820.96 | **8821** |
| 2388 | ×0.9 | 2149.2 | **2149** |
| 5988 | ×0.91 | 5449.08 | **5449** |
| 9588 | ×0.94 | 9012.72 | **9013** |
| 23787 × 22896000 | ÷ 31536000 | 17270.04 | **17270** |
| 32367 | ÷12 | 2697.25 | **2697** |
| 86504 | ÷12 | 7208.67 | **7209** |
| 1250 | ×0.5 (half) | 625.0 | 625; 1251×0.5 = 625.5 → **626** (even) |

## 9. Quotes (both worlds)

| | Individual (`subscription_quote`, new) | Org (`license_quote`, 20 §2.3, unchanged) |
|---|---|---|
| created by | `POST /api/billing/quotes` (09 §3) | `POST /api/orgs/{id}/licenses/quotes` |
| TTL | `billing.quote.ttl_minutes` (15) | `enterprise.quote.ttl_minutes` (15) |
| `inputs_hash` | `v1|user:{id}|cur|cv:{catalog_version}|pv:{plan_version_id}|interval|promo:{code?}|lines…` | 22 §7 |
| staleness | `409 QUOTE_STALE {reason}` / `410 QUOTE_EXPIRED` | same |
| DTO | `PlanQuoteDTO` (09 §3.2): current/proposed lines with list/effective, `planTotalMinor` per interval, `monthlyEquivalentMinor`, `savingsMinor/Bp`, `prorationEstimateMinor`, `nextInvoiceEstimateMinor`, `nextInvoiceAt`, `effectiveAt` per line (now / period end / term end), `aiWindowCents` (admin only; customers see %), `taxEstimateMinor/taxSource/taxNote`, `warnings[]`, `requiresConfirmation[]`, `expiresAt`, `inputsHash` | `LicenseQuoteDTO` (22 §8) + `intervalChange?`, `monthlyEquivalentMinor`, `savingsMinor` |
| single-use | APPLIED on confirm/checkout; SUPERSEDED when a newer quote for the same subscription exists | 22 §7 |

A **checkout** (new subscriber) is a quote too: `POST /api/billing/quotes/{id}/checkout` builds the Stripe
Checkout Session from the quote's price ids and quantities, so the price the customer saw is the price in
Stripe to the minor unit (quote → session metadata `quote_id`; the webhook marks it APPLIED).

## 10. Invoice snapshots
Every invoice line we mirror (`invoice_line` personal — new; `org_invoice_line` — exists) stores
`price_id`, `plan_version_id`, `feature_key`, `quantity`, `unit_amount_minor`, `amount_minor`,
`period_start/end`, `proration` flag, `discount_minor` share, `description`; the sum of lines equals the
invoice amount (foundation rule). Reports never recompute from the catalog.

## 11. Currencies
`billing.currencies` (USD only, C4). A plan version is sellable in a currency only when **every** priced
component has an active price row in it for every interval listed; the public catalog reports
`sellableIn[]`. Zero-decimal currencies: minor = whole unit; the derivation and proration rules produce
integers by construction (22 G12).

## 12. Tests (names used by the stories)
`PricingEngineGoldenTest` (G1–G14 unchanged + **S1–S3** above + the rounding rows), `AnnualDerivationTest`
(precedence explicit > component > plan > global; max-discount levers of §8.3), `MarginGuardCompositionTest`
(§7.2 checks 1–5; `levers` values; discount rows never overridable), `ProrationIntervalTest` (MONTH/QUARTER/
YEAR periods; confirm ≤ quote; seat transfer = 0), `IntervalSwitchRulesTest` (§6.2 table), property tests
22 §10 extended with: (8) `monthly_equiv × f ≤ total(MONTH) × f` whenever a discount ≥ 0; (9) derived annual
rows are integers in every currency; (10) savings = Σ per-line savings (no rounding on totals).
