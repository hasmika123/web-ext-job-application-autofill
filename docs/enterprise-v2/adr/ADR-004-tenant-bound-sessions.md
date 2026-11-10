# ADR-004 — Custom-domain authentication: host-only sessions and tenant-bound tokens (tid claim)

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §4
- **Reversibility:** see Consequences

## Context
Cookies kiwiply_access/kiwiply_refresh are host-only, httpOnly, SameSite=Lax; tokens are stateless JWTs with refresh rotation families; Google sign-in has one registered origin.

## Decision
- Logging in on a tenant host mints access and refresh tokens carrying tid=<orgId> (and hid=<hostnameId>). Logging in on a platform host mints tokens without tid (today's behaviour).
- A token with tid may call user-scoped routes (/api/account, /api/profile, notifications) and org routes only for {orgId} == tid; any other org id → 404. A token without tid may call /api/orgs/{id} on membership alone (the kiwiply.com org chooser keeps working).
- Refresh on a tenant host keeps tid; the refresh family is per login as today. Sign-out revokes the family.
- No cookie domain is ever set; no session is shared across hosts. Cross-host SSO (SAML/OIDC, central auth host) is Phase 12.
- Login-first: unauthenticated visits to any tenant path render the branded login (ADR-007); the user must be an ACTIVE member of that tenant to proceed, otherwise a branded "not a member" screen with no data.
- Google sign-in on a tenant host is available only after the origin is registered (manual, per domain) and the org enables it; default is password + email verification (+ MFA when it exists for users).

## Consequences
A person administering two orgs on two hosts signs in twice; acceptable and explicit. The extension token (/api/extension/session) stays user-only (ADR-023 note; Phase 9 workspace header).

## Security note
tid binding prevents token replay across tenants even if a token leaks; it is defence in depth over membership checks.
