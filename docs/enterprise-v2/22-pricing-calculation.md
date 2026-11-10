# 22 — Pricing calculation: exact formulas, rounding, precedence, quotes, golden tables

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-014 (precedence), ADR-015 (tiers),
> ADR-019 (quotes). Build-ready for **X5.5** (`PricingEngine`, `QuoteService`, golden tests) and the
> frontend of **X6.3** (which only displays quote fields). Every number here is reproducible by hand;
> Sonnet turns §9 into `PricingEngineGoldenTest` (table-driven) and §10 into property tests.

## 1. Types and the only rounding function

```java
// All money: long minor units (cents, pence, yen…) + ISO-4217 currency; no double/float/BigDecimal in pricing.
record Money(long minor, String currency) {}
final class Minor {
  /** amount × num / den, rounded HALF_EVEN to an integer; den > 0; exact in long arithmetic (Math.multiplyHigh guards overflow). */
  static long mulDivHalfEven(long amount, long num, long den) {
    long prod = Math.multiplyExact(amount, num);
    long q = Math.floorDiv(prod, den), r = Math.floorMod(prod, den);
    long twice = Math.multiplyExact(r, 2);
    if (twice < den) return q;
    if (twice > den) return q + 1;
    return (q % 2 == 0) ? q : q + 1;          // exactly half → to even
  }
  static long pctOff(long amount, int bp) { return mulDivHalfEven(amount, 10_000L - bp, 10_000L); }   // bp = basis points
}
```
Percentages are **basis points** (`INT`, 0–10 000) everywhere in the schema (`pct_off_bp`,
`override_pct_off_bp`, `catalog.stripe.pct_bp`). Rounding happens **once per step per unit** (§3),
never on totals; totals are sums of already-rounded units × integer quantities, so an invoice line
is always a whole number of minor units and Stripe can represent it.

## 2. Inputs

| Input | Source | Resolved at |
|---|---|---|
| `list(product, currency, at)` | active `product_price` (audience ORG, MONTH, `effective_from ≤ at < effective_until`) | quote and confirm |
| `contract` | the org's single `ACTIVE` `org_contract` whose `starts_at ≤ at < ends_at` (23 §2); `rows` by product (or `product_id NULL` = all) | quote and confirm (version pinned) |
| `discount` | the **best** eligible `org_discount` (23 §5): eligible = active, window contains `at`, applies to the product's kind/code, org matches eligibility; "best" = largest resulting reduction on the *org's current recurring total* evaluated once per quote; ties → lowest id | quote and confirm |
| `tier` | the highest `volume_tier` whose `min_licensed_consultants ≤ licensed_count_next_period` and whose product scope matches (specific product beats `NULL`) | quote and confirm; period rollover (26 §7) |
| `licensed_count_next_period` | `COUNT(consultant_license WHERE org_id=? AND status IN (ACTIVE, PENDING) AND (ends_at IS NULL OR ends_at > period_end_at))` + licenses created by this quote | quote |
| `quantity` | `license_feature.quantity` (1 unless stackable) | — |
| `period_start_at`, `period_end_at` | `org_billing_account.current_period_start/end` (from the Stripe mirror; LOCAL mode: calendar month UTC) | quote |

## 3. The per-unit effective price — exact precedence (ADR-014)

```
unit_list      = list(product, currency, at).amount_minor
unit_contract  = no contract row        → unit_list
               | row.override_amount    → row.override_amount_minor                       (REPLACES)
               | row.override_pct_off_bp→ pctOff(unit_list, bp)                            (REDUCES)
contracted     = (a contract row matched this product)
org_contracted = (the org has an ACTIVE contract at `at`, with ≥ 1 row)
unit_discount  = (discount != null) && (!org_contracted || contract.stackable)
               → discount.percent ? pctOff(unit_contract, discount.pct_off_bp)
                                  : max(0, unit_contract − discount.amount_off_minor_per_unit)
               | otherwise unit_contract
unit_effective = (tier != null) && (!contracted || contract.volume_applies)
               → pctOff(unit_discount, tier.pct_off_bp)
               | otherwise unit_discount
```
Rules that make it "no double discount":
1. A contract **row** never combines with another contract row (one row per product; `NULL`-product rows apply only where no product-specific row exists).
2. **At most one promotional discount** per quote, and **none at all** when the org is under a non-stackable contract (contracts are negotiated totals; promos are for list-price customers).
3. The tier is skipped on contracted lines unless the contract says `volume_applies`; it is applied on non-contracted lines of a contracted org only when `volume_applies` too (an org under contract is either "volume applies" or not, org-wide).
4. `unit_effective ≥ 0` always; a contract row that would make a line negative is refused at contract save (23 §3).
5. The precedence is evaluated **per product** (per line), and the quote shows for each line: `list`, `contract`, `discount`, `tier`, `effective`, and the name of whatever applied.

## 4. Totals

```
line_total(l)                = unit_effective(l) × quantity(l)
license_recurring(L)         = line_total(base) + Σ line_total(features)
org_recurring(at)            = Σ over live licenses license_recurring + Σ live org_module_license line_total
discount_total               = Σ (unit_list − unit_effective) × quantity          -- what the Stripe coupon must carry (26 §5)
```
`current_recurring_minor` = `org_recurring` over the licenses as they are now (pending removals still counted, because they are still billed this period);
`proposed_recurring_minor` = `org_recurring` over the licenses as they will be **after** every line of the quote and after every pending removal effective at `period_end_at`;
`delta_minor = proposed − current`.

## 5. Which prices move when

| Change | Price used for existing lines | Price used for new lines |
|---|---|---|
| add feature / create license | existing rows keep their `price_id` | current active row at `at` |
| remove feature | the removed row's own price until `ends_at` | — |
| retire a price in the catalog | untouched (ADR-013) | the replacement |
| contract starts / ends | re-evaluated at the next quote **and** at the period rollover (coupon re-sized, 26 §7) — Kiwiply never changes a mid-period line; the invoice snapshot at issue time is what was agreed | — |
| discount expires | same as contract | — |
| volume tier crossed | re-evaluated at every quote and at rollover; the quote warns `VOLUME_TIER_CHANGES {from, to}` when the quote itself crosses a threshold (both directions) | — |

## 6. Proration (Kiwiply is the authority; Stripe never prorates — 26 §4)

```
period_seconds   = epochSeconds(period_end_at) − epochSeconds(period_start_at)
remaining_seconds= max(0, epochSeconds(period_end_at) − epochSeconds(effective_at))
proration(l)     = mulDivHalfEven(unit_effective(l) × quantity_added(l), remaining_seconds, period_seconds)   -- additions and upgrades only
proration_total  = Σ proration(l)                                                   -- removals, downgrades, cancels, suspends: 0, always
```
- `effective_at = now` for immediate changes; a future-dated quote (≤ 30 days ahead) prorates from that date.
- **Quote vs confirm:** the quote stores `proration_estimate_minor` computed at quote time; confirm recomputes with `effective_at = confirm time` and the recomputed value is **≤** the quoted one (remaining time only shrinks). The UI says "up to $X today"; `license_change.payload_json.proration_minor` holds the final number, which is what the invoice item carries.
- Reactivation inside the already-paid period (`now < paid_through_at`) prorates **0** (27 §4).
- Upgrade of the base (`UPGRADE_BASE`, e.g. a new base product) = add the new base now (prorated) and schedule the old base to end at period end (no credit).

## 7. Quote inputs hash and staleness

```
canonical = "v1|org:" + orgId + "|cur:" + currency + "|cv:" + catalogVersion
          + "|contract:" + (contractId ?: "none") + ":" + (contractVersion ?: 0)
          + "|discount:" + (discountId ?: "none") + "|tier:" + (tierId ?: "none")
          + "|eff:" + (futureDated ? isoDate(effective_at) : "now")
          + "|lines:" + lines.sorted().map(l -> (l.licenseId ?: "m" + l.memberId) + ":" + l.op + ":" + (l.featureKey ?: "-") + ":" + l.quantity + ":" + l.priceId).join(",")
          + "|confirmed:" + confirmedCommercialDeps.sorted().join(",")
inputs_hash = sha256Hex(canonical)
```
Confirm recomputes the canonical string from the live catalog/contract state and compares; any
difference → `409 QUOTE_STALE {reason: CATALOG_VERSION|CONTRACT|DISCOUNT|TIER|PRICE_RETIRED}` and the
client re-quotes. `expires_at` passed → `410 QUOTE_EXPIRED`. A quote is single-use (`APPLIED`), and
creating a new quote for the same org marks older OPEN quotes `SUPERSEDED` only when they touch the
same license ids (two admins configuring different consultants do not block each other).

## 8. `LicenseQuoteDTO` — the Subscription Impact Preview (requirements §19), every field

| field | type | rule |
|---|---|---|
| `quoteId`, `orgId`, `kind`, `createdAt`, `expiresAt`, `status` | | |
| `currency` | ISO | org currency |
| `catalogVersion`, `contract{id,name,version,stackable,volumeApplies}` | | null when none |
| `effectiveAt`, `periodStartAt`, `periodEndAt` | ISO | |
| `currentBaseFeeMinor` | long | Σ base lines today (§14 "current base fee") |
| `currentFeatures[]` | `{licenseId, member{…}, featureKey, name, quantity, unitListMinor, unitEffectiveMinor, applied: [CONTRACT\|DISCOUNT\|TIER], endsAt?}` | |
| `proposedFeatures[]` | same shape + `op` | additions and quantity increases |
| `proposedRemovals[]` | same shape + `effectiveAt = periodEndAt` | |
| `requiresConfirmation[]` | `{featureKey, requires, kind: COMMERCIAL, priceMinor, name}` | non-empty ⇒ confirm needs `confirmedCommercialDeps` |
| `autoAdded[]` | free TECHNICAL deps added | |
| `contractDiscountsMinor` | long | Σ (list − contract) × qty across proposed state |
| `promotionalDiscount{name, minor}` / `volumeTier{name, minLicensed, pctOffBp, minor}` | | null when none applied |
| `discountTotalMinor` | long | §4 |
| `currentRecurringMinor`, `proposedRecurringMinor`, `deltaMinor` | long | §4 |
| `prorationEstimateMinor` | long | §6 upper bound ("up to") |
| `nextInvoiceEstimateMinor` | long | `proposedRecurring + prorationEstimate + pendingOverageMinor (0 until overages ship)` |
| `nextInvoiceAt` | ISO | `periodEndAt` |
| `taxEstimateMinor`, `taxSource` | long?/enum | NULL + `NONE` unless Stripe preview with automatic tax (C3) |
| `taxNote` | string | "Taxes are calculated by Stripe at invoice time where applicable." when NONE |
| `licensedCountNow`, `licensedCountAfter` | int | drives the tier |
| `stripeItemsAfter` | int | warning at ≥ 18, refusal at > 20 unless COMPUTED_INVOICE (26 §6) |
| `warnings[]` | enum | `VOLUME_TIER_CHANGES`, `STRIPE_ITEM_LIMIT_NEAR`, `PRESET_INCOMPLETE`, `INTEGRATION_REQUIRED`, `CONSENT_REQUIRED`, `PAST_DUE_REMOVE_ONLY` |
| `inputsHash` | hex | echoed so the UI can detect its own drift |

The frontend never computes money: it renders these fields and formats them with `Intl.NumberFormat(currency)`.

## 9. Golden tables (`PricingEngineGoldenTest`) — draft prices from `21 §6`

Shorthand: BASE 1499 · JM `ai.job_matching` 499 · RT `ai.resume_tailoring` 799 · INB `inbox.monitoring` 499 · MKT `marketing.assisted_applications` 699 · INT `interview.ai_prep` 999 · ALR `alerts.advanced` 199. Consultants from §14: **A** = BASE+JM+RT · **B** = BASE+INB+MKT+INT · **C** = BASE · **D** = none. Currency USD unless stated. "Licensed count" = 3 (A, B, C).

### G1 — list prices only
| line | unit | qty | total |
|---|---|---|---|
| A | 1499+499+799 | | **2797** |
| B | 1499+499+699+999 | | **3696** |
| C | 1499 | | **1499** |
| D | — | | **0** |
| org recurring | | | **7992** |
| Stripe items | BASE×3=4497, JM×1=499, RT×1=799, INB×1=499, MKT×1=699, INT×1=999 | 6 items | 7992 ✓ |
| discount_total | | | 0 (no coupon) |

### G2 — contract amount override: BASE → 1299 (stackable=false, volume_applies=false)
A **2597** · B **3496** · C **1299** · org **7392** · discount_total **600** → coupon `amount_off=600`.

### G3 — contract pct override 1000 bp on all products (`product_id NULL`)
units: BASE 1349 (1349.1) · JM 449 · RT 719 · INB 449 · MKT 629 · INT 899 → A **2517** · B **3326** · C **1349** · org **7192** · discount_total **800**.

### G4 — promotional discount 1500 bp on FEATURE products only, no contract
units: BASE 1499 · JM 424 (424.15) · RT 679 · INB 424 · MKT 594 · INT 849 → A **2602** · B **3366** · C **1499** · org **7467** · discount_total **525**.

### G5 — G2 contract (non-stackable) + G4 promo ⇒ promo ignored
identical to G2: org **7392**, `promotionalDiscount = null`, warning none (the UI shows "contract pricing applies").

### G6 — G2 contract with `stackable=true` + G4 promo (promo scope FEATURE only)
units: BASE 1299 (contract; promo does not cover BASE) · JM 424 · RT 679 · INB 424 · MKT 594 · INT 849 → A **2402** · B **3166** · C **1299** · org **6867** · discount_total **1125**.

### G7 — volume tier `min 3 → 500 bp`, all products, no contract (licensed count 3)
units: BASE 1424 (1424.05) · JM 474 · RT 759 · INB 474 · MKT 664 · INT 949 → A **2657** · B **3511** · C **1424** · org **7592** · discount_total **400**. With C removed (count 2) → tier off → 6493 (A+B at list) and warning `VOLUME_TIER_CHANGES{from:"3+",to:null}`.

### G8 — G4 promo then G7 tier (no contract)
units: BASE 1424 · JM 403 (402.8) · RT 645 (645.05) · INB 403 · MKT 564 (564.3) · INT 807 (806.55) → A **2472** · B **3198** · C **1424** · org **7094**.

### G9 — G3 contract with `volume_applies=true` + G7 tier
units: BASE 1282 (1281.55) · JM 427 (426.55) · RT 683 (683.05) · INB 427 · MKT 598 (597.55) · INT 854 (854.05) → A **2392** · B **3161** · C **1282** · org **6835**. Same contract with `volume_applies=false` → G3 (**7192**).

### G10 — rounding (half-even) unit cases
| amount | bp off | exact | result |
|---|---|---|---|
| 1250 | 500 | 1187.5 | **1188** |
| 1150 | 500 | 1092.5 | **1092** |
| 999 | 1500 | 849.15 | **849** |
| 1 | 5000 | 0.5 | **0** |
| 3 | 5000 | 1.5 | **2** |
| 2797 | 10000 | 0 | **0** |

### G11 — proration (period 2026-11-05T00:00Z → 2026-12-05T00:00Z, 2 592 000 s)
Quote at 2026-11-20T12:00Z (remaining 1 252 800 s): add RT to C; apply `JOB_SEARCH_ESSENTIALS` to D (BASE+JM+ALR = 2197); remove INT from B.
| item | formula | value |
|---|---|---|
| RT proration | mulDivHalfEven(799, 1252800, 2592000) = 386.18 | **386** |
| preset proration | mulDivHalfEven(2197, 1252800, 2592000) = 1061.88 | **1062** |
| INT removal | 0, effective 2026-12-05T00:00Z | **0** |
| currentRecurring | 7992 | |
| proposedRecurring | 7992 + 799 + 2197 − 999 | **9989** |
| delta | | **+1997** |
| prorationEstimate | 386 + 1062 | **1448** |
| nextInvoiceEstimate | 9989 + 1448 | **11437** |
| licensedCount now/after | 3 / 4 | |
| stripeItemsAfter | BASE×4, JM×2, RT×2, INB, MKT, ALR (INT item deleted now, 26 §4) | **7** |
Confirm at 2026-11-20T18:00Z (remaining 1 231 200 s): RT → 380 (379.525), preset → 1044 (1043.575); total **1424 ≤ 1448** ✓.

### G12 — currencies
| case | expectation |
|---|---|
| org currency EUR, only USD prices published | `GET …/licenses/catalog` lists products with `sellable=false`; quote → `409 CURRENCY_MISMATCH` |
| org currency EUR, EUR prices published (BASE 1399, JM 449) | A-like license = 1399+449 = **1848 EUR**; Stripe items on the EUR prices; coupon in EUR |
| JPY (zero-decimal; `minor` = 1 yen) BASE 1999 with tier 500 bp | 1899 (1899.05) — no sub-unit; the gateway passes `unit_amount=1899` unchanged |
| mixed-currency contract row (contract USD, price EUR) | refused at contract save `422 CURRENCY_MISMATCH` |

### G13 — stackable feature
`ai.credits_extra` quantity 3 on A: line = 499 × 3 = 1497; A = 2797 + 1497 = **4294**; AI budget for A's org window = 75 + 125 + 3 × 75 = **425 ¢** (25 §6). Quantity 5 → `422 QUANTITY_LIMIT {max:4}`.

### G14 — dependencies
| quote | expectation |
|---|---|
| D: add `automation.approved_apply` only | `requiresConfirmation=[{ai.job_matching, COMMERCIAL, 499}]`; confirm without it → `422 DEPENDENCY_UNCONFIRMED`; with `confirmedCommercialDeps=[ai.job_matching]` → license BASE+JM+AUTO = 1499+499+1999 = **3997** |
| B: remove INB while `analytics.applications` is on B | allowed (no TECHNICAL dep); warning none |
| A: remove BASE | `422 DEPENDENCY_BLOCKS_REMOVAL` — removing the base is `CANCEL`, not `REMOVE_FEATURE` |

## 10. Property tests (`PricingEnginePropertyTest`, jqwik or hand-rolled generators)
1. `unit_effective ∈ [0, unit_list]` for every input.
2. Precedence idempotence: evaluating twice with the same inputs yields identical bytes of `lines_json`.
3. `org_recurring` is linear in quantities: adding a feature to N consultants raises the total by exactly N × unit_effective (no rounding on totals).
4. `proration(confirm) ≤ proration(quote)` whenever `confirm_at ≥ quote_at` within the same period.
5. `discount_total = Σ list×qty − org_recurring` exactly (the coupon reproduces the effective total to the cent).
6. Rounding never crosses currency precision: for zero-decimal currencies results are integers in whole units.
7. Stripe-off parity: `PricingEngine` on LOCAL mode and on SUBSCRIPTION_ITEMS mode produce the same `proposedRecurringMinor` (only `taxSource` may differ).

## 11. Where the engine lives
`service/ent/pricing/PricingEngine` (pure, no Spring beans besides a clock), `PricingInputsLoader`
(repositories → `PricingInputs`), `QuoteService` (inputs → `license_quote` row + DTO),
`QuoteHasher`. The engine takes a `PricingInputs` value object so golden tests build it in memory
without a database.
