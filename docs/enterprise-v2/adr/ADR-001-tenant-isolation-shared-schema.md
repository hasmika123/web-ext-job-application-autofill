# ADR-001 — Tenant isolation: shared schema, org_id discriminator, explicit tenant context

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §1
- **Reversibility:** see Consequences

## Context
One MySQL, one API, one web container (01 §3). Existing org tables already carry org_id and OrgIsolationIT sweeps every repository method cross-tenant. Member-owned data (resume, application, inbox) is deliberately not org-keyed; the org sees it through data_share consent.

## Decision
- Every org-owned table carries org_id (NOT NULL, leading column of its indexes). Member-owned tables never gain org_id; org reads of member data go through consent and link tables (org_resume, org_assignment).
- A request-scoped TenantContext {kind: PLATFORM|TENANT|UNKNOWN, orgId, hostnameId, host} is populated by TenantResolver (ADR-003) and is the only way service code learns the active tenant.
- Every org-scoped repository method takes orgId as its first parameter; TenantRepositoryContractTest (reflection) fails the build otherwise. No findById on org-scoped repositories.
- Cross-tenant misses answer generic 404 (OrgNotFoundException), as today.
- No Hibernate @Filter/@TenantId auto-filtering: hidden rows mask bugs; explicit parameters fail loudly.
- Schema-per-tenant and database-per-tenant are rejected for this deployment (512 MB JVM, one Liquibase, member data spans tenants).

## Consequences
Discipline is enforced by tests, not by the database. Background jobs must receive orgId explicitly (no thread-inherited context). Reversal: a later move to schema-per-tenant is possible for org-owned tables only, because the discriminator is already present.

## Security note
The gate is OrgIsolationIT + TenantRepositoryContractTest in CI. Any org route without @OrgPermissionRequired/@OrgUnscoped is refused at runtime (existing interceptor).
