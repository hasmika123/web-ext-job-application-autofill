# Organization billing (B3 + B4): build plan

> 2026-11-11. Gap list items **B3** (Subscription Overview, Billing & Invoices, Feature Usage pages) and **B4** (Stripe per organization), from
> `BUILD-OUT-GAPS.md`. Design: `28-billing-pages-ux.md` (layouts), `deferred/org-billing-pages.md` (build-ready delta, OBL-01…09),
> `26-billing-provider-integration.md` (Stripe), `27-subscription-lifecycle.md` (states, dunning). Where this plan and those docs differ, the
> user decisions below win.

## User decisions (2026-11-11)
- **Order: pages first, then Stripe.** Each step is its own PR:
  1. **Step 1a**: the pages read the real tables; nothing is charged.
  2. **Step 1b**: licence changes go quote → confirm, still without money (`LocalBillingApplier`).
  3. **Step 2**: one Stripe customer per organization plus the setup fee.
  4. **Step 3**: Stripe charges for licences, org webhooks, failed payments and the reconciler.
- **Payment: invoices, paid within 15 days** (`collection_method = SEND_INVOICE`, `days_until_due = 15`), by card or bank transfer from the
  Stripe-hosted invoice. This is what doc 26 specifies.
- **Setup fee: the organization is usable at once.** The one-time fee is a line on its **first invoice**. There's no `PENDING_SETUP_FEE` gate for
  new organizations, unlike doc 26 / X6.12. Organizations that already exist are never charged a setup fee.
- **C1–C10: the safe defaults** in `08-decisions-for-user.md`:
  - no refunds: credits only, flag off, two people;
  - a suspended licence gets no credit;
  - Stripe Tax off until the user registers for tax;
  - USD only;
  - a preset is the sum of its features;
  - minimum licence counts are informational;
  - invited people are billed from confirm;
  - no prices are seeded: the user publishes them;
  - removals take effect at period end;
  - additions are prorated by Kiwiply as invoice items.

## Step 1a: the pages, read-only (this PR)
**Where the numbers come from, for a real organization** (not only the demo seed, which fills every billing table):
- **Consultants, licensed and unlicensed:** the consultant profiles and `consultant_license`, the same rows the Licenses page reads (B1).
- **Monthly recurring:** the sum over live licences of the base and add-on amounts recorded on them (the contract price when the licence was
  given). When the organization has no prices, it says "Price not set" and shows no $0.
- **Billing account, invoices, payments, payment method (brand and last 4 only) and contract:**
  - read from `org_billing_account`, `org_invoice(_line)`, `org_payment`, `org_payment_method` and `org_contract`;
  - when there is no billing account, which is every real organization until step 2, the page says "Billing is being set up for {org}:
    licences can be given, nothing is billed yet" (grey `SETUP` pill);
  - rows with `source = LOCAL` are labelled **Estimate** (no money moved).
- **Usage, this month and the 5 before it, real counts per licensed consultant:**
  - AI budget used, as a **percent** and never dollars (`AiBudgetService.usage`);
  - job-match views (`cws_match_view`), interview-prep sessions (`cws_prep_session`) and applications tracked (`talent_application`), the
    same sources as the consultant's My Features page.
  - Where the demo seed filled `usage_counter`, those rows are shown as well.
  - There's no By team tab in 1a; when one comes, teams under 3 people stay hidden (`org.usage.k_min` = 3).
- **The Stripe portal button:** "Billing isn't connected yet" (disabled) until step 2.

**API** (module `billing`, which is `flag.enterprise.billing`, moved from the deferred list to live with default **off**; the platform admin switches
it on per organization):

| Method | Path | Permission | Answer |
|---|---|---|---|
| GET | `/api/orgs/{orgId}/billing/overview` | `billing.view` | tiles; recurring; next invoice (when a billing account exists); licences ending; usage top 5; contract; status + overdue invoices; `billingConnected` |
| GET | `/api/orgs/{orgId}/billing` | `billing.view` | account (status, currency, collection method, cycle, period, next invoice, paid through); payment method; contract; `billingConnected`; `taxNote` |
| GET | `/api/orgs/{orgId}/billing/invoices?status&page` | `billing.view` | invoice rows (number, kind, period, issue and due dates, status, amount, paid, `estimate`) |
| GET | `/api/orgs/{orgId}/billing/invoices/{id}` | `billing.view` | the invoice + its lines + its payments |
| GET | `/api/orgs/{orgId}/usage?period=YYYY-MM` | `usage.view` | by consultant (meters) and by feature (totals) |
| GET | `/api/orgs/{orgId}/usage/history?months=6` | `usage.view` | per month per feature |

**Web:**
- `w/[workspace]/subscription`, `w/[workspace]/billing` (Account · Invoices · Contract tabs) and `w/[workspace]/usage` (By consultant ·
  By feature · History).
- `lib/ent/billing.ts`, the BFF routes, and money formatted from `*Minor` with `Intl.NumberFormat` (the web never adds two prices).
- Menu: Org Admin gets **Subscription**, **Billing & Invoices** (the existing "Plan & Billing" item) and **Feature Usage**, all behind the `billing`
  module.

**Not in 1a:**
- licence changes through quotes (1b; the Licenses page keeps its B1 direct changes);
- billing contacts;
- the Finance workspace copies;
- the portal;
- anything Stripe.

## Step 1b: quote → confirm (next PR)
- `license_quote` (additive) and `POST /licenses/quotes` + `/quotes/{id}/confirm` (Idempotency-Key, 15-minute expiry, inputs hash).
- `LicenseChangeApplier` with `LocalBillingApplier` writes the licence rows plus `subscription_change` + `org_subscription_item` (source LOCAL).
- Removals take effect at period end, with Undo.
- `QuoteSummary` and `CostConfirmSheet` on the Licenses page.
- `LocalPeriodRolloverJob` writes an **Estimate** invoice each period.

## Step 2 and step 3 (later PRs)
- **Step 2:**
  - `createOrgCustomer` (`kiwiply_scope=org`, `org_id`), filling `org_billing_account.stripe_customer_id`;
  - the setup fee as a pending invoice item that lands on the first invoice;
  - the portal;
  - `OrgBillingCustomerLookup`.
- **Step 3:**
  - the Stripe `LicenseChangeApplier`: a send-invoice subscription, one item per price, prorations as invoice items, and removals with `proration_behavior=none`;
  - `OrgBillingWebhookHandler`: invoice, payment, failed payment → PAST_DUE, and the `paid_through` lapse;
  - `OrgSeatReconciler` → `billing_drift`;
  - test-clock ITs.
- Prices must be published by the user (B5) before anything is charged.

## Status
- **Step 1a built (2026-11-11).**
  - API:
    - `OrgBillingReadService` (overview, account, invoices, invoice) and `OrgUsageReadService` (month, history) on `OrgBillingResource`;
    - `OrgLicenseService.rowsFor` (the licence rows behind `billing.view`);
    - `flag.enterprise.billing` is live (default off).
  - Tests: `OrgBillingReadServiceTest`, `OrgUsageReadServiceTest`, `OrgBillingResourceIT`, six `OrgIsolationIT` rows, and the menu pins.
  - Web:
    - `SubscriptionOverviewPage`, `BillingPage` and `UsagePage` under `components/ent/billing`;
    - `lib/ent/billing.ts` and `billing-bff.ts` with their routes;
    - the menu items Subscription, Billing & Invoices and Feature Usage (no "Soon" row is left);
    - tests for the pages, the helpers and the BFF.
  - Not done: mock-API fixtures for these routes (the licence routes have none either), so on `dev:demo` the pages show their error state.
- **Next: step 1b** (quote → confirm).
