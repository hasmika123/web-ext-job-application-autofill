# Catalog, margin guard and entitlements admin (Phase 18 in admin terms)

Area `admin`. Stories: A3.*, plus A2.4 (comps) and A2.5 (promo codes) which write grants. Source of the rules:
ROADMAP.md Phase 18 (lines 1247–1276) and the cost-control block (1178–1227); CLAUDE.md "Expansion (locked)".

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **The catalog is the only place prices, limits and feature keys live.** `web/src/lib/catalog.ts` (the 15.6 public catalog) becomes a generated file: `GET /api/catalog/public` → build-time or ISR fetch. Until 18.5 lands, the web file stays and the admin page is read-only. |
| D2 | **Prices are immutable rows.** "Edit price" = create a new `product_price` row and retire the old one (`active=false`, `retired_at`). Subscribers keep their `stripe_price_id`; grandfathering is free. |
| D3 | **Publishing a price creates the Stripe Price through `StripeGateway`** (`api/.../billing/StripeGateway.java`). A row with `stripe_price_id=NULL` is a draft and can't be sold. Stripe disabled (blank key) → publish is refused with 503 `BILLING_DISABLED`; drafts can still be edited. |
| D4 | **Margin guard is a pure function in the API** (`MarginCalculator`), evaluated on every save and on every publish, and rendered live in the admin form. Floors: subscriptions ≥ 80 %, services ≥ 20 %, org per-person items ≥ 80 %, one-time fees ≥ 80 %. Below the floor: publish is refused (422 `MARGIN_BELOW_FLOOR {margin, floor}`) unless `overrideReason` (≥ 20 chars) is given → HIGH audit `CATALOG_MARGIN_OVERRIDE`. |
| D5 | **Worst case = every variable cost spent.** Subscription: `ai_budget_cents + stripe_fee(price) + email_cost_cents`; service: `payout_cents + stripe_fee(price_after_discount) + ai_cents`. Stripe fee = 2.9 % + 30 ¢ (configurable `catalog.stripe.pct/fixed` via A5 runtime settings). |
| D6 | **Entitlements resolve from grants; highest limit wins, never the sum** (ROADMAP 1195). Admin shows the *resolution* per user ("why does this user have X"). |
| D7 | **Comps and promo codes are admin-only support tools, not trials.** A comp is an `entitlement_grant` with `source=ADMIN_COMP`, max 90 days, FINANCE/ADMIN only above 30 days. Promo codes are Stripe Coupons created through `StripeGateway`, mirrored in `promo_code` with their margin shown against the floor. |
| D8 | **Nothing is unlimited.** A `product_entitlement` row with a NULL limit is refused for numeric feature keys. |
| D9 | **No packages yet**, but `bundle_item` ships (empty) so bundles are an admin action later. |

## 2. Data model (additive, MySQL)

```sql
CREATE TABLE product (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(40) NOT NULL UNIQUE,          -- FREE, PRO, AUTOPILOT, ORG_SETUP_FEE, ORG_PRO_SEAT, SVC_REVIEW...
  name          VARCHAR(100) NOT NULL,
  kind          VARCHAR(20) NOT NULL,                 -- SUBSCRIPTION|SEAT|SERVICE|FEE|BUNDLE
  sold_to       VARCHAR(20) NOT NULL,                 -- INDIVIDUAL|ORG|BOTH
  description   VARCHAR(1000),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL, updated_at DATETIME NOT NULL, updated_by VARCHAR(50)
);
CREATE TABLE product_price (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id       BIGINT NOT NULL,                   -- FK product
  audience         VARCHAR(20) NOT NULL,              -- INDIVIDUAL|ORG
  billing_interval VARCHAR(20) NOT NULL,              -- MONTH|QUARTER|ONE_TIME
  amount_cents     INT NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  stripe_price_id  VARCHAR(255) UNIQUE,               -- NULL = draft
  payout_cents     INT NOT NULL DEFAULT 0,            -- services: expert payout
  subscriber_discount_pct INT NOT NULL DEFAULT 0,     -- services: 10
  margin_pct_worst DECIMAL(5,2),                      -- computed at save, stored for history
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  published_at     DATETIME, retired_at DATETIME,
  created_at       DATETIME NOT NULL, created_by VARCHAR(50) NOT NULL,
  INDEX idx_product_price_product (product_id, active)
);
CREATE TABLE product_entitlement (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id   BIGINT NOT NULL,
  feature_key  VARCHAR(60) NOT NULL,                  -- ai.server, ai.budget_cents_per_period, resumes.max, answers.sync,
                                                      -- inbox, autopilot.apps_per_month, autopilot.apps_per_day,
                                                      -- interview.ai_practice, matches.per_day, matches.ai_scored
  limit_value  BIGINT,                                -- NULL only for boolean keys
  UNIQUE (product_id, feature_key)
);
CREATE TABLE bundle_item (bundle_product_id BIGINT NOT NULL, component_product_id BIGINT NOT NULL, quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bundle_product_id, component_product_id));
CREATE TABLE entitlement_grant (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,                        -- FK jhi_user CASCADE
  product_id  BIGINT NOT NULL,
  source      VARCHAR(30) NOT NULL,                   -- STRIPE_SUBSCRIPTION|ORG_ASSIGNMENT|ADMIN_COMP|SERVICE_ORDER
  source_ref  VARCHAR(255),                           -- sub_…, org_assignment id, audit id, order id
  org_id      BIGINT,                                 -- Phase 21
  starts_at   DATETIME NOT NULL, ends_at DATETIME,    -- NULL = until revoked
  granted_by  VARCHAR(50), reason VARCHAR(500),
  revoked_at  DATETIME, revoked_by VARCHAR(50),
  INDEX idx_grant_user_active (user_id, ends_at), INDEX idx_grant_source (source, source_ref)
);
CREATE TABLE promo_code (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(40) NOT NULL UNIQUE,
  stripe_coupon_id VARCHAR(255), stripe_promo_id VARCHAR(255),
  percent_off      INT, amount_off_cents INT, duration VARCHAR(20),   -- once|repeating|forever (forever refused)
  duration_months  INT,
  applies_product_codes VARCHAR(255) NOT NULL,        -- csv
  max_redemptions  INT NOT NULL, redeemed INT NOT NULL DEFAULT 0,
  expires_at       DATETIME NOT NULL,
  margin_pct_worst DECIMAL(5,2) NOT NULL,
  created_by VARCHAR(50) NOT NULL, created_at DATETIME NOT NULL, archived_at DATETIME
);
CREATE TABLE catalog_change (                         -- human-readable diff log, in addition to admin_audit_event
  id BIGINT AUTO_INCREMENT PRIMARY KEY, entity VARCHAR(30), entity_id BIGINT, before_json JSON, after_json JSON,
  actor_login VARCHAR(50), created_at DATETIME, INDEX (entity, entity_id)
);
```
Seed (18.2): FREE (resumes.max=3, matches.per_day=3, ai.server=0, ai.parse_resume=1), PRO ($19.99 MONTH, $49.99 QUARTER; ai.budget 300/800, resumes.max 25, matches 20, answers.sync, inbox), AUTOPILOT ($39.99/$99.99; ai.budget 600/1600, resumes 50, autopilot 300/30), SVC_REVIEW $79 payout 5000, SVC_REWRITE $199/13000, SVC_MOCK $129/8500, SVC_COACH $119/8000, ORG_SETUP_FEE $499 ONE_TIME, ORG_PRO_SEAT $24.99, ORG_AUTOPILOT_SEAT $49.99, ORG_AI_PRACTICE $9.99 (ai.budget 150), ORG_MARKETER $29.99.
Existing to migrate: `ai_quota_override.monthly_budget_cents` (20260629000100 + 20260922030000) → an `ADMIN_COMP`-style grant on a synthetic `ADMIN_AI_BUDGET` product; the column stays readable until 18.5 flips `AiBudgetService`.

## 3. Margin maths (the guard)

```
fee(p)           = round(p * stripe_pct) + stripe_fixed          -- 290 bp + 30 ¢ default
subscription:    margin = (p - fee(p) - ai_budget_cents - email_cents) / p
service:         p' = p * (1 - subscriber_discount_pct/100)       -- worst case: every buyer is a subscriber
                 margin = (p' - fee(p') - payout_cents - ai_cents) / p'
seat (org):      as subscription with the seat's ai budget
fee/one-time:    margin = (p - fee(p)) / p
```
Worked (today's numbers): Pro monthly 1999 → fee 88, AI 300 → margin 80.6 % (passes, barely; the UI shows "0.6 pt above floor"). Pro at $24.99 → 84.3 %. Autopilot 3999 → fee 146, AI 600 → 81.3 %. Resume review 7900 → p' 7110, fee 236, payout 5000 → 26.4 %. Mock interview 12900 → 11610, fee 367, payout 8500 → 23.6 %.
Rule from ROADMAP 1207: if > 5 % of Pro users hit 100 % of their AI budget in a period, the Catalog page shows a red "decide with data" banner; the cap is never raised silently (A4 metric `ai.cap_hit_pct`).

## 4. API

```
GET  /api/admin/catalog                          -> {products:[{...,prices:[...],entitlements:[...]}], floors:{SUBSCRIPTION:80,SERVICE:20,...}}
POST /api/admin/catalog/products                 -> ADMIN|FINANCE; HIGH
PUT  /api/admin/catalog/products/{id}            -> name/description/active/sort only (code and kind immutable)
PUT  /api/admin/catalog/products/{id}/entitlements -> full replacement list; refuses NULL limits on numeric keys
POST /api/admin/catalog/prices                   -> draft {productId, audience, interval, amountCents, payoutCents, discountPct}
                                                    response includes marginPctWorst + floor + ok:boolean
POST /api/admin/catalog/prices/{id}/publish {overrideReason?} -> creates Stripe Price; 422 MARGIN_BELOW_FLOOR without reason
POST /api/admin/catalog/prices/{id}/retire       -> active=false; the previous active price for (product,audience,interval) must exist or 409
GET  /api/admin/catalog/margin?kind=&amountCents=&payoutCents=&aiBudgetCents=&discountPct=  -> live calculator for the form
GET  /api/admin/users/{login}/entitlements       -> {features:{key:{value, from:[{source,sourceRef,product,endsAt}]}}, grants:[...]}
POST /api/admin/users/{login}/comps {productCode, days, reason}  -> grant ADMIN_COMP; SUPPORT ≤ 30 days; HIGH above
DELETE /api/admin/grants/{id} {reason}           -> revoke (sets revoked_at); STRIPE_SUBSCRIPTION grants cannot be revoked here (409: "cancel in Stripe")
GET/POST /api/admin/promo-codes ; POST /{id}/archive
GET  /api/catalog/public                         -> no auth; active products + active prices + public limits (feeds /pricing)
```
`EntitlementService` (`api/src/main/java/com/dossier/api/service/EntitlementService.java`, today `isPro/plan/requirePro` on `SubscriptionRepository`) gains `has(login, key)`, `limit(login, key)`, `resolve(login)`; `isPro` = `has("ai.server")`. The Stripe webhook (`BillingWebhook*`, writer of `subscription`) additionally upserts the `STRIPE_SUBSCRIPTION` grant keyed by `source_ref = stripe_subscription_id` — it stays the only writer of that source.

## 5. State machines

Price: `DRAFT -(publish, guard ok | override)-> ACTIVE -(retire)-> RETIRED`. Never `RETIRED -> ACTIVE`; create a new row.
Grant: `ACTIVE (starts_at ≤ now < ends_at, revoked_at NULL) -> ENDED | REVOKED`. Subscription grants follow the mirror: `past_due` keeps the grant until `current_period_end` (12.x rule unchanged).
Promo: `ACTIVE -> EXHAUSTED (redeemed = max) | EXPIRED | ARCHIVED`.

## 6. Failure modes

- Stripe create succeeds but our commit fails → the Stripe Price is orphaned. Mitigation: write the row first with `publishing_at`, create in Stripe with `idempotency_key = "price-" + id`, then set `stripe_price_id`; a reconciler (A10 job) lists Stripe prices with `metadata.app=kiwiply` and flags unknown ones.
- Two admins publish the same (product, audience, interval) → the second gets 409 and sees the first.
- Catalog unreachable at runtime → `EntitlementService` keeps an in-memory copy of the last good catalog (refreshed every 60 s); grants are DB rows, so gating still works; the public catalog endpoint serves the last good copy with `Cache-Control: max-age=300`.
- Seed mismatch vs. current config → the 18.2 migration test compares `isPro` before/after for the fixture users.

## 7. Security / privacy

Catalog has no PII. Grants reference users: the per-user entitlement explainer is `users` area (SUPPORT may VIEW). Comps above 30 days and every publish/override are HIGH (re-auth, see rbac doc). Override reasons are free text: keep them non-PII (validation hint).

## 8. Test strategy

`MarginCalculatorTest` (table-driven with the worked numbers above; boundary 79.99 fails, 80.00 passes), `CatalogResourceIT` (publish below floor → 422; with reason → 201 + audit row `CATALOG_MARGIN_OVERRIDE`; retire last active → 409), `EntitlementResolutionTest` (two grants, highest wins; expired ignored; revoked ignored; ADMIN_COMP outranks Free), `PublicCatalogIT` (drafts never appear). Web: form shows margin within 300 ms of a keystroke (debounced call), red state below floor, override textarea required.

## 9. Rollout

18.1 tables + seed → 18.2 service on grants behind `dossier.catalog.enabled=false` (shadow-compare `isPro` old vs new, log mismatches) → flip → 18.3 features on `/api/profile/version` → 18.4 admin page (read-only first, then edit) → 18.5 delete the hard-coded config.

## 10. Mobile wireframe (390px) — price editor with the live margin guard

```
┌──────────────────────────────┐
│ ← Pro · Monthly (new price)  │
│ Amount        [$ 24.99     ] │
│ AI budget     $3.00 (from    │
│               entitlements)  │
│ Stripe fee    −$1.02 (est.)  │
│ ─────────────────────────────│
│ Worst-case margin            │
│ ████████████████████░░  84 % │  <- green ≥ floor, red below, with "floor 80 %" tick
│ 4.3 pt above the 80 % floor  │
│ ─────────────────────────────│
│ [ Save draft ]  [ Publish ]  │  <- Publish opens the re-auth bottom sheet
└──────────────────────────────┘
Below floor:
│ ███████████░░░░░░░░░░░  61 % │
│ ⚠ 19 pt below the 80 % floor │
│ Override reason (required)   │
│ [                          ] │
│ [ Publish with override ]    │  <- HIGH, audited
```
