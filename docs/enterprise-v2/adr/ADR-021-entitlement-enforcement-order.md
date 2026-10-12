# ADR-021 — Central entitlement enforcement: one server-side check with a fixed evaluation order and actor/beneficiary recording

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §21
- **Reversibility:** see Consequences

## Context
Requirements §8 and §20 list the evaluation order; today gates are scattered isPro calls.

## Decision
- EntitlementService.check(EntitlementRequest{context, actorLogin, beneficiaryLogin, featureKey, quantity, idempotencyKey}) → EntitlementDecision{allowed, reasonCode, allowance, remaining, reservationId}.
- Order: 1 tenant resolved and matches token tid (if any) → 2 actor is an ACTIVE member → 3 org status allows the operation (ACTIVE; PAST_DUE read-only grace; SUSPENDED/CLOSED refuse) → 4 actor permission → 5 resource scope → 6 module enabled for org (org-level entitlement/flag) → 7 beneficiary license ACTIVE and feature present and effective → 8 allowance remaining (reservation) → 9 actor may act for beneficiary (assignment) → 10 consent (data_share FULL names actor, or per-feature consent) → 11 subscription state (no pending suspension).
- @RequiresFeature(key, beneficiary = PATH_MEMBER|SELF) on handlers; services call check() for non-HTTP entry points (schedulers, AI router).
- Reason codes: TENANT_UNKNOWN, NOT_MEMBER, ORG_INACTIVE, PERMISSION_DENIED (all three surface as 404 on org routes), MODULE_OFF, FEATURE_NOT_LICENSED (402), FEATURE_ALLOWANCE_EXHAUSTED (402), NOT_ASSIGNED, CONSENT_REQUIRED (403 with a consent link for the beneficiary), SUBSCRIPTION_STATE.
- The decision and (actor, beneficiary, org, feature) are written to usage_event on reservation (ADR-016) and to ai_call for AI tasks.

## Consequences
Hiding menus is presentation only; every protected operation runs check().

## Security note
A reflection test asserts that every handler under /api/orgs/** that names a feature carries @RequiresFeature or an explicit check() call (coverage registry like OrgIsolationIT).
