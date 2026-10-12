# ADR-013 — Feature catalog versioning: immutable effective-dated price rows and a monotonic catalog version

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §13
- **Reversibility:** see Consequences

## Context
Phase 18 design (docs/design/admin/catalog-margin-entitlements.md) defines product/product_price/product_entitlement with immutable price rows and Stripe publication; nothing is built yet.

## Decision
- Adopt the Phase 18 tables as the enterprise catalog (do not fork). product_price gains effective_from, effective_until, catalog_version; prices are never updated, only retired and replaced.
- catalog_version is a single monotonic counter bumped on every publish; licenses, quotes and contracts record the price ids (and thus the version) they were made under.
- Invoices (org_invoice_line mirror) snapshot amount, description and price id at issue time.
- Retiring a price never changes existing licenses; a retired price can still be billed until the license changes.

## Consequences
The admin catalog page (A3.4/A3.7) is the editor; enterprise adds feature-definition, dependency and preset editors next to it.

## Security note
Publish requires catalog.manage and passes the margin guard; overrides below the floor need a typed reason and are HIGH-risk audit rows.
