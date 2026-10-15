# HANDOFF — Subscription Module (plans built from services, per-seat add-ons, retirement lifecycle)

> Design by Fable on branch `subscription-design` (cut from `version2`, 2026-10-15). **Design only — Sonnet
> builds.** Nothing in this module is implemented yet; the personal Pro billing of Phase 12 and the
> enterprise foundation tables are what exists (see the current-state review).

## START HERE
- **Last commit:** `design: unified subscription module (individual + enterprise, add-on services, per-seat, monthly/annual)` on `subscription-design` (not pushed; the user decides).
- **Read in this order (30 min):** `docs/subscriptions/README.md` → `01-current-state-review.md` →
  `02-unified-product-model.md` → `03-pricing-model.md` → `decisions-for-user.md` → `10-stories-and-build-order.md`.
  Then the doc your story names in its `design` field.
- **First commands:**
  ```
  git fetch origin && git switch subscription-design          # or branch off develop once merged: git checkout -b <topic> develop
  node docs/roadmap/build-master-roadmap.mjs --list            # area sub · prefix K · 67 stories · 0 dangling
  cd api && ./gradlew test --tests 'EntitlementServiceTest' --tests 'BillingResourceIT' --tests 'BillingWebhookIT'   # the regression baseline every K story must keep green
  ```
- **First task:** **K3.4** (settings registry keys) then **K1.1** — phase S0 of `10-stories-and-build-order.md` §3.
  Mark it with `node docs/roadmap/build-master-roadmap.mjs --set K3.4=in_progress` and the row in
  `docs/subscriptions/progress-tracker.md`.
- **Rules that bite:** one story = one commit = one PR into `develop`; additive Liquibase only
  (`LiquibaseAdditiveTest`); money in `long` minor units with `Minor.mulDivHalfEven`; the web never adds two
  prices; Stripe test mode only; `CLAUDE.md` wins — conflicts go to `docs/subscriptions/decisions-for-user.md`.

## What the module is (five lines)
1. Every feature is a catalog **service** (`feature_definition`, widened to both worlds) with a key, allowance, AI budget, dependencies and eligibility; prices are immutable effective-dated rows.
2. A **plan** is a published, versioned composition: base + included services + optional add-ons (priced) + per-seat rules for organizations; Free/Pro/Autopilot and Org Standard are seeded as behaviour-identical v1 compositions; admin creates new plans and versions at any time.
3. One **pricing engine** (list → contract → one discount → tier; Kiwiply prorates) prices an individual basket, a seat and an org at MONTH/QUARTER (and YEAR when the user enables annual, decision S-01); one **margin guard** with levers checks every row and composition against the ≥ 80 % floor.
4. One **EntitlementService** resolves a plan version + add-ons (personal) or licenses on an org plan version (org) into one set; 14 `isPro` callers migrate with byte-identical 402 bodies; a `LOCKED` tri-state implements the read-only fallback.
5. **Stripe stays the truth**: items per add-on, YEAR prices when enabled, schedules for period-end changes, webhooks write mirrors, reconcilers report drift, existing subscribers migrate with reused price ids and no behaviour change.

## Decisions the user still owns
`decisions-for-user.md`: S-01 annual (default off), S-03 re-pricing existing subscribers, S-06 which add-ons
get prices, S-11 fee model, S-20/S-21 retirement wizard defaults, plus the rest of the table. **Answered:**
S-19 — no-response default is Free with a read-only lock (2026-10-15).

## Where things are
| What | Where |
|---|---|
| Design docs | `docs/subscriptions/` (README index) |
| Stories (canonical) | `docs/roadmap/areas/sub.json` → `docs/roadmap/master-roadmap.html#/sub` |
| Progress | `docs/subscriptions/progress-tracker.md` |
| Decisions | `docs/subscriptions/decisions-for-user.md` |
| Related designs | `docs/enterprise-v2/20`–`29` (org licensing), `docs/design/admin/catalog-margin-entitlements.md`, `docs/design/pay/*` (Phase 18 / pay) |

## Open questions for the coordinator
- Whether to push `subscription-design` and open the PR into `develop` (docs only, no code).
- Whether K1.2/K1.3 or X5.1/X5.2 lands first (both orders are designed with preconditions).
