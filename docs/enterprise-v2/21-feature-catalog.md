# 21 — Feature catalog: definitions, immutable prices, versions, dependencies, eligibility, presets, allowances

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-012, ADR-013, ADR-015 on top of the
> Phase 18 catalog design (`docs/design/admin/catalog-margin-entitlements.md`) — **one catalog** for
> personal plans and enterprise licenses, never two. E3 is **answered 2026-10-12**: base license +
> per-feature add-ons per consultant replaces the locked "setup fee + per-person items"; the old
> per-person items become features/presets; the setup fee stays a one-time catalog item; the ≥ 80 %
> margin guard stays; **the catalog ships with no prices until admin publishes.** Build-ready for
> **X5.1** (catalog tables + admin page), **X5.2** (feature definitions, dependencies, presets,
> tiers), **X5.3** (margin guard for the new kinds), **X6.9** (Platform Pricing Admin).

## 1. Principles
1. **Definition ≠ price.** `feature_definition` says what a feature is and what it allows;
   `product` + `product_price` say what it costs. A feature with no published price is visible to
   admins and invisible to orgs.
2. **Prices are immutable, effective-dated rows.** Nothing updates an amount; a change is a new row
   with `effective_from`, and the old row gets `effective_until`/`retired_at`. Licenses, quotes,
   contracts and invoices reference price **ids**, so a contracted price can never move (§15).
3. **One monotonic `catalog_version`** bumped by every publish; everything commercial records the
   version it was made under.
4. **Nothing is unlimited.** Every feature has a numeric allowance per period (or `0` for pure
   access features that consume nothing, e.g. advanced versions, which are capped by their own
   limit column). A NULL allowance is refused by the editor.
5. **Everything admin-configured.** Code ships keys, kinds and safe defaults; prices, allowances,
   dependencies, presets, tiers and eligibility are rows edited from Platform Pricing Admin.

## 2. Tables (Liquibase `20261019010000_ent_catalog.xml`, additive — Phase-5 bucket, 06 §4; Phase 18 tables created here if absent)

### 2.1 `product` (Phase 18 + enterprise kinds)
`code` (UQ, e.g. `ORG_BASE_LICENSE`, `FEAT_AI_JOB_MATCHING`), `name`, `kind` `SUBSCRIPTION|SEAT|SERVICE|FEE|BUNDLE|BASE_LICENSE|FEATURE|ORG_MODULE`, `sold_to` `INDIVIDUAL|ORG|BOTH`, **`feature_key`** (FK `feature_definition`, NOT NULL for FEATURE/ORG_MODULE/BASE_LICENSE), **`quantity_basis`** `FLAT|PER_ROLE` (ORG_MODULE), **`role_key`** (PER_ROLE), `description`, `active`, `sort_order`, audit columns. `SEAT` stays for the legacy org seat rows; **no `SEAT` row is seeded for enterprise** (they became presets/features, E3).

### 2.2 `product_price` (Phase 18 + effective dating)
`product_id`, `audience` `INDIVIDUAL|ORG`, `billing_interval` `MONTH|QUARTER|ONE_TIME` (**ORG + QUARTER refused**, E17 default), `amount_minor` BIGINT, `currency` CHAR(3), `stripe_price_id` (NULL = draft), `payout_minor`, `subscriber_discount_pct`, `margin_pct_worst` DECIMAL(5,2), `active`, `published_at`, `retired_at`, **`effective_from`** DATETIME(6) NOT NULL, **`effective_until`** NULL, **`catalog_version`** INT NOT NULL, `created_by`, `created_at`. Rename note: Phase 18 wrote `amount_cents`; the enterprise changelog creates the table as `amount_minor` from the start (the Phase 18 story A3.1 is superseded by X5.1; `relates` kept).
Constraints: at most one *active* row per `(product_id, audience, billing_interval, currency)` at any instant (service check + `active_key` generated column `IF(active, CONCAT_WS(':',product_id,audience,billing_interval,currency), NULL)` UNIQUE).

### 2.3 `catalog_publish`
`id` INT PK = the **catalog_version**, `published_at`, `published_by`, `summary` (what changed, generated), `price_ids_json`, `feature_keys_json`. `catalog_version` = `MAX(id)`; a publish inserts the next id in the same transaction as the price/feature rows it activates.

### 2.4 `feature_definition`
| column | notes |
|---|---|
| feature_key VARCHAR(60) PK | dotted, stable, lower-case (`ai.resume_tailoring`) |
| name (80), description (500) | shown to org admins and consultants |
| category | `BASE` `MATCHING` `RESUME` `EMAIL` `MARKETING` `INTERVIEW` `ALERTS` `ANALYTICS` `AUTOMATION` `AI_CREDITS` `MODULE` |
| usage_unit (24) | `tailorings`, `optimizations`, `matches`, `connections`, `preparations`, `sessions`, `alerts`, `reports`, `operations`, `credits`, `versions`, `none` |
| default_allowance BIGINT NOT NULL | per `allowance_period`; `0` only when `usage_unit='none'` |
| allowance_period | `PERIOD` (org billing period, default) `MONTH` (calendar UTC) `DAY` |
| pool_mode | `PER_CONSULTANT` (default, E18) `ORG_POOL`. A `category = MODULE` row (e.g. `module.talent_marketing`) is always `ORG_POOL` with allowance = `default_allowance × org_module_license.quantity`; its beneficiary is the acting employee (09 row 9) |
| ai_budget_cents INT NOT NULL DEFAULT 0 | the model-cost budget this feature adds to the beneficiary's org AI budget per period; also the margin guard's worst-case AI cost |
| reserve_ttl_seconds INT DEFAULT 900 | reservation timeout (25 §4) |
| stackable BOOLEAN DEFAULT false, max_quantity INT NULL | only `ai.credits_extra` |
| eligibility_json JSON | `{"orgTypes":["CONSULTANCY","STAFFING",…] \| null, "requiresBaseCodes":["ORG_BASE_LICENSE"], "minOrgAgeDays":0}` |
| consumes_ai BOOLEAN | whether `check()` also runs the AI budget guard |
| active BOOLEAN, catalog_version INT, created_at, updated_at, updated_by | |

### 2.5 `feature_dependency`
`feature_key`, `requires_feature_key`, `kind` `TECHNICAL|COMMERCIAL|INTEGRATION|CONSENT`, `note` (200), `active`. PK `(feature_key, requires_feature_key, kind)`. Cycles are refused by the editor (DFS on save). `requires_feature_key` may name a non-purchasable key for INTEGRATION/CONSENT (`integration.inbox_connected`, `integration.extension_connected`, and the **consent kinds** of `ConsentKinds`: `consent.act_for` (= the FULL pairing, no `org_feature_consent` row), `consent.resume_edit`, `consent.resume_view_org`, `consent.ai_tailoring`, `consent.ai_optimization`, `consent.marketing_assist`) — those keys exist in `feature_definition` with `category=MODULE`, `usage_unit='none'`, no product. `org_feature_consent.feature_key` always holds a consent kind, never a purchasable feature key (09 row 10); seeded CONSENT rows: `ai.resume_tailoring → consent.ai_tailoring`, `resume.optimization → consent.ai_optimization`, `marketing.assisted_applications → consent.act_for` (§3.4).

### 2.6 `license_preset`
`key` (40, UQ), `name`, `description`, `feature_keys_json` (ordered), `mirrors_product_code` NULL (`PRO`/`AUTOPILOT` — enables the hard "above individual" check, §5), `active`, `sort_order`, `catalog_version`. A preset **has no price**: applying it produces ordinary `license_feature` rows at their own effective prices (ADR-012). Escalation C5 asks whether presets may carry a bundle discount later.

### 2.7 `volume_tier` (ADR-015, ships empty)
`id`, `product_id` NULL (= all ORG recurring products), `min_licensed_consultants` INT, `pct_off_bp` INT (basis points, 0–5000), `active`, `effective_from`, `effective_until`, `catalog_version`. Non-overlapping ranges per product enforced on save.

### 2.8 `org_contract`, `org_contract_price` — see `23-contract-discounts.md`.

## 3. Starting feature set and the base / add-on split (recommendation)

**Rule used to split:** the base carries everything that costs us nothing variable and that a
consultant needs to be *managed* (so a licensed consultant is always a complete, usable seat);
every feature with model cost, an external connection, or a marketer acting on the person's behalf
is an add-on with its own allowance and AI budget, so the margin guard can see each cost.

| feature_key | In | Why | unit · default allowance / period | ai_budget_cents | consumes_ai |
|---|---|---|---|---|---|
| `base.consultant` | **BASE** (`ORG_BASE_LICENSE`) | consultant workspace, profile overlay, org-managed resume links + approvals, rule-ranked job discovery (no AI), application tracking via submit-detect link, interview coordination records, notifications, standard alerts, up to 3 resume versions | `none` · 0 | 0 | no |
| `ai.job_matching` | add-on | AI-scored matches for the consultant (opportunity_match scoring) | `matches` · 300 | 75 | yes |
| `ai.resume_tailoring` | add-on | tailor a resume to a posting/requirement (self or marketer with consent) | `tailorings` · 40 | 125 | yes |
| `resume.optimization` | add-on | ATS/keyword optimisation passes | `optimizations` · 40 | 50 | yes |
| `resume.advanced_versions` | add-on | versions beyond the base cap, compare, branch, per-client variants | `versions` · 50 (cap) | 0 | no |
| `inbox.monitoring` | add-on | the consultant's own Gmail over IMAP, classification of application mail | `connections` · 1 | 60 | yes |
| `marketing.assisted_applications` | add-on | marketer prepares applications/submission packs for the consultant (never submits) | `preparations` · 60 | 75 | yes |
| `interview.ai_prep` | add-on | AI interview practice (text) | `sessions` · 20 | 150 | yes |
| `alerts.advanced` | add-on | instant alerts, saved searches, client-requirement alerts | `alerts` · 500 | 0 | no |
| `analytics.applications` | add-on | per-consultant application analytics & exports | `reports` · 100 | 0 | no |
| `automation.approved_apply` | add-on | Autopilot **prepare** for assigned/approved jobs in the consultant's own browser; stops before submit (E1 answered: the consultant submits) | `operations` · 300 / period, 30 / day (second allowance row via `feature_definition_limit`, §3.1) | 300 | yes |
| `ai.credits_extra` | add-on, stackable (max 4) | +AI budget for any licensed AI feature | `credits` · 1 per unit | 75 per unit | n/a |

### 3.1 Secondary limits
`feature_definition_limit (feature_key, limit_key, limit_value, period DAY|PERIOD)` for features with
more than one cap (`automation.approved_apply`: `operations.per_day=30`). `check()` evaluates every
row for the feature.

### 3.2 Why not in base
- *AI Job Matching, Tailoring, Optimisation, Interview Prep, Autopilot prepare*: model cost → each needs its own worst-case budget in the guard.
- *Inbox monitoring*: an external connection with support load and poll cost.
- *Marketing-assisted applications*: a marketer's time and AI drafting spent on this consultant; also the thing consultancies pay for.
- *Advanced versions / alerts / analytics*: no AI cost but bounded resources (storage, mail, exports) — cheap add-ons let "base only" stay the cheapest complete seat (consultant C in §14).

### 3.3 Mapping of the old locked per-person items (E3 answered)
| Old item | Becomes |
|---|---|
| Pro seat $24.99 | preset **Resume & AI Support** (`mirrors_product_code=PRO`) |
| Autopilot seat $49.99 | preset **Full Career Support** (`mirrors_product_code=AUTOPILOT`) |
| AI Interview Practice $9.99 | feature `interview.ai_prep` |
| Marketer seat $29.99 | ORG_MODULE `module.talent_marketing` PER_ROLE `MARKETING_SPECIALIST` |
| Consultancy Ops add-on | ORG_MODULE `module.consultancy_ops` (Phase 23) |
| Setup fee $499 | stays: product `ORG_SETUP_FEE` kind `FEE`, ONE_TIME |
| Human services | unchanged `SERVICE` products, list price for orgs |

### 3.4 Dependency graph (seeded, admin-editable)
| feature | requires | kind | effect |
|---|---|---|---|
| every FEATURE | `base.consultant` | TECHNICAL | a license always has a base (structural; the quote cannot violate it) |
| `ai.resume_tailoring` | `resume.advanced_versions` | **none** (deliberately) | tailoring writes a new version within the base cap; above cap → `RESUME_VERSION_LIMIT` with an upsell card |
| `marketing.assisted_applications` | `consent.act_for` | CONSENT | the consultant's FULL share naming the marketer (05 §5); no row in `org_feature_consent` |
| `ai.resume_tailoring` | `consent.ai_tailoring` | CONSENT | per-consultant kind in `org_feature_consent` (30 §4; 09 row 10) |
| `resume.optimization` | `consent.ai_optimization` | CONSENT | as above |
| `marketing.assisted_applications` | `ai.resume_tailoring` | **none** (recommended only) | packs use the org-approved resume as-is; tailoring is an upsell card, never a forced line — keeps §14's consultant B (Base + Email + Marketing + Interview) representable |
| `automation.approved_apply` | `integration.extension_connected` | INTEGRATION | licensed, but `check()` → `INTEGRATION_REQUIRED` until the consultant's extension is connected (Phase 9) |
| `automation.approved_apply` | `ai.job_matching` | COMMERCIAL | prepares only matched/approved jobs |
| `inbox.monitoring` | `integration.inbox_connected` | INTEGRATION | consultant connects their own Gmail (App Password); the org never sees credentials |
| `analytics.applications` | `inbox.monitoring` | none | analytics works without the inbox; it just has less data (documented in the description) |
| `ai.credits_extra` | any `consumes_ai` feature | COMMERCIAL (rule `anyOf`) | refused with `DEPENDENCY_REQUIRED` when no AI feature is on the license |
| `module.consultancy_ops` | `module.talent_marketing` | COMMERCIAL | Phase 23 |

This graph is authoritative (09 row 9): Session D's proposed `automation.approved_apply → marketing.assisted_applications` TECHNICAL row is **dropped** (Autopilot prepare works from any approved match; the COMMERCIAL row on `ai.job_matching` above already covers "prepares only matched/approved jobs").

### 3.5 Presets (seeded inactive; admin activates)
| key | features | mirrors |
|---|---|---|
| `JOB_SEARCH_ESSENTIALS` | base + `ai.job_matching` + `alerts.advanced` | — |
| `RESUME_AI_SUPPORT` | base + `ai.resume_tailoring` + `resume.optimization` + `resume.advanced_versions` | `PRO` |
| `TALENT_MARKETING_SUPPORT` | base + `marketing.assisted_applications` + `inbox.monitoring` + `analytics.applications` | — |
| `INTERVIEW_SUPPORT` | base + `interview.ai_prep` | — |
| `FULL_CAREER_SUPPORT` | base + all features except `ai.credits_extra` | `AUTOPILOT` |

A preset is a shortcut: applying it adds whatever is missing, removes nothing, and the quote shows each line. A license that no longer matches any preset is just a license (no "preset" state is stored; the UI labels a license "Full Career Support" only when the set matches exactly).

## 4. Dependency semantics (for the quote engine and `check()`)

| kind | Checked when | On failure | Who fixes it |
|---|---|---|---|
| TECHNICAL | quote | free dep auto-added and shown; paid dep → `DEPENDENCY_REQUIRED` | org admin adds it in the same quote |
| COMMERCIAL | quote + confirm | `DEPENDENCY_UNCONFIRMED` unless the dep's key is in `confirmedCommercialDeps` → full cost impact shown (both lines, both prices, new total) | org admin confirms (the cost-confirmation dialog, 24-UX §9) |
| INTEGRATION | `check()` step 7b | `INTEGRATION_REQUIRED {integrationKey}` 409 | the consultant (connect inbox/extension) |
| CONSENT | `check()` step 10 | `CONSENT_REQUIRED {beneficiary, consentKind}` 403 | the consultant grants consent |

## 5. Margin guard for the new kinds (X5.3; extends `MarginCalculator`)

Inputs from settings: `catalog.stripe.pct_bp` (290), `catalog.stripe.fixed_cents` (30), **new** `catalog.stripe.invoicing_bp` (40, Stripe Invoicing fee on `send_invoice`), `catalog.margin_floor_subscription_pct` (80), `catalog.org_above_individual_pct` (**new**, 25), `catalog.org_min_invoice_lines` (**new**, 1 — reserved).

```
fee_base(p)    = mulDivHalfEven(p, pct_bp + invoicing_bp, 10000) + fixed_cents      -- the base line carries the per-invoice fixed fee
fee_feature(p) = mulDivHalfEven(p, pct_bp + invoicing_bp, 10000)                    -- every feature requires a base on the same invoice (TECHNICAL dep), so the fixed fee is never paid twice
margin(p, ai)  = (p - fee(p) - ai) * 10000 / p   (basis points, floor division)     -- p = amount_minor, ai = feature_definition.ai_budget_cents (× quantity for stackable)
BASE_LICENSE:  margin(p, 0) with fee_base
FEATURE:       margin(p, ai_budget_cents) with fee_feature
ORG_MODULE:    margin(p, ai_budget_cents) with fee_feature (PER_ROLE lines also sit on an invoice with a base line; a FLAT-only org with no consultants is a guard warning, not a failure)
FEE / ONE_TIME: (p - fee_base(p)) / p, informational
```
Floor: `margin_bp ≥ floor_pct × 100` else `422 MARGIN_BELOW_FLOOR {marginBp, floorBp}` unless `overrideReason` (≥ 20 chars) → HIGH audit `CATALOG_MARGIN_OVERRIDE` (Phase 18 D4, unchanged).

**Preset checks** (run on preset save and on every price publish touching a preset's features):
- *Above individual* (hard when `mirrors_product_code` is set): `Σ effective list prices of the preset ≥ mulDivHalfEven(individual_price, 10000 + above_pct×100, 10000)` where `individual_price` is the active INDIVIDUAL MONTH price of the mirrored product; failure → `422 PRESET_BELOW_INDIVIDUAL {presetKey, sumMinor, requiredMinor}`. Presets without a mirror get a warning when the sum is below individual Pro.
- *Worst-case margin of the preset as a whole*: `margin(Σp, Σai)` with `fee_base` — must also pass the floor (a preset of thin features cannot hide behind a fat base).
- *Volume worst case*: the guard re-evaluates every active price at the deepest active `volume_tier` (`p × (10000 − pct_off_bp)/10000`) and refuses a tier that pushes any product under the floor (`422 TIER_BELOW_FLOOR`).

## 6. Draft default prices (USD, MONTH, audience ORG) — **not seeded; an admin types them**
The margin guard validates each row; these are the numbers the golden tables in `22` use.

| product code | feature | amount_minor | ai | fee | margin |
|---|---|---|---|---|---|
| `ORG_BASE_LICENSE` | `base.consultant` | 1499 | 0 | 49+30=79 | 94.7 % |
| `FEAT_AI_JOB_MATCHING` | `ai.job_matching` | 499 | 75 | 16 | 81.8 % |
| `FEAT_AI_RESUME_TAILORING` | `ai.resume_tailoring` | 799 | 125 | 26 | 81.1 % |
| `FEAT_RESUME_OPTIMIZATION` | `resume.optimization` | 399 | 50 | 13 | 84.2 % |
| `FEAT_RESUME_ADV_VERSIONS` | `resume.advanced_versions` | 199 | 0 | 7 | 96.5 % |
| `FEAT_INBOX_MONITORING` | `inbox.monitoring` | 499 | 60 | 16 | 84.8 % |
| `FEAT_MARKETING_ASSISTED` | `marketing.assisted_applications` | 699 | 75 | 23 | 86.0 % |
| `FEAT_INTERVIEW_AI_PREP` | `interview.ai_prep` | 999 | 150 | 33 | 81.7 % |
| `FEAT_ALERTS_ADVANCED` | `alerts.advanced` | 199 | 0 | 7 | 96.5 % |
| `FEAT_ANALYTICS_APPLICATIONS` | `analytics.applications` | 299 | 0 | 10 | 96.7 % |
| `FEAT_AUTOMATION_APPROVED_APPLY` | `automation.approved_apply` | 1999 | 300 | 66 | 81.7 % |
| `FEAT_AI_CREDITS_EXTRA` | `ai.credits_extra` (per unit) | 499 | 75 | 16 | 81.8 % |
| `MOD_TALENT_MARKETING` | `module.talent_marketing` (per marketer) | 2999 | 400 | 99 | 83.4 % |
| `ORG_SETUP_FEE` | — | 49900 | — | 1677 | n/a |

Preset sums at these drafts: Job Search Essentials 2197; Resume & AI Support **2896** (≥ 2499 = Pro 1999 × 1.25 ✓); Talent Marketing Support 2996; Interview Support 2498; Full Career Support **8089** (≥ 4999 = Autopilot 3999 × 1.25 ✓; Σai 835; fee 267+30; margin 86.0 %). Escalation C5 notes that the old $49.99 Autopilot-seat price cannot be reproduced by a pure sum.

## 7. Versioning rules (ADR-013, exact)
1. **Publish** = one transaction: insert `catalog_publish` (version N), set `catalog_version=N` on every row going live, `effective_from = max(now, requested)`; retire replaced price rows (`active=false`, `retired_at`, `effective_until = effective_from of the replacement`). Creating the Stripe Price happens *before* the commit with idempotency key `price-{id}` (Phase 18 §6).
2. **Retiring never touches a license.** `license_feature.price_id` keeps pointing at the retired row and keeps being billed at it (Stripe keeps the item on the old Price; the reconciler ignores retired-but-licensed prices). Only a license *change* on that feature moves it to the current price — and the quote says so ("price updated from $7.99 to $8.49 on change").
3. **Feature definition edits** (name, description, allowance defaults, dependencies) are versioned by `catalog_version` as well; allowance changes apply to new periods only (`usage_event.period_key` snapshot of the allowance at reservation, 25 §3).
4. **Public/organisation views** read only `active` rows with `effective_from ≤ now < coalesce(effective_until, ∞)`.
5. `catalog_change` (Phase 18) logs before/after JSON for every edit, plus `admin_audit_event`.

## 8. APIs (platform admin, `ROLE_ADMIN`; HIGH-risk writes need the reason sheet)
```
GET  /api/admin/catalog                                   -> products + prices + entitlements + features + deps + presets + tiers + floors + catalog_version
POST /api/admin/catalog/features        PUT /{key}        -> feature_definition (+ limits); cycles refused
PUT  /api/admin/catalog/features/{key}/dependencies      -> full replacement list
GET/POST/PUT /api/admin/catalog/presets  POST /{key}/check -> preset checks (§5)
GET/POST/PUT /api/admin/catalog/volume-tiers
POST /api/admin/catalog/prices                            -> draft (margin returned)      (Phase 18)
POST /api/admin/catalog/prices/{id}/publish {effectiveFrom?, overrideReason?}           (Phase 18 + versioning §7)
POST /api/admin/catalog/prices/{id}/retire {effectiveUntil?}
GET  /api/admin/catalog/versions  GET /versions/{n}       -> catalog_publish rows and the snapshot
GET  /api/admin/catalog/margin?kind=&amountMinor=&aiBudgetCents=&quantity=               (live calculator)
GET  /api/orgs/{orgId}/licenses/catalog                   -> org-effective view (20 §7)
```

## 9. Tests (X5.1–X5.3)
`CatalogVersioningTest` (publish bumps version, retire keeps licensed price billable, overlapping active rows refused, ORG+QUARTER refused), `FeatureDependencyTest` (cycle refused, anyOf rule), `MarginCalculatorTest` (table §6; boundaries 79.99/80.00; preset above-individual pass/fail; deepest tier check), `PresetCheckTest`, `CatalogResourceIT` (reason sheet on publish/override; drafts never reach `/api/orgs/{id}/licenses/catalog`), `PublicCatalogIT` unchanged for personal plans.
