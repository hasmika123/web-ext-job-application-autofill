# ADR-003 — Hostname resolution: the BFF forwards the raw host, the API resolves, clients never name a tenant

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §3
- **Reversibility:** see Consequences

## Context
The browser talks to the Next BFF; the BFF forwards only authorization/content-type/if-match to Spring; the extension calls the API directly. Requirements §5: never trust frontend-supplied tenant identifiers.

## Decision
- web/src/proxy.ts reads the request host (x-forwarded-host from the edge, else host) and the BFF forwards it unchanged as X-Kiwiply-Host on every API call (serverApiFetch).
- The API TenantResolver maps host → TenantContext: exact org_hostname match (status ACTIVE) → else {slug}.kiwiply.com with organization.subdomain_enabled and status ACTIVE/PAST_DUE → else reserved platform hosts (kiwiply.com, www, app, api, localhost, *.localhost) → PLATFORM → else UNKNOWN.
- A tenant id is never read from a header, cookie, body or query for authorization. The host only selects a tenant candidate; membership and permissions are still required (OrgAccessService). Spoofing X-Kiwiply-Host therefore grants nothing.
- UNKNOWN hosts: the API answers 404 for every tenant-scoped route and GET /api/public/tenant; the web renders a tenant-404 page (no branding, no redirect, no links to the public site).
- Resolution is cached in-process for 60 s keyed by host, invalidated by a tenant-config version counter bumped on every org_hostname/branding write.
- Public endpoint GET /api/public/tenant returns only what an anonymous visitor may see: org display name, branding, login options, status. Never member counts, never settings.

## Consequences
Logs, audit rows and rate-limit keys gain the tenant id (MDC). Playwright needs host emulation (Host header or extraHTTPHeaders) against the mock.

## Security note
Negative tests: forged header with a non-member → 404; header naming tenant A with a token bound to tenant B → 404; unknown host → 404 and no cookie set.
