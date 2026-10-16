# Subscription Module — design index (`docs/subscriptions/`)

> Fable, 2026-10-15, branch `subscription-design` (from `version2`). **Design only; Sonnet builds.** New chat?
> Start at `docs/HANDOFF-SUBSCRIPTIONS.md`. The user asked for: a review of the current plans and pricing;
> every feature as an add-on service; plans composed in admin at any time (base + add-ons + total); the same
> for enterprise with a per-seat price and per-seat add-on customisation; monthly and yearly totals with a
> configurable annual discount; fully configurable; plus (added) a full plan/add-on **retirement lifecycle**
> with a Free + read-only-lock default when the subscriber does nothing (user decision S-19).
> `CLAUDE.md` wins on every conflict; conflicts and material choices live in `decisions-for-user.md`.

## Read order
| # | File | What it answers |
|---|---|---|
| 01 | `01-current-state-review.md` | what exists in code and in design today (built / partial / design-only / absent), the duplication between the personal grant model and the enterprise license model, the 12 gaps that block "plans built from add-ons", risks |
| 02 | `02-unified-product-model.md` | services (one `feature_definition` catalog for both worlds), plans as versioned compositions (base, included, optional, seat roles, fees), Free/Pro/Autopilot and Org Standard as seeds, invariants |
| 03 | `03-pricing-model.md` | settings, precedence (list → contract → one discount → tier), totals for individuals and orgs, annual derivation (annual ON — S-01 answered; discount admin-set under the guard), proration and mid-cycle rules, the margin guard with levers, worked examples S1–S3 with exact minor-unit maths, quotes, invoice snapshots, currencies |
| 04 | `04-plan-builder-admin-ux.md` | the admin Plans tab: list, editor with live margin ticks, preview pane, publish with typed confirm, grandfathering, compare, org seat rules — 1440 and 390 on the admin page kit |
| 05 | `05-customer-ux.md` | pricing page generated from published plans, add-on picker with live totals, review sheet and checkout, My plan with impact preview and undo, org plan card, per-seat matrix, cost preview, invoices — 1440 and 390, empty/error states, honesty rules |
| 06 | `06-entitlements-and-enforcement.md` | one `EntitlementService` with Personal and Org readers over the same `EntitlementSet`, the personal check order, migration of the 14 `isPro` callers with byte-identical bodies, allowances and AI budgets, reason codes |
| 07 | `07-stripe-mapping.md` | products, prices (incl. YEAR), subscription items and quantities, coupons, schedules, webhook routing and mirrors, migration of existing subscribers with reused price ids, regression IT list, billing-disabled parity |
| 08 | `08-data-model.md` | additive Liquibase DDL: widened `feature_definition`/`product`, `product_price`, `catalog_publish/change`, `plan*`, `subscription` widening, `subscription_addon`, quotes/changes, `invoice*`, `entitlement_grant` (narrowed), personal usage ledger, enterprise links; backfill and migration plan |
| 09 | `09-apis.md` | admin catalog and plan builder, public catalog, personal quotes/checkout/change, org plan, entitlements — method, path, auth, JSON, error codes, idempotency |
| 10 | `10-stories-and-build-order.md` | epics K1–K10, the 67-story list, build order S0–S6, how K supersedes/relates B/A/X stories |
| 11 | `11-plan-retirement.md` | retirement lifecycle: RETIRING → RETIRED states, effective dates that never cut a paid period short, notices, closest-match successors, subscriber choices, the Free fallback with per-service read-only locks, enterprise seats, Stripe schedules, wizard and customer page, tests |
| — | `decisions-for-user.md` | S-01 … S-23: every conflict with a lock and every financially material choice, with options, recommendation and the safe default applied; **answered 2026-10-15: S-01 annual ON, S-03 no existing subscribers, S-17, S-19 Free + read-only lock, S-20 retire-to-Free default**; the `CLAUDE.md` amendment sentence for S-01 sits there for the user's session to apply |
| — | `progress-tracker.md` | live status per story (Not Started → In Progress → Code Complete → Testing → Completed / Blocked) |

Canonical stories: `docs/roadmap/areas/sub.json` (area `sub`, prefix `K`), rendered at
`docs/roadmap/master-roadmap.html#/sub`. Regenerate: `node docs/roadmap/build-master-roadmap.mjs`;
`--list` must say `dangling ids: 0`.

## The model in five lines
1. A **service** is a catalog row that can be switched on and metered (key, allowance, AI budget, dependencies, audience).
2. A **plan** is a published, immutable **version** composed of services: base + included + optional add-ons with prices; for organizations a mandatory **seat** base + seat-included + seat-optional add-ons + fees (E3 reconciled: licenses are seats on an org plan version).
3. **One pricing engine** and **one margin guard** price and check every combination at every interval; annual is ON (S-01) as a derived price row whose discount admin sets under the guard.
4. **One EntitlementService** resolves what a person or seat holds, with a `LOCKED` state for read-only fallback; no cross-world stacking (O4).
5. **Stripe stays the truth**; there are no existing subscribers today (S-03) so the seed is a no-data migration with the safety rules kept for future cohorts; retirements default to Free with read-only locks (S-19/S-20), never cut a paid period short and never delete data.

## Worked numbers (from `03 §8`, USD minor units, simple fee model)
- **Individual, monthly:** Pro 1999 + Extra AI credits ×2 (499 each) = **2997/mo**; AI window 450 ¢; every row and the composition pass the 80 % floor (8059 / 8216 / 8108 bp).
- **Individual, yearly (if enabled, 10 % off):** 21589 + 2 × 5389 = **32367/yr** ≈ 2697/mo, saves 3597; a 15 % discount is refused by the guard (7929 bp) — max 11.5 % on Pro at Launch-1 prices.
- **Organization, monthly:** setup fee 49900 once; seats A 2797 + B 3696 + C 1499 = **7992/mo** (golden G1).
- **Organization, yearly (if enabled, 10 % plan discount, 9 % on AI Job Matching, 6 % on Tailoring — the guard's levers):** **86756/yr** ≈ 7230/mo, saves 9148; adding a seat on day 100 costs 17270 prorated; a seat transfer costs 0.

## Runbooks (filled in by the stories that own them)
- **No-data migration** (K8.4, S-03: there are no existing subscribers): the Liquibase changeSets seed the services and plans (no prices, B-01) and run `SubscriptionBackfill` (zero rows today; idempotent; a Pro row matching no configured price id is linked to PRO v1 without an interval and logged, `SUBSCRIPTION_BACKFILL_STRICT=true` fails instead). Then `BackfillPeriodStartJob` (hourly, also callable with a cursor) stamps `current_period_start` from Stripe invoices: read-only (`listInvoices` only), 50 rows a run, resumable (a Stripe outage stops at the failing row, the next run continues there), skipped with one log line when the Stripe key is blank. Verify: `SELECT COUNT(*) FROM subscription WHERE plan_version_id IS NULL` is 0 after the linker ran, and `SELECT COUNT(*) FROM subscription WHERE stripe_subscription_id IS NOT NULL AND current_period_start IS NULL` drains to 0. Rollback: set `billing.catalog.shadow=true` (the legacy gates answer again); the added columns and tables stay.
- **Test clocks** (K8.6): scenario P (personal: checkout with add-ons monthly and yearly, change, failed renewal → lapse, resubscribe) and scenario R (retirement: notice → choice → Free fallback with locks), test mode only, object ids recorded here.
- **Annual operations** (K9.6): tax mode decided (S-09) before the first yearly invoice, fee model chosen (S-11); derived YEAR rows published with the plans; switch-off rollback (existing annual terms run to term end); realised margin per interval.
- **Shadow flip** (K7.7), `billing.catalog.shadow` true to false. The legacy gates answer while it is true and the resolver only runs beside them. Checklist, in order: (1) `ShadowCompareTest`, `PlanResolverTest`, `EntitlementServiceTest`, `EntitlementServiceShadowTest`, `LegacyReadersUnchangedIT`, `BillingResourceIT`, `BillingWebhookIT` green on the release candidate; (2) the log search `entitlement.shadow_mismatch` (and the Prometheus counter of the same name) shows zero for one release (no two-week wait, there is no existing cohort, S-03); (3) `PRO` and `AUTOPILOT` v1 are linked (`plan_version_id` not null on every paid row) and the prices an admin published pass the margin guard; (4) flip in Admin > Settings with a reason; (5) watch `entitlement.shadow_mismatch` and 402 rates for an hour; (6) rollback = set it back to true (instant, nothing else changes). Until the flip the only user-visible resolver output is the additive `features[]`, `limits`, `aiPct` and `periodEnd` on `GET /api/profile/version`.

## Conventions
Design docs say what exists with file references and what to build with table/column/endpoint names. Money
is `long` minor units + ISO currency; percentages are basis points; the only rounding is
`Minor.mulDivHalfEven`. Every price, cap, interval, discount and floor is a row or a settings key. The web
never computes money. Anything undecided goes to `decisions-for-user.md`.
