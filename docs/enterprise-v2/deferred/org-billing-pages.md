# Org billing pages — Subscription Overview, Consultant Licenses, Billing & Invoices, Feature Usage — build-ready delta

> Status: design, 2026-10-17 (Fable, branch `ent-deferred-design`). Stories `OBL-01…OBL-09` in `stories.md`.
> Checked against `docs/subscriptions/` (merged 2026-10-17, `fa437e74`): the subscription module built the **personal** side
> (catalog, plans, resolver, add-ons, Stripe, retirement, admin plan builder incl. K4.6 org plan editor). Its enterprise stories
> **K6.1–K6.6, K9.5, K10.7 are Not Started and wait on X5.4/X6.12**; they own the plan-version layer, seat TRANSFER, interval /
> version quotes and the seat matrix. **This design does not touch any of that.** It builds the four org pages that are
> placeholders today (`ADMIN_NOT_BUILT`: subscription, licenses, billing, usage) as **reads over the built mirror tables**
> (`billing-data-foundation.md`, `20261020010000_ent_billing_data.xml`) plus the **local** licence-change path (seat add /
> feature add-remove / suspend / cancel) that the catalog-driven quote flow of docs 20–28 specifies, with Stripe application
> left to X6.6/X6.7 (`LicenseChangeApplier` Stripe mode). Doc 28 is the UX spec and stays authoritative for layouts.

## 0. What is a placeholder, what exists

| Page | Today | Data that exists |
|---|---|---|
| `/w/admin/subscription` | ComingSoon | `org_billing_account`, `org_subscription`, `org_subscription_item`, `org_plan_feature`, `subscription_change`, `org_contract(_price)` — seeded, no reader |
| `/w/admin/licenses` (+ `/w/finance/subscriptions` read-only) | ComingSoon | `consultant_license`, `license_feature`, `license_change`, `feature_definition`, `product`; read by `PlanResolver` and `InboxEntitlement` only |
| `/w/admin/billing` (+ `/w/finance/billing`, `/w/finance/invoices`) | ComingSoon | `org_invoice(_line)`, `org_payment`, `org_payment_method`, `org_billing_adjustment`; `StripeGateway.listInvoices/retrieveInvoice/createCheckoutSession` exist; `OrgBillingWebhookHandler` is a NOOP seam; **no org billing controller** |
| `/w/admin/usage` | ComingSoon | `usage_event`, `usage_counter`, `usage_alert`, `feature_credit`; KPI formulas in the foundation doc |
| Dashboard widget `subscription.summary` | built (status + setup fee) | — |

## 1. Decisions taken now (DD-13…DD-15 in `08-decisions-for-user.md`)

| # | Decision |
|---|---|
| DD-13 | **Reads first, on the mirror.** The four pages read the foundation tables through one `OrgBillingReadService`; Stripe is never called on a page read (26: only webhooks write mirrors; with a blank key the pages still work on LOCAL rows). |
| DD-14 | **Licence changes go through one `OrgLicenseChangeService` with a quote → confirm flow (20 §7 / 28 §7–§9) and a `LocalBillingApplier`** that writes `license_change APPLIED` + `consultant_license`/`license_feature` + `subscription_change` + `org_subscription_item.quantity` with `source = LOCAL`. The Stripe applier (X6.6/X6.7) later replaces `LocalBillingApplier` behind the same `LicenseChangeApplier` interface; `billing_mode` and `source` columns already exist. Prices come from `org_contract_price` (the org's locked prices) and, when absent, from the catalog `product_price` (K1.3) — the engine never adds two prices in the web. **Seat TRANSFER, interval and plan-version changes are K6 and are not built here** (the UI shows them as "soon"). |
| DD-15 | **Invoices list = `org_invoice` mirror; the Stripe customer portal link is the only Stripe call** (`billing.manage`, `StripeGateway.createPortalSession` exists for personal; org variant = X6.12's customer; until `org_billing_account.stripe_customer_id` is set the button reads "Billing isn't connected yet" and the page says so — `billingEnabled=false`, 28 §8). E17 (monthly only for orgs) stays the default until K9.5 lands; the DTO already carries `billingInterval`. |

## 2. API (`/api/orgs/{orgId}/billing`, `OrgBillingResource` + `/licenses`, `OrgLicenseResource` + `/usage`, `OrgUsageResource`; module `billing`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/billing/overview` | `billing.view` | 28 §1: consultants / licensed / unlicensed / monthly recurring (sum of live `license_feature` + base amounts, or `org_subscription_item` lines), next invoice estimate (`org_billing_account.next_invoice_on`, recurring + pending prorations), pending changes (`license_change PENDING`), usage top 5, contract summary, status (`org_billing_account.status`, PAST_DUE banner data), `billingEnabled` |
| GET | `/billing` | `billing.view` | 28 §4 Account tab: status, currency, interval, payment method display (`org_payment_method`: brand, last4, exp), contacts, `portalAvailable` |
| POST | `/billing/portal` | `billing.manage` | Stripe portal session when `stripe_customer_id` set, else 409 `BILLING_NOT_CONNECTED` |
| GET | `/billing/invoices?status&page` · `/invoices/{id}` | `billing.view` | mirror rows + lines + payments; `downloadUrl` only when Stripe `hosted_invoice_url` is mirrored (column `org_invoice.hosted_url`, additive) |
| GET | `/billing/payments?page` · `/billing/adjustments` | `billing.view` | |
| GET/PUT | `/billing/contacts` | `billing.view` / `billing.manage` | `org_billing_contact(id, org_id, member_id NULL, email, role BILLING\|TECHNICAL, created_at)` (additive table `20261124060000_ent_org_billing_pages.xml`); e-mail scanned; max 5 |
| GET | `/licenses?q&status&marketer&feature&page&sort` | `licenses.view` | 28 §2 rows: consultant, marketer, features chips (live + pending-removal + pending-add), status, $/mo (`MoneyText` minor), next change |
| GET | `/licenses/{licenseId}` · `/licenses/{licenseId}/history` | `licenses.view` | detail + `license_change` history |
| GET | `/licenses/catalog` | `licenses.view` | sellable base + features with the org's prices (contract override else catalog), dependencies (`feature_dependency`, K1.2), allowances |
| POST | `/licenses/quotes` | `licenses.manage` | `{lines:[{op: CREATE\|ADD_FEATURE\|REMOVE_FEATURE\|UPGRADE_BASE\|SUSPEND\|REACTIVATE\|CANCEL, consultantId, featureKey?, productId?}], confirmedCommercialDeps?[]}` → `LicenseQuoteDTO` (22 §8 fields: lines with unit/qty/proration, totals, `effectiveAt` per line — adds now, removals at period end; `expiresAt` = +`enterprise.quote.ttl_minutes` (15); `inputsHash`); 422 `DEPENDENCY_REQUIRED` / `DEPENDENCY_UNCONFIRMED` / `FEATURE_INELIGIBLE` / `DEPENDENCY_BLOCKS_REMOVAL`, 409 `CURRENCY_MISMATCH`, bulk cap `enterprise.license.bulk_max_lines` (500) |
| GET | `/licenses/quotes/{id}` | `licenses.manage` | |
| POST | `/licenses/quotes/{id}/confirm` | `licenses.manage` + `Idempotency-Key` | re-hash inputs (409 `QUOTE_STALE`), 410 `QUOTE_EXPIRED`; `LocalBillingApplier.apply(quote)` in one tx; returns the applied/pending changes; audit `LICENSE_CHANGE` (MEDIUM; HIGH for CANCEL/SUSPEND) + `subscription_change` summary rows |
| DELETE | `/licenses/changes/{changeId}` | `licenses.manage` | undo a PENDING scheduled removal (28 §1 "Undo") |
| POST | `/licenses/{id}/{suspend\|reactivate\|cancel}` | `licenses.manage` | shortcuts that build a one-line quote and confirm it (same path, same audit) |
| GET | `/usage?by=consultant\|feature\|team&period=` · `/usage/history?months=6` · `/usage/events?consultant&feature&page` · `/usage/alerts` | `usage.view` | 28 §5; team view suppresses groups < 3 (`org.usage.k_min`, 3) |
| POST | `/usage/credits` | `licenses.manage` | `{consultantId, featureKey, quantity, reason}` → `feature_credit` + counter allowance bump; audit `FEATURE_CREDIT` |
| POST | `/usage/alerts/{id}/ack` | `usage.view` | |
| GET | `/api/orgs/{orgId}/members/{memberId}/entitlements` | `licenses.view` or self | the consultant's own "My Features" page already reads `PlanResolver`; this exposes the same `EntitlementSet` to admins |

Quote/apply table: `license_quote(id, org_id, kind SINGLE|BULK, status OPEN|CONFIRMED|EXPIRED|STALE, lines_json, totals_json, inputs_hash CHAR(64), currency, created_by_member_id, created_at, expires_at, confirmed_at, idempotency_key)` (additive, same changelog). `LicenseChangeApplier` interface: `Applied apply(LicenseQuote quote, OrgMembership actor)`; `LocalBillingApplier` is the only implementation here and is selected when `org_billing_account.source = LOCAL` or Stripe is disabled; a Stripe implementation (X6.7) is wired by bean condition later.
Period rollover for LOCAL orgs: `LocalPeriodRolloverJob` (daily): applies PENDING removals whose `effective_at` ≤ now, advances `current_period_*`, writes a `org_invoice` RECURRING mirror row with lines from the live items (so the Invoices page has history even without Stripe), status OPEN (no money moves; it is a **record** of what would be billed — labelled "Estimate" in the UI when `source = LOCAL`).

## 3. UI (28 §1–§5 and §7–§9 verbatim for layouts)

`web/src/components/ent/billing/` (`SubscriptionOverviewPage`, `LicensesPage` with `readOnly` prop for `/w/finance/subscriptions`, `ConfigureLicenseSheet`, `BillingPage` with tabs Account · Invoices · Contract · Contacts (`InvoicesPage` is the Invoices tab mounted standalone at `/w/finance/invoices`), `UsagePage`, `QuoteSummary`, `CostConfirmSheet`), `web/src/lib/ent/billing.ts` (hooks `useOrgSubscription`, `useLicenses`, `useLicense`, `useOrgCatalog`, `useQuote`, `useConfirmQuote`, `useOrgBilling`, `useUsage` — plain fetch + `useState`, the house pattern, no SWR), `billing-bff.ts` + `api/orgs/[orgId]/{billing,licenses,usage}/[[...path]]/route.ts`, mock `scripts/mock-org-billing.mjs` (acme fixtures A/B/C/D from 22 §9). Primitives: `MoneyText`, `PriceDelta`, `FeatureChip`, `AllowanceMeter`, `StatePill` + `BILLING_STATE_MAP` (all exist in `@kiwiply/ui/enterprise`), `AnimatedNumber`, `HBarList` equivalent via `MiniBars`. Money is formatted from `*Minor` only; **money changes are never autosaved** — every licence change is quote → `QuoteSummary` → confirm (`CostConfirmSheet` for COMMERCIAL dependencies). Undo exists only for scheduled removals (DELETE change) and reads "Keep {feature} for {name}". Route folders `w/[workspace]/{subscription,licenses,billing,usage}/page.tsx` (admin gates `billing.view` / `licenses.view` / `usage.view`, module `billing`; finance workspace renders the read-only variants).
Empty / off states (28 §8): billing module off → the nav hides the pages (module gate); `billingEnabled=false` → grey `SETUP` pill and "Licenses can be configured — nothing is billed yet" (LOCAL mode); no licences → encourage pose "No consultant licenses yet. Pick a consultant to start — you'll see the exact price before anything is billed."

## 4. Settings
`enterprise.quote.ttl_minutes` (15) · `enterprise.license.bulk_max_lines` (500) · `org.usage.k_min` (3) · `enterprise.billing.default_currency` (USD, C4) · `org.billing.contacts_max` (5). Existing `flag.enterprise.billing` moves from the deferred list to live (default off).

## 5. Tests
`OrgBillingReadServiceTest` (overview formulas = `billing-data-foundation.md` §5 against the seed), `LicenseQuoteServiceTest` (every op, effective dates now vs period end, dependency rules, contract price over catalog price, hash/stale/expired, bulk cap), `LocalBillingApplierTest` (rows written, `subscription_change` summaries, undo of a PENDING removal, idempotent confirm), `LocalPeriodRolloverJobTest`, `OrgBillingResourceIT` / `OrgLicenseResourceIT` / `OrgUsageResourceIT` (A/B tenants; Felix (Finance) reads, cannot confirm; Sarah confirms; Beta licence id 404), `BillingSchemaIT` unchanged, `OrgIsolationIT` rows, `DataMapIT` rows (`license_quote`, `org_billing_contact`), `NoSensitiveText` coverage on contacts, vitest `SubscriptionOverviewPage`, `LicensesPage`, `ConfigureLicenseSheet` (quote preview renders `LicenseQuoteDTO` 1:1, never computes), `BillingPage`, `UsagePage`, `billing.test.ts`; Playwright `ent-billing.spec.ts` (28 §11) over the mock; QA `qa/stories/billing.md`.
