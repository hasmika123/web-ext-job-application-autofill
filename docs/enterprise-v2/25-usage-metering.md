# 25 — Usage metering: the `usage_event` ledger, reservations, allowances, periods, overage hooks

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-016. Build-ready for **X5.7**
> (`UsageLedgerService`, sweeper, allowance resolution) and the Feature Usage page (**X6.5**). AI cost
> budgets (`AiBudgetService`) stay a **second, independent guard** (§6). Nothing here moves money;
> overage *hooks* exist, overage *billing* is Phase 12 (X12).

## 1. Table `usage_event` (Liquibase `202611xxxxxxxx_ent_usage.xml`)

| column | type | notes |
|---|---|---|
| id | BIGINT PK | returned as `reservationId` |
| org_id | BIGINT NOT NULL | |
| member_id | BIGINT NOT NULL | **beneficiary** membership (whose allowance is spent) |
| actor_member_id | BIGINT NOT NULL | who triggered it (= member_id for self-service) |
| actor_login, beneficiary_login | VARCHAR(50) | denormalised for support and for `ai_call` joins |
| feature_key | VARCHAR(60) NOT NULL | |
| limit_key | VARCHAR(40) NOT NULL DEFAULT 'default' | which `feature_definition_limit` row (`default`, `operations.per_day`) |
| quantity | BIGINT NOT NULL | reserved → committed quantity (updated on commit) |
| reserved_quantity | BIGINT NOT NULL | the original reservation (audit) |
| unit | VARCHAR(24) NOT NULL | snapshot of `feature_definition.usage_unit` |
| status | VARCHAR(12) NOT NULL | `RESERVED` `COMMITTED` `RELEASED` |
| release_reason | VARCHAR(16) NULL | `FAILED` `TIMEOUT` `DENIED` `CANCELLED` `PARTIAL` |
| overage | BOOLEAN NOT NULL DEFAULT false | committed beyond the allowance (only when overage is enabled, §7) |
| pool_mode | VARCHAR(16) NOT NULL | snapshot `PER_CONSULTANT` / `ORG_POOL` |
| allowance_snapshot | BIGINT NOT NULL | the allowance in force when reserved (so history explains itself after catalog changes) |
| period_key | VARCHAR(32) NOT NULL | §5 |
| period_start_at, period_end_at | DATETIME(6) NOT NULL | |
| idempotency_key | VARCHAR(120) NOT NULL UNIQUE | §2 |
| reference_type (30), reference_id (BIGINT) | | resume / posting / requirement / inbox_message / autopilot_item |
| ai_call_id | BIGINT NULL | back-link when the work was an AI call |
| expires_at | DATETIME(6) NULL | reservation deadline = created_at + `reserve_ttl_seconds` |
| created_at, committed_at, released_at | DATETIME(6) | |

Indexes: `(org_id, feature_key, period_key, status)`, `(org_id, member_id, period_key)`, `(status, expires_at)` (sweeper), `(org_id, created_at)`. Retention `enterprise.usage.retention_months` (24, E13) via `UsageEventPurgeJob`.

## 2. Idempotency

- `idempotency_key` is **mandatory** for every reservation and is built by the caller as
  `"{orgId}:{featureKey}:{referenceType}:{referenceId}:{attemptId}"` where `attemptId` is the client's
  `Idempotency-Key` header (UUID) for HTTP calls or a stable job id (`autopilot_item.id`, `inbox_message.id`) for async work. Global UNIQUE; the org prefix makes cross-tenant collision impossible.
- `reserve()` with an existing key returns the **existing row** (any status) without creating a
  second one; if it is `RELEASED` the call returns `allowed=false, reason=ALREADY_RELEASED` so a
  retry after a failure must use a new attempt id (a deliberate choice: a retry is a new attempt, and
  the first attempt's release is on record).
- `commit()`/`release()` are idempotent (`COMMITTED` twice = no-op; `release` after `COMMITTED` = no-op with a WARN log, never a reversal — committed usage is never un-committed; corrections are compensating `RELEASED`... no: corrections are admin **credits** in §7, so the ledger stays append-only in spirit).

## 3. Allowance resolution (per beneficiary, feature, limit row)

```
limit_rows      = feature_definition.default_allowance (limit_key 'default', period = allowance_period)
                ∪ feature_definition_limit rows
allowance(row)  = license_feature.allowance_override                       -- if set (admin/contract applied at quote)
                ?: org_contract_price.allowance_override for the product   -- active contract row
                ?: row.limit_value × license_feature.quantity (stackable)  -- default
pool_mode       = org_contract_price.pool_mode_override ?: feature_definition.pool_mode
PER_CONSULTANT: used = Σ quantity of usage_event(org, member, feature, limit_key, period_key, status ∈ {RESERVED, COMMITTED}, overage=false)
ORG_POOL:       pool_allowance = Σ allowance(row) over every live license_feature of that feature in the org (adding a license grows the pool)
                used = Σ quantity over the org (any member) for that feature/limit/period
remaining       = allowance − used   (never below 0 in the DTO)
```
Every live limit row must have `remaining ≥ quantity` for the reservation to succeed; the failing
row's `limit_key` is reported. Reservations count against the allowance (so two parallel
requests cannot both pass with one unit left): the reserve statement is
`INSERT … SELECT … WHERE (allowance − used) ≥ :quantity` under `SELECT … FOR UPDATE` of a
`usage_counter (org_id, member_id|0, feature_key, limit_key, period_key, used)` row kept in step
with the ledger (one row per beneficiary/feature/period; `member_id = 0` for ORG_POOL). The counter
is a cache of the ledger and is rebuilt by the reconciler if it drifts (`UsageCounterReconcileJob`,
nightly, logs drift, never changes ledger rows).

## 4. Lifecycle

```
reserve(req) ──► RESERVED (expires_at = now + ttl) ──commit(actual ≤ reserved)──► COMMITTED (quantity = actual; the difference is returned to the allowance, release_reason=PARTIAL when actual < reserved)
                       │
                       ├──release(FAILED|DENIED|CANCELLED)──► RELEASED (quantity returned)
                       └──UsageSweeperJob every 60 s: expires_at < now ──► RELEASED (TIMEOUT), WARN log with feature/reference
```
- `reserve_ttl_seconds` per feature (default 900; `automation.approved_apply` 3600 because a prepare run can wait for the user's browser; `inbox.monitoring` 300).
- Async work that legitimately outlives the TTL calls `extend(reservationId, seconds)` (max 3 extensions) — the Autopilot runner does this per item while the browser is filling.
- `commit` may exceed `reserved` **only** for `ORG_POOL`-less features flagged `allow_over_commit`
  (none at launch); otherwise `422 COMMIT_EXCEEDS_RESERVATION`.
- The handler path: `@RequiresFeature(quantity>0)` reserves → business work → `UsageCommitAdvice`
  commits on normal return, releases (`FAILED`) on exception. Async path: the enqueuer reserves with
  the job id as attempt id; the worker commits/releases.

## 5. Billing-period boundaries

- `period_key` = `"P:" + isoDate(period_start) + ".." + isoDate(period_end)` for `allowance_period = PERIOD`
  (the org's current billing period from `org_billing_account.current_period_start/end`; in LOCAL
  mode or before the first invoice, the calendar month UTC: `"M:2026-10"`), `"M:yyyy-MM"` for `MONTH`,
  `"D:yyyy-MM-dd"` for `DAY` (UTC).
- A reservation belongs to the period containing its `created_at`; a commit after the boundary keeps
  the reservation's period (the work was authorised in that period).
- At rollover nothing is written: new reservations simply land in the new key, and `remaining`
  starts fresh. Unused allowance never carries over (nothing is unlimited; nothing banks).
- `resetsAt` in DTOs = `period_end_at`.
- Removing a feature at period end: reservations until `ends_at` are allowed; the sweeper releases
  nothing special.

## 6. AI cost budgets — the second guard (X5.8)

```java
record AiBudgetWindow(long budgetMicros, Instant start, Instant resetsAt, String scope /* "org:7:member:42" */) {}
AiBudgetService.decide(AiBudgetWindow w, AiTask task) -> Decision   // same Verdict/model/economy logic as today, over ai_call rows filtered by (org_id, beneficiary_login) in [start, resetsAt)
```
Org window for a beneficiary = Σ `feature_definition.ai_budget_cents` over the beneficiary's live
`license_feature` rows (× quantity for stackable) → micros; period = the org billing period;
`consultant_license.ai_budget_override_cents` (platform admin) replaces the sum. Soft cap and
economy model unchanged (`AiPolicy.softCapPercent`). The personal `decide(login, task)` is untouched,
and `ai_call` rows written on the org path carry `org_id`, `beneficiary_login`, `feature_key`,
`usage_event_id`. The Feature Usage page shows AI budget as a **percentage** per consultant (never
dollars to the org — same rule as personal users; platform admins see cents).

## 7. Overage hooks (designed now, billed later)

- `feature_definition.overage_product_id BIGINT NULL` (a `FEATURE` product with `billing_interval=ONE_TIME` semantic "per unit") and `org_billing_account.overage_opt_in BOOLEAN DEFAULT false`.
- `reserve()` when `remaining < quantity`: if `overage_product_id != null && overage_opt_in` → the
  reservation succeeds with `overage=true` and the DTO says `overage: {unitMinor, units}`; else
  `FEATURE_ALLOWANCE_EXHAUSTED`.
- `OverageInvoicer` (X12, not built now) sums `COMMITTED, overage=true` per feature per period at
  rollover into invoice items (SUBSCRIPTION_ITEMS mode) or lines (COMPUTED_INVOICE), with
  idempotency key `ovg-{orgId}-{period_key}-{featureKey}`.
- **Credits:** platform admin `POST /api/admin/orgs/{id}/usage/credits {memberId?, featureKey, quantity, reason}` inserts a `usage_event` with `quantity < 0`, `status=COMMITTED`, `reference_type=ADMIN_CREDIT` (HIGH audit). The ledger stays append-only; a credit is a row.

## 8. APIs

| path | permission | returns |
|---|---|---|
| `GET /api/orgs/{orgId}/usage?by=consultant\|feature\|team&period=P:…\|current&featureKey=&memberId=&teamId=` | `usage.view` | rows `{key, label, allowance, used, remaining, overage, aiBudgetPct?}` + totals; `by=consultant` respects consent (summary only for members who share NONE — counts, not references) |
| `GET /api/orgs/{orgId}/usage/history?months=6&featureKey=` | `usage.view` | per-period series for `BarLineChart` |
| `GET /api/orgs/{orgId}/usage/events?memberId=&featureKey=&from=&to=&page=` | `usage.view` (ORG) or self (OWN) | ledger rows (actor, beneficiary, feature, quantity, status, reference label, created_at) — never the AI prompt or output |
| `GET /api/orgs/{orgId}/members/{memberId}/usage` | self or `usage.view` | the consultant's own meters (also embedded in `entitlementsOf`) |
| `GET /api/admin/orgs/{id}/usage` + `POST …/usage/credits` | platform admin | with cents for AI |

Every route joins the `OrgIsolationIT` registry; `usage_event`, `usage_counter` join `CrossTenantSweepIT`.

## 9. Tests (X5.7)
`UsageLedgerServiceTest`: same key twice → one row; released key → `ALREADY_RELEASED`; partial commit returns the remainder; commit > reserved refused; concurrent reserves with one unit left → exactly one succeeds (two threads, `FOR UPDATE`); PER_CONSULTANT vs ORG_POOL maths (table: 3 licensed × 40 = 120 pool; member X uses 50 → remaining 70 for everyone); DAY + PERIOD rows both enforced; period keys at the boundary (23:59:59.999999 vs 00:00); counter drift rebuilt by the reconcile job; overage opt-in path; admin credit row. `UsageSweeperJobTest`: TIMEOUT release, extension cap. `AiBudgetServiceTest` (extend): org window sum, override replaces, personal path byte-identical. `UsageResourceIT`: consent projection on `by=consultant`.
