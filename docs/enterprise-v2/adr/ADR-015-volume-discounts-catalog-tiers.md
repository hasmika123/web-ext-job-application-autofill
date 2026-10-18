# ADR-015 — Volume discounts live in the catalog as tiers and ship empty

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §15
- **Reversibility:** see Consequences

## Context
CLAUDE.md: volume discounts come later as catalog prices, not code.

## Decision
- volume_tier (product_id NULL = all org products, min_licensed_consultants, pct_off, active, effective_from/until). The highest matching tier applies once per billing period to the count of consultants with an ACTIVE base license on the period start.
- No tiers are seeded; the admin creates them. The margin guard evaluates the worst tier.

## Consequences
Pricing previews show the tier name when one applies.

## Security note
catalog.manage only.
