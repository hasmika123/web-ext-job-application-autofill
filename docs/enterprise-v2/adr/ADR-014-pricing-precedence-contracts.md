# ADR-014 — Price precedence: list → contract override → one discount → volume tier → effective; no double discounts

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §14
- **Reversibility:** see Consequences

## Context
Requirements §17 propose list → contract → discount → effective and ask for precise precedence and accurate money types.

## Decision
- org_contract (org_id, status DRAFT|ACTIVE|ENDED, currency, starts_at, ends_at, billing_interval, notes, stackable BOOLEAN default false, volume_applies BOOLEAN default false, created_by) and org_contract_price (contract_id, product_id, override_amount_minor NULL, override_pct_off NULL, min_quantity). Exactly one of amount/pct per row.
- PricingEngine.effective(product, orgContext, quantity, at) = list price (effective at `at`) → if a contract row applies, it REPLACES the list (amount) or reduces it (pct) → then at most ONE promotional discount (the best eligible) applies only if no contract row applied or contract.stackable → then the volume tier applies only if no contract row applied or contract.volume_applies → rounded half-even to minor units.
- All money is long minor units + ISO currency; no floating point anywhere in pricing; a golden-table unit test pins the precedence.
- Org Admins see effective prices and the contract name; they cannot edit any price. Platform admins edit contracts with contracts.manage and a reason.

## Consequences
Stripe representation is topic 20/ADR-020 (coupons for overrides).

## Security note
Contract changes are HIGH-risk audit rows; a contract never changes a price already invoiced.
