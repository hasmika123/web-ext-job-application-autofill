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

## Step 1b: quote → confirm (this PR)
**What changes for an Org Admin:** on the Licenses page, Give licence / Save add-ons became **Review** → a priced summary → **Confirm**. Nothing is billed
yet; the summary says so.

**Prices** (`OrgLicenseService.prices`):
- the organization's contract price;
- else the catalog's active ORG monthly price (`product_price`, which the user publishes, B5);
- else "Price not set" (never $0).

A licence records the price it was given at, as before.

**API** (all `licenses.manage`; the generic 404 otherwise):

| Method | Path | Answer |
|---|---|---|
| POST | `/api/orgs/{orgId}/licenses/quotes` | body `{consultantId, features}`: the add-ons the licence should carry afterwards (no licence yet → one is given). Answers the quote. It writes a `license_quote` row and no audit row. 422 `NO_CHANGE` |
| GET | `/licenses/quotes/{quoteId}` | the quote as priced; status OPEN, CONFIRMED or EXPIRED |
| POST | `/licenses/quotes/{quoteId}/confirm` | Idempotency-Key (optional). Re-prices the stored request: 410 `QUOTE_EXPIRED`, 409 `QUOTE_STALE` (the inputs hash differs), 409 `QUOTE_USED`. Then `LicenseChangeApplier.apply` (`LocalBillingApplier`) changes the licence. Audit `LICENSE_CHANGE` ("… (quote N)"). Answers the licence detail |
| DELETE | `/licenses/changes/{changeId}` | Keep an add-on whose removal is waiting for the period end (the Undo). 409 `NOT_PENDING` |

The quote itself:
- **lines:** `CREATE`, `ADD_FEATURE`, `REMOVE_FEATURE` or `KEEP_FEATURE`, each with its monthly price, what is due now, and when it takes effect;
- **totals:** monthly before and after, the delta, and what is due now (null amounts = price not set);
- `expiresAt`.

The direct `POST /licenses/{id}` and `PUT /licenses/{id}/features` stay. They now price and confirm in one step (`LicenseQuoteService.applyNow`), so every add-on change goes through a quote and the applier. Suspend, reactivate and end stay one-click and immediate.

**Billing period** (`org_billing_account.current_period_*`, which only the demo organizations have until step 2):
- **Additions** start now. The rest of the period is prorated with `PricingEngine.prorate` and shown as "due now".
- **Removals** wait for the end of the period (C9):
  - the add-on's `ends_at` becomes the period end, so it keeps working until then;
  - a PENDING `license_change` is written, which Keep cancels;
  - asking for the add-on again before then also keeps it (`KEEP_FEATURE`).
- **Without a billing period** (every real organization today), removals happen at once, as in B1.
- **Ending a licence** cancels its pending removals.

**Rows written:**
- `license_quote` (new table, additive changelog `20261128010000_ent_license_quote.xml`);
- `license_change.quote_id` (new column);
- one `subscription_change` line per change (ADDED, CHANGED or REMOVED, with the live licence count after it).

`enterprise.quote.ttl_minutes` (15) is now a live setting.

**Web:**
- `QuoteSummary` draws the quote 1:1 and never adds money.
- The Configure sheet reviews before it confirms, with a fresh Idempotency-Key per review.
- Removals that wait show as dashed "pending removal" chips, plus a "stops on {date}" row with **Keep {add-on}** in the sheet.
- The BFF gained the four routes and passes Idempotency-Key on.

**Not in 1b:**
- `org_subscription_item` quantities (no real organization has a subscription row until step 2);
- `LocalPeriodRolloverJob`, which writes an **Estimate** invoice each period and marks PENDING removals APPLIED once their date passes (the add-on already stops then, through `ends_at`): **moved to step 2**;
- `CostConfirmSheet` for commercial dependencies (no dependency rules exist yet);
- bulk quotes, tiers, promotions and presets.

## Step 2: start billing, the Stripe customer, the setup fee, the portal, the period rollover (this PR)
**User decision 2026-11-12: the platform admin starts billing** for an organization, from a **Billing** panel on its page in the Kiwiply admin.

**Starting** (`OrgBillingStartService`) creates the `org_billing_account`:
- billing email, USD, invoices sent each period and paid within 15 days;
- a first period from today to the end of the month;
- the setup fee:
  - **WAIVED** when the organization existed before this shipped (`organization.setup_fee_exempt`, set for every existing row by the changelog), or when the admin waives it with a reason;
  - otherwise **OWED** at the published ORG one-time price of `ORG_SETUP_FEE`. With no price published, it stays OWED at "price not set" (never $0).

**Stripe** is used only when the new setting **`enterprise.billing.stripe_enabled`** (default **off**) is on AND a Stripe key is configured:
- one customer (`createOrgCustomer`, `kiwiply_scope=org`, key `orgcust-{orgId}`), mirrored to `organization.stripe_customer_id`;
- an owed, priced fee becomes a **pending invoice item** (key `orgsetup-{orgId}`, status ADDED). It waits for the organization's first invoice, which step 3's subscription creates;
- Stripe calls run first, so a failure saves nothing (502 `BILLING_PROVIDER`) and a retry reuses the same objects;
- with the setting off, billing stays **local**: nothing is sent to Stripe and nothing is charged.

**API:**
- `GET /api/admin/orgs/{id}/billing` and `POST /api/admin/orgs/{id}/billing/start` (`ROLE_ADMIN`; body `{billingEmail, waiveSetupFee, reason}`; 409 `BILLING_STARTED`; admin audit `ORG_BILLING_START` + the organization's `ADMIN_BILLING_START`, HIGH);
- `POST /api/orgs/{orgId}/billing/portal` (`billing.manage`, module billing): a Stripe portal session for the organization's own customer, back to `/w/admin/billing`. 409 `BILLING_NOT_CONNECTED` until it has one; audit `BILLING_PORTAL`.

`billingConnected` now means the organization has its Stripe customer.

**Period rollover** (`OrgBillingPeriodJob`, daily at 00:40 UTC with a job lease; `OrgBillingPeriodService`). For every account whose period ended:
- finish the PENDING removals whose date came (APPLIED, add-on off);
- while billing is local, write an **Estimate** invoice (`ACME-E0001`, `source = LOCAL`, due in 15 days) from the monthly amounts on the licences live at the period's end. Nothing priced means no invoice (never $0);
- move the period on a calendar month at a time, catching up missed runs.

**Web:**
- the admin `OrgBillingPanel`: start form, or the account summary once started;
- the Billing & Invoices page opens the portal when connected, and shows where invoices go and the setup fee;
- BFF routes for both.

**Not in step 2:**
- `OrgBillingCustomerLookup` (step 3 routes webhooks with it);
- changing the billing email after starting;
- one-time Checkout for the fee (it goes on the first invoice instead, by decision).

## Step 3a: Kiwiply-built Stripe invoices, in advance (this PR)
**User decisions 2026-11-12.** These replace doc 26's subscription-items model for organizations.

**Kiwiply builds each invoice.** There is no Stripe subscription, no Stripe price per catalog item, no coupon and no 20-item limit. Kiwiply composes the invoice at the licences' exact prices (contract or catalog), and Stripe sends it and collects the payment.

**Billed in advance.** On the 1st, the invoice covers the month that starts.

**When a billing period P closes and N starts** (`OrgInvoiceComposer`, called by the period job for an account with a Stripe customer):
- **N in advance:**
  - every licence and add-on live when N starts, at the monthly amount recorded on it;
  - suspended licences are billed (C2: no credit); ended ones are not.
- **The rest of P:** what was live during P but not already billed for P in advance, prorated over the calendar month (`PricingEngine.prorate`). That means:
  - additions made during P;
  - the whole first, partial period from the day billing started.

  Removals and ends give no credit (no refunds).
- **The setup fee, once:**
  - the pending item made when billing started;
  - or, if the fee was unpriced then and has a published price now, an item made here;
  - its status becomes INVOICED, then PAID with the invoice.
- **Nothing priced and no fee:** no invoice (never $0).

**Stripe side:**
- each line is an invoice item;
- then `createOrgInvoice` creates one invoice with `send_invoice`, 15 days to pay and the pending items, finalizes it and sends it;
- the customer pays on Stripe's page by card or bank transfer;
- keys are `orginv-{orgId}-{N start}-{i}` and `orginv-{orgId}-{N start}`;
- **the job now runs hourly**, so a failed run is retried inside Stripe's 24-hour idempotency window;
- a month already invoiced is never sent twice.

Kiwiply writes the `org_invoice` mirror (`source = STRIPE`, Stripe's number, `stripe_invoice_id`, `hosted_url`) with its lines (BASE_LICENSE, FEATURE, PRORATION, SETUP_FEE).

**Webhooks** (`OrgInvoiceWebhookHandler`, the real `OrgBillingWebhookHandler`; `OrgBillingAccountCustomerLookup` routes events by customer):
- `invoice.paid`:
  - the mirror becomes PAID with the amount and the date;
  - the account is paid through the invoice's period, and is ACTIVE again when nothing else is overdue;
  - a setup fee on that invoice becomes PAID.
- `invoice.payment_failed` / `invoice.overdue`: the account becomes PAST_DUE.
- `invoice.voided` / `invoice.marked_uncollectible`: VOID / WRITTEN_OFF.
- A paid mirror never moves back.
- The event's customer must be the organization's own.
- Audit: `BILLING_INVOICE_PAID` / `BILLING_PAYMENT_LATE` (actor `stripe`).

**Overdue:**
- each run marks a Stripe-billed account PAST_DUE while an open invoice is past its due date, and ACTIVE once none is;
- **nothing is switched off.** What a PAST_DUE organization loses, and when, is a dunning decision still to be made: doc 27, and `OrgStateRules` would block most writes.

**Stripe off:** with `enterprise.billing.stripe_enabled` off, an organization that has a Stripe customer keeps its period open (no estimate, no invoice). It is invoiced on the first run after Stripe is back on, so no month passes unbilled.

**Web:** an open Stripe invoice has a **Pay** link (Stripe's hosted page) on Billing & Invoices; "Written off" is a status.

**Schema:** `20261130010000_ent_org_invoices.xml` adds `org_invoice.stripe_invoice_id` (unique) and `hosted_url`. Local organizations keep step 2's estimates, in arrears.

## Step 3b (next PR)
- The reconciler: nightly, compare each Stripe-billed organization's invoices with Stripe (`retrieveInvoice`), and every closed period with its invoice → `billing_drift`, with an admin badge. It never fixes money by itself.
- A test-clock runbook (`docs/enterprise-v2/runbooks/stripe-test-clock-C.md`) with real test-mode ids.
- Dunning (what PAST_DUE switches off, and when): needs the user's decision first.
- Before anything is charged:
  - prices published (B5);
  - `enterprise.billing.stripe_enabled` switched on.

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
- **Step 1b built (2026-11-11).**
  - API:
    - `LicenseQuoteService` (quote, get, confirm, applyNow) with the `LicenseChangeApplier` seam and `LocalBillingApplier`;
    - `OrgLicenseService`: catalog prices, removals at period end, `keepFeature`, quote ids, subscription history;
    - `license_quote`.
  - Tests:
    - `LicenseQuoteIT` (setup without billing, stale, expired, used, period-end removal with Keep, tenant wall);
    - four `OrgIsolationIT` rows; the settings pins.
  - Web: `QuoteSummary`, the review → confirm sheet, Keep, the BFF routes, and tests.
- **Step 2 built (2026-11-12).**
  - API:
    - `OrgBillingStartService` (status, start), `OrgBillingPortalService`, `OrgBillingPeriodService` + `OrgBillingPeriodJob`;
    - `StripeGateway.createOrgCustomer`;
    - the changelog `20261129010000_ent_org_billing_start.xml` (account Stripe and setup-fee columns, `organization.setup_fee_exempt` set for existing rows);
    - `enterprise.billing.stripe_enabled` (off).
  - Tests: `OrgBillingStartServiceTest`, `OrgBillingStartIT` (admin start, portal refusal, rollover estimate + removal), one `OrgIsolationIT` row.
  - Web: `OrgBillingPanel` on the admin organization page, and the portal and account rows on Billing & Invoices, with tests.
- **Step 3a built (2026-11-12).**
  - API:
    - `OrgInvoiceComposer`, `OrgInvoiceWebhookHandler`, `OrgBillingAccountCustomerLookup`;
    - `StripeGateway.createOrgInvoice`; invoice events read their own metadata;
    - the period job is hourly, with the overdue sweep.
  - Tests:
    - `OrgInvoiceComposerTest` (first partial month, additions after an advance month, ended licences, nothing priced, keys, setup fee once, no double send);
    - `OrgInvoiceWebhookHandlerTest`;
    - `OrgInvoicesIT` (start with Stripe, a closed month invoiced in advance and mirrored, paid, overdue; Stripe off keeps the period open).
  - Web: the Pay link and the Written off status.
- **Next: step 3b** (reconciler, test-clock runbook; dunning after a decision).
