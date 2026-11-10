# ADR-020 — Billing-provider limitations: contract overrides as Stripe discounts, 20-item cap fallback, test clocks

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §20
- **Reversibility:** see Consequences

## Context
Stripe: ≤ 20 items per subscription, immutable prices, coupons at customer/subscription level, upcoming-invoice previews, test clocks; no tax-ID collection (locked); automatic tax optional.

## Decision
- Contract overrides and volume tiers are represented in Stripe as a subscription-level discount (coupon amount or percent computed by PricingEngine), never as per-org Stripe prices; items therefore equal the number of distinct list prices in use.
- If an org would exceed 20 items, enterprise.billing.mode switches that org to COMPUTED_INVOICE (ADR-017) with a platform-admin alert; the UI is unchanged.
- Proration previews use Stripe upcoming-invoice preview when billing is enabled, else the PricingEngine estimate labelled "estimate".
- QA runbook uses Stripe test clocks; CI runs with billing disabled.

## Consequences
Escalation E9 asks the user to accept the discount representation (it shows on the invoice as a discount line rather than a reduced unit price).

## Security note
Coupons are created through StripeGateway only, audited.
