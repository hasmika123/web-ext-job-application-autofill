# Billing data foundation: data layer for Subscription Overview, Consultant Licenses, Billing, Feature Usage

> Branch `ent-billing-data` (cut from `ent-boards`). **Read this first** if you build one of the four org-admin billing pages.
> It gives you tables, entities, repositories, seeded demo data and the formula for every KPI, tile and series on the boards. You still write the REST
> resource, service and web UI of your page. Boards: `design/enterprise-more/{subscription-overview,consultant-licenses,billing,feature-usage}.png`.
> Template: `talent-foundation.md`. Rules: `41-database-design.md` (R1-R10), CLAUDE.md (no sensitive PII, cards never touch us, Stripe is the truth, nothing
> hard-coded that admin should decide, 404 not 403, `@kiwiply/ui` only). Money is `*_minor` BIGINT + currency; we **record** money, never move it.

## 1. Tables (one changelog: `20261020010000_ent_billing_data.xml`, registered after `ent_talent`)

The catalog / contract / license changelogs of doc 41 phase 5 did **not** exist on this branch, so this changelog creates the minimal slice the boards need
(names follow docs 20, 21, 23, 25, 26). All org tables: `org_id NOT NULL` + FK `organization`, every secondary index starts with `org_id`, `uk_<t>_org_id (org_id, id)`,
composite tenant FKs `(org_id, parent_id)`, varchar enum names, `DATETIME(6)` UTC, one precondition-guarded changeSet per table (+ one for generated keys), empty rollbacks.

| Table | Purpose |
|---|---|
| `feature_definition` (platform, PK `feature_key`) | What a feature is: name, `usage_type` (AI_FEATURE, ANALYTICS, PRODUCTIVITY, MARKETING, RECRUITING, INTEGRATION), `usage_unit`, `default_allowance` (per `allowance_period` MONTH), `icon_key`, `active`, `demo_data`. **No price.** |
| `product` (platform) | Sellable things: `kind` BASE_LICENSE (tier_rank 1..3), FEATURE (`feature_key`), ORG_ADDON. Unique `code`. **No price.** |
| `org_contract` | The org's agreement (23 s2.1): `reference` (unique per org), `status`, `version`, `currency`, `demo_data`. One ACTIVE per org (generated `active_key`). |
| `org_contract_price` | **The prices.** `override_amount_minor` per product (23 s2.2: `version_from/version_to`, `allowance_override`). Never updated; an amendment closes a row with `version_to`. |
| `org_payment_method` | Display mirror of a Stripe method: `brand`, `last4`, `exp_month`, `exp_year`, `default_method` (one default per org: generated key), `status`, `provider_ref`. **No card number.** |
| `org_billing_account` | One per org (26 s2): `billing_cycle` MONTH, `current_period_*`, `next_invoice_on`, `paid_through_on`, `default_payment_method_id`, `seats_purchased` (150), `source` LOCAL / STRIPE. |
| `org_subscription` | Subscription mirror: `plan_code`, `plan_name` ("Professional"), `plan_description`, `status`, `unit_amount_minor` (plan per-consultant price), `licensed_capacity` (150), period, `source`. One ACTIVE/PAST_DUE per org. |
| `org_plan_feature` | The "Plan Features" checklist (7 labels). |
| `org_subscription_item` | One row per product on the subscription = the **License Packages and Add-ons** table: `kind` BASE_LICENSE / FEATURE / ORG_ADDON, `quantity` (licensed), `capacity` (nullable), `unit_amount_minor`, `label`, `detail`. |
| `subscription_change` | **Recent Subscription Changes**: `kind` ADDED / UPDATED / REMOVED, `summary` ("+5 Consultant Licenses (Total: 142)"), `licenses_delta`, `licenses_total_after`, `actor_member_id`, `occurred_at`. |
| `consultant_license` | One live license per consultant (generated `active_key`, ENDED rows are history): `status` PENDING / ACTIVE / SUSPENDED / CANCEL_AT_PERIOD_END / ENDED, `base_product_id` (tier), `base_amount_minor` (price pinned), `starts_at`, `renews_at`, `ends_at`, `suspended_at`, `suspend_reason`, `end_reason`, `paid_through_at`. |
| `license_feature` | An add-on on a license: `feature_key`, `unit_amount_minor` (pinned), `quantity`, `allowance_override`, `starts_at`, `ends_at`, `live` (one live row per license+feature: generated `live_key`). |
| `license_change` | License history (drawer History tab) **and** the scheduled/pending changes: `kind` CREATE / ADD_FEATURE / REMOVE_FEATURE / UPGRADE_BASE / SUSPEND / CANCEL / REACTIVATE / END, `status` PENDING / APPLIED / CANCELLED, `effective_at`, `amount_delta_minor`, `summary`, `actor_member_id`. |
| `org_invoice` | Invoice mirror `INV-YYYY-NNNN` (unique per org): `kind` RECURRING / ADJUSTMENT, `period_start/end`, `issue_date`, `due_date`, `status` PAID / OPEN / VOID / DRAFT, `description`, `amount_minor`, `amount_paid_minor`, `paid_at`, `payment_method_id`, `source`. |
| `org_invoice_line` | Snapshot lines: `line_kind` BASE_LICENSE / FEATURE / ORG_ADDON / PRORATION / CREDIT / ADJUSTMENT, `description`, `detail`, `quantity`, `unit_amount_minor`, `amount_minor` (credits negative). **Sum of lines = invoice amount.** |
| `org_payment` | Transactions: `status` SUCCEEDED / FAILED / PENDING / REFUNDED, `kind` CHARGE / MANUAL_RECORD, `failure_reason`, `occurred_at`, `recorded_by_member_id`. |
| `org_billing_adjustment` | Adjustments tab: `kind` CREDIT / DEBIT / DISCOUNT, signed `amount_minor`, `reason`, `status` PENDING / APPLIED / VOID, `applied_invoice_id`. |
| `usage_event` | Append-only ledger (25, simplified): `consultant_id`, `feature_key`, `quantity`, `period_key` (`YYYY-MM`), `occurred_at`, `status`, `source`. Seeded for the current and previous month. |
| `usage_counter` | Per consultant x feature x `period_key`: `used`, `allowance` (allowance in force incl. credits). Unique per tuple. Seeded for six months (older than two months: counters only). |
| `usage_alert` | Recent alerts: `kind` APPROACHING_LIMIT (80 %) / LIMIT_REACHED (100 %), `threshold_pct`, `message`, `created_at`, `acknowledged_at`. |
| `feature_credit` | Add Feature Credits: extra allowance for a consultant+feature+period (`quantity`, `reason`, `created_by_member_id`). |

## 2. Classes

- Entities `com.dossier.api.domain.ent.billing.*` (one per table, 21). Plain fields, explicit `orgId`, statuses as String, `Boolean`/`Integer`/`Long`/`Instant`/`LocalDate` (generated key columns are not mapped).
- Org repositories `com.dossier.api.repository.ent.billing.<Entity>Repository` (19). **Every method takes `orgId` first** (enforced by `BillingSchemaIT` and `EntRepositoryContractTest`).
  Each has `findByOrgIdAndId`, `findByOrgId`, `countByOrgId` plus the KPI queries named in section 5 (the javadoc of each method says what it counts).
- Platform catalog repositories `com.dossier.api.repository.catalog.{FeatureDefinitionRepository,ProductRepository}` (no `org_id`; deliberately **outside** `repository.ent` so the org-first contract test keeps scanning only tenant data).
- Seeder `com.dossier.api.service.ent.BillingDemoSeeder` (called by `EnterpriseDemoBootstrap` after `TalentDemoSeeder`). `BillingDemoSeeder.TABLES` lists the 19 org tables; `BILLABLE = {ACTIVE, CANCEL_AT_PERIOD_END, PENDING}`.

## 3. Demo data (how to turn it on, what is in it)

Same switches as the other demo tenants: `DEMO_ENABLED=true ENT_DEMO_SEED=true` (never under `prod`; see `real-stack-runbook.md`). Idempotent: an org that already has a contract is skipped;
the catalog rows are keyed by `feature_key` / `code`. Dates are relative to now; the random stream is seeded per org. **It needs the talent seed first** (licenses attach to the seeded `consultant_profile` rows); if an org has no consultants it is skipped.

**Demo catalog data, clearly marked.** The platform catalog tables carry no prices. The seeder inserts 12 `feature_definition` + 17 `product` rows (`demo_data = true`, codes `DEMO_*`) and gives each demo org a
`DEMO-<ORG>-2026` contract ("Demo agreement (demo catalog data)") whose `org_contract_price` rows carry the prices (Standard $79 / Professional $149 / Enterprise $199 per consultant per month; add-ons $9 to $45; org add-ons Advanced
Analytics $500, API Access $300). The constants live only in `BillingDemoSeeder`; no application code reads them. Plan names are data (`org_subscription.plan_name`, `product.name`).

| Seeded (Acme / Beta) | |
|---|---|
| consultants / licensed | 153 / 46 consultants. **142 / 34 live licenses** (not ENDED): ACTIVE 118 / 27, CANCEL_AT_PERIOD_END (the "Expiring Soon" ones, `ends_at` within 30 days) 18 / 5, SUSPENDED 4 / 1, PENDING (starts in a few days) 2 / 1. Plus ENDED history 9 / 3. **Unlicensed = 11 / 12** |
| capacity | `org_subscription.licensed_capacity` 150 / 40 (142 of 150 = 95 %) |
| base mix | ~45 % Standard, 40 % Professional, 15 % Enterprise; license starts grow month by month (about 12 months of growth for Acme, 6 for Beta) |
| add-on features | about 150 / 40 `license_feature` rows over all 12 features (Acme: every feature has at least one) |
| license history | ~270 `license_change` rows; PENDING scheduled changes: 18 cancels + 8 adds + 5 upgrades + 2 pending CREATE (Beta 5 + 2 + 1 + 1) |
| subscription | 1 ACTIVE "Professional" subscription, 7 plan features, items (3 base tiers + the features in use + 2 org add-ons for Acme), 7 `subscription_change` rows |
| invoices | Acme 12 monthly RECURRING (months 1..12 back, rising) + 1 proration invoice this month (paid when its date is past) + 1 OVERDUE invoice (issued 45 days ago, due 30 days ago) = 14; the latest monthly invoice is OPEN (unpaid, due 14 days after issue); Beta 6 monthly |
| payments | one SUCCEEDED per PAID invoice; one FAILED attempt then a success four months ago (Acme second card), and one failed attempt on the overdue invoice |
| adjustments | Acme: PENDING credit -$4,000, APPLIED credit -$250 and debit +$180 (months 7 and 10 back, outside the 6-month series window); Beta: PENDING credit -$100 |
| payment methods | Acme Visa 4242 (default) + Mastercard 4444 (public test numbers); Beta Visa 4242 |
| usage | counters for six months over every license feature row, **events for the current and previous month that sum exactly to the counters**, current month about +24 % (range +5 % to +75 %) over the previous, 3 credits (Acme), 4 counters pushed to 80-92 % and one to 100 % (the alerts) |

Counts of random-driven rows (features, events, changes) vary a little between runs; the headline numbers (142 / 150, 18, 4, 2, 9, 11, the 12 monthly invoices, 12 features, one overdue invoice) are fixed.
`consultant_profile.license_status` / `license_valid_until` are **rewritten** by this seed to follow the license (ACTIVE; CANCEL_AT_PERIOD_END becomes EXPIRING; PENDING; suspended and unlicensed become NEEDS_REVIEW), so the Consultants board and the
dashboard alerts agree with the Licenses board (this raises Needs Review by the number of unlicensed + suspended consultants).

## 4. Permissions (no new keys needed: all exist in `EntPermissions` / `RoleTemplates`)

| Page | View | Write |
|---|---|---|
| Subscription Overview | `billing.view` (ORG) | `billing.manage` for Manage Plan / Edit Packages (change a plan = a quote in the later phase) |
| Consultant Licenses | `licenses.view` (ORG; TEAM for a marketing manager) | `licenses.manage` (ORG): configure, add features, suspend, assign |
| Billing | `billing.view` | `billing.manage`: Generate Invoice, Record Payment, adjustments, Edit |
| Feature Usage | `usage.view` (ORG) | `licenses.manage` for Add Feature Credits (credits change what a license can use) |
| Consultant self view | `features.view` (OWN) | none |

Org Admin holds all of them; Finance Specialist `billing.*`, `licenses.view`, `usage.view`; Executive Viewer `billing.view`. Unknown ids or another tenant's ids answer the generic 404. Free text on write DTOs (reason, summary, notes) goes through the PII scanner
(`SensitiveContent`). `OrgStateRules` already lets `billing.view/manage` through when the org is PAST_DUE.

## 5. How every number on the boards is computed (all from rows; "now" is request time UTC; `T-30` = now minus 30 days; delta % = (cur - prev) / prev, "n/a" when prev = 0)

Constants: **licensed** = live license = status <> ENDED (`ConsultantLicenseRepository.countLive`). **billable** = ACTIVE, CANCEL_AT_PERIOD_END, PENDING (suspended is licensed but excluded from the next period: doc 20 s3; `BillingDemoSeeder.BILLABLE`).
Money in `*_minor`; format on the client.

### Subscription Overview (`OrgSubscriptionRepository`, `OrgSubscriptionItemRepository`, ...)
| Tile / block | Formula |
|---|---|
| Total Consultants | `consultant_profile` ACTIVE count (`ConsultantProfileRepository.countByOrgIdAndStatus`); vs last month = minus `countByOrgIdAndStatusAndCreatedAtLessThan(T-30)` |
| Licensed Consultants | `licenses.countLive`; vs last month = `countLive - countLiveAt(T-30)` as % of `countLiveAt(T-30)` |
| Current Monthly Recurring | `licenses.sumBaseAmount(BILLABLE) + licenseFeatures.sumAmount(BILLABLE) + sum(org add-on items)` (= `items.sumMonthlyMinor(subscriptionId)`); vs last month = against the previous month's recurring invoice (`lines.sumRecurring` of the RECURRING invoice with `period_start` = last month) |
| Estimated Next Invoice | current monthly recurring + `adjustments.sumAmountByStatus(PENDING)` (negative credits reduce it); "vs current" = % difference to the current recurring figure |
| Monthly Recurring Spend chart (6 months) | per month k = 6..1 back: the RECURRING invoice with that `period_start` -> `lines.sumRecurring(invoiceId)` (BASE_LICENSE + FEATURE + ORG_ADDON lines, **excludes** CREDIT / ADJUSTMENT / PRORATION). `findByOrgIdAndKindAndPeriodStartBetweenOrderByPeriodStartAsc(RECURRING, from, to)`. "+6 % vs previous 6 months" = last 6 sum vs the 6 before (Acme has 12 months) |
| Organization Billing Summary | plan = `org_subscription.plan_name` + `status`; cycle = `org_billing_account.billing_cycle`; next invoice = `next_invoice_on` (+ days from today); payment method = default `org_payment_method` (brand + `last4`); Total Active Licenses = `countLive` / `org_subscription.licensed_capacity`, % = ratio |
| Subscription Plan Overview | name + description from the subscription row; "$ per consultant/month" = `unit_amount_minor`; "licensed consultants" = `licensed_capacity`; features = `org_plan_feature` ordered |
| License Packages and Add-ons | `org_subscription_item` rows ordered by `sort_order`: label/detail, price = `unit_amount_minor`, Licensed = `quantity`, Monthly Total = `unit_amount_minor x quantity`. **Available** for the licenses block = `licensed_capacity - countLive` (shown on the base-license rows); add-on rows show "-". |
| Next Invoice Snapshot | Base plan (n licenses) = base amounts of the first `licensed_capacity` billable licenses; Additional licenses = the billable ones beyond capacity (Acme: 0); Feature Add-ons = `licenseFeatures.sumAmount(BILLABLE)` + org add-on items; Credits/Adjustments = `adjustments.sumAmountByStatus(PENDING)`; Estimated Total = sum |
| Payment Status | last PAID invoice (`findByOrgIdAndStatus(PAID)` newest `paid_at`): date + `amount_paid_minor`; "Good Standing" = account status ACTIVE and `invoices.countOverdue(today) = 0` |
| Recent Subscription Changes | `subscriptionChanges.findTop10ByOrgIdOrderByOccurredAtDesc` (date, kind chip, summary, actor from `actor_member_id`); View All = the paged `findByOrgIdOrderByOccurredAtDesc` |
| Quick Actions / Usage Summary tab | links; Usage Summary = section 5 Feature Usage |
| Upcoming Changes tab | `licenseChanges.findByOrgIdAndStatusOrderByEffectiveAtAsc(PENDING)` |

### Consultant Licenses (`ConsultantLicenseRepository`, `LicenseFeatureRepository`, `LicenseChangeRepository`)
| Tile / column | Formula |
|---|---|
| Active Licenses | `countByOrgIdAndStatus(ACTIVE)`; vs last month = `countLiveAtWithStatus(ACTIVE-ish, T-30)` (history is not versioned: use `countLiveAt(T-30)`) |
| Expiring Soon (in next 30 days) | `countByOrgIdAndStatusAndEndsAtBetween(CANCEL_AT_PERIOD_END, now, now+30d)`; the list = `findExpiring(now, now+30d)` ordered by `ends_at`; the chip "Expiring Soon" is shown for status CANCEL_AT_PERIOD_END |
| Unlicensed Consultants | consultants with no non-ENDED license: `consultants.findByOrgId` minus consultant ids of `findByOrgIdAndStatusIn(all live statuses)` (or a NOT EXISTS query of your own) |
| Add-on Features Enabled | `licenseFeatures.countEnabled(orgId)` (live feature rows on non-ENDED licenses); vs last month = minus `countEnabledAt(T-30)` |
| Row: consultant | `consultant_profile` (name, email, `job_title`); assigned marketer = `marketer_assignment` (`MarketerAssignmentRepository.findByOrgIdAndConsultantId`) |
| Row: base plan, price | `base_product_id` -> `product.name` (strip " License": Standard / Professional / Enterprise); Monthly Price = `base_amount_minor` (+ add-ons in the drawer) |
| Row: add-on chips | `licenseFeatures.findByOrgIdAndLicenseIdIn(visible license ids)` -> `feature_definition.name`; first 2 chips + "+n" |
| Row: license status | stored `status`: ACTIVE -> Active, CANCEL_AT_PERIOD_END -> Expiring Soon, SUSPENDED -> Suspended, PENDING -> Pending; **Unlicensed** = a consultant without a live license (no row) |
| Renewal Date | `COALESCE(ends_at, renews_at)` (annual term anniversary for active ones) |
| Tabs | All = `findByOrgIdAndStatusNot(ENDED, pageable)`; Pending Changes = `licenseChanges.findByOrgIdAndStatusOrderByEffectiveAtAsc(PENDING)`; Expiring Soon = the list above; Feature Usage = section 5 Feature Usage grouped by consultant |
| Drawer | base license + `base_amount_minor`; Add-ons (n) with `unit_amount_minor` each; Monthly Total = base + sum(add-ons x quantity), "Renews in n days" from `renews_at`; Usage Summary: Logins = **not stored in this foundation** (see limitations), Feature Usage % = `sum(used) / sum(allowance)` over the consultant's current-month `usage_counter` rows, Storage = **not stored**; History = `licenseChanges.findByOrgIdAndLicenseIdOrderByCreatedAtDesc` |
| Actions | configure / add features / suspend / history = service writes you add (write `license_change` + update the row; set `suspended_at` + `suspend_reason`); the unique `active_key` allows one live license per consultant |

### Billing (`OrgInvoiceRepository`, `OrgInvoiceLineRepository`, `OrgPaymentRepository`, `OrgBillingAdjustmentRepository`)
| Tile / block | Formula |
|---|---|
| Total Billed | `invoices.sumIssuedBetween(firstOfMonth, today)` (this month's issued invoices, VOID excluded); vs last month = the same for last month |
| Outstanding Invoices | `invoices.sumOutstanding(orgId)` (unpaid balance of OPEN invoices); vs last month = `sumOutstandingIssuedBefore(first of this month)` |
| Paid This Month | `payments.sumSucceededBetween(monthStart, nextMonthStart)`; vs last month the same range one month earlier |
| Payment Success Rate | SUCCEEDED / (SUCCEEDED + FAILED) over a window (the IT uses 12 months): `countByOrgIdAndStatusAndOccurredAtBetween(SUCCEEDED, ...) / countAttemptsBetween(...)` |
| Invoices list | `findByOrgIdOrderByIssueDateDescIdDesc(pageable)` or `findByOrgIdAndStatus...`; columns: `invoice_number`, "Billing Period" = `period_start - period_end`, `description`, `amount_minor`, `due_date`. **Status chip**: PAID -> Paid; OPEN and `due_date < today` -> Overdue (`findOverdue`); OPEN otherwise -> Unpaid |
| Detail drawer | Billing Summary = the invoice columns (Issue Date = `issue_date`, "due in n days" from `due_date`); payment method = `payment_method_id` -> brand + last4; Invoice Items (n) = `lines.findByOrgIdAndInvoiceIdOrderBySortOrderAsc` (description, detail, amount); Total = `amount_minor` (always equals the sum of the lines); History tab = the invoice's `org_payment` rows (`findByOrgIdAndInvoiceIdOrderByOccurredAtAsc`) |
| Payment Methods tab | `methods.findByOrgIdAndStatusOrderByDefaultMethodDescIdAsc(ACTIVE)` (brand, last4, expiry `mm/yyyy`, default chip). Add/remove goes through Stripe (the portal), never through our DB |
| Transactions tab | `payments.findByOrgIdOrderByOccurredAtDesc(pageable)` (status, amount, method, failure reason) |
| Adjustments tab | `adjustments.findByOrgIdOrderByCreatedAtDesc` (kind, signed amount, reason, status, applied invoice) |
| Generate Invoice / Record Payment | writes you add: Record Payment inserts a SUCCEEDED `org_payment` (`kind` MANUAL_RECORD, `recorded_by_member_id`) and flips the invoice to PAID with `amount_paid_minor`; we never move money |
| Invoice numbers | next number = `findFirstByOrgIdAndInvoiceNumberStartingWithOrderByInvoiceNumberDesc(orgId, "INV-" + year + "-")` + 1 (sequence restarts each year; unique per org) |

### Feature Usage (`UsageCounterRepository`, `UsageEventRepository`, `UsageAlertRepository`, `FeatureCreditRepository`)
Period key = `YYYY-MM` of the selected month (the date-range picker maps to months). Status chip: `used >= allowance` -> Limit reached; `used*100 >= 80*allowance` -> Approaching limit; otherwise Active (derived, not stored).
| Tile / column | Formula |
|---|---|
| Total Active Features | `counters.countFeatures(orgId, period)` (distinct features with usage rows; Acme 12); vs last month = same for the previous period |
| AI Usage This Month | `counters.sumUsedAi(orgId, period)` (counters of features whose `feature_definition.usage_type = AI_FEATURE`); vs last month the same for the previous period |
| Most Used Feature | `counters.byFeature(orgId, period)` -> row with the largest `used` (name from `feature_definition`, "n usages") |
| Usage Trend | `(sumUsed(period) - sumUsed(prev)) / sumUsed(prev)`; the Trends tab = `counters.trend(orgId, fromKey, toKey)` (six months) |
| By Feature tab / row | `usage_counter` rows of the period (`findByOrgIdAndPeriodKey(pageable)`): consultant, feature, type = `feature_definition.usage_type` (display: AI Feature, Analytics, ...), Usage (This Month) = `used`, Allowance = `allowance`, Remaining = `allowance - used` (floor 0), Usage % = `used / allowance` |
| By Consultant tab | group counters by `consultant_id` (sum used / sum allowance) |
| Limits tab | `counters.findAtOrAbovePct(orgId, period, 80)` |
| Drawer (consultant) | donut = sum of the consultant's `used` vs `allowance` (`findByOrgIdAndConsultantIdAndPeriodKey`); Usage by Feature bars = the same rows; History = `events.history(orgId, consultantId, PageRequest)` |
| Recent Alerts | `alerts.findTop10ByOrgIdOrderByCreatedAtDesc` ("2 days ago" from `created_at`); View All = the whole list |
| Add Feature Credits | insert a `feature_credit` row (`period_key`, `quantity`, `reason`) **and** add the quantity to that month's `usage_counter.allowance` (the counter's allowance is the effective one); `credits.sumQuantity(orgId, consultantId, featureKey, period)` rebuilds it |
| View Usage History | `events.findByOrgIdAndConsultantIdAndPeriodKeyOrderByOccurredAtDesc` |
| Filters | feature type = `feature_definition.usage_type`; departments = `consultant_profile.department_group_id`; statuses = the derived chip |

## 6. Isolation and tests

- `BillingSchemaIT` (api/src/test/.../service/ent): migration applies and every org table has `org_id NOT NULL`, the FK to organization and `uk_<t>_org_id`; every FK to another org table is composite; the platform catalog has no `org_id` and no price column; no card-number-like column anywhere;
  a cross-tenant child row (invoice line, usage counter) and a second live license for one consultant are refused by the database; seeded counts (142 / 150, 118 / 18 / 4 / 2 / 9, 11 unlicensed, 12 features, 12 invoices, one overdue); sum of lines = invoice amount; payments = paid amount; subscription items = licenses + features + org add-ons;
  the six-month recurring series strictly rises; usage counters equal usage events for the current and previous month and the trend is up; second run adds nothing; Beta is ~30 % and never mixes with Acme; every billing repository method takes `orgId` first.
- `EntRepositoryContractTest` still scans `repository.ent` (now including `repository.ent.billing`). `OrgIsolationIT` only scans `repository.org`, so **add your route rows to `OrgIsolationIT.COVERAGE`** when you add `/api/orgs/{orgId}/...` routes.
- On this branch the doc 41 policy tests (`TenantKeyPolicyTest`, `LiquibaseAdditiveTest`, `CompositeTenantFkTest`) do not exist yet; the changelog follows their rules by construction (additive only, `org_id` first in every index, composite tenant FKs), and `BillingSchemaIT` checks the same facts against the live schema.

## 7. Known limitations / decisions

- **Scale deviates from the first numbers on the boards.** The boards mix figures (162 consultants, 214 active licenses, $200 vs $149 per consultant). The seed is built on the 153 seeded consultants, so licensed = 142 of 150 seats but **unlicensed = 11** (not 24); recurring spend is whatever the rows add up to (about $23k for Acme), not $28,400. Every number on the boards is computed from rows, so nothing needs forcing.
- **No public prices.** Platform `product` / `feature_definition` have no price column. Demo prices are `org_contract_price` rows for **both** demo orgs (the brief said Acme only; Beta needs a price to have licenses). A real org without a contract has no prices and cannot be licensed until admin publishes (doc 21/23). `product_price` (list prices) is not created here; add it with the Phase 5 catalog.
- **Licenses attach to `consultant_profile`, not `org_member`** (doc 20 uses membership): most consultants are not seats (`member_id` null in the seeded data). `consultant_license.member_id` is nullable and filled when the consultant is a seat.
- **Logins and storage are not stored** (the drawer's "Logins 48" and "Storage Used 2.4 GB"): no table records them in this foundation, so show them only when a data source exists, or add `consultant_activity_daily` additively. Feature Usage % in the drawer is computed from `usage_counter`.
- `usage_event` is simplified from doc 25 (committed quantities only, no reservations/idempotency keys/limit_key); `usage_counter` is the per-period sum. Events are kept for the current and previous month in the demo; older months are counters only (the retention story of doc 41 s5).
- `org_billing_account` has no `stripe_customer_id` / `stripe_subscription_id`, `license_quote` / `org_discount` / `volume_tier` / `org_module_license` do not exist yet; the mirrors are written by `LocalBillingApplier` (`source LOCAL`) until the Stripe phase. Only webhooks (or the local applier) may write the mirror tables in production code; the demo seeder is the only other writer.
- Invoice status is stored as PAID / OPEN (/ VOID / DRAFT); "Unpaid" and "Overdue" are derived from `due_date`. Because dates are relative to "now", an OPEN invoice seeded as "due in 12 days" will read Overdue if the database is kept for weeks.
- `consultant_profile.license_status` is rewritten by this seed (see section 3).
- No photos, no phone numbers, no card numbers, no DOB, no tax or bank identifiers anywhere; payment methods are brand, last4, expiry only.
- Counts of random-driven rows vary by a few between runs (see section 3).
