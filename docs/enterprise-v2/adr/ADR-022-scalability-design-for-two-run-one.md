# ADR-022 — Scalability: design for two instances, run one

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §22
- **Reversibility:** see Consequences

## Context
One web and one API container, in-memory rate limiters, no ShedLock, 512 MB JVM, MySQL FULLTEXT search.

## Decision
- Caches (tenant resolution, branding, membership permissions) are TTL-based (≤ 60 s) and version-bumped; no cache is required for correctness.
- All org-scoped indexes lead with org_id; large tables (usage_event, org_audit_event, pipeline events) get (org_id, created_at) indexes and retention jobs from settings.
- S3 keys for org assets are org/{orgId}/…; signed URLs only; no prefix listing from user input.
- MDC carries tenant and membership ids into every log line; rate-limit keys include the tenant.
- Before a second instance: ShedLock on @Scheduled jobs, rate limits moved to MySQL or Redis (Phase 12). No search engine: FULLTEXT queries always carry org_id.

## Consequences
No new infrastructure in Phases 1–11.

## Security note
Per-tenant rate limits bound abuse blast radius.
