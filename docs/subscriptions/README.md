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
| 03 | `03-pricing-model.md` | settings, precedence (list → contract → one discount → tier), totals for individuals and orgs, annual derivation (inert until S-01), proration and mid-cycle rules, the margin guard with levers, worked examples S1–S3 with exact minor-unit maths, quotes, invoice snapshots, currencies |
| 04 | `04-plan-builder-admin-ux.md` | the admin Plans tab: list, editor with live margin ticks, preview pane, publish with typed confirm, grandfathering, compare, org seat rules — 1440 and 390 on the admin page kit |
| 05 | `05-customer-ux.md` | pricing page generated from published plans, add-on picker with live totals, review sheet and checkout, My plan with impact preview and undo, org plan card, per-seat matrix, cost preview, invoices — 1440 and 390, empty/error states, honesty rules |
| 06 | `06-entitlements-and-enforcement.md` | one `EntitlementService` with Personal and Org readers over the same `EntitlementSet`, the personal check order, migration of the 14 `isPro` callers with byte-identical bodies, allowances and AI budgets, reason codes |
| 07 | `07-stripe-mapping.md` | products, prices (incl. YEAR), subscription items and quantities, coupons, schedules, webhook routing and mirrors, migration of existing subscribers with reused price ids, regression IT list, billing-disabled parity |
| 08 | `08-data-model.md` | additive Liquibase DDL: widened `feature_definition`/`product`, `product_price`, `catalog_publish/change`, `plan*`, `subscription` widening, `subscription_addon`, quotes/changes, `invoice*`, `entitlement_grant` (narrowed), personal usage ledger, enterprise links; backfill and migration plan |
| 09 | `09-apis.md` | admin catalog and plan builder, public catalog, personal quotes/checkout/change, org plan, entitlements — method, path, auth, JSON, error codes, idempotency |
| 10 | `10-stories-and-build-order.md` | epics K1–K10, the 67-story list, build order S0–S6, how K supersedes/relates B/A/X stories |
| 11 | `11-plan-retirement.md` | retirement lifecycle: RETIRING → RETIRED states, effective dates that never cut a paid period short, notices, closest-match successors, subscriber choices, the Free fallback with per-service read-only locks, enterprise seats, Stripe schedules, wizard and customer page, tests |
| — | `decisions-for-user.md` | S-01 … S-23: every conflict with a lock and every financially material choice, with options, recommendation and the safe default applied; **S-19 answered** (Free + read-only lock) |
| — | `progress-tracker.md` | live status per story (Not Started → In Progress → Code Complete → Testing → Completed / Blocked) |

Canonical stories: `docs/roadmap/areas/sub.json` (area `sub`, prefix `K`), rendered at
`docs/roadmap/master-roadmap.html#/sub`. Regenerate: `node docs/roadmap/build-master-roadmap.mjs`;
`--list` must say `dangling ids: 0`.

## The model in five lines
1. A **service** is a catalog row that can be switched on and metered (key, allowance, AI budget, dependencies, audience).
2. A **plan** is a published, immutable **version** composed of services: base + included + optional add-ons with prices; for organizations a mandatory **seat** base + seat-included + seat-optional add-ons + fees (E3 reconciled: licenses are seats on an org plan version).
3. **One pricing engine** and **one margin guard** price and check every combination at every interval; annual is a derived price row behind a switch that defaults off (S-01).
4. **One EntitlementService** resolves what a person or seat holds, with a `LOCKED` state for read-only fallback; no cross-world stacking (O4).
5. **Stripe stays the truth**; existing subscribers migrate with reused price ids and byte-identical behaviour; retirements never cut a paid period short and never delete data.

## Worked numbers (from `03 §8`, USD minor units, simple fee model)
- **Individual, monthly:** Pro 1999 + Extra AI credits ×2 (499 each) = **2997/mo**; AI window 450 ¢; every row and the composition pass the 80 % floor (8059 / 8216 / 8108 bp).
- **Individual, yearly (if enabled, 10 % off):** 21589 + 2 × 5389 = **32367/yr** ≈ 2697/mo, saves 3597; a 15 % discount is refused by the guard (7929 bp) — max 11.5 % on Pro at Launch-1 prices.
- **Organization, monthly:** setup fee 49900 once; seats A 2797 + B 3696 + C 1499 = **7992/mo** (golden G1).
- **Organization, yearly (if enabled, 10 % plan discount, 9 % on AI Job Matching, 6 % on Tailoring — the guard's levers):** **86756/yr** ≈ 7230/mo, saves 9148; adding a seat on day 100 costs 17270 prorated; a seat transfer costs 0.

## Runbooks (filled in by the stories that own them)
- **Existing-subscriber migration** (K8.4): seed with reused price ids → backfill → verify → shadow → flip. Rollback = flip shadow back; columns stay.
- **Test clocks** (K8.6): scenario P (personal: checkout with add-ons, change, failed renewal → lapse, resubscribe) and scenario R (retirement: notice → choice → fallback with locks), test mode only, object ids recorded here.
- **Enable annual** (K9.6): only after S-01 (b)/(c), tax mode decided (S-09), fee model chosen (S-11); publish derived rows; enable per world; verify the pricing page; monitor realised margin.
- **Shadow flip** (K7.7): 14 days of zero `entitlement.shadow_mismatch`; checklist in `progress-tracker.md`.

## Conventions
Design docs say what exists with file references and what to build with table/column/endpoint names. Money
is `long` minor units + ISO currency; percentages are basis points; the only rounding is
`Minor.mulDivHalfEven`. Every price, cap, interval, discount and floor is a row or a settings key. The web
never computes money. Anything undecided goes to `decisions-for-user.md`.
