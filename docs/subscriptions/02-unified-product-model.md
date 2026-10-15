# 02 — Unified product model: services, plans, seats (one catalog for individuals and organizations)

> Status: design, 2026-10-15 (Fable, branch `subscription-design`). Design only. Builds on Phase 18
> (`docs/design/admin/catalog-margin-entitlements.md`, `docs/design/pay/catalog-entitlements-engine.md`)
> and Enterprise V2 docs `20`–`29` (`docs/enterprise-v2/`). Nothing here replaces those tables; it adds the
> **plan** layer on top and widens `feature_definition` to individuals so there is **one catalog**, not two.
> Current-state facts and gaps: `01-current-state-review.md`. Money rules: `03-pricing-model.md`. Tables:
> `08-data-model.md`. Conflicts with `CLAUDE.md`: `decisions-for-user.md` (nothing here overrides a lock).

## 1. The one-sentence model

> A **service** is a thing we can switch on and meter. A **plan** is a published, versioned composition of
> services: a **base** (what is included), **optional add-ons** (each priced), and for organizations a
> **seat** (what every licensed consultant gets, and what each seat may add). An individual subscribes to a
> plan version plus chosen add-ons; an organization subscribes to a plan version plus N seats, each seat
> configured from the plan's seat components. Everything — names, prices, allowances, discounts, intervals —
> is a row admin publishes; code ships keys and safe defaults only.

```
                 ┌────────────── CATALOG (platform, admin-published, versioned) ──────────────┐
                 │  feature_definition (= SERVICE)   product + product_price (what it costs)   │
                 │  feature_dependency · feature_definition_limit · license_preset · volume_tier│
                 │                                                                              │
                 │  plan ──< plan_version ──< plan_component  (BASE | INCLUDED | OPTIONAL |     │
                 │                                             SEAT_BASE | SEAT_INCLUDED |      │
                 │                                             SEAT_OPTIONAL | FEE)             │
                 └──────────────────────────────────────────────────────────────────────────────┘
                              │ audience INDIVIDUAL                      │ audience ORG
                              ▼                                          ▼
   PERSONAL   subscription (plan_version_id, interval)      ORG   org_subscription (plan_version_id, interval)
              └─< subscription_addon (feature, qty, price)        org_billing_account · org_contract · org_discount
                                                                   └─< consultant_license (= one SEAT)
                                                                         └─< license_feature (seat add-ons)
              EntitlementContext.Personal(login)                   EntitlementContext.Org(orgId, actor, beneficiary)
                              └──────────── EntitlementService.check (one evaluator, two readers) ────────────┘
```

## 2. Services (the catalog unit)

### 2.1 Definition
A service is a `feature_definition` row (21 §2.4) **widened** with the columns below (additive, `08` §2.1).
The key is stable and dotted; the row says what the service *is* and what it *allows*; `product` +
`product_price` say what it *costs* (21 §1 principle 1 — unchanged).

| Field | Source | Rule |
|---|---|---|
| `feature_key` | exists | stable, lower-case, dotted (`ai.resume_tailoring`); never renamed, only retired |
| `name`, `description` | exist | customer-facing; the plan builder and pricing page render these, never code strings |
| `category` | exists, +values | `BASE` `AUTOFILL` `RESUME` `MATCHING` `EMAIL` `MARKETING` `INTERVIEW` `ALERTS` `ANALYTICS` `AUTOMATION` `AI_CREDITS` `SYNC` `SUPPORT` `MODULE` `FEE` |
| `audience` | **new** | `INDIVIDUAL` \| `ORG` \| `BOTH` — eligibility by world (replaces the implicit "org only" of 21) |
| `usage_unit`, `default_allowance`, `allowance_period`, `pool_mode` | exist | nothing unlimited: a NULL allowance is refused; `none` + 0 for pure access services |
| `feature_definition_limit` rows | exist | secondary caps (`operations.per_day`), each with its own period |
| `ai_budget_cents`, `consumes_ai`, `reserve_ttl_seconds` | exist | the worst-case model cost per period (the guard's input) |
| `stackable`, `max_quantity` | exist | quantity > 1 only when stackable (credits, resume packs) |
| `eligibility_json` | exists | `{orgTypes, requiresBaseCodes, minOrgAgeDays, countries?, verification?: "STUDENT"}` |
| `entitlement_keys_json` | **new** | the **legacy capability keys** this service confers, e.g. `["ai.server"]`, `["answers.sync"]`, `["inbox"]` — how today's `isPro` callers map (06 §4); empty for most |
| `limit_key` | **new** | when the service's allowance *is* a plan limit (`resumes.max`, `matches.per_day`), the key that `limit(ctx, key)` answers; NULL otherwise |
| `visibility` | **new** | `PUBLIC` (pricing page) \| `ADMIN_ONLY` (sold only through admin/contracts) \| `HIDDEN` (technical, e.g. consent kinds) |
| `sort_order`, `icon_key` | exist (foundation) | |

### 2.2 What a service unlocks
`EntitlementService.has(ctx, feature_key)` is the primary question (24 §6). For the keys today's code asks
about (`ai.server`, `resumes.max`, `answers.sync`, `inbox`, `matches.per_day`, `autopilot.apps_per_month`,
`autopilot.apps_per_day`, `interview.ai_practice`, `ai.budget_cents_per_period`), the resolver also answers
`has(ctx, capabilityKey)` and `limit(ctx, limitKey)` by projecting the **union of the person's live services**:

```
capabilities(ctx) = ∪ service.entitlement_keys_json over live services
limit(ctx, key)   = max over live services where service.limit_key = key of effectiveAllowance(service)
aiBudget(ctx)     = Σ service.ai_budget_cents × quantity over live services (× period factor, 03 §6)
```
"Highest wins, never the sum" (ROADMAP cost controls) stays true **within one context**; there is no cross-
context union (O4: enterprise and personal accounts are different rows).

### 2.3 Dependencies (unchanged semantics, 21 §4)
`feature_dependency(feature_key, requires_feature_key, kind TECHNICAL|COMMERCIAL|INTEGRATION|CONSENT)`.
The plan builder and the customer add-on picker run the **same** rules the license quote runs today:
TECHNICAL free → auto-added and shown; TECHNICAL paid → refused unless the dependency is in the plan's
base; COMMERCIAL → cost-confirmation sheet (never silently added); INTEGRATION/CONSENT → licensed but
`check()` refuses until satisfied. A plan version that includes a service without its TECHNICAL
dependency is **unpublishable** (`422 PLAN_DEPENDENCY_MISSING`).

### 2.4 The starting service list (seeded; prices never seeded)

Keys with `audience=ORG` are exactly 21 §3 (unchanged). The rows below **add the individual world** so Free,
Pro and Autopilot can be expressed as compositions. "Today" = how the behaviour is coded now (Phase 12/13).

| feature_key | audience | category | unit · allowance / period | ai ¢ | entitlement_keys / limit_key | Today |
|---|---|---|---|---|---|---|
| `base.personal` | INDIVIDUAL | BASE | none · 0 | 0 | — | the Free product: autofill on every ATS, board, capture, profile, learned answers on-device, BYO key |
| `resume.library` | BOTH | RESUME | `resumes` · **3** (cap on non-archived) | 0 | limit_key `resumes.max` | `RESUME_LIMIT` 402; Free 3 / Pro 25 / Autopilot 50 via plan allowance overrides |
| `resume.ai_parsing` | BOTH | RESUME | `parses` · 3 / PERIOD (= one per resume slot; Pro 25, Autopilot 50 via override) | 20 | — | the one free server-AI exception (ROADMAP tiers) |
| `ai.autofill` | INDIVIDUAL | AUTOFILL | `operations` · 2000 / PERIOD | 150 | `ai.server` | "Kiwiply AI for autofill" (mapping, picks, drafting) — Pro |
| `answers.sync` | INDIVIDUAL | SYNC | `syncs` · 5000 / PERIOD | 0 | `answers.sync` | learned answers synced across devices — Pro |
| `ai.resume_tailoring` | BOTH | RESUME | `tailorings` · 40 | 125 | — | Pro (resume tailoring to JD) / org add-on |
| `resume.optimization` | BOTH | RESUME | `optimizations` · 40 | 50 | — | Pro (ATS score) / org add-on |
| `ai.job_matching` | BOTH | MATCHING | `matches` · 300 | 75 | `matches.ai_scored`; limit_key `matches.per_day` (limit row 20/DAY; Free rule-ranked 3/DAY lives on `matches.basic`) | Pro daily matches |
| `matches.basic` | INDIVIDUAL | MATCHING | `matches` · 3 / DAY | 0 | limit_key `matches.per_day` | Free 3 rule-ranked matches |
| `inbox.monitoring` | BOTH | EMAIL | `connections` · 1 | 60 | `inbox` | Pro inbox auto-status / org add-on |
| `interview.ai_prep` | BOTH | INTERVIEW | `sessions` · 20 | 150 | `interview.ai_practice` | inside Pro/Autopilot; org add-on |
| `automation.approved_apply` | BOTH | AUTOMATION | `operations` · 300 / PERIOD + 30 / DAY | 300 | `autopilot.apps_per_month`, `autopilot.apps_per_day` | Autopilot prepare (Phase 19) |
| `alerts.advanced` | BOTH | ALERTS | `alerts` · 500 | 0 | limit_key `alerts.max` | Pro (Launch 2) |
| `analytics.applications` | BOTH | ANALYTICS | `reports` · 100 | 0 | `analytics.full` | Pro (Launch 2) |
| `builder.ai` | INDIVIDUAL | RESUME | `assists` · 200 | 80 | `builder.ai` | resume builder AI assist (Pro) |
| `ai.credits_extra` | BOTH | AI_CREDITS | `credits` · 1 / unit, stackable max 4 | 75 / unit | — | new optional add-on (org: exists in 21) |
| `resume.extra_pack` | INDIVIDUAL | RESUME | `resumes` · +10 / unit, stackable max 3 | 0 | limit_key `resumes.max` (additive on top of the plan allowance — the one additive limit, flagged `additive=true`) | new optional add-on |
| `resume.advanced_versions`, `marketing.assisted_applications`, `base.consultant`, `module.*`, consent kinds | ORG | — | 21 §3 unchanged | | | |
| `support.priority` | BOTH | SUPPORT | none · 0 | 0 | — | new optional add-on (admin decides whether to publish) |

Rules: (1) every service has an allowance (nothing unlimited); (2) a service with `ai_budget_cents > 0` is
always a separately priceable component so the margin guard sees it, even when a plan includes it; (3)
the individual world has **no mandatory base price** — `base.personal` is the free base (price 0) and the
paid plans add services on top; the org world keeps E3's **mandatory paid base** (`base.consultant`).

## 3. Plans (compositions)

### 3.1 Definition
A plan is `plan` (identity) + `plan_version` (immutable, effective-dated snapshot) + `plan_component`
rows. **Nothing about a published version is ever updated**; a change is a new version (ADR-013 extended
from prices to plans). Subscriptions reference the **version** they bought (grandfathering is structural).

| Object | Fields (full DDL in `08` §2) |
|---|---|
| `plan` | `plan_key` (UQ, `PRO`, `AUTOPILOT`, `FREE`, `ORG_CONSULTANCY`…), `name`, `audience` INDIVIDUAL\|ORG, `status` DRAFT\|PUBLISHED\|**RETIRING**\|RETIRED (the retirement lifecycle is `11-plan-retirement.md`), `public`, `description`, `sort_order`, `badge` ("Most popular"), `successor_plan_id` (default successor; a retirement maps ranked successors in `plan_retirement_successor`) |
| `plan_version` | `plan_id`, `version` (1..n), `status` DRAFT\|PUBLISHED\|SUPERSEDED\|RETIRING\|RETIRED, `effective_from`, `effective_until`, `catalog_version`, `base_product_id` (the SUBSCRIPTION product whose prices are the plan's base prices; NULL for FREE), `intervals_json` (`["MONTH","QUARTER"]` + `"YEAR"` only when annual is enabled), `annual_discount_bp` (NULL = global), `seat_rules_json` (ORG: `{seatBaseProductId, minSeats, maxSeats, setupFeeProductId, platformFeeProductId, presets[]}`), `snapshot_json` (the rendered composition: every component with its price ids and allowances — the record of what was sold), `published_by`, `published_at`, `summary` |
| `plan_component` | `plan_version_id`, `feature_key`, `role` BASE\|INCLUDED\|OPTIONAL\|SEAT_BASE\|SEAT_INCLUDED\|SEAT_OPTIONAL\|FEE, `product_id` (OPTIONAL/SEAT_OPTIONAL/FEE: the priceable product), `allowance_override`, `limit_overrides_json`, `default_quantity`, `max_quantity`, `default_on` (OPTIONAL shown pre-selected? — **always false**, honest UX), `component_discount_bp` (annual discount for this component, NULL = plan), `sort_order`, `marketing_label` |

### 3.2 Component roles

| Role | Audience | Meaning | Price source |
|---|---|---|---|
| `BASE` | INDIVIDUAL | the plan's bundle of included services, sold as one price (the SUBSCRIPTION product) | `product_price(base_product_id, INDIVIDUAL, interval)` |
| `INCLUDED` | both | a service inside the base, at a plan-specific allowance (no own price) | — |
| `OPTIONAL` | INDIVIDUAL | an add-on the subscriber may pick, at its own price | `product_price(component.product_id, INDIVIDUAL, interval)` |
| `SEAT_BASE` | ORG | the mandatory per-seat license (E3 `ORG_BASE_LICENSE`) | `product_price(seatBaseProductId, ORG, interval)` |
| `SEAT_INCLUDED` | ORG | a service every seat gets (inside the seat base price) | — |
| `SEAT_OPTIONAL` | ORG | a per-seat add-on an org admin may pick per consultant | `product_price(component.product_id, ORG, interval)` |
| `FEE` | ORG | one-time or flat org-level charges: setup fee, optional platform fee, org modules | `product_price(product, ORG, ONE_TIME|interval)` |

### 3.3 Free / Pro / Autopilot as compositions (seed, version 1 — behaviour-identical to today)

| plan_key | BASE product (prices as today) | INCLUDED (allowance) | OPTIONAL at launch |
|---|---|---|---|
| `FREE` | — (no charge) | `base.personal`, `resume.library` (3), `resume.ai_parsing` (3), `matches.basic` (3/day) | none published |
| `PRO` | `PRO` — $19.99 MONTH, $49.99 QUARTER (existing Stripe price ids reused) | everything in FREE + `resume.library` (25), `resume.ai_parsing` (25), `ai.autofill`, `answers.sync`, `ai.resume_tailoring`, `resume.optimization`, `ai.job_matching` (20/day), `inbox.monitoring`, `interview.ai_prep`, `alerts.advanced`, `analytics.applications`, `builder.ai` | `ai.credits_extra`, `resume.extra_pack`, `support.priority` — **seeded as components with no published price**, so nothing is sellable until admin publishes a price (same rule as E3) |
| `AUTOPILOT` | `AUTOPILOT` — $39.99 MONTH, $99.99 QUARTER | everything in PRO + `resume.library` (50), `resume.ai_parsing` (50), `automation.approved_apply` (300/period, 30/day) | same as PRO |

Plan-level AI budget = Σ included `ai_budget_cents` **capped by the plan's `ai_budget_cap_cents`** on the
version (Pro 300 / 800 per quarter, Autopilot 600 / 1600 — the locked budgets). The cap is the number the
guard uses; the per-service budgets inside a plan are *shares* of it (how `AiBudgetService` attributes
spend per feature), never additive above the cap. For an **add-on** bought on top of a plan the add-on's
own `ai_budget_cents` is added to the window (that is what the customer pays for).

### 3.4 Organization plans as compositions (reconciled with E3)

| plan_key | FEE components | SEAT_BASE | SEAT_INCLUDED | SEAT_OPTIONAL | seat_rules |
|---|---|---|---|---|---|
| `ORG_STANDARD` (default, seeded v1, no prices) | `ORG_SETUP_FEE` ONE_TIME (always charged, E3); `ORG_PLATFORM_FEE` MONTH (**optional, default no price = $0**) | `ORG_BASE_LICENSE` = `base.consultant` | 21 §3 base contents | every 21 §3 add-on at its ORG price; presets of 21 §3.5 | `minSeats 1`, `maxSeats` from setting `enterprise.license.max_seats` (500) |
| `ORG_CONSULTANCY` | as above + `module.talent_marketing` PER_ROLE, `module.consultancy_ops` FLAT (Phase 23) | same | same | same | same |

So E3's model **is** an org plan: `consultant_license` = a seat on the org's plan version;
`license_feature` = the seat's SEAT_OPTIONAL picks; `org_module_license` = FEE components with a
quantity basis; `license_preset` = a seat shortcut. The only additions are the `plan_version_id` the org
subscribed under (so two orgs can be on different versions of `ORG_STANDARD` with different included
services) and the per-seat allowed component list (an org may only pick what its plan version offers).

### 3.5 What "create a plan at any time" means
Admin picks services from the one catalog, assigns roles, sets allowances, chooses which products carry
the prices (or creates them in the same flow), sets intervals and the annual discount, runs the margin
guard on **every sellable combination** (03 §7), previews the impact, and publishes an effective-dated
version. Presets/bundles are shortcuts over the same components (21 §3.5), with no price of their own
unless the user answers S-05 in `decisions-for-user.md`.

## 4. Subscriptions (who holds what)

| World | Row | References | Items |
|---|---|---|---|
| Personal | `subscription` (exists, +`plan_version_id`, +`billing_interval`, +`current_period_start`) | one plan version | `subscription_addon` rows (new): feature_key, product_id, price_id, quantity, stripe_item_id, starts_at/ends_at, live |
| Org | `org_subscription` (exists in the foundation, +`plan_version_id`, +`billing_interval`) | one plan version | `consultant_license` (seats) + `license_feature` (seat add-ons) + `org_module_license` (FEE components) — unchanged |

Rules (both worlds): one live subscription per account/org; all items share the subscription's interval
(Stripe constraint — `07` §2); the plan version is pinned at purchase and moves only when the customer
confirms a quote that says the version changed (`06` §5 grandfathering); add = now (prorated), remove =
period end (no refund) — unchanged from 27 §2.

## 5. Presets and bundles
`license_preset` (21 §2.6) stays the org seat shortcut. For individuals, `plan_version.presets_json` may
list named add-on combinations ("Power user: +2 credits, +1 pack") rendered as one-tap chips that tick the
add-ons visibly; a preset never adds a line the customer did not see priced. A bundle **discount** is
S-05 (default: none).

## 6. Eligibility and verification
`feature_definition.eligibility_json` and `plan.eligibility_json` carry `{countries, verification:
"STUDENT", orgTypes, minOrgAgeDays}`; the public catalog filters by the visitor's country and
verification state (the B7 student/regional rows become plans `PRO_STUDENT`, `PRO_LITE` on this model,
not coupons — `discounts-regional-student.md` D3/D5 kept as written).

## 7. Invariants (each is a test, `10` §K1/K2)
1. Every `plan_component` with role BASE/OPTIONAL/SEAT_BASE/SEAT_OPTIONAL/FEE references a product whose
   `sold_to` matches the plan audience and whose active price exists for **every** interval in
   `intervals_json` — else publish is refused `422 PLAN_PRICE_MISSING {featureKey, interval}`.
2. Every INCLUDED/SEAT_INCLUDED service with `ai_budget_cents > 0` contributes to the version's worst-case
   AI budget and the guard runs on the base price with that budget.
3. A published version is byte-immutable: `snapshot_json` hash stored at publish and re-verified by the
   nightly `CatalogIntegrityJob`.
4. `FREE` has exactly one version live at a time, no base product, no OPTIONAL components with a price
   (Free never pays — a Free user who wants an add-on is shown the plan that includes it).
5. No service appears twice in one version; no OPTIONAL component duplicates an INCLUDED one.
6. For every subscription, `plan_version.audience` equals the account world (personal ↔ INDIVIDUAL,
   org ↔ ORG) — the O4 separation at the data level.
