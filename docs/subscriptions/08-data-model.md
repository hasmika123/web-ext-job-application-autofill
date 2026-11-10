# 08 — Data model: additive Liquibase for plans, add-ons, annual, personal quotes and invoices

> Status: design, 2026-10-15 (Fable). Rules: `41-database-design.md` R1–R10 (additive only; `LiquibaseAdditiveTest`
> refuses drop/rename/modify), money `*_minor BIGINT` + `currency CHAR(3)`, `DATETIME(6)` UTC, varchar enums,
> generated keys for "one live row" constraints, every org table `org_id` first in every index. **Reuses**
> the enterprise foundation tables (`L/20261020010000_ent_billing_data.xml`) and the Phase 18 / doc 21
> catalog tables; it creates a table only when none of them covers the need. DDL is MySQL 8.
> Changelogs (in order): `20261101010000_sub_catalog.xml` · `20261101020000_sub_plans.xml` ·
> `20261101030000_sub_personal.xml` · `20261101040000_sub_backfill.xml` · `20261101050000_sub_enterprise_links.xml`.

## 1. Table map (what exists, what is widened, what is new)

| Table | Status | Changelog | Owner story |
|---|---|---|---|
| `feature_definition` | exists (foundation) → **widen** | sub_catalog | K1.1 |
| `feature_definition_limit`, `feature_dependency`, `license_preset`, `volume_tier` | doc 21 design → create if absent (X5.2 owns; K1.2 creates them when X5.2 has not landed, same names/columns) | sub_catalog | K1.2 / X5.2 |
| `product` | exists (foundation) → **widen** (`kind` values, `sold_to`, `stripe_product_id`) | sub_catalog | K1.1 |
| `product_price` | absent → **create** (doc 21 §2.2 shape, `amount_minor`, + annual columns) | sub_catalog | K1.3 (supersedes B1.1/A3.1/X5.1's table part) |
| `catalog_publish`, `catalog_change` | absent → create (21 §2.3, Phase 18 §2) | sub_catalog | K1.3 |
| `plan`, `plan_version`, `plan_component`, `plan_preset` | **new** | sub_plans | K2.1 |
| `subscription` | exists → **widen** | sub_personal | K5.2 |
| `subscription_addon`, `subscription_quote`, `subscription_change` (personal) | **new** | sub_personal | K5.2 |
| `invoice`, `invoice_line` (personal mirror) | absent → create (lifecycle doc 4.2 + lines) | sub_personal | K8.3 |
| `entitlement_grant` | Phase 18 design → create narrowed (06 §7) | sub_personal | K7.6 |
| `personal_usage_event`, `personal_usage_counter` | **new** (doc-25 shape for personal accounts; org tables untouched) | sub_personal | K7.5 |
| `ai_call` | exists → widen (24 §7 four columns) | sub_personal | K7.2 |
| `stripe_event` | exists → widen (`scope`, `org_id`) | sub_personal | K8.1 |
| `org_subscription`, `org_billing_account`, `consultant_license`, `license_feature`, `license_change` | exist → **widen** (plan links, interval, transfer) | sub_enterprise_links | K6.1 |
| `license_quote`, `org_module_license`, `org_discount` | doc 20/23 design → X5.4/X5.11/X5.15 create them; K6 adds columns only if they exist (precondition) | sub_enterprise_links | X5.* |

## 2. Catalog (`20261101010000_sub_catalog.xml`)

### 2.1 `feature_definition` — widen
```sql
ALTER TABLE feature_definition
  ADD COLUMN audience             VARCHAR(12)  NOT NULL DEFAULT 'ORG',        -- INDIVIDUAL | ORG | BOTH
  ADD COLUMN category             VARCHAR(16)  NULL,                          -- 02 §2.1 (usage_type stays; category is the catalog grouping)
  ADD COLUMN pool_mode            VARCHAR(16)  NOT NULL DEFAULT 'PER_CONSULTANT',
  ADD COLUMN ai_budget_cents      INT          NOT NULL DEFAULT 0,
  ADD COLUMN consumes_ai          BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN reserve_ttl_seconds  INT          NOT NULL DEFAULT 900,
  ADD COLUMN stackable            BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN max_quantity         INT          NULL,
  ADD COLUMN additive             BOOLEAN      NOT NULL DEFAULT FALSE,        -- limit adds to the plan limit instead of max()
  ADD COLUMN eligibility_json     JSON         NULL,
  ADD COLUMN entitlement_keys_json JSON        NULL,                          -- ["ai.server", ...]
  ADD COLUMN limit_key            VARCHAR(40)  NULL,                          -- resumes.max, matches.per_day, alerts.max
  ADD COLUMN visibility           VARCHAR(12)  NOT NULL DEFAULT 'PUBLIC',     -- PUBLIC | ADMIN_ONLY | HIDDEN
  ADD COLUMN catalog_version      INT          NOT NULL DEFAULT 0,
  ADD COLUMN updated_at           DATETIME(6)  NULL,
  ADD COLUMN updated_by           VARCHAR(50)  NULL;
CREATE INDEX ix_feature_definition_audience ON feature_definition (audience, active, sort_order);
```
(`allowance_period` exists with default MONTH; the catalog editor sets `PERIOD`/`DAY` per 21 §2.4.)

### 2.2 `product` — widen
```sql
ALTER TABLE product
  ADD COLUMN sold_to           VARCHAR(12) NOT NULL DEFAULT 'ORG',   -- INDIVIDUAL | ORG | BOTH
  ADD COLUMN stripe_product_id VARCHAR(255) NULL,
  ADD COLUMN quantity_basis    VARCHAR(10) NULL,                      -- FLAT | PER_ROLE (ORG_MODULE)
  ADD COLUMN role_key          VARCHAR(40) NULL,
  ADD COLUMN updated_at        DATETIME(6) NULL, ADD COLUMN updated_by VARCHAR(50) NULL;
-- kind values accepted by the service: SUBSCRIPTION | FEATURE | BASE_LICENSE | ORG_MODULE | FEE | SERVICE | BUNDLE (legacy SEAT, ORG_ADDON tolerated, never created)
CREATE UNIQUE INDEX ux_product_stripe ON product (stripe_product_id);
```

### 2.3 `product_price` — create (doc 21 §2.2 + annual)
```sql
CREATE TABLE product_price (
  id                      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id              BIGINT       NOT NULL,
  audience                VARCHAR(12)  NOT NULL,                 -- INDIVIDUAL | ORG
  billing_interval        VARCHAR(10)  NOT NULL,                 -- MONTH | QUARTER | YEAR | ONE_TIME
  amount_minor            BIGINT       NOT NULL,
  currency                CHAR(3)      NOT NULL,
  stripe_price_id         VARCHAR(255) NULL,                     -- NULL = draft
  payout_minor            BIGINT       NOT NULL DEFAULT 0,       -- services
  subscriber_discount_bp  INT          NOT NULL DEFAULT 0,       -- services
  margin_bp_worst         INT          NULL,                     -- stored at save, re-read against fee_model_version
  margin_bp_typical       INT          NULL,
  fee_model_version       INT          NULL,
  annual_source           VARCHAR(10)  NULL,                     -- EXPLICIT | DERIVED (YEAR rows only)
  derived_from_price_id   BIGINT       NULL,                     -- the MONTH row a DERIVED YEAR row came from
  derived_discount_bp     INT          NULL,
  accepts_promos          BOOLEAN      NOT NULL DEFAULT FALSE,
  country_set             VARCHAR(400) NULL,
  active                  BOOLEAN      NOT NULL DEFAULT FALSE,
  effective_from          DATETIME(6)  NOT NULL,
  effective_until         DATETIME(6)  NULL,
  published_at            DATETIME(6)  NULL,
  retired_at              DATETIME(6)  NULL,
  catalog_version         INT          NOT NULL DEFAULT 0,
  active_key              VARCHAR(80)  GENERATED ALWAYS AS (IF(active, CONCAT_WS(':', product_id, audience, billing_interval, currency), NULL)) STORED,
  created_by              VARCHAR(50)  NOT NULL,
  created_at              DATETIME(6)  NOT NULL,
  CONSTRAINT fk_product_price_product FOREIGN KEY (product_id) REFERENCES product (id),
  CONSTRAINT fk_product_price_derived FOREIGN KEY (derived_from_price_id) REFERENCES product_price (id),
  UNIQUE KEY ux_product_price_active (active_key),
  UNIQUE KEY ux_product_price_stripe (stripe_price_id),
  KEY ix_product_price_lookup (product_id, audience, billing_interval, currency, effective_from)
);
-- A YEAR row may exist only when the service setting billing.annual.enabled is true at publish (service rule, not a DB constraint).
-- ORG + QUARTER refused by the service (E17).
```

### 2.4 `catalog_publish`, `catalog_change`
```sql
CREATE TABLE catalog_publish (
  id            INT          NOT NULL PRIMARY KEY,                -- = catalog_version
  published_at  DATETIME(6)  NOT NULL, published_by VARCHAR(50) NOT NULL,
  summary       VARCHAR(2000) NULL, price_ids_json JSON NULL, feature_keys_json JSON NULL, plan_version_ids_json JSON NULL,
  snapshot_hash CHAR(64)     NULL
);
CREATE TABLE catalog_change (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(30) NOT NULL, entity_id VARCHAR(80) NOT NULL,      -- product | product_price | feature_definition | plan | plan_version | plan_component | fee_schedule | preset
  before_json JSON NULL, after_json JSON NULL, actor_login VARCHAR(50) NOT NULL, reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL,
  KEY ix_catalog_change_entity (entity, entity_id), KEY ix_catalog_change_created (created_at)
);
```

### 2.5 Doc 21 tables created here if absent (precondition `tableExists` → skip)
`feature_definition_limit (feature_key, limit_key, limit_value BIGINT, period VARCHAR(8), PRIMARY KEY (feature_key, limit_key))`,
`feature_dependency (feature_key, requires_feature_key, kind, note VARCHAR(200), active, PRIMARY KEY (feature_key, requires_feature_key, kind))`,
`license_preset (key VARCHAR(40) PK, name, description, feature_keys_json JSON, mirrors_product_code VARCHAR(40), plan_key VARCHAR(40) NULL, active, sort_order, catalog_version)`,
`volume_tier (id, product_id NULL, min_licensed_consultants INT, pct_off_bp INT, active, effective_from, effective_until, catalog_version)` — exactly 21 §2.5–2.7.

## 3. Plans (`20261101020000_sub_plans.xml`)
```sql
CREATE TABLE plan (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_key          VARCHAR(40)  NOT NULL,                         -- FREE, PRO, AUTOPILOT, PRO_STUDENT, ORG_STANDARD …
  name              VARCHAR(80)  NOT NULL,
  audience          VARCHAR(12)  NOT NULL,                         -- INDIVIDUAL | ORG
  status            VARCHAR(12)  NOT NULL DEFAULT 'DRAFT',         -- DRAFT | PUBLISHED | SUNSET | RETIRED
  public            BOOLEAN      NOT NULL DEFAULT FALSE,
  description       VARCHAR(1000) NULL,
  badge             VARCHAR(40)  NULL,
  sort_order        INT          NOT NULL DEFAULT 0,
  eligibility_json  JSON         NULL,
  successor_plan_id BIGINT       NULL,
  created_at DATETIME(6) NOT NULL, created_by VARCHAR(50) NOT NULL, updated_at DATETIME(6) NULL, updated_by VARCHAR(50) NULL,
  UNIQUE KEY ux_plan_key (plan_key),
  CONSTRAINT fk_plan_successor FOREIGN KEY (successor_plan_id) REFERENCES plan (id)
);
CREATE TABLE plan_version (
  id                   BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id              BIGINT      NOT NULL,
  version              INT         NOT NULL,
  status               VARCHAR(12) NOT NULL DEFAULT 'DRAFT',       -- DRAFT | PUBLISHED | SUPERSEDED | SUNSET | RETIRED
  effective_from       DATETIME(6) NULL,
  effective_until      DATETIME(6) NULL,
  catalog_version      INT         NULL,
  base_product_id      BIGINT      NULL,                            -- SUBSCRIPTION product (INDIVIDUAL); NULL for FREE
  intervals_json       JSON        NOT NULL,                        -- ["MONTH","QUARTER"]
  annual_discount_bp   INT         NULL,                            -- NULL = global setting
  ai_budget_cap_cents  INT         NOT NULL DEFAULT 0,              -- per MONTH; × f(interval)
  seat_rules_json      JSON        NULL,                            -- ORG: {seatBaseProductId, minSeats, maxSeats, setupFeeProductId, platformFeeProductId}
  presets_json         JSON        NULL,                            -- INDIVIDUAL shortcuts
  snapshot_json        JSON        NULL,                            -- rendered composition at publish (immutable)
  snapshot_hash        CHAR(64)    NULL,
  summary              VARCHAR(2000) NULL,
  live_key             BIGINT      GENERATED ALWAYS AS (IF(status = 'PUBLISHED', plan_id, NULL)) STORED,   -- one PUBLISHED version per plan
  published_at DATETIME(6) NULL, published_by VARCHAR(50) NULL,
  created_at DATETIME(6) NOT NULL, created_by VARCHAR(50) NOT NULL, updated_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_plan_version_plan FOREIGN KEY (plan_id) REFERENCES plan (id),
  CONSTRAINT fk_plan_version_base FOREIGN KEY (base_product_id) REFERENCES product (id),
  UNIQUE KEY ux_plan_version (plan_id, version),
  UNIQUE KEY ux_plan_version_live (live_key),
  KEY ix_plan_version_effective (plan_id, effective_from)
);
CREATE TABLE plan_component (
  id                     BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_version_id        BIGINT      NOT NULL,
  feature_key            VARCHAR(60) NOT NULL,
  role                   VARCHAR(16) NOT NULL,                      -- BASE | INCLUDED | OPTIONAL | SEAT_BASE | SEAT_INCLUDED | SEAT_OPTIONAL | FEE
  product_id             BIGINT      NULL,                          -- OPTIONAL / SEAT_OPTIONAL / SEAT_BASE / FEE
  allowance_override     BIGINT      NULL,
  limit_overrides_json   JSON        NULL,                          -- {"operations.per_day": 30}
  default_quantity       INT         NOT NULL DEFAULT 1,
  max_quantity           INT         NULL,
  component_discount_bp  INT         NULL,                          -- annual, overrides plan_version.annual_discount_bp
  sort_order             INT         NOT NULL DEFAULT 0,
  marketing_label        VARCHAR(120) NULL,
  CONSTRAINT fk_plan_component_version FOREIGN KEY (plan_version_id) REFERENCES plan_version (id),
  CONSTRAINT fk_plan_component_feature FOREIGN KEY (feature_key) REFERENCES feature_definition (feature_key),
  CONSTRAINT fk_plan_component_product FOREIGN KEY (product_id) REFERENCES product (id),
  UNIQUE KEY ux_plan_component (plan_version_id, feature_key),
  KEY ix_plan_component_role (plan_version_id, role, sort_order)
);
```
Service rules (not DB): `default_on` does not exist on purpose (nothing paid is pre-selected); `role=BASE`
rows exist only for INDIVIDUAL versions with a `base_product_id`; `FEE` rows only for ORG.

## 4. Personal subscription (`20261101030000_sub_personal.xml`)

### 4.1 `subscription` — widen (lifecycle doc 4.1 + plan)
```sql
ALTER TABLE subscription
  ADD COLUMN plan_version_id       BIGINT       NULL,
  ADD COLUMN billing_interval      VARCHAR(10)  NULL,        -- MONTH | QUARTER | YEAR
  ADD COLUMN currency              CHAR(3)      NULL,
  ADD COLUMN current_period_start  DATETIME(6)  NULL,
  ADD COLUMN paid_through_at       DATETIME(6)  NULL,
  ADD COLUMN base_stripe_item_id   VARCHAR(255) NULL,
  ADD COLUMN schedule_id           VARCHAR(255) NULL, ADD COLUMN scheduled_plan_version_id BIGINT NULL, ADD COLUMN scheduled_interval VARCHAR(10) NULL, ADD COLUMN scheduled_at DATETIME(6) NULL,
  ADD COLUMN promo_code_id         BIGINT       NULL,
  ADD COLUMN first_paid_at         DATETIME(6)  NULL, ADD COLUMN lapsed_at DATETIME(6) NULL, ADD COLUMN lapse_notice_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cancel_requested_at   DATETIME(6)  NULL, ADD COLUMN cancel_reason VARCHAR(40) NULL, ADD COLUMN cancellation_number VARCHAR(20) NULL;
ALTER TABLE subscription ADD CONSTRAINT fk_subscription_plan_version FOREIGN KEY (plan_version_id) REFERENCES plan_version (id);
CREATE INDEX ix_subscription_plan_version ON subscription (plan_version_id);
-- `plan` (FREE|PRO|…) stays as the derived label written by touch(); `price_id` stays = item 0's price.
```

### 4.2 `subscription_addon`
```sql
CREATE TABLE subscription_addon (
  id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id    BIGINT       NOT NULL,
  user_id            BIGINT       NOT NULL,
  feature_key        VARCHAR(60)  NOT NULL,
  product_id         BIGINT       NOT NULL,
  price_id           BIGINT       NOT NULL,                     -- immutable product_price row (grandfathered)
  quantity           INT          NOT NULL DEFAULT 1,
  allowance_override BIGINT       NULL,
  stripe_item_id     VARCHAR(255) NULL,
  starts_at          DATETIME(6)  NOT NULL,
  ends_at            DATETIME(6)  NULL,
  live               BOOLEAN      NOT NULL DEFAULT TRUE,        -- maintained by the service/jobs (NOW() cannot be used in a generated column)
  live_seq           BIGINT       GENERATED ALWAYS AS (IF(live, 0, id)) STORED,
  change_id          BIGINT       NULL,
  created_at         DATETIME(6)  NOT NULL, updated_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_sub_addon_subscription FOREIGN KEY (subscription_id) REFERENCES subscription (id),
  CONSTRAINT fk_sub_addon_user FOREIGN KEY (user_id) REFERENCES jhi_user (id),
  CONSTRAINT fk_sub_addon_price FOREIGN KEY (price_id) REFERENCES product_price (id),
  UNIQUE KEY ux_sub_addon_live (subscription_id, feature_key, live_seq),
  KEY ix_sub_addon_user (user_id, live), KEY ix_sub_addon_ends (ends_at)
);
```

### 4.3 `subscription_quote`, `subscription_change`
```sql
CREATE TABLE subscription_quote (
  id                         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id                    BIGINT      NULL,                       -- NULL = anonymous pricing-page quote (no checkout from it)
  subscription_id            BIGINT      NULL,                       -- NULL = new subscriber
  kind                       VARCHAR(12) NOT NULL,                   -- CHECKOUT | CHANGE | ANONYMOUS
  plan_version_id            BIGINT      NOT NULL,
  billing_interval           VARCHAR(10) NOT NULL,
  currency                   CHAR(3)     NOT NULL,
  catalog_version            INT         NOT NULL,
  promo_code                 VARCHAR(40) NULL,
  inputs_hash                CHAR(64)    NOT NULL,
  lines_json                 JSON        NOT NULL,
  current_recurring_minor    BIGINT      NOT NULL DEFAULT 0,
  proposed_recurring_minor   BIGINT      NOT NULL,
  delta_minor                BIGINT      NOT NULL,
  monthly_equivalent_minor   BIGINT      NOT NULL,
  savings_minor              BIGINT      NOT NULL DEFAULT 0,
  proration_estimate_minor   BIGINT      NOT NULL DEFAULT 0,
  next_invoice_estimate_minor BIGINT     NULL,
  tax_estimate_minor         BIGINT      NULL, tax_source VARCHAR(16) NOT NULL DEFAULT 'NONE',
  effective_at               DATETIME(6) NULL, period_end_at DATETIME(6) NULL,
  expires_at                 DATETIME(6) NOT NULL,
  status                     VARCHAR(12) NOT NULL DEFAULT 'OPEN',    -- OPEN | APPLIED | EXPIRED | SUPERSEDED
  applied_batch_id           CHAR(36)    NULL, stripe_session_id VARCHAR(255) NULL,
  warnings_json              JSON        NULL,
  created_at                 DATETIME(6) NOT NULL,
  CONSTRAINT fk_sub_quote_version FOREIGN KEY (plan_version_id) REFERENCES plan_version (id),
  KEY ix_sub_quote_user (user_id, status, expires_at), KEY ix_sub_quote_expires (status, expires_at)
);
CREATE TABLE subscription_change (
  id                    BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id       BIGINT      NOT NULL, user_id BIGINT NOT NULL,
  quote_id              BIGINT      NULL, batch_id CHAR(36) NOT NULL,
  kind                  VARCHAR(20) NOT NULL,                       -- ADD_ADDON | REMOVE_ADDON | CHANGE_QUANTITY | UPGRADE_PLAN | DOWNGRADE_PLAN | CHANGE_INTERVAL | MIGRATE_VERSION | CANCEL | RESUME | END
  feature_key           VARCHAR(60) NULL, product_id BIGINT NULL, price_id BIGINT NULL,
  quantity_from         INT NULL, quantity_to INT NULL,
  plan_version_from     BIGINT NULL, plan_version_to BIGINT NULL, interval_from VARCHAR(10) NULL, interval_to VARCHAR(10) NULL,
  payload_json          JSON        NULL,                           -- authoritative numbers at confirm (unit, proration_minor charged)
  effective_at          DATETIME(6) NOT NULL,
  status                VARCHAR(12) NOT NULL DEFAULT 'PENDING',     -- PENDING | APPLYING | APPLIED | CANCELLED | FAILED
  stripe_ref            VARCHAR(255) NULL, stripe_idempotency_key VARCHAR(255) NULL, failed_reason VARCHAR(500) NULL,
  applied_at            DATETIME(6) NULL, created_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_sub_change_subscription FOREIGN KEY (subscription_id) REFERENCES subscription (id),
  KEY ix_sub_change_sub (subscription_id, status, effective_at), KEY ix_sub_change_batch (batch_id)
);
```
(Name collision note: the foundation's org-scoped `subscription_change` holds `org_id NOT NULL`; **the
personal table is named `personal_subscription_change`** in the changelog to avoid the clash — the text
above uses the short name for readability; every DDL/API reference must use `personal_subscription_change`.)

### 4.4 `invoice`, `invoice_line` (personal mirror; webhook-only writer)
```sql
CREATE TABLE invoice (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, subscription_id BIGINT NULL,
  stripe_invoice_id VARCHAR(255) NOT NULL, stripe_subscription_id VARCHAR(255) NULL, number VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL, billing_reason VARCHAR(40) NULL, currency CHAR(3) NOT NULL,
  amount_due_minor BIGINT NOT NULL, amount_paid_minor BIGINT NOT NULL DEFAULT 0, tax_minor BIGINT NOT NULL DEFAULT 0, discount_minor BIGINT NOT NULL DEFAULT 0, amount_refunded_minor BIGINT NOT NULL DEFAULT 0,
  period_start DATETIME(6) NULL, period_end DATETIME(6) NULL, paid_at DATETIME(6) NULL, attempt_count INT NOT NULL DEFAULT 0, next_payment_attempt DATETIME(6) NULL,
  hosted_invoice_url VARCHAR(1024) NULL, invoice_pdf_url VARCHAR(1024) NULL, disputed BOOLEAN NOT NULL DEFAULT FALSE,
  last_event_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL,
  UNIQUE KEY ux_invoice_stripe (stripe_invoice_id), KEY ix_invoice_user (user_id, created_at)
);
CREATE TABLE invoice_line (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
  stripe_line_id VARCHAR(255) NULL, line_kind VARCHAR(12) NOT NULL,          -- BASE | ADDON | PRORATION | DISCOUNT | TAX | CREDIT | OTHER
  price_id BIGINT NULL, stripe_price_id VARCHAR(255) NULL, plan_version_id BIGINT NULL, feature_key VARCHAR(60) NULL,
  description VARCHAR(500) NULL, quantity INT NOT NULL DEFAULT 1, unit_amount_minor BIGINT NOT NULL, amount_minor BIGINT NOT NULL,
  period_start DATETIME(6) NULL, period_end DATETIME(6) NULL, proration BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_invoice_line_invoice FOREIGN KEY (invoice_id) REFERENCES invoice (id),
  KEY ix_invoice_line_invoice (invoice_id, sort_order)
);
```
Retention: 7 years, pseudonymised on account deletion (B6.4).

### 4.5 `entitlement_grant` (narrowed, 06 §7)
```sql
CREATE TABLE entitlement_grant (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, plan_version_id BIGINT NOT NULL,
  source VARCHAR(20) NOT NULL,                 -- ADMIN_COMP | REFERRAL | SERVICE_ORDER
  source_ref VARCHAR(255) NULL, starts_at DATETIME(6) NOT NULL, ends_at DATETIME(6) NULL,
  granted_by VARCHAR(50) NULL, reason VARCHAR(500) NULL, revoked_at DATETIME(6) NULL, revoked_by VARCHAR(50) NULL,
  CONSTRAINT fk_grant_user FOREIGN KEY (user_id) REFERENCES jhi_user (id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_version FOREIGN KEY (plan_version_id) REFERENCES plan_version (id),
  KEY ix_grant_user_active (user_id, ends_at), KEY ix_grant_source (source, source_ref)
);
```

### 4.6 Personal usage ledger (`personal_usage_event`, `personal_usage_counter`) and widenings
The foundation's `usage_event` carries `org_id NOT NULL` with FKs to `organization` **and** a composite FK
`(org_id, consultant_id) → consultant_profile` (`L/20261020010000_ent_billing_data.xml` lines 491–494), so
personal rows cannot live there without non-additive changes or sentinel rows in tenant tables. The
personal ledger is therefore its **own pair of tables with the doc-25 shape** (same `UsageLedgerService`,
one repository per scope; `S-14` records the alternative).
```sql
CREATE TABLE personal_usage_event (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, login VARCHAR(50) NOT NULL,
  feature_key VARCHAR(60) NOT NULL, limit_key VARCHAR(40) NOT NULL DEFAULT 'default',
  quantity BIGINT NOT NULL, reserved_quantity BIGINT NOT NULL, unit VARCHAR(24) NOT NULL,
  status VARCHAR(12) NOT NULL, release_reason VARCHAR(16) NULL, allowance_snapshot BIGINT NOT NULL,
  period_key VARCHAR(32) NOT NULL, period_start_at DATETIME(6) NOT NULL, period_end_at DATETIME(6) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL, reference_type VARCHAR(30) NULL, reference_id BIGINT NULL, ai_call_id BIGINT NULL,
  expires_at DATETIME(6) NULL, created_at DATETIME(6) NOT NULL, committed_at DATETIME(6) NULL, released_at DATETIME(6) NULL,
  CONSTRAINT fk_pue_user FOREIGN KEY (user_id) REFERENCES jhi_user (id) ON DELETE CASCADE,
  CONSTRAINT fk_pue_feature FOREIGN KEY (feature_key) REFERENCES feature_definition (feature_key),
  UNIQUE KEY ux_pue_idem (idempotency_key),
  KEY ix_pue_user_period (user_id, feature_key, limit_key, period_key, status), KEY ix_pue_sweep (status, expires_at)
);
CREATE TABLE personal_usage_counter (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, feature_key VARCHAR(60) NOT NULL,
  limit_key VARCHAR(40) NOT NULL DEFAULT 'default', period_key VARCHAR(32) NOT NULL, used BIGINT NOT NULL DEFAULT 0, allowance BIGINT NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY ux_puc (user_id, feature_key, limit_key, period_key)
);
ALTER TABLE ai_call       ADD COLUMN org_id BIGINT NULL, ADD COLUMN beneficiary_login VARCHAR(50) NULL, ADD COLUMN feature_key VARCHAR(60) NULL, ADD COLUMN usage_event_id BIGINT NULL, ADD COLUMN usage_scope VARCHAR(8) NULL;
ALTER TABLE stripe_event  ADD COLUMN scope VARCHAR(10) NULL, ADD COLUMN org_id BIGINT NULL, ADD COLUMN replayed_from VARCHAR(255) NULL, ADD COLUMN replayed_by VARCHAR(50) NULL;
```
Retention `billing.usage.retention_months` (24) via the same purge job pattern; rows are deleted with the
account (CASCADE) — usage is not a financial record (invoices are).

## 5. Backfill (`20261101040000_sub_backfill.xml`, `customChange`, idempotent)
1. Seed `feature_definition` rows of 02 §2.4 (no prices), `product` rows `PRO`, `AUTOPILOT`, `FEAT_AI_CREDITS`,
   `FEAT_RESUME_PACK`, `FEAT_SUPPORT`, `ORG_SETUP_FEE`, `ORG_PLATFORM_FEE`, `ORG_BASE_LICENSE`, `FEAT_*` of 21 §6 (no prices).
2. `product_price` for PRO MONTH/QUARTER (and AUTOPILOT MONTH/QUARTER as **drafts**, `stripe_price_id NULL`)
   — PRO rows get `stripe_price_id` from `STRIPE_PRICE_MONTHLY/3MO` when the env has them, `active=true`,
   `effective_from = now`, `published_at = now`, `catalog_version = 1`; blank env → drafts.
3. `plan` + `plan_version` v1 for FREE, PRO, AUTOPILOT (INDIVIDUAL) and ORG_STANDARD (ORG), status PUBLISHED
   for FREE/PRO, DRAFT for AUTOPILOT and ORG_STANDARD (they have no prices); `plan_component` rows per 02 §3.3/3.4;
   `catalog_publish` id 1.
4. `subscription`: `plan_version_id`, `billing_interval` from `price_id` (monthly → MONTH, 3mo → QUARTER; no
   Pro price → FREE v1), `currency = 'USD'`. Rerun = no-op (`WHERE plan_version_id IS NULL`). **Zero rows
   today** (S-03: no existing subscribers) — kept as the idempotent safety net for future cohorts.
5. Verification query (fails the migration if any row remains unmapped with a non-null Pro `price_id`).

## 6. Enterprise links (`20261101050000_sub_enterprise_links.xml`)
```sql
ALTER TABLE org_subscription    ADD COLUMN plan_version_id BIGINT NULL, ADD COLUMN stripe_subscription_id VARCHAR(255) NULL, ADD COLUMN stripe_coupon_id VARCHAR(255) NULL;
ALTER TABLE org_billing_account ADD COLUMN stripe_customer_id VARCHAR(255) NULL, ADD COLUMN billing_interval VARCHAR(10) NOT NULL DEFAULT 'MONTH', ADD COLUMN billing_mode VARCHAR(20) NULL, ADD COLUMN paid_through_at DATETIME(6) NULL, ADD COLUMN overage_opt_in BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN test_clock_id VARCHAR(255) NULL;
ALTER TABLE consultant_license  ADD COLUMN base_price_id BIGINT NULL, ADD COLUMN plan_version_id BIGINT NULL, ADD COLUMN ai_budget_override_cents INT NULL, ADD COLUMN transferred_from_license_id BIGINT NULL, ADD COLUMN last_change_id BIGINT NULL;
ALTER TABLE license_feature     ADD COLUMN price_id BIGINT NULL, ADD COLUMN change_id BIGINT NULL;
ALTER TABLE license_change      ADD COLUMN quote_id BIGINT NULL, ADD COLUMN price_id BIGINT NULL, ADD COLUMN quantity_from INT NULL, ADD COLUMN quantity_to INT NULL, ADD COLUMN payload_json JSON NULL, ADD COLUMN stripe_ref VARCHAR(255) NULL, ADD COLUMN stripe_idempotency_key VARCHAR(255) NULL, ADD COLUMN failed_reason VARCHAR(500) NULL, ADD COLUMN target_member_id BIGINT NULL;   -- kind gains TRANSFER, CHANGE_INTERVAL, MIGRATE_VERSION
CREATE UNIQUE INDEX ux_org_subscription_stripe ON org_subscription (stripe_subscription_id);
CREATE UNIQUE INDEX ux_org_billing_account_customer ON org_billing_account (stripe_customer_id);
```
`contract_price_id` / `base_amount_minor` / `unit_amount_minor` (foundation) stay: `price_id` is the list
row, `contract_price_id` the contract row, the pinned `*_amount_minor` is the effective unit at the time —
the same three numbers the quote shows (list / contract / effective). `consultant_license.consultant_id`
stays; `member_id` is authoritative when present (01 §6).

## 6a. Retirement and read-only lock (`20261101060000_sub_retirement.xml`)
`plan_retirement`, `plan_retirement_successor`, `plan_retirement_item`, `service_lock`, `seat_service_lock`,
`feature_definition.lifecycle`, and the enum additions (`plan.status` / `plan_version.status` `RETIRING`
replaces the earlier `SUNSET` value; change kinds `RETIREMENT_SWITCH`, `FALLBACK_FREE`, `FALLBACK_BASE`) —
DDL in `11-plan-retirement.md` §10; owner stories K10.1, K10.5, K10.7.

## 7. Settings registry additions (keys, `AdminSettingKeys` / `EnterpriseSettingKeys`)
All of 03 §2 plus: `billing.catalog.shadow` (bool, true), `billing.public_catalog.cache_seconds` (300),
`billing.plan.max_optional_addons` (8), `billing.plan.sunset_notice_days` (30), `billing.migration.notice_days`
(30, hard minimum 30), `billing.addon.max_total_quantity` (10), `catalog.stripe.invoicing_bp` (40).
Each: type, bounds, env default, risk; HIGH keys go through `ReasonSheet` (A5.1 rules).

## 8. Migration plan (order, safety)
| Step | Changelog | Behaviour change | Rollback |
|---|---|---|---|
| 1 | sub_catalog | none (new/widened tables, defaults keep org semantics) | empty rollback (additive) |
| 2 | sub_plans | none | additive |
| 3 | sub_personal (tables + widenings) | none | additive |
| 4 | sub_backfill | none for readers (`plan` label unchanged); `plan_version_id` populated | idempotent; a verification query guards it |
| 5 | shadow flip (`billing.catalog.shadow=false`) | resolver becomes the gate; bodies identical by test | flip back (setting) |
| 6 | sub_enterprise_links | none until X5/X6 services read them | additive |
| 7 | `billing.annual.enabled` ships **true** (S-01 answered) — YEAR rows allowed at publish from the first catalog publish | annual prices sellable once published | switch off: new YEAR rows refused; existing YEAR subscriptions keep running to term end |
`LiquibaseAdditiveTest` parses every changelog above; `SubscriptionBackfillTest` + `CatalogSeedMigrationTest`
run in the `personal-billing-regression` CI job.
