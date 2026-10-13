# 23 — Contracts and discounts: entities, overrides, dates, renewal, audit

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-014/ADR-015/ADR-020. Build-ready for
> **X5.5** (tables + engine inputs) and **X6.9** (Platform Pricing Admin → Commercial Agreements). Org
> admins **see** contract pricing and the contract name; only platform admins with `contracts.manage`
> write anything here, always with a reason (HIGH audit).

## 1. Principles
1. A contract **pins commercial terms** for one org: currency, interval, per-product overrides,
   whether promos stack, whether volume tiers apply, and optional allowance overrides.
2. A contract never changes a price already invoiced (invoice lines are snapshots) and never changes
   a line mid-period: it is applied at quotes and at the period rollover (22 §5).
3. **One ACTIVE contract per org at a time** (generated `active_key = IF(status='ACTIVE', org_id, NULL)` UNIQUE). Renewal = a new row that starts when the old one ends; amendments = a new **version** of the same contract (immutable history).
4. Every write is a `contract_event` row + `admin_audit_event` (HIGH). Contracts hold **no PII**: a
   counter-party name, a reference number, notes (scanned by `SensitivePatterns`).

## 2. Tables (in `202611xxxxxxxx_ent_catalog.xml`)

### 2.1 `org_contract`
| column | notes |
|---|---|
| id, org_id | |
| reference (40) | human reference (e.g. `ACME-2026-01`), unique per org |
| name (80) | shown to the org ("Acme enterprise agreement 2026") |
| status | `DRAFT` `ACTIVE` `ENDED` `CANCELLED` |
| version INT NOT NULL DEFAULT 1 | bumped by every amendment (quotes pin `contract_version`) |
| currency CHAR(3) | must equal `org_billing_account.currency`; changing currency = new contract |
| billing_interval | `MONTH` only (E17 default) |
| starts_at, ends_at DATETIME(6) | `ends_at` NULL = open-ended (admin must set a review date, `review_at`) |
| renewal | `NONE` `MANUAL` `AUTO_SAME_TERMS` — AUTO creates the successor row 30 days before `ends_at` (job), status DRAFT, for admin approval; nothing renews silently |
| stackable BOOLEAN DEFAULT false | promos may apply under this contract (22 §3) |
| volume_applies BOOLEAN DEFAULT false | tiers may apply under this contract |
| min_committed_licenses INT NULL | informational floor the org committed to (shown on the overview; **not enforced by billing** — escalation C6) |
| notes (1000) | scanned |
| created_by, approved_by, approved_at, created_at, updated_at | two-person rule: creator ≠ approver when `enterprise.contracts.two_person_rule=true` (default true) |

### 2.2 `org_contract_price`
| column | notes |
|---|---|
| id, contract_id, org_id | |
| product_id BIGINT NULL | NULL = every ORG recurring product without a specific row |
| override_amount_minor BIGINT NULL | REPLACES the list price (same currency) |
| override_pct_off_bp INT NULL | REDUCES the list price; exactly one of the two is non-NULL (check on save) |
| min_quantity INT DEFAULT 1 | the row applies only when the org's quantity on that product (after the quote) ≥ min_quantity; below it the list price applies and the quote warns `CONTRACT_MIN_QUANTITY` |
| allowance_override BIGINT NULL | per-period allowance for the product's feature (25 §3) |
| pool_mode_override | NULL \| `PER_CONSULTANT` \| `ORG_POOL` |
| price_floor_check | computed at save: the override must keep the product ≥ margin floor **or** carry `override_reason` (HIGH audit `CONTRACT_BELOW_FLOOR`) |

### 2.3 `contract_event`
`id, contract_id, org_id, kind (CREATED|AMENDED|APPROVED|ACTIVATED|RENEWAL_DRAFTED|ENDED|CANCELLED|PRICE_ROW_ADDED|PRICE_ROW_REMOVED), version_from, version_to, before_json, after_json, actor_login, reason (500), created_at`.

### 2.4 `org_discount` (promotional discounts for orgs; the personal `promo_code` table stays separate)
| column | notes |
|---|---|
| id, code (40 UQ), name | |
| kind | `PERCENT` (`pct_off_bp`) or `AMOUNT_PER_UNIT` (`amount_off_minor`, `currency`) |
| scope_kinds_json | which product kinds it touches (`["FEATURE"]`, `["BASE_LICENSE","FEATURE"]`) |
| scope_product_codes_json | NULL = all in scope kinds |
| eligibility_json | `{orgTypes, maxLicensed, createdAfter, orgIds}` |
| starts_at, ends_at, max_orgs, used_orgs | nothing is forever (`ends_at` required, ≤ 12 months) |
| margin_pct_worst DECIMAL(5,2) | computed at save against the deepest-discounted eligible product; below floor → refused unless reason |
| active, created_by, created_at, archived_at | |
`org_discount_redemption (discount_id, org_id, first_applied_at)` makes `used_orgs` auditable.

## 3. Validation on save (service `ContractService`)
1. Currency equals the org's; interval MONTH.
2. Each price row: exactly one override; `override_amount_minor ≥ 0`; pct in 0–10000; product is `sold_to ∈ {ORG, BOTH}` and recurring; no duplicate `(contract_id, product_id)` (NULL counts as a product).
3. Margin: `MarginCalculator` at the override (and at the deepest tier when `volume_applies`) — below floor needs `override_reason` (≥ 20 chars), HIGH audit.
4. No negative effective price is possible: for `AMOUNT_PER_UNIT` org discounts stacking on a contract, the engine clamps at 0 (22 §3 rule 4) and the save warns.
5. Dates: `starts_at < ends_at`; a new ACTIVE contract may not overlap the current ACTIVE one (`409 CONTRACT_OVERLAP`); activation of a future-dated contract is done by the nightly `ContractLifecycleJob` (DRAFT+approved → ACTIVE at `starts_at`; ACTIVE → ENDED at `ends_at`), which also re-sizes the org's Stripe coupon (26 §7) and notifies the org's billing contacts 14 days before `ends_at`.

## 4. What the org sees
- `GET /api/orgs/{orgId}/billing` → `contract{name, reference, startsAt, endsAt, renewal, stackable, volumeApplies, minCommittedLicenses}` (no notes, no approver).
- `GET /api/orgs/{orgId}/licenses/catalog` → each product's `unitListMinor`, `unitEffectiveMinor`, `applied:["CONTRACT"]` and the contract name.
- Quotes show `contractDiscountsMinor`.
- Org admins cannot edit prices (requirements §17): there is no write endpoint under `/api/orgs/**` for contracts or discounts, and `AuthzCoverageTest` asserts it.

## 5. Platform admin APIs (`ROLE_ADMIN` + `contracts.manage` admin permission; reason sheet on every write)
```
GET    /api/admin/contracts?orgId=&status=
POST   /api/admin/contracts                          {orgId, reference, name, currency, startsAt, endsAt, renewal, stackable, volumeApplies, minCommittedLicenses, notes, rows[]}
PUT    /api/admin/contracts/{id}                     amendment → version+1 (DRAFT or ACTIVE; ACTIVE amendments apply at next quote/rollover)
POST   /api/admin/contracts/{id}/approve · /activate · /end {endsAt} · /cancel {reason}
GET    /api/admin/contracts/{id}/events
GET/POST/PUT /api/admin/org-discounts · POST /{id}/archive
GET    /api/admin/orgs/{orgId}/pricing-preview       -> the org-effective catalog as the org sees it (support tool)
```

## 6. Tests (X5.5 / X6.9)
`ContractServiceTest` (one active per org, overlap refused, exactly-one override, currency mismatch, floor + reason, min_quantity rule, two-person rule), `ContractLifecycleJobTest` (activation/ending/renewal draft at the right instants; coupon re-size call), `OrgDiscountTest` (eligibility, best-of selection with tie-break, `ends_at` required), `ContractResourceIT` (reason sheet; no org-side writes), plus the golden rows G2/G3/G5/G6/G9 in `22`.
