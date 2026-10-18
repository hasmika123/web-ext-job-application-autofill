# ADR-016 — Usage metering: per-consultant allowances by default, optional org pools, an idempotent reservation ledger

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §16
- **Reversibility:** see Consequences

## Context
AI cost is already metered per login (ai_call); nothing meters feature usage per org/consultant; nothing is unlimited (locked).

## Decision
- usage_event (org_id, member_id beneficiary, actor_member_id, feature_key, quantity, unit, status RESERVED|COMMITTED|RELEASED, idempotency_key UNIQUE, period_key, reference_type/id, created_at, committed_at). Reservation before async work; commit on success; release on failure or timeout (sweeper job).
- Allowance per feature per period comes from the license_feature → feature_definition default or a contract override; pool_mode PER_CONSULTANT (default) or ORG_POOL per feature definition.
- Exceeding the allowance is refused with 402 FEATURE_ALLOWANCE_EXHAUSTED unless an overage price exists for that feature (Phase 6+, metered); overage is then recorded as a usage_event with status COMMITTED and flag overage=true and billed from the ledger.
- AI cost budgets (AiBudgetService) remain a second, independent guard; ai_call gains org_id, beneficiary_login, feature_key, usage_event_id.

## Consequences
The Feature Usage page reads the ledger by consultant/feature/team. Retries with the same idempotency key never double-consume.

## Security note
Actor and beneficiary are both recorded (requirements §20).
