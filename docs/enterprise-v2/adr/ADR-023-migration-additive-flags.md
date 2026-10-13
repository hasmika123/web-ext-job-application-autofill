# ADR-023 — Migration strategy: additive Liquibase, backfill changesets, dual-write for the role column, per-phase feature flags

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §23
- **Reversibility:** see Consequences

## Context
All existing migrations are additive; the settings registry provides typed flags; OrgIsolationIT is the CI gate.

## Decision
- Only additive changesets (createTable, addColumn with default, createIndex, addForeignKey). No renames, no drops, no data moves. Backfills are separate changesets with preconditions and are idempotent.
- Feature flags in SettingDefinitions: flag.enterprise (master, off), flag.enterprise.domains, flag.enterprise.roles, flag.enterprise.billing, flag.enterprise.marketing, flag.enterprise.hr_finance, flag.enterprise.extension_workspaces; all JSON flags {on, pct, allow, deny} with allow lists of org ids. OrgsEnabledFilter stays the first wall; enterprise filters add the second.
- org_member.role is dual-written (primary role) until Phase 4 ends; a later changeset may relax NOT NULL but never drops the column in this programme.
- Each phase ships behind its flag with its ITs and an entry in OrgIsolationIT's coverage registry; the flag turns on per org (allow list) first.
- Rollback = flag off; data stays. No step requires downtime.

## Consequences
Liquibase ids follow 202610xxxxxxxx_ent_<topic>.xml.

## Security note
Flags fail closed (existing OrgFeatureFlag pattern).
