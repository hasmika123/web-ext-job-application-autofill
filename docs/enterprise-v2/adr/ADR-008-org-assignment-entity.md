# ADR-008 — Consultant–marketer assignments as an auditable entity

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §8
- **Reversibility:** see Consequences

## Context
org_member.support_owner_member_id is a single field; data_share.full_to_member_id names the consented marketer. Requirements §10 need primary/backup/manager, effective dates, history, delegation and workload balancing.

## Decision
- New table org_assignment (org_id, consultant_member_id, assignee_member_id, kind PRIMARY|BACKUP|MANAGER|DELEGATE, starts_at, ends_at, reason, created_by_member_id, created_at). At most one open PRIMARY per consultant (generated active key). Reassignment ends the old row and opens a new one; nothing is deleted.
- Consent stays with the consultant: FULL pairing (data_share.full_to_member_id) must name the assignee for resume/answer access; BACKUP/MANAGER/DELEGATE see SUMMARY unless the consultant extends consent to them. Reassignment prompts the consultant to re-point FULL (never silently moved).
- support_owner_member_id remains for the STAFF support-owner flow in schools/bootcamps and is not written for consultancy assignments.
- Workload = count of open assignments per assignee; the cap comes from the assignee's license/entitlement (consultants.max from the catalog, default 10) and settings.

## Consequences
Pipeline objects reference the assignment id at creation for attribution; history survives reassignment.

## Security note
Only assignments.manage (ORG or TEAM scope) may create/end; every change audited ASSIGNMENT_CREATE/END (constants exist).
