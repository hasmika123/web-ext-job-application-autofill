# ADR-019 — Mid-cycle license changes: add/upgrade now with proration; remove/downgrade at period end; backend quotes with expiry

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §19
- **Reversibility:** see Consequences

## Context
Locked: no refunds, cancel anytime keeps paid time; requirements §19 preview with authoritative backend totals and stale-price protection.

## Decision
- license_quote (org_id, created_by, inputs_hash, catalog_version, lines_json, totals (current_recurring, proposed_recurring, delta, proration_estimate, next_invoice_estimate, tax_estimate), effective_at, expires_at = now+15 min, status OPEN|APPLIED|EXPIRED). Applying requires the quote id and a matching inputs_hash and catalog_version, otherwise 409 QUOTE_STALE.
- license_change (org_id, license_id, quote_id, kind ADD|REMOVE|UPGRADE|DOWNGRADE|SUSPEND|CANCEL|REACTIVATE, effective_at, status PENDING|APPLIED|CANCELLED, applied_by, applied_at). Adds/upgrades apply immediately (Stripe proration_behavior=create_prorations); removes/downgrades are PENDING until current_period_end (proration none, no credit).
- Pending changes are visible and cancellable until effective; a consultant keeps the feature until the effective date.
- The frontend displays quote fields only; it never computes money.

## Consequences
Bulk changes produce one quote with many lines.

## Security note
Applying a quote requires licenses.manage and writes a HIGH-risk audit row with the quote id.
