# 20 — Consultant license model: base license + features, tied to the membership

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-012 (base + add-ons), ADR-018
> (membership-scoped, no cross-workspace stacking), ADR-019 (quotes and effective dates). Build-ready
> for **X5.4** (tables + `LicenseService`), **X5.11** (org modules), **X5.12** (bulk). Pricing is
> `22-pricing-calculation.md`; the catalog is `21-feature-catalog.md`; Stripe is `26-…`; the state
> machines in full are `27-subscription-lifecycle.md`. Money is always `long` minor units + ISO
> currency; timestamps `DATETIME(6)` UTC. Liquibase: `202611xxxxxxxx_ent_licenses.xml` (additive).

## 1. What a license is (and is not)

| Statement | Consequence |
|---|---|
| A **consultant license** belongs to an **org membership** (`org_member.id`), never to the global user. | Anika licensed at Acme has nothing at Beta; leaving Acme ends the license; her personal plan is untouched (ADR-018). |
| Exactly **one live license per membership**. | Generated column `active_key = IF(status IN ('PENDING','ACTIVE','SUSPENDED','CANCEL_AT_PERIOD_END'), member_id, NULL)` UNIQUE. A new license after ENDED is a new row (history stays). |
| A license always references **one `BASE_LICENSE` price**; features are rows under it. | A `license_feature` cannot exist without a live license (FK + service rule). No "$0 licensed consultant" (E3). |
| Non-consultant roles consume **no** consultant license. | OWNER/ORG_ADMIN/HR/FINANCE/MARKETING/ACCOUNT_MANAGER seats are free; commercially restricted *modules* are `org_module_license` rows (§6). |
| A license is **isolated across orgs** and across workspaces. | `EntitlementContext.ORG(orgId)` reads only this org's rows; PERSONAL reads only `subscription`. |
| The license configuration lives **only in Kiwiply**. | Stripe sees quantities per list price (ADR-017), never who has what. |

## 2. Tables

### 2.1 `consultant_license`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | BIGINT NOT NULL FK organization | first in every index |
| member_id | BIGINT NOT NULL FK org_member | the consultant's membership in this org |
| status | VARCHAR(24) NOT NULL | `PENDING` `ACTIVE` `SUSPENDED` `CANCEL_AT_PERIOD_END` `ENDED` |
| active_key | BIGINT generated, UNIQUE | one live license per member (see §1) |
| base_product_id | BIGINT NOT NULL FK product | kind `BASE_LICENSE` |
| base_price_id | BIGINT NOT NULL FK product_price | the immutable price row the license was made under (ADR-013) |
| currency | CHAR(3) NOT NULL | copied from `org_billing_account.currency`; must equal the price's currency |
| starts_at | DATETIME(6) NOT NULL | effective start (= confirm time, or a future `effective_at` from the quote → PENDING until then) |
| ends_at | DATETIME(6) NULL | set when CANCEL_AT_PERIOD_END/ENDED; the entitlement stops at this instant |
| paid_through_at | DATETIME(6) NULL | end of the last period this license was billed for; drives free reactivation (27 §4) |
| suspended_at, suspend_reason (200) | | admin suspension (entitlement off now) |
| end_reason | VARCHAR(24) NULL | `REMOVED` `MEMBER_LEFT` `MEMBER_REMOVED` `MEMBER_ERASED` `ORG_SUSPENDED` `ORG_CLOSED` `REPLACED` |
| ai_budget_override_cents | INT NULL | platform-admin only (X6.10), HIGH audit; outranks the computed org AI budget for this beneficiary |
| created_by_member_id, created_at, updated_at | | |
| last_change_id | BIGINT NULL FK license_change | the change that produced the current state |

Indexes: `(org_id, status)`, `(org_id, member_id)`, `(org_id, ends_at)`.

### 2.2 `license_feature`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | BIGINT NOT NULL | denormalised for isolation sweeps |
| license_id | BIGINT NOT NULL FK consultant_license | |
| feature_key | VARCHAR(60) NOT NULL FK feature_definition | |
| product_id, price_id | BIGINT NOT NULL | the FEATURE product and the immutable price row |
| quantity | INT NOT NULL DEFAULT 1 | > 1 only for `feature_definition.stackable` features (`ai.credits_extra`), capped by `max_quantity` |
| allowance_override | BIGINT NULL | admin/contract override of the per-period allowance (25 §3) |
| starts_at | DATETIME(6) NOT NULL | |
| ends_at | DATETIME(6) NULL | removal at period end sets this to `current_period_end`; the feature works until then |
| active_key | VARCHAR(80) generated UNIQUE | `IF(ends_at IS NULL OR ends_at > NOW(6), CONCAT(license_id,':',feature_key), NULL)` — one live row per (license, feature); a scheduled removal keeps the row live until `ends_at`. Implement as `live` BOOLEAN maintained by the service (MySQL generated columns cannot use NOW()); unique `(license_id, feature_key, live_seq)` where `live_seq = IF(live, 0, id)`. |
| added_by_member_id, change_id (FK license_change), created_at | | |

### 2.3 `license_quote` (ADR-019)
| column | notes |
|---|---|
| id, org_id, created_by_member_id, created_at | |
| kind | `SINGLE` `BULK` |
| catalog_version | INT NOT NULL — the version every price id in `lines_json` belongs to |
| contract_id, contract_version | NULL when no contract; the contract row's `version` at quote time |
| currency | CHAR(3) |
| inputs_hash | CHAR(64) — SHA-256 of the canonical input (22 §7) |
| lines_json | JSON — one entry per (license or member) × operation, with every price id, list/effective unit, quantity, allowance, dependency confirmations |
| current_recurring_minor, proposed_recurring_minor, delta_minor | BIGINT |
| proration_estimate_minor | BIGINT — upper bound at quote time (22 §6) |
| next_invoice_estimate_minor | BIGINT |
| tax_estimate_minor | BIGINT NULL — NULL = "not calculated" (tax escalation C3) |
| tax_source | `NONE` `STRIPE_PREVIEW` |
| effective_at | DATETIME(6) — when additions take effect (now, or a future date ≤ 30 days) |
| period_end_at | DATETIME(6) — the period end used for scheduled removals |
| expires_at | DATETIME(6) = created_at + `enterprise.quote.ttl_minutes` (15) |
| status | `OPEN` `APPLIED` `EXPIRED` `SUPERSEDED` |
| applied_change_batch_id | VARCHAR(36) NULL |
| warnings_json | JSON — e.g. `STRIPE_ITEM_LIMIT_NEAR`, `VOLUME_TIER_CHANGES`, `PRESET_INCOMPLETE` |

Index `(org_id, status, expires_at)`. Quotes are retained 90 days (purge job), applied quotes 7 years (money mirror rule).

### 2.4 `license_change` (ADR-019)
| column | notes |
|---|---|
| id, org_id, license_id (NULL for a CREATE until the row exists; then back-filled), quote_id, batch_id CHAR(36) | one batch per confirm |
| kind | `CREATE` `ADD_FEATURE` `REMOVE_FEATURE` `CHANGE_QUANTITY` `UPGRADE_BASE` `SUSPEND` `CANCEL` `REACTIVATE` `END` `APPLY_PRESET` |
| feature_key, product_id, price_id, quantity_from, quantity_to | per line |
| payload_json | the authoritative numbers at confirm: list/effective unit, proration_minor actually charged, allowance, dependency confirmations (`confirmed_commercial_deps`) |
| effective_at | now for adds/upgrades/reactivations; `period_end_at` for removals/downgrades/cancels |
| status | `PENDING` `APPLYING` `APPLIED` `CANCELLED` `FAILED` |
| stripe_ref | item id / invoice item id / coupon id touched |
| stripe_idempotency_key | `lc-{id}` (26 §8) |
| applied_by_member_id, applied_at, failed_reason (500) | |

Index `(org_id, status, effective_at)`, `(license_id, created_at)`.

### 2.5 `org_module_license` (X5.11; ADR-012 "org-level entitlements")
| column | notes |
|---|---|
| id, org_id, module_key (FK feature_definition where category = MODULE), product_id, price_id | |
| quantity_basis | `FLAT` or `PER_ROLE` (copied from the product) |
| role_key | NULL unless PER_ROLE (e.g. `MARKETING_SPECIALIST`) |
| quantity | INT — FLAT: 1; PER_ROLE: maintained = count of ACTIVE members holding `role_key`; recomputed on every role grant/revoke |
| status, starts_at, ends_at, created_by_member_id, change_id | same lifecycle as a license minus SUSPENDED |

Modules that are **not** commercially restricted need no row: `module enabled = flag allow-list` (05 §2 step 6).

## 3. Lifecycle (summary; full machine in 27 §3)

```
            quote+confirm (effective now)            admin suspend
 (none) ───────────────────────────────► ACTIVE ◄──────────────────────► SUSPENDED
    │  effective_at in the future            │ ▲ reactivate                    │
    └──────────────► PENDING ────────────────┘ │                               │ period end passes & not reactivated
                 (job promotes at effective_at)│ cancel (keeps until period end)│
                                               ▼                               ▼
                                   CANCEL_AT_PERIOD_END ───(period end)──► ENDED ◄── member leaves/removed/erased, org closed
```
- **Adds and upgrades are immediate** (and prorated, 22 §6). **Removals, downgrades and cancels are
  effective at `period_end_at`** and never credit anything (no refunds). Until then the consultant
  keeps the feature; the pending change is visible and cancellable.
- **Suspend** (permission `licenses.manage`, reason required): entitlement off **now**; nothing is
  credited; the row is excluded from the next period's quantities. **Reactivate** within the
  already-paid period is free; after it, it is an add (prorated).
- **Member leaves / is removed / is erased**: license → ENDED **now** with `end_reason`; features
  end now; Stripe quantities decrement with no proration (the org paid the period; documented in
  the org terms — see billing.md §8, unchanged).
- **Org PAST_DUE**: licenses keep working until `org_billing_account.paid_through_at` (E11, 24 §4).
  **Org SUSPENDED/CLOSED**: every license → ENDED (`ORG_SUSPENDED`/`ORG_CLOSED`) and features stop
  now; paying again creates new rows (history stays).

## 4. `LicenseService` (API only in X5.4; Stripe effects arrive in X6.7 through `LicenseChangeApplier`)

```java
public interface LicenseService {
  LicenseQuote quote(QuoteRequest req);                       // never writes licenses; see 22 §7
  ChangeBatch confirm(long orgId, long quoteId, String idempotencyKey, Member actor); // applies the quote
  void cancelPending(long orgId, long changeId, Member actor); // only status PENDING, effective_at in the future
  LicenseView get(long orgId, long licenseId);
  Page<LicenseRow> list(long orgId, LicenseFilter f, Pageable p);
  List<LicenseChange> history(long orgId, long licenseId);
}
record QuoteRequest(long orgId, List<QuoteLine> lines, Instant effectiveAt /*nullable=now*/, Set<String> confirmedCommercialDeps) {}
record QuoteLine(Long licenseId /*null = new*/, Long memberId, Op op, String featureKey, Integer quantity, String presetKey) {}
enum Op { CREATE, ADD_FEATURE, REMOVE_FEATURE, CHANGE_QUANTITY, UPGRADE_BASE, SUSPEND, CANCEL, REACTIVATE, APPLY_PRESET }
```

Rules the service enforces (each is a unit test):
1. **Org state**: quoting needs org `ACTIVE` or `PAST_DUE`; confirming needs `ACTIVE` (PAST_DUE may only remove/cancel — adding paid lines while unpaid is refused `409 ORG_STATE`).
2. **Membership**: the member must be `ACTIVE` or `INVITED` in this org; INVITED → license `PENDING` until acceptance (`JoinResource` accept promotes it; the org is already billed from confirm, as billing.md §4 decided; the Licenses page shows "waiting on invite").
3. **Eligibility**: `feature_definition.eligibility_json` (org types, requires base product codes) is evaluated at quote time; ineligible → `422 FEATURE_INELIGIBLE {featureKey, rule}`.
4. **Dependencies** (21 §4): TECHNICAL missing → the quote **adds the missing feature line automatically only if it is free** (price 0) else refuses `422 DEPENDENCY_REQUIRED {featureKey, requires, kind, priceMinor}`; COMMERCIAL missing → the quote returns the dependency with its cost in `lines_json[].requires[]` and `confirm` refuses `422 DEPENDENCY_UNCONFIRMED` unless `confirmedCommercialDeps` names it (nothing paid is ever added silently — requirement §16); INTEGRATION/CONSENT missing → quote `warnings_json` (the feature is licensed but `check()` will return `INTEGRATION_REQUIRED`/`CONSENT_REQUIRED` until satisfied). Removing a feature that others depend on TECHNICALLY → `422 DEPENDENCY_BLOCKS_REMOVAL` listing dependents (the admin removes them in the same quote).
5. **Quantity**: `quantity > 1` only when `stackable`; `≤ max_quantity`; `CHANGE_QUANTITY` up = immediate, down = period end.
6. **Currency**: every price id in the quote has the org's currency, else `409 CURRENCY_MISMATCH`.
7. **Catalog freshness**: `confirm` recomputes with the quote's price ids; if any price is retired/ineffective at confirm time or `catalog_version`/`contract_version`/`inputs_hash` differ → `409 QUOTE_STALE` (the UI re-quotes). `expires_at` passed → `410 QUOTE_EXPIRED`.
8. **Idempotent confirm**: `Idempotency-Key` header (UUID) is stored on `license_change.batch_id`; a replay returns the same batch (200) and never applies twice.
9. **Atomicity**: confirm writes all `license_change` rows PENDING in one transaction, then hands the batch to `LicenseChangeApplier` (X6.7). While Stripe is off (dev/CI or `flag.enterprise.billing` UI-off), the applier's local mode applies immediately and writes `org_subscription` mirror rows with `source=LOCAL` (26 §11).
10. **Audit**: every confirm writes `org_audit_event(action=LICENSE_CHANGE, risk=HIGH, beneficiary_login, details={quoteId,batchId,delta_minor})`; suspend/cancel/end carry the reason.
11. **Notifications**: the consultant gets `LICENSE_FEATURES_CHANGED` (what was added/removed and when); Finance/Admin get a digest when `delta_minor ≠ 0` (setting `enterprise.billing.notify_delta_min_minor`, default 0 = always).

## 5. Bulk operations (X5.12)

- One quote, many lines (`kind=BULK`); the request names members by id or by filter (`team`, `department`, `role`, `unlicensed=true`) resolved server-side at quote time into explicit member ids (the quote lists them; the filter is not re-evaluated at confirm).
- Operations: `ASSIGN_PRESET` (create or extend), `ADD_FEATURE`, `REMOVE_FEATURE`, `SUSPEND`, `CANCEL`, `REACTIVATE`.
- **Partial-failure semantics**: the quote is all-or-nothing per *line validation* (an ineligible member makes the quote return `422` with `line_errors[]`, nothing applied); confirm is all-or-nothing in Kiwiply; Stripe application is per-batch with per-line idempotency keys and a `FAILED` line never blocks the others — the batch shows `applied/failed` counts and failed lines are retried by the sweeper (26 §9).
- Limits: `enterprise.license.bulk_max_lines` (default 500). CSV import (member email → preset) reuses the invite CSV parser; a row with an unknown email is reported, not invited.

## 6. Org modules and the marketer seat

- `ORG_MODULE` products carry `quantity_basis` and `role_key`. Draft catalog: `module.talent_marketing` (**the locked "Marketer seat"**, PER_ROLE `MARKETING_SPECIALIST`; quantity follows the role grants, so the Roles page shows "adding this role adds a paid seat" with the price before the grant is saved — same never-silent rule), `module.consultancy_ops` (FLAT + PER_ROLE `CONSULTANT` second line, Phase 23, prices admin-set), `module.clients_placements` and `module.hr_finance` (**included**, no product: enabled by flag allow-list).
- A role grant that changes a PER_ROLE quantity goes through the same quote → confirm path (`Op.CHANGE_QUANTITY` on the module line); the Roles page calls `POST /licenses/quotes` with `moduleLines[]` and shows the delta before saving the role.
- Modules never gate a *consultant* feature; they gate steps 6 (`MODULE_OFF`) of the evaluation order for employee actions (e.g. `submissions.prepare` needs `module.talent_marketing`).

## 7. APIs (all under the tenant, `@OrgPermissionRequired`)

| Method & path | Permission | Notes |
|---|---|---|
| `GET /api/orgs/{orgId}/licenses?status=&featureKey=&teamId=&q=&sort=&page=` | `licenses.view` | rows: member (PersonCell data), assigned marketer (open PRIMARY assignment), features[], status, recurring_minor, next_change{kind, effective_at}, pending flag |
| `GET /api/orgs/{orgId}/licenses/{id}` | `licenses.view` | full view incl. allowances/remaining (from 25) and history link |
| `GET /api/orgs/{orgId}/licenses/{id}/history` | `licenses.view` | `license_change` rows, newest first |
| `GET /api/orgs/{orgId}/licenses/catalog` | `licenses.view` | the **org-effective** catalog: base + features with list and effective unit prices, allowances, dependencies, presets, contract name, currency, catalog_version |
| `POST /api/orgs/{orgId}/licenses/quotes` | `licenses.manage` | body `QuoteRequest`; 200 `LicenseQuoteDTO` (28 fields, 22 §8) |
| `POST /api/orgs/{orgId}/licenses/quotes/{quoteId}/confirm` | `licenses.manage` | header `Idempotency-Key`; 200 `ChangeBatchDTO`; 409/410/422 as §4 |
| `DELETE /api/orgs/{orgId}/licenses/changes/{changeId}` | `licenses.manage` | cancel a PENDING scheduled change |
| `POST /api/orgs/{orgId}/licenses/{id}/suspend` · `/reactivate` · `/cancel` | `licenses.manage` | shortcuts that create a one-line quote and confirm it in one call (body `{reason}`), returning the batch |
| `GET /api/orgs/{orgId}/members/{memberId}/entitlements` | self (`features.view` OWN) or `licenses.view` | the consultant's "My Available Features": feature, allowance, remaining, resets_at, consent needed? |
| `GET /api/orgs/{orgId}/modules` · `POST /api/orgs/{orgId}/modules/quotes` | `billing.view` / `billing.manage` | org modules (X5.11) |

Every route is added to `OrgIsolationIT`'s coverage registry and to `CrossTenantSweepIT` (consultant_license, license_feature, license_quote, license_change, org_module_license).

## 8. Permissions and scope

`licenses.view` (ORG_ADMIN, FINANCE_SPECIALIST; ORG scope), `licenses.manage` (ORG_ADMIN; ORG), `features.view` (CONSULTANT; OWN). A MARKETING_MANAGER may **view** licenses of their TEAM (`licenses.view` at TEAM) to see who lacks a feature, never change them. Platform admins touch licenses only through the admin billing operations (X6.10) with a reason sheet.

## 9. Tests (X5.4 / X5.11 / X5.12)

- `LicenseServiceTest`: one-live-license rule; INVITED → PENDING → ACTIVE on accept; dependency rules 4 (free TECHNICAL auto-added, paid TECHNICAL refused, COMMERCIAL unconfirmed refused, confirmed accepted, removal blocked by dependents); stackable cap; currency mismatch; stale/expired quotes; idempotent confirm; member leave ends now; org suspended ends all.
- `LicenseLifecycleJobTest`: PENDING promotion at `effective_at`; CANCEL_AT_PERIOD_END → ENDED at `ends_at`; scheduled removals flip `live=false`.
- `OrgModuleLicenseTest`: PER_ROLE quantity follows role grants and goes through a quote.
- `BulkLicenseTest`: filter resolution, 500-line cap, line errors, per-line idempotency.
- `LicenseResourceIT` (+ coverage registry rows): 404 for outsiders on every route; 402 vocabulary never leaks across tenants.
