# ADR-012 — Consultant licenses: mandatory base license plus individually selected feature add-ons; presets are shortcuts

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §12
- **Reversibility:** see Consequences

## Context
Locked: org = setup fee + per-person items priced above individual; ≥ 80 % worst-case margin; nothing unlimited; prices from the admin catalog. Requirements §14–16 ask for base + features, presets, dependencies with cost confirmation.

## Decision
- Catalog products gain kinds BASE_LICENSE and FEATURE (sold_to ORG). A consultant_license (org_id, member_id, status, base_price_id, starts_at, ends_at, cancel_at_period_end) must reference exactly one BASE_LICENSE price; license_feature rows (license_id, feature_product_id, price_id, starts_at, ends_at) add features.
- feature_definition is separate from pricing: feature_key, name, category, usage_unit, default allowance, pool_mode, eligibility_json, active. feature_dependency (feature_key, requires_feature_key, kind TECHNICAL|COMMERCIAL|INTEGRATION|CONSENT). Enabling a feature with a COMMERCIAL dependency shows the full cost delta and requires explicit confirmation; nothing is added silently.
- license_preset (key, name, feature_keys_json, active, sort) is admin-defined; applying a preset is a UI shortcut producing the same license_feature rows.
- The existing org seat rows (Pro seat, Autopilot seat, AI Interview, Marketer seat) become presets or features in the catalog; their prices remain admin inputs that must satisfy the margin guard and the "above individual" rule (a guard check compares preset total to the individual plan it mirrors).
- Non-consultant seats (admin, HR, finance, marketing, account manager) consume no consultant license; commercially restricted admin modules are org-level entitlements (product kind ORG_MODULE), off by default.

## Consequences
Prior-art stories O3.1/O3.2 (per-item assignment) are superseded by the license model; E2E-C becomes the acceptance scenario.

## Security note
Only licenses.manage may change a license; every change is a license_change row (ADR-019).
