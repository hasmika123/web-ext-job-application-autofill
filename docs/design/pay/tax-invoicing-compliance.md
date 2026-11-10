# Tax, invoices & receipts, legal compliance for billing (B6.*)

> Area `pay`. Status: design, 2026-10-11. Locked: Stripe Checkout + Portal; "no refunds, cancel anytime"
> stated plainly; consumer law overrides the ToS where it applies (ROADMAP 12.6 note). The trust area (`T`)
> owns the lawyer list and legal versions (A9.6); this doc says what billing needs from them and what the
> code must do regardless.

## 1. Tax strategy — the decision the launch checklist must record (B6.1)

Today: `StripeProperties.managedPayments=null` (leave the account's setting), `automaticTax=false`, product
`tax_code` to be set by hand (ROADMAP 12.0: `txcd_10103000` SaaS-personal). Nobody has written down which
state the **live** account (created 2026-10-06, DEPLOY.md §11.4) is actually in.

| Option | What Stripe does | Cost | Margin at Launch-1 prices | Ops burden |
|---|---|---|---|---|
| **A. Managed Payments (MoR)** — user decision 2026-09-21 | Stripe is merchant of record: registers, collects and remits VAT/GST/sales tax worldwide, owns fraud/disputes, handles refund law | **+3.5 %** per transaction | **every plan fails the 80 % floor** (fee doc §3.2) | lowest; also gated on Stripe's eligibility review (39 seller countries) |
| **B. Stripe Tax Basic** | calculates tax at checkout where *we* are registered; we register and remit | 0.5 % where registered | passes at Launch-2 prices, ~79 % at Launch-1 (fee doc §3.3) | we file; at launch that is 0–2 US states (nexus thresholds ~$100k/state) and nothing abroad until EU OSS thresholds (€10k) are near |
| **C. Nothing at launch** | we charge the list price, no tax line | 0 | as recorded in ROADMAP | legally fine while under every nexus threshold; must be revisited quarterly (B10.3 metric `revenue.by_country`) |

**Recommendation for the user (open question 1):** C at Launch 1 with a quarterly nexus review, B switched
on per jurisdiction as thresholds approach, A reconsidered only if the floor is redefined or the price
rises. The code supports all three already (`wantsAutomaticTax`, `managed_payments[enabled]` extra param);
B6.1 adds: the `tax_code` on every catalog product (`product.tax_code`, published with the Stripe Product),
a `billing.tax.mode = NONE|STRIPE_TAX|MANAGED` runtime setting (A5.1) that the gateway reads instead of the
two booleans, and a startup log line stating the mode so the 15.4 checklist can assert it.

## 2. Invoices & receipts in-app (B6.2)

- `GET /api/billing/invoices` from the mirror (lifecycle doc §4.2); Settings › Plan › "Invoices" list:
  date, amount, status, [PDF]. PDF = Stripe `invoice_pdf` URL (signed, expiring; we fetch a fresh URL on
  tap via `gateway.retrieveInvoice` if the stored one is > 24 h old). No PDFs stored by us.
- **Business details for people who expense Pro** (common: "my employer reimburses job-search tools"):
  the Stripe Portal's "billing information" (name, address, tax ID) is enabled; our page links to it with
  `flow: invoices`. Stripe re-renders past invoices with the updated customer details — nothing to build.
- Receipt email is ours (B3.5), with the hosted invoice link; Stripe's receipt emails are off.
- `billing_email` on the customer (Stripe `customer.email`) follows the account email; U1.6 email change
  calls `gateway.updateCustomerEmail`.

## 3. Legal requirements the billing code satisfies by construction (B6.3)

| Requirement | Source (checked 2026-10-11) | Where it is met |
|---|---|---|
| Clear and conspicuous auto-renewal terms **before** the charge; express affirmative consent | California ARL (B&P §17600 ff., amended effective 2025-07-01: <https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025>) | the `today` + `renews` + `noRefund` lines on every charging CTA (checkout doc §11); Stripe `consent_collection` (B3.1); `billing_consent` records kept 3 years (B3.2) |
| Cancellation through the same channel as sign-up, as easy as sign-up | California ARL; FTC's federal click-to-cancel rule was **vacated 2025-07-08** by the Eighth Circuit (<https://www.lw.com/en/insights/eighth-circuit-vacates-ftc-click-to-cancel-rule>) but state laws (CA, NY, others) still apply and the FTC Act's unfairness standard remains | in-app one-tap cancel (B5.1) + portal; no phone-only path; no retention gate |
| Renewal reminders for longer terms; annual reminder with amount, frequency and cancel instructions | California ARL amendments | 7-day reminder before each quarterly renewal (B4.2); there is no annual plan |
| Price-change notice before a higher renewal | ARL "material change" notice; general unfair-practice law | B4.2 30-day notice; grandfathering by default (catalog D2) |
| EU/UK: 14-day withdrawal right for digital services unless the consumer asks for immediate performance *and* acknowledges losing the right; no pre-ticked boxes | Directive 2011/83/EU art. 16(m) & guidance; pending CJEU C-234/25 on subscriptions-as-services (<https://www.williamfry.com/knowledge/world-consumer-rights-day-part-2-reshaping-online-subscription-rights-the-sky-austria-case/>) | the unticked "Start now, I lose the 14-day right" checkbox on Checkout for EU/UK (B3.1); the acknowledgement repeated in the receipt email (durable medium); **lawyer to confirm** — if the service classification wins, a 14-day pro-rata refund may be owed to EU consumers who withdraw, which `no refunds` cannot override. B6.3 ships a `gateway.refund(invoice, amountCents)` path used **only** by support for statutory cases, HIGH-audited (`BILLING_STATUTORY_REFUND`). |
| EU "withdrawal button" for online contracts (reported effective 2026-06-19) | secondary source only (<https://www.webtoffee.com/blog/right-of-withdrawal/>) — **verify with the lawyer** | if confirmed: a "Withdraw from contract" button on Settings › Plan for 14 days after a first purchase by an EU user (calls the statutory-refund path) |
| Chargebacks are not waived by a ToS line | card-network rules | dispute mirror (lifecycle §5), support playbook in A2.3; Stripe Smart Disputes optional |
| Keep records of the terms a consumer accepted | ARL; general evidence | `terms_version` on `billing_consent` from A9.6's legal-versions table |

What the lawyer must review (feeds the trust area's list): the `today/renews/noRefund` copy, the EU
checkbox wording, the ToS Billing section (exists since 12.6) updated for Autopilot, plan switching,
student/regional prices and the statutory-refund sentence; the privacy policy's Stripe paragraph (exists).

## 4. Financial records & deletion (B6.4)

- `invoice`, `billing_consent`, `stripe_event` (amount, currency, detail) are **financial records**: on
  account deletion they are pseudonymised (user FK retained as a bare number, `jhi_user` row gone — the
  existing `stripeEventRepository.forget` already drops the customer link; B6.4 changes it to keep amounts)
  and purged by A9.5's retention job after the trust area's retention period (default 7 years; open to the
  lawyer). The DSAR export (`AccountExportResource`) gains `billing: {invoices[], consents[], plan}`.
- Stripe keeps the authoritative ledger regardless; deletion in Stripe is a separate, manual, documented
  support action (A2.3) and is never automatic.

## 5. Failure modes

| failure | behaviour |
|---|---|
| Tax mode set to STRIPE_TAX but Stripe Tax not configured on the account | checkout 502 today; B6.1's startup check calls `gateway.taxSettingsStatus()` and logs ERROR + sets a health indicator (A10.0) so the 15.4 checklist catches it before a customer does |
| Managed Payments silently on for a new live account | the startup line prints the account's `managed_payments` capability state; the 15.4 checklist asserts it matches `billing.tax.mode` |
| A user in the EU withdraws on day 10 and asks for money back | support path: statutory refund (pro-rata by days) via the audited gateway call; the subscription is cancelled immediately in that one case (the user chose to withdraw); the admin note records the legal basis |
| Chargeback on a 3-month plan after 2 months of use | Stripe dispute; evidence pack = `billing_consent` + usage summary from the ledger (we show the dates AI was used); no entitlement change until the dispute resolves; if lost, `charge.dispute.closed` → support decides on the grant |

## 6. Tests

`TaxModeTest` (three modes → correct session params; MANAGED never sends `automatic_tax=false`),
`BillingStartupCheckTest`, `InvoiceResourceIT` (list, fresh PDF URL after 24 h), `StatutoryRefundIT`
(HIGH re-auth, audit row, invoice mirror updated, subscription cancelled now), `AccountExportIT` (billing
section present), `AccountDeletionIT` (invoices pseudonymised, not deleted).

## 7. Wireframe — Settings › Plan › Invoices, 390 px

```
┌──────────────────────────────┐
│ ‹ Invoices                   │
│ Jan 11 2027  $49.99  Paid  ⤓ │
│ Oct 11 2026  $49.99  Paid  ⤓ │
│ Jul 11 2026  $19.99  Paid  ⤓ │
│──────────────────────────────│
│ Need a company name or VAT   │
│ ID on your invoices?         │
│ [ Edit billing details ]     │  → portal (flow: invoices)
└──────────────────────────────┘
```
