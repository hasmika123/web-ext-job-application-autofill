# 10 — Stories, build order and phase plan (roadmap area `sub`, prefix `K`)

> Status: design, 2026-10-15 (Fable). The canonical, fully specified stories (ID, epic, title, persona,
> objective, story, functional, UI, backend, DB, APIs, permissions, entitlements, deps, relates/supersedes,
> acceptance criteria, tests, size/complexity, DoD) live in **`docs/roadmap/areas/sub.json`** and render in
> `docs/roadmap/master-roadmap.html` (`#/sub`). This page is the human index: epics, the one-line story
> list, the build order and how the K stories relate to the existing B (pay), A (admin) and X (enterprise)
> backlogs. Regenerate with `node docs/roadmap/build-master-roadmap.mjs`; `--list` must report 0 dangling ids.
> Live status: `progress-tracker.md`.

## 1. Epics

| Epic | Priority | Stories | Goal |
|---|---|---|---|
| **K1 Unified service catalog** | P0 | K1.1–K1.6 | one `feature_definition` catalog for both worlds; immutable effective-dated prices with Stripe objects; hard-coded config re-homed |
| **K2 Plans and versions** | P0 | K2.1–K2.5 | plan / version / component; Free, Pro, Autopilot, Org Standard seeded behaviour-identical; publish, grandfather, migrate; admin plans API |
| **K3 Pricing engine v2 and quotes** | P0 | K3.1–K3.4 | intervals, totals, monthly equivalent/savings, the one margin guard with levers, personal quotes, settings keys |
| **K4 Plan builder (admin UX)** | P0 | K4.1–K4.7 | list, editor, preview, publish, compare, org seat rules, journey |
| **K5 Individual customer** | P0 | K5.1–K5.8 | pricing page from the catalog, add-on picker, checkout from a quote, My plan with impact preview, switches, invoices |
| **K6 Enterprise plan layer** | P1 | K6.1–K6.6 | org subscriptions on a plan version, seat transfer, org interval/version quotes, plan card, seat matrix |
| **K7 Entitlements unification** | P0 | K7.1–K7.7 | PlanResolver + EntitlementSet, 14 callers migrated with byte-identical bodies, features on the version endpoint, personal ledger, regression gate |
| **K8 Stripe mapping, migration, reconciliation** | P0 | K8.1–K8.7 | scope router, gateway growth, invoice mirror, existing-subscriber migration, reconciler, scenario harness, billing-disabled parity |
| **K9 Annual billing (on)** | P0 | K9.1–K9.6 | YEAR rows with the admin-set discount under the guard, annual proration/term rules, monthly sub-windows, annual UX, org annual, operations runbook — **S-01 answered ON (2026-10-15)**; stories sit in phases S2/S3/S5 |
| **K10 Retirement lifecycle and the read-only lock** | P0 | K10.1–K10.11 | RETIRING → RETIRED, effective dates, notices, closest-match successors, subscriber choices, Free fallback with locks (S-19), enterprise seats, Stripe schedules, wizard, customer page, regression |

**67 stories** (S 16 · M 51 · L 0), all `not_started`.

## 2. Story list (id · size · owners · title, abridged)

| id | size | owners | title |
|---|---|---|---|
| K1.1 | M | API | Widen feature_definition/product for both worlds + ServiceDTO + admin services API |
| K1.2 | M | API | Doc-21 tables created if absent + dependency editor with cycle refusal |
| K1.3 | M | API | product_price (amount_minor, effective dating, annual columns) + catalog_publish/catalog_change + CatalogService |
| K1.4 | S | API | Seed individual-world services/products (no prices) + FeatureKeys registry test |
| K1.5 | M | API | Stripe Product/Price creation at publish, deactivate on retire, CatalogReconcileJob |
| K1.6 | M | API | Re-home hard-coded price ids, AI budgets, resume caps, MRR onto the catalog |
| K2.1 | M | API | plan/plan_version/plan_component + seed FREE/PRO/AUTOPILOT/ORG_STANDARD v1 + subscription backfill |
| K2.2 | M | API | PlanService: drafts, invariants, snapshot + publish, supersede, integrity job |
| K2.3 | M | API | PlanPreviewDTO: totals, worst-case margin with levers, roster preview, impact |
| K2.4 | M | API | Grandfathering invariants + PlanRetireGuard (version-migration primitive marked FUTURE — S-03) |
| K2.5 | M | API | Admin plans API with OpenAPI, idempotent publish, authz coverage |
| K3.1 | M | API | PricingEngine v2: intervals, plan/seat/org totals, monthly equivalent; golden S1 + G1–G14 |
| K3.2 | M | API | MarginCalculator v2: fee model SIMPLE/SCHEDULE, composition checks, levers, discounts never overridable |
| K3.3 | M | API | Personal QuoteService: subscription_quote, hash, TTL, PlanQuoteDTO, anonymous quotes |
| K3.4 | S | API | Settings registry keys for the module (intervals, annual, fee model, TTL, seats, shadow, cache, notice) |
| K4.1 | M | Web | Plans list page (admin kit) + nav + BFF |
| K4.2 | M | Web | Plan editor with autosaved draft, live margin ticks, 390 stepper |
| K4.3 | M | Web | Preview pane: totals, worst case, checks, impact; BottomSheet on 390 |
| K4.4 | M | Web | Publish flow: typed confirm, diff, override reason, history, Stripe-off banner |
| K4.5 | M | Web | Compare versions, subscribers by version, migration offer sheet |
| K4.6 | M | Web | Org plan editor: seat roles, seat rules, presets, roster preview |
| K4.7 | S | Web | Mock fixtures + Playwright admin-plans journey + axe |
| K5.1 | M | API, Web | Public catalog endpoint + /pricing rendered from it with interval tabs and add-on rows |
| K5.2 | M | API | subscription_addon + personal_subscription_change; webhook writes add-on rows |
| K5.3 | M | API, Web | Checkout from a quote (line items = quote), review sheet, success lists add-ons, legacy alias |
| K5.4 | M | API | Change flow: confirm → SubscriptionChangeApplier (items, proration items, retry) + undo removal |
| K5.5 | M | Web | My plan page: add-on steppers, impact preview, confirm, undo toast, meters |
| K5.6 | M | API, Web | Plan switch and interval switch (upgrade now / at period end; schedules or fallback) |
| K5.7 | S | API | PlanDTO v3, GET /api/billing/invoices, GET /api/entitlements/me |
| K5.8 | S | Web | Playwright pricing-addons journey + copy lint + no-plan-string-gate ESLint rule |
| K6.1 | M | API | Enterprise links (org_subscription.plan_version_id, interval, price pins) + GET /orgs/{id}/plan + filtered catalog |
| K6.2 | S | API | Seat TRANSFER operation ($0, no Stripe change, HIGH audit) |
| K6.3 | M | API | Org plan quotes: CHANGE_INTERVAL / MIGRATE_VERSION as BULK quotes applied at rollover |
| K6.4 | S | Web | Plan card on the org Subscription Overview + version compare/opt-in |
| K6.5 | M | API, Web | Seat matrix view + bulk transfer sheet |
| K6.6 | S | Web, API | QuoteSummary and org invoice line extensions (interval, equivalent, savings, version) |
| K7.1 | M | API | PlanResolver + EntitlementSet (Personal and Org readers), shadow compare, narrowed entitlement_grant |
| K7.2 | S | API | AiBudgetService window from the resolved set + ai_call columns |
| K7.3 | M | API | Migrate the 14 call sites to require(ctx, feature) with byte-identical bodies; AuthzCoverage |
| K7.4 | S | API, Ext | features[]/limits on /api/profile/version; extension gates on features |
| K7.5 | M | API | Personal usage ledger (personal_usage_event/counter), allowance resolution, additive add-ons |
| K7.6 | S | API, Web | PLAN_REQUIRED upgrade object + shared UpgradeSheet |
| K7.7 | S | API | Regression gate: E13/E14, LegacyReadersUnchangedIT, shadow-flip checklist, CI job |
| K8.1 | M | API | Webhook scope router + stripe_event scope/org_id; UserBillingHandler extracted unchanged |
| K8.2 | M | API | StripeGateway growth (checkout spec, items, schedules, invoice items, products/prices, preview) |
| K8.3 | M | API | Personal invoice + invoice_line mirror, paid_through_at, period start, renewal reminder hook |
| K8.4 | M | API | No-data migration (S-03): seed verification, backfill proven on empty + synthetic fixtures, period-start job kept, runbook |
| K8.5 | M | API | Personal reconciler + billing_drift + replay endpoint |
| K8.6 | M | API | FakeStripeGateway scenario harness + test-clock runbook scenario P |
| K8.7 | S | API, Web | Billing-disabled parity (BillingConfigIT) |
| K9.1 | M | API | YEAR interval: derived annual rows, precedence, guard with ai×12, levers; golden S2/S3 |
| K9.2 | M | API | Annual proration, term-end rules, interval switches in the personal appliers |
| K9.3 | S | API | Monthly sub-window allowances and AI budget on annual terms |
| K9.4 | M | Web | Annual customer UX: yearly tab, copy, savings |
| K9.5 | M | API, Web | Org annual: interval, seat quotes on YEAR units, overview rows, transfers |
| K9.6 | S | API | Annual operations runbook, tax precondition, self-check |
| K10.1 | M | API | Retirement model, RETIRING states, effective dates, impact, start/cancel/complete, 410 on purchases |
| K10.2 | M | API | SuccessorAdvisor closest match + per-subscriber quotes + nightly recompute |
| K10.3 | M | API | Notice schedule, channels, copy register, dedupe, enterprise recipients |
| K10.4 | M | API | Subscriber choices API (switch now/at renewal, pick, later, cancel) |
| K10.5 | M | API | RetirementJob: Free fallback with service locks (S-19), D-1 Stripe cancel, MIGRATE/CANCEL paths |
| K10.6 | M | API | Read-only lock evaluation: access tri-state, FEATURE_LOCKED, READ/WRITE modes, over-cap, instant release |
| K10.7 | M | API, Web | Enterprise retirement: seat fallback to base, seat locks, switch-all / per-seat, contract dates |
| K10.8 | M | API | Stripe mechanics for retirements: schedules, D-1 cancel, coupons carried, drift kind RETIREMENT |
| K10.9 | M | Web | Admin retirement wizard + progress page (1440/390) |
| K10.10 | M | Web, Ext | Customer UX: banner, "your plan is changing" page, one-click switch, lock states, extension line |
| K10.11 | S | API, Web | Retirement regression gate (NoEarlyLossIT, DowngradeNeverDeletesIT, NoSilentRepriceIT, E15, journeys) |

## 3. Build order and phases (each phase ends with its exit gate; one story = one commit = one PR into `develop`)

| Phase | Stories (in order) | Exit gate |
|---|---|---|
| **S0 Foundations (no behaviour change)** | K3.4 → K1.1 → K1.2 → K1.3 → K1.4 → K8.2 → K8.1 → K2.1 → K3.1 → K3.2 | all additive changelogs applied on a prod-like dump; `LegacyReadersUnchangedIT`, `BillingResourceIT`, `BillingWebhookIT`, `EntitlementServiceTest` green and unchanged; seed reuses the live Stripe price ids (K8.4 test subset) |
| **S1 Resolver in shadow** | K7.1 → K7.2 → K7.5 → K7.3 → K7.4 → K7.7 → K8.3 → K8.4 | `ShadowCompareTest` green on the fixture matrix and zero prod mismatches over one release (no two-week wait — no existing cohort, S-03); flip `billing.catalog.shadow=false` by checklist; `/api/profile/version` carries `features[]` |
| **S2 Plans and the builder (incl. annual rows)** | K1.5 → K2.2 → **K9.1** → K2.3 → K2.4 → K2.5 → K4.1 → K4.2 → K4.3 → K4.4 → K4.5 → K4.6 → K4.7 → **K9.3** → K1.6 | admin publishes PRO v2 and AUTOPILOT v1 with monthly, quarterly **and yearly** prices (derived rows under the guard); `/pricing` unchanged for the public until K5.1; env-var price path deleted |
| **S3 Individual add-ons and annual UX** | K3.3 → K5.1 → K5.2 → K5.3 → K5.4 → K5.7 → K5.5 → K5.6 → **K9.2** → **K9.4** → K7.6 → K8.5 → K8.6 → K8.7 → **K9.6** → K5.8 | a Pro subscriber buys two credit packs yearly from the pricing page, removes one from My plan (applies at renewal), switches interval; scenario harness green; reconciler zero drift for a week; tax mode decided before the first yearly invoice (S-09) |
| **S4 Retirement lifecycle (P0)** | K10.1 → K10.2 → K10.3 → K10.4 → K10.5 → K10.6 → K10.8 → K10.9 → K10.10 → K10.11 | a test retirement of a mock plan walks notice → choice → Free fallback with locks (default, S-20) in CI and in the test account (scenario R); `NoEarlyLossIT` green |
| **S5 Enterprise plan layer and org annual** (after X5.4/X6.12) | K6.1 → K6.2 → K6.3 → K6.6 → K6.4 → K6.5 → **K9.5** → K10.7 | E2E-C (22 §9 / 28 §11) passes with seats picked from the plan version on monthly and yearly terms; seat transfer and switch-all proven |

Answered decisions already applied: **S-01** annual ON · **S-03** no existing subscribers (K8.4 no-data; K2.4
migration primitive FUTURE) · **S-19** Free + read-only fallback · **S-20** wizard default retire-to-Free.
Still open and able to pause a story: **S-06** (which add-ons get prices — admin action, no story),
**S-09** (tax mode before the first yearly invoice — K9.6 self-check), **S-11** (fee model), **S-21** (alternative
retirement outcomes).

## 4. How K relates to the existing backlogs (nothing deleted)

| Existing | Relationship | K story |
|---|---|---|
| B1.1 Catalog schema + seed, A3.1 | **superseded** (table half) · seed/engine halves → K2.1 / K7.1 | K1.3 |
| B1.2 EntitlementService.resolve over grants | **superseded** (grants are not the truth; plan versions + add-ons are) | K7.1 |
| B1.3 webhook writes STRIPE_SUBSCRIPTION grants | not built (relates; explained in K7.1) | K7.1 |
| B1.4 features on /version, PlanDTO v2 | relates (K5.7, K7.4 deliver it) | K5.7, K7.4 |
| B1.5 public catalog + /pricing | **superseded** | K5.1 |
| B1.6 re-home config, A3.5 | relates (K1.6 delivers it) | K1.6 |
| B2.1/B2.2 MarginCalculator + guard, A3.3, X5.3 | relates (K3.2 is the one calculator; X5.3's org formulas live inside it) | K3.2 |
| B3.1 checkout v2, B3.3 upgrade sheet, B3.4 switch, B3.6 extension 402 | relates | K5.3, K7.6, K5.6, K7.4 |
| B4.1 webhook v2 invoice mirror, B4.2 reminders | relates (K8.3 delivers the mirror; reminders hook) | K8.3 |
| B9.1 scope router, B9.2 gateway growth, B9.4 quantity ops | relates (delivered by K8.1, K8.2, K5.4) | K8.1, K8.2, K5.4 |
| B10.1 reconciler, B10.2 replay, B10.4 harness | relates | K8.5, K8.6 |
| A3.4/A3.7 Catalog page, X5.13, X6.9 | relates — the Plans tab (K4) sits beside them; the price editor is shared | K4.* |
| X5.1 catalog tables, X5.2 feature tables | relates — shared ownership with MARK_RAN preconditions in both directions | K1.2, K1.3 |
| X5.4 LicenseService, X5.12 bulk, X6.12 org billing account | deps of K6 | K6.* |
| X5.5 PricingEngine, X5.6 check(), X5.7 ledger, X5.8 isPro migration, X5.9 regression | relates — one engine / one service / one ledger; K extends to the personal world | K3.1, K7.1, K7.5, K7.3, K7.7 |
| X6.1–X6.5 org billing pages, X6.13 bulk | relates — K6.4/K6.5/K6.6/K10.7 add the plan layer and retirement to them | K6.4, K6.5, K6.6, K10.7 |
| X6.6/X6.7/X6.8/X6.14/X6.15 org Stripe | relates — shared gateway, applier skeleton and reconciler kinds | K8.2, K5.4, K8.5, K10.8 |
| A2.4 comps | relates — grants now reference a plan version (06 §7) | K7.1 |
| E2E-A5.1 Settings › Features matrix | relates — reads plan components instead of product entitlements | K3.4 |

## 5. Sizing and effort (indicative)
67 stories · 118 points (S=1, M=2) · 29 critical. S0–S1 = 18 stories (the no-behaviour-change half);
S2 = 15; S3 = 16; S4 = 10; S5 = 8. Owner mentions: API 54 · Web 23 · Ext 2 (shared stories count for each owner).
