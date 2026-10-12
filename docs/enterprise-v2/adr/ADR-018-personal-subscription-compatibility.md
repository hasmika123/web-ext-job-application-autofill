# ADR-018 — Personal subscriptions untouched; entitlements are evaluated per workspace and never combined

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §18
- **Reversibility:** see Consequences

## Context
subscription mirror + EntitlementService.isPro(login) drive personal Pro; eight callers. Requirements §22 and CLAUDE.md: never cancel, never auto-combine.

## Decision
- EntitlementContext {workspace PERSONAL | ORG(orgId), login, beneficiaryLogin}. Personal path: unchanged isPro/plan/requirePro. Org path: licenses and features.
- Joining, leaving, licensing or unlicensing a person never reads or writes the subscription table.
- No stacking: in the ORG workspace only org-funded entitlements apply; in PERSONAL only the personal plan. The prior-art story O3.3 (highest-limit stacking) is superseded.
- GET /api/profile/version keeps {version, plan} for the personal workspace and adds workspaces[] (Phase 9) so the extension can show "Pro via Acme" only inside that workspace.
- Regression gate: BillingResourceIT, BillingWebhookIT, EntitlementServiceTest plus a new PersonalSubscriptionUnchangedIT (join org → license → leave → personal plan identical).

## Consequences
A user may hold a personal Pro and an org license simultaneously; the UI explains which applies where (ORG_COVERS_YOUR_PLAN notice from O3.5 is kept as copy only).

## Security note
Billing ownership stays separate: personal Stripe customer vs org Stripe customer.
