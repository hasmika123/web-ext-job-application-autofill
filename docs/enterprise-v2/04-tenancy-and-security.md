# 04 — Tenancy and security: resolution, context, isolation per layer, negative tests, threat model

> Status: design, 2026-10-12. Implements ADR-001 (isolation), ADR-002 (TLS), ADR-003 (resolution),
> ADR-004 (sessions), ADR-021 (entitlement order), ADR-022 (scale). Build-ready for Phase 1 stories
> X1.2–X1.5, X1.9, X1.10.

## 1. Vocabulary
- **Tenant** — an `organization` reachable through at least one hostname. "Platform" is the
  non-tenant context (kiwiply.com, the personal product, the platform admin).
- **Host** — the request's hostname, lower-cased, punycoded, port stripped.
- **TenantContext** — the per-request record `{kind: PLATFORM | TENANT | UNKNOWN, orgId?, hostnameId?, host, resolvedAt}`.
- **Membership** — the caller's live `org_member` row in the tenant org, with effective roles/permissions (`OrgMembership`).
- **Workspace** — PERSONAL or ORG(orgId); the entitlement context (ADR-018).

## 2. Tenant resolution from the hostname

### 2.1 Where it happens
1. **Edge (Caddy)** terminates TLS for any host whose certificate it was allowed to mint (ADR-002) and proxies to `dossier-web:3000` with `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`.
2. **Web `proxy.ts`** (Next middleware) computes `host = x-forwarded-host ?? host`, normalises it, and stores it on the request (`x-kiwiply-host` internal header). It does *not* decide the tenant; it only carries the host.
3. **Web server components** call `getTenant()` (per-request `cache()`), which calls `GET /api/public/tenant` with `X-Kiwiply-Host`. Result: `PublicTenantDTO` or 404 → `UNKNOWN`.
4. **Every BFF → API call** (`serverApiFetch`) forwards `X-Kiwiply-Host`. The **API `TenantResolver`** (a `OncePerRequestFilter` before security) resolves the host independently and stores `TenantContext` in a request-scoped holder and the MDC. The API is authoritative; the web result is for rendering only.

### 2.2 Resolution algorithm (API, `TenantResolver.resolve(host)`)
```
if host is null/blank/invalid        → UNKNOWN
if host ∈ reservedPlatformHosts      → PLATFORM          (kiwiply.com, www., app., api., localhost, *.localhost, 127.0.0.1, dev hosts from settings enterprise.hosts.platform)
row = org_hostname where hostname=host and status=ACTIVE
if row                               → TENANT(row.org_id, row.id) if org.status ∈ {ACTIVE, PAST_DUE} else UNKNOWN(reason ORG_INACTIVE)
if host matches {label}.kiwiply.com  → org by subdomain=label where subdomain_enabled and org.status ∈ {ACTIVE, PAST_DUE} → TENANT(org, subdomainRow) else UNKNOWN
otherwise                            → UNKNOWN
```
- Reserved labels for subdomains (`www, app, api, mail, admin, edge, static, cdn, status, help, docs, dev, staging, demo, join, connect`) are rejected at provisioning (`OrgSlugs.isReserved` is extended).
- SUSPENDED/REMOVED hostnames resolve to UNKNOWN (never to the org); PENDING/VERIFYING likewise.
- A suspended org (`SUSPENDED`, `CLOSED`) resolves to UNKNOWN with a *distinct internal reason* so the tenant-404 page can show "this workspace is unavailable" without naming the org.
- Cache: Caffeine, key host, TTL 60 s, invalidated by `organization.config_version` (any hostname/branding/status write bumps it and evicts).

### 2.3 What the resolver never does
- Never reads a tenant id from a header, cookie, query or body.
- Never falls back to "the first org", "the user's last org" or the platform when the host is unknown.
- Never returns branding for a non-ACTIVE hostname.

### 2.4 Public tenant DTO (`GET /api/public/tenant`, permitAll, rate-limited per host+IP)
```
{ orgId? (omitted), displayName, branding: {logoUrl, faviconUrl, bannerUrl, primary, secondary, accent, theme, welcomeTitle, welcomeMessage, terminology},
  login: {password: true, google: bool, mfaRequired: bool}, status: ACTIVE|PAST_DUE }
```
No ids, no counts, no settings. Signed, short-lived asset URLs. `Cache-Control: public, max-age=60`.

## 3. Request tenant context in the API

```java
public record TenantContext(Kind kind, Long orgId, Long hostnameId, String host) {
  public enum Kind { PLATFORM, TENANT, UNKNOWN }
  public boolean isTenant() { … }
}
// holder: request attribute + ThreadLocal set/cleared by TenantResolverFilter; never inherited by async threads.
```
- `OrgPermissionInterceptor` (existing) gains a step: if `TenantContext.kind == TENANT`, the path `{orgId}` **must equal** `context.orgId`, else `OrgNotFoundException` (404). If kind is `UNKNOWN`, every `/api/orgs/**`, `/api/me/orgs/**`, `/api/join/**` and `/api/public/tenant` request → 404. If `PLATFORM`, today's membership-only behaviour applies (path-based console on kiwiply.com).
- **Token binding (ADR-004):** `JwtDecoder` validation adds: if the JWT has `tid` and the resolved context is `TENANT`, `tid == context.orgId` or 401; if the JWT has `tid` and the context is `PLATFORM`, the token is accepted only for user-scoped routes (not `/api/orgs/{other}`); if the JWT has no `tid` and the context is `TENANT`, the request is treated as unauthenticated on tenant routes (forces a tenant login) — except `/api/account` for the login-first hand-off.
- **Async/background:** services pass `orgId` explicitly; a `TenantScoped.run(orgId, () -> …)` helper sets the holder for the scope of a job and clears it in `finally`. `@Async` methods take `orgId` as a parameter. Schedulers iterate orgs.
- **MDC:** `tenant=<orgId|platform|unknown>`, `host`, `member=<memberId>` on every log line; `CRLFLogConverter` already sanitises.

## 4. Isolation strategy per layer (requirements §5 list)

| Layer | Rule | Mechanism | Test |
|---|---|---|---|
| **HTTP routes** | Every org route is `@OrgPermissionRequired`/`@OrgUnscoped`; tenant routes require context = TENANT and path org = context org | `OrgPermissionInterceptor`, `OrgsEnabledFilter`, `EnterpriseEnabledFilter` (flag per org) | `OrgIsolationIT` (route discovery), `OrgHandlerGuardIT` |
| **Database queries** | `orgId` first parameter on every org-scoped repository method; no `findById` | `TenantRepositoryContractTest` (reflection over `repository.org.*` and `repository.ent.*`) | contract test + cross-tenant sweep |
| **File storage** | Org assets under `org/{orgId}/…`; keys resolved from DB rows the caller may read; signed URLs; no listing | `OrgStorageKeys` helper; `StorageService` refuses keys outside the caller's tenant prefix for org routes | IT: logo of org A requested via org B → 404 |
| **Resume documents** | Org reads via `org_resume` link + consent; `ResumeAccessService.access()` ORG_MANAGED branch; PDF/thumbnail share the check | existing `Via.ORG` + new branch | `ResumeAccessOrgIT` |
| **Applications / interviews** | Org sees only linked (`pipeline_application_link`) rows at the consent scope; never raw `application` queries by org | projection service with `ShareField` | `OrgIsolationIT` share tests (exist) + link tests |
| **Placements / pipeline** | All tables org-keyed | repositories | contract test |
| **Subscription records / billing** | `org_billing_account`/mirrors org-keyed; personal `subscription` never joined to org | separate services; `PersonalSubscriptionUnchangedIT` | billing ITs |
| **Notifications** | `notification.user_id` only; org-originated notifications carry `org_id` in payload for display, never for authorization | `NotificationService.publish(orgId?, …)` | unit |
| **AI requests** | `EntitlementService.check` before `AiRouter`; `ai_call.org_id/beneficiary` | ADR-021 | `AiEntitlementIT` |
| **Search indexes** | MySQL FULLTEXT only; every org query carries `org_id`; global `job_posting` is not tenant data (public postings) | repository | contract test |
| **Background jobs** | explicit `orgId`; no inherited context; per-org loops | `TenantScoped` | unit |
| **Logs / audit** | MDC tenant; `org_audit_event.org_id`; platform-admin reads of tenant data write an audit row **in the tenant's log** | `OrgAuditService` | `OrgIsolationIT` "every mutation one audit row" |
| **Integration credentials** | per user (`inbox_connection`) or per org (`org_integration`, Phase 12) encrypted with `SecretBox`; never cross-readable | service | IT |
| **Settings** | `org_setting` per org; allow-listed keys only | `OrgSettingsService` | unit |
| **Rate limits** | keys `tenant:host:ip` for public tenant endpoints; per-org caps for invites/joins (branch B settings) | `JoinRateLimiter` pattern | IT |

## 5. Negative tests (CI gate; F scenario)

`OrgIsolationIT` is extended (not replaced). New classes under `web/rest/ent/`:

1. **HostUnknownIT** — `Host: nobody.example` → `GET /api/public/tenant` 404; `GET /api/orgs/{acme}` with acme-member token 404; no `Set-Cookie`; web renders tenant-404 with no branding, no links.
2. **HostMismatchIT** — token with `tid=acme` + host `beta.kiwiply.com` → 401 on login-required routes, 404 on org routes; token with `tid=acme` + path `/api/orgs/{beta}` on acme host → 404.
3. **ForgedHostHeaderIT** — non-member sends `X-Kiwiply-Host: acme.kiwiply.com` directly to the API → `/api/public/tenant` 200 (public branding only) but `/api/orgs/{acme}/…` 404; member of beta forging acme host → 404.
4. **SuspendedHostnameIT** — ACTIVE → SUSPENDED hostname → immediate UNKNOWN (cache evicted); REMOVED → never resolves again; subdomain of a SUSPENDED org → UNKNOWN.
5. **AskEndpointIT** — `/api/internal/tenant-hosts/check?domain=` returns 200 only for ACTIVE rows and ACTIVE-org subdomains; 404 for PENDING/VERIFIED/SUSPENDED/REMOVED/unknown; 401 without `X-Internal-Token`.
6. **TenantRepositoryContractTest** — reflection: every method on every repository in `repository.org`/`repository.ent` takes `Long orgId` first (allow-list for `findMine(userId)`-style methods).
7. **CrossTenantSweepIT** — for every org-scoped route in the coverage registry: acme owner on beta ids → 404; beta owner on acme ids → 404; platform admin → 404 on `/api/orgs/**` (as today).
8. **PersonalSubscriptionUnchangedIT** — join → license → leave → `subscription` row byte-identical; `GET /api/profile/version.plan` unchanged in PERSONAL.
9. **NoSubmitSurfaceTest** — reflection: no handler under `/api/orgs/**` has `submit` semantics (name or annotation) that transmits to a third party (kept from marketer design).
10. **Playwright `tenant-isolation.spec.ts`** (mock): acme and beta hosts render different branding; acme admin visiting beta host sees the branded login, signs in, gets "not a member"; unknown host → tenant-404; `/admin` on a tenant host → 404.

## 6. Initial threat model (STRIDE-lite, Phase 1–3 scope)

| # | Threat | Vector | Control | Residual / escalation |
|---|---|---|---|---|
| T1 | Cross-tenant data read | wrong `orgId` in path/body; forged host | path-org = context-org; membership required; repository contract; 404 | contract tests are the gate |
| T2 | Token replay across tenants | leaked `kiwiply_access` from acme used on beta | `tid` binding; host-only cookies; refresh families | — |
| T3 | Certificate minting abuse | attacker points DNS to our box to make the edge mint certs for junk names | `ask` endpoint 200 only for ACTIVE rows; LE rate-limit monitor; subdomain provisioning throttle | E5 (edge owned by BeeCompete) |
| T4 | Domain takeover | customer adds a domain they don't control | DNS TXT ownership proof (token) **and** CNAME target check before VERIFIED; re-check every 24 h; SUSPEND on failure after grace | — |
| T5 | Phishing via branded login | attacker org with a look-alike brand on `{label}.kiwiply.com` | reserved labels; platform-admin approval for subdomains of orgs younger than N days (setting); Kiwiply mark on every tenant login ("Powered by Kiwiply"); report link | E10 (approval policy) |
| T6 | Invite hijack | invite token accepted by the wrong account | `org.invite.require_email_match=true` default for enterprise; single-use hashed tokens; expiry | E7 |
| T7 | Privilege escalation via role editing | admin grants a custom role more than they hold | ceiling rule; OWNER immutable; last-admin guard; HIGH audit | E4 |
| T8 | Marketer acting beyond consent | act_for without FULL pairing | ADR-021 step 10; `data_share` immediate revoke; `MarketerScopeTest` | — |
| T9 | Platform-admin overreach | reading tenant data without a reason | break-glass with typed reason, MFA re-auth, audit row visible to the tenant | E8 |
| T10 | Money tampering | client-computed totals | backend quotes with hash + expiry; webhook-only mirrors; reconciler | — |
| T11 | PII ingestion | HR/finance/client notes with SSN etc. | `SensitivePatterns` on every text column and upload; refuse on hit | E2 |
| T12 | Host header injection into links/mail | tenant URLs built from untrusted host | `TenantUrls` builds only from `org_hostname` primary rows, never from the request host | — |
| T13 | Enumeration of tenants | probing `{label}.kiwiply.com` | public DTO only for ACTIVE; identical 404 timing for PENDING/unknown; rate limit per IP | — |
| T14 | Public operational endpoints | `/management/prometheus`, `/api/internal/**` through the edge | edge path filtering (outside repo) + internal token | E12 (independent of V2) |
| T15 | Denial of wallet | AI/usage abuse by a licensed consultant | allowances + AI cost budgets + per-tenant rate limits | — |

## 7. Headers and transport (tenant hosts)
- Web sets per response: `Content-Security-Policy` (self + `data:` + signed asset host), `X-Frame-Options: DENY` (branded login must not be framed), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`. **No HSTS `includeSubDomains`/`preload`** until ADR-002's edge is live for every subdomain (audit finding).
- Cookies: unchanged attributes; `__Host-` prefix evaluated in Phase 3 (requires `Secure` + no `Domain` + `Path=/`, all already true).
- Robots: tenant hosts serve `noindex` on everything except nothing (login-first; no public pages).
