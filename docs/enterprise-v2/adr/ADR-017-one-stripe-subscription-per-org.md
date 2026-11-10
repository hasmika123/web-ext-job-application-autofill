# ADR-017 — Organization billing: one Stripe customer and one subscription per org; identical charges aggregate as item quantities

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §17
- **Reversibility:** see Consequences

## Context
docs/design/org/billing.md decisions 2–5 (one customer per org, monthly send_invoice, add prorates, remove at period end). StripeGateway lacks items/quantities/invoices today.

## Decision
- org_billing_account (org_id, stripe_customer_id, billing_email, billing_contacts_json, collection_method, tax_status, status) replaces the loose columns on organization over time (the columns stay and are mirrored).
- One Stripe subscription per org; one subscription item per distinct effective list price; quantity = number of licenses/features on that price. The per-consultant configuration exists only in Kiwiply (consultant_license, license_feature).
- Mirrors written only by webhooks: org_subscription, org_subscription_item, org_invoice, org_invoice_line. Nightly OrgSeatReconciler compares Kiwiply quantities with Stripe and alerts on drift; it never auto-fixes money.
- Fallback mode (flag enterprise.billing.mode = SUBSCRIPTION_ITEMS | COMPUTED_INVOICE): in COMPUTED_INVOICE Kiwiply creates invoice items on the org customer each period from the license ledger; used when an org exceeds Stripe's subscription-item limit.
- StripeGateway grows: createOrgCustomer, createOrgSubscription, setItemQuantity(proration), previewUpcomingInvoice, listInvoices, createCoupon/applyDiscount, createInvoiceItem, refund (admin only, audited). All disabled when the key is blank (dev/CI).

## Consequences
Setup fee flow (O4.1/O4.2) is unchanged and precedes any license.

## Security note
Webhook signature verification and stripe_event idempotency as today.
