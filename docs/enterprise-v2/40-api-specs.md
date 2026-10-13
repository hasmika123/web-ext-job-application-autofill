# 40 — API specifications: route families, conventions, error model, endpoint catalogue per bounded context

> Status: design (Session E, task 3), 2026-10-12. Normative for every Enterprise V2 story's **APIs** section;
> where a domain doc already lists endpoints (10–17, 20–38) this doc is the *index and the conventions*, the
> domain doc keeps the semantics. Wording of `09-consistency-decisions.md` is assumed applied. Existing prior art:
> `web/rest/errors/*` (`ErrorConstants.DEFAULT_TYPE`, `OrgProblemException`, `ProRequiredException`),
> `OrgPermissionRequired/OrgUnscoped`, `OrgIsolationIT` registry, `FixedWindowRateLimiter`, `InternalSecurityConfiguration`.
> Marks: `⚑ needs design review` = judgment call or risk area for the stronger-model review.

## 1. Route families

| Family | Prefix | Auth | Tenant context | Isolation gate |
|---|---|---|---|---|
| Public | `/api/public/**`, `/api/join/**` (preview), `/api/config/public` | none (permitAll) | any; tenant DTO needs TENANT | rate limit per host+IP |
| Internal | `/api/internal/**` | `X-Internal-Token` (own filter chain, no JWT) | n/a | network (`web_edge`/compose) + token + **X1.13** public-Host refusal |
| Session / account | `/api/authenticate*`, `/api/auth/*`, `/api/refresh`, `/api/logout`, `/api/account/**`, `/api/me/tenant`, `/api/me/orgs` | JWT (tid/hid rules, 12 §2) | any | user-scoped only |
| Person (unchanged) | `/api/profile/**`, `/api/resumes/**`, `/api/billing/*`, `/api/ai/**`… | JWT | PLATFORM (or workspace header, §2.3) | `PersonalSubscriptionUnchangedIT` |
| Consultant-in-org | `/api/me/orgs/{orgId}/**` | JWT, caller is an ACTIVE member (self rows only) | TENANT: `orgId` = tenant | **registry** (§10; extended from `/api/orgs/**` to this prefix) |
| Org | `/api/orgs/{orgId}/**` | JWT + membership + permission key + scope | TENANT: `orgId` = tenant; PLATFORM: legacy console behaviour | **registry** |
| Platform admin | `/api/admin/**` | `ROLE_ADMIN` + admin MFA session | PLATFORM only; on a TENANT host → 404 | `AdminHostGuardIT` (new, X1.13) |
| Webhook | `POST /api/billing/webhook` (Stripe, personal + org) | Stripe signature | none | `BillingWebhookIT`, `OrgBillingWebhookIT` |
| Outbound | n/a (Phase 12) | HMAC signature | n/a | §9.2 |

`/api/ent/**` is **not used** (reserved name scanned by `NoSubmitSurfaceTest`). No GraphQL, no WebSocket in this programme
(notifications poll, as today).

## 2. Headers and tenant resolution

### 2.1 Request headers

| Header | Who sets | Meaning | Rule |
|---|---|---|---|
| `X-Kiwiply-Host` | web BFF (`serverApiFetch`) from edge `X-Forwarded-Host` | the browser-facing hostname | the **only** host input; the API ignores `Host` and `X-Forwarded-Host` for tenancy. Authority comes from `org_hostname`, never from the header's sender (forging only yields public branding, `ForgedHostHeaderIT`) |
| `X-Kiwiply-Workspace` | extension (Phase 9) | `personal` \| `org:{orgId}` | allow-listed endpoints only (§2.3); flag off → ignored |
| `Authorization: Bearer` / cookie `kiwiply_access` | BFF / extension | JWT (`sub`, `tid?`, `hid?`) | `tid`/`hid` binding, 12 §2 |
| `Idempotency-Key` | client | UUID v4 | §6 |
| `If-Match` / `If-None-Match` | client | ETag | §5 |
| `X-Request-Id` | edge/BFF, else generated | log correlation (MDC `req`) | echoed in responses and in every problem body |
| `X-Internal-Token` | web container / edge `ask` (`?t=`) | service auth | constant-time compare; masked in logs |

### 2.2 Behaviour by `TenantContext.kind` (single table; X1.3/X1.5 implement, `HostMatrixIT` proves)

| Route family | TENANT (host → org A) | PLATFORM | UNKNOWN (header present, no tenant) | header missing |
|---|---|---|---|---|
| `/api/public/tenant` | 200 DTO (A) | 200 `{kind:"PLATFORM"}` | 404 | as PLATFORM |
| `/api/authenticate`, `/api/auth/google` | login allowed only if caller is an ACTIVE member of A, else 401 `NOT_A_MEMBER`-style generic failure (12 §3); token gets `tid=A, hid` | as today, token without `tid` | 404 | as today (extension, scripts) |
| `/api/orgs/{orgId}/**`, `/api/me/orgs/{orgId}/**`, `/api/join/**` | `orgId` must equal A else 404; JWT `tid` must equal A else 401 `TENANT_MISMATCH` | legacy console: membership only; JWT with `tid` of another org → 404 | 404 | as PLATFORM (legacy; unchanged behaviour for today's clients) |
| `/api/me/tenant` | 200 (member of A) / 404 non-member / 403 `MEMBER_SUSPENDED` | 404 | 404 | 404 |
| `/api/account/**`, `/api/notifications/**` (user-scoped) | allowed with a `tid`-less token (login-first hand-off) | allowed | allowed | allowed |
| `/api/profile/**`, `/api/billing/*` (person) | allowed (no tenant effect) | allowed | allowed | allowed |
| `/api/admin/**` | **404** (a tenant host never exposes platform admin) | `ROLE_ADMIN` | 404 | as PLATFORM |
| `/api/internal/**` | n/a (own chain; refuses public Host, X1.13) | | | |

Rules: never read a tenant id from body/query/cookie; never fall back to "first org"; suspended/closed orgs resolve UNKNOWN with an
internal reason only. Async/jobs pass `orgId` explicitly (`TenantScoped`).

### 2.3 Workspace header (E6, Phase 9, flag `flag.enterprise.extension_workspaces`)
Honoured only on: `GET /api/profile/version` (adds `workspaces[]`, plan per workspace), `GET /api/profile/resumes*`,
`GET /api/me/orgs/{orgId}/opportunities/assigned` (extension feed), `POST /api/orgs/{orgId}/opportunities/from-extension`.
`WorkspaceHeaderFilter`: `org:{id}` must match an ACTIVE membership else **404**; malformed → 400 `WORKSPACE_INVALID`;
absent/`personal` → personal plan, byte-identical response to today (additive `workspaces[]` only when flag on).
The extension token never carries `tid`.

## 3. Authorisation contract (per endpoint)

Every `/api/orgs/{orgId}/**` and `/api/me/orgs/{orgId}/**` handler carries exactly one of `@OrgPermissionRequired(value, beneficiary)`
or `@OrgUnscoped(reason)`; entitlement-consuming handlers add `@RequiresFeature(key, beneficiary, quantity)` (05 §6, 24 §5).
Catalogue notation: **perm** = permission key; **(scope)** = minimum scope that makes the handler reachable (`OWN < ASSIGNED < TEAM <
DEPARTMENT < ORG`); `+FULL` = consent step 10 at FULL, `+SUM` = SUMMARY; `feat:` = `@RequiresFeature` key; `flag:` = module flag;
`self` = `/api/me/orgs/…` caller-owned rows; `PA` = platform admin.
Failure mapping is the one table in §4; the interceptor never writes a status by hand.

## 4. Error model

Body is `application/problem+json` (existing JHipster `ProblemDetailWithCause`): `{type, title, status, code, message, detail?, requestId, …extras}`.
`code` is the machine contract; `message` is an i18n key (`error.org`, `error.proRequired`, `error.ent.<code>`); clients branch on `code` only.
`fieldErrors:[{objectName, field, message}]` on 400/422.

| HTTP | `code` (extras) | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` (`fieldErrors`) · `SORT_INVALID` (`allowed[]`) · `FILTER_INVALID` · `WORKSPACE_INVALID` · `IDEMPOTENCY_KEY_MISSING` | malformed input |
| 401 | `UNAUTHENTICATED` · `TENANT_MISMATCH` · `TOKEN_HOST_REVOKED` · `TOKEN_EXPIRED` · `STEP_UP_REQUIRED` (admin break-glass, §3.9) | token problems; tid/hid binding |
| 402 | `FEATURE_NOT_LICENSED` · `FEATURE_ALLOWANCE_EXHAUSTED` · `AI_BUDGET_EXHAUSTED` · `SUBSCRIPTION_STATE` · `PRO_REQUIRED` · `RESUME_LIMIT` | **only after** steps 1–6 passed (24 §4) — leaks nothing cross-tenant |
| 403 | `CONSENT_REQUIRED` (`beneficiary, consentKind, requestUrl`) · `MEMBER_SUSPENDED` | the **only** non-404 refusals on org data (the consultant must see the request) |
| 404 | `NOT_FOUND` (identical body/timing for "absent", "not yours", wrong tenant, module off, not assigned, out of scope) | the isolation promise (05 §2). Never 403 for a tenant/permission/scope/assignment failure |
| 409 | `ORG_STATE` · `INVALID_TRANSITION` (`from,to,allowed[]`) · `IDEMPOTENCY_IN_PROGRESS` · `QUOTE_STALE` (`reason`) · `INTEGRATION_REQUIRED` · `PRIMARY_REQUIRED` · `PRIMARY_EXISTS` · `HOST_NOT_LIVE` · `SUBDOMAIN_MANAGED` · `SEAT_STATE` · `ALREADY_MEMBER` · `LAST_ADMIN` · `ASSIGNMENT_CAP` · `DUPLICATE_WARNING` · `RESUME_STALE` · `PDF_NOT_READY` · `SLUG_TAKEN` (`suggestion`) · `INVITE_EXPIRED` | state conflicts for a caller who **already passed** authz |
| 410 | `QUOTE_EXPIRED` | quote past `expires_at` |
| 412 | `PRECONDITION_FAILED` (`currentVersion`) | `If-Match` mismatch (§5) |
| 413/415 | `PAYLOAD_TOO_LARGE` · `UNSUPPORTED_MEDIA_TYPE` | uploads (PDF/PNG/CSV only; `ent.upload.max_bytes`) |
| 422 | `HOSTNAME_INVALID` (`reason`) · `RESERVED_VALUE` · `SENSITIVE_CONTENT` (`path, kind` — never the value) · `MARGIN_BELOW_FLOOR` · `IDEMPOTENCY_KEY_REUSED` · `ROLE_CEILING` · `DELEGATE_NEEDS_END` · `CONTRAST_TOO_LOW` | semantic validation |
| 428 | `PRECONDITION_REQUIRED` | mutation of a versioned aggregate without `If-Match` |
| 429 | `RATE_LIMITED` (`retryAfterSeconds`) + `Retry-After` | §8 |
| 503 | `BILLING_DISABLED` (existing) · `DEPENDENCY_UNAVAILABLE` | Stripe/AI/DNS down; read paths keep working |

`CONSENT_REQUIRED` exception list is closed: adding another 403 needs a design review (reviewed Task 4: accepted as the only 403).

## 5. Optimistic concurrency (412 / 428)

Weak ETag `W/"<version>"` from a `version BIGINT` column (JPA `@Version`) on every user-editable aggregate. GET returns `ETag`; PATCH/PUT/DELETE
**require** `If-Match` (missing → 428, stale → 412 with `currentVersion` so the UI can show "changed by X — reload" or three-way merge).
Required on: `org_branding` draft (`draftVersion`), `org_setting`, `org_role` + permission grid, `org_group`, `consultant_profile` overlay,
`client_account`, `client_requirement`, `offer`, `placement`, `org_policy`, `resume doc` (existing `doc_version`), `license` configure forms
(quote `inputsHash` plays this role instead). Not required on append-style actions (`/end`, `/record`, transitions — guarded by
`INVALID_TRANSITION`). `GET /api/me/tenant` and public tenant assets use `ETag`/`If-None-Match` → 304 for caching.

## 6. Idempotency

| Rule | Detail |
|---|---|
| Header | `Idempotency-Key: <uuid>` **required** (else 400 `IDEMPOTENCY_KEY_MISSING`) on: quote confirm, license direct actions, module quote confirm, setup-fee checkout, bulk member actions, invites, offboard apply, offer extend/accept, placement start/extend/end, org subscription mode change, admin catalog publish/retire, usage credits, exports. Optional elsewhere. |
| Store | `idempotency_record` (41 §3.1): `(org_id NULL-able, actor_login, key)` unique; `request_hash` = sha256(method + path + canonical body). 24 h TTL. |
| Replay | same key + same hash → the stored status/body again (`Idempotent-Replayed: true`); same key + different hash → 422 `IDEMPOTENCY_KEY_REUSED`; same key in flight → 409 `IDEMPOTENCY_IN_PROGRESS` (+ `Retry-After: 1`). |
| Money | key flows to usage ledger (`{orgId}:{feature}:{refType}:{refId}:{attempt}`, 25 §2) and to Stripe (`IdempotencyKey.of`, 26 §8) — never regenerated on retry. |
| Webhooks | `stripe_event.id` PK is the key (26 §7). |

## 7. Pagination, filtering, sorting, search, export

| Aspect | Convention |
|---|---|
| Paging | `?page=0&size=25` (0-based, `size` ≤ 100, default 25). Response `PageDTO<T> {items[], page, size, total, hasNext}` + `X-Total-Count`. Lists over 10 000 rows use keyset `?after=<cursor>` (usage events, audit, pipeline events) and return `{items[], next}`; `total` omitted. |
| Sorting | `?sort=field,dir` repeatable; allow-list per endpoint (catalogued in the DTO appendix); unknown → 400 `SORT_INVALID`. Always a stable tiebreak on `id`. |
| Filters | named query params, repeated for multi (`status=A&status=B`), enums validated (400 `FILTER_INVALID`); dates `from`/`to` ISO-8601 instants (inclusive/exclusive); ids are numeric; **never** an `orgId`/`tenant` filter (tenant from path only). |
| Search | `q` (≤ 80 chars): FULLTEXT on indexed text columns with `org_id` first; wildcard characters escaped; ≥ 2 chars. |
| Scope-filtered lists | a list endpoint returns only rows inside the caller's scope + consent projection (`ShareField`); there is no "403 on some rows" — rows are simply absent. |
| Export | `GET …/export?format=csv` ⇒ synchronous ≤ `ent.export.sync_max_rows` (5 000) else 202 + job (`ops-export` lifecycle, 24 h); audited `EXPORT` (MEDIUM); free-text columns pass `SensitivePatterns.redact`; CSV injection guard (`=+-@` prefix → `'`). |
| Time | UTC ISO-8601 instants (`2026-10-12T09:30:00Z`); dates `YYYY-MM-DD`; money `{amountMinor:long, currency:"USD"}` — never decimals, never floats. |
| IDs | numeric Long internally; **never** expose sequential ids of another tenant's objects in public/unauthenticated DTOs (`PublicTenantDTO` has no `orgId`). Join tokens/invite tokens are opaque 32-char base62, hashed at rest. |

## 8. Rate limits

In-process `FixedWindowRateLimiter` (single instance, ADR-022) with a **key function** `tenant:host:ip:user`; limits are settings (`enterprise.ratelimit.<class>.limit/window_s`, admin-editable), defaults below. Over limit → 429 + `Retry-After` + `RATE_LIMITED`. Moves to MySQL/Redis before a second instance (Phase 12).

| Class | Default | Key |
|---|---|---|
| `GET /api/public/tenant`, tenant assets | 120/min | host + IP |
| Login on a tenant host (`/api/authenticate`, `/auth/google`) | 10 / 5 min | host + IP **and** username (second bucket) |
| `GET /api/internal/tenant-hosts/check` (ask) | 600/min global; 404 burst alert | global |
| Join accept / code redeem | existing `JoinRateLimiter` | IP + token |
| Hostname verify-now | 1/min | hostname |
| Invites / resend | `org.invite.*` (existing) | org + actor |
| Quote create / confirm | 30/min · 10/min | org + actor |
| AI-backed handlers (`tailor`, `match run`, `prep`) | 20/min per actor on top of allowance/budget | actor |
| Exports | 5/hour | actor |
| `.ics` feeds | 60/min | token |
| Consent request ("Ask Anika") | 1 per 7 d per (feature, beneficiary) (`org.consent.request_cooldown_days`) | actor+beneficiary+kind |
| Bulk member/license actions | 10/min | org + actor |
| Marketer "Save for consultant" (extension) | 60/hour | actor |

## 9. Webhooks

### 9.1 Inbound — Stripe (exists; extended, 26 §7)
`POST /api/billing/webhook` (permitAll, **signature verified** with the signing secret before any parse; reject > 5 min skew; body size ≤ 1 MB;
duplicate `stripe_event.id` → 200 no-op). Route first: org event (`customerId ∈ org_billing_account` or `scope=org` metadata) →
`OrgBillingWebhookHandler`; else personal path **unchanged**; BeeCompete-tagged events ignored. Handler failure → 500 so Stripe retries; permanent
parse errors → 200 + `billing_drift`/log (never a poison loop). Only webhooks write billing mirrors.

### 9.2 Outbound — org integrations (Phase 12, X12.3; ⚑ risk area: SSRF + replay)
`org_webhook` (41 §10): URL (https only, no private/loopback/link-local/metadata IPs — resolved at send time and pinned, redirects disabled, 5 s timeout, 64 KB body),
secret (SecretBox, shown once), event types, status. Delivery `POST` JSON `{id, type, createdAt, orgId, data}` with
`X-Kiwiply-Signature: t=<unix>,v1=<hex hmac-sha256(secret, t + "." + body)>`, `X-Kiwiply-Event-Id`; receivers must reject `t` older than 5 min.
Retries: 1 m, 5 m, 30 m, 2 h, 12 h (5 attempts) then `FAILED` + notification; manual redeliver. Event catalog (additive, `enterprise.webhooks.events` allow-list):
`member.joined|left`, `license.changed`, `usage.threshold`, `match.assigned|accepted`, `submission.recorded`, `interview.confirmed`, `offer.extended|accepted`, `placement.started|ended`.
Payloads follow the consent projection (no resume text, no rates unless `finance.view` creator opted in — default off). Scope `integrations.manage`.

## 10. OpenAPI conventions and the isolation registry

- `api/openapi.json` (springdoc) is regenerated and committed by every API story (`OpenApiContractIT`, 120 s timeout, fails on drift).
- Tags = bounded context (`Tenancy, Identity, Roles, Assignments, Catalog, Licenses, Usage, Billing, Talent, Pipeline, Applications, Interviews, Clients, Placements, HR, Finance, Reports, Integrations, Admin, Public, Internal`).
- `operationId` = `{tag}_{verb}{Noun}` unique (`licenses_confirmQuote`); schemas end `DTO`/`VM`; every non-2xx references the shared `Problem` schema with the §4 `code` enum.
- Vendor extensions emitted from annotations by an `OperationCustomizer` and asserted by `OpenApiAuthzExtensionsIT`: `x-permission`, `x-scope`, `x-feature`, `x-flag`, `x-idempotent: true`, `x-etag: true`, `x-phase`. **A handler under `/api/orgs/**` or `/api/me/orgs/**` without `x-permission` or `x-unscoped` fails CI.**
- Enums in DTOs are closed sets in the schema (clients treat unknown values defensively; adding a value is additive).
- **Registry rule (`OrgIsolationIT.COVERAGE`)**: every mapped route under `/api/orgs/{orgId}/**` **and** `/api/me/orgs/{orgId}/**` must have a line (body to attack with); `everyOrgRouteIsListedInTheCoverageRegistry` fails on a missing line (naming the line to add) **and** on a stale line; the sweep (`CrossTenantSweepIT`) replays each line with acme-owner on beta ids, beta-owner on acme ids, a non-member, a platform admin (all 404) and, for money/consent routes, a same-org caller outside scope (404). A story that adds a route without the line cannot merge. New route families outside those prefixes must be declared in `RouteFamilies` (test fixture) or the build fails — there is no un-registered third place to put tenant data.
- `AuthzCoverageTest` (24 §5): handlers referencing a feature key without `@RequiresFeature` fail. `NoSubmitSurfaceTest` (31 §10) scans `/api/orgs/**` + `/api/ent/**` verbs. `AdminHostGuardIT`: every `/api/admin/**` route 404s on a tenant host.

## 11. Versioning and compatibility

| Rule | Detail |
|---|---|
| No URL version | additive evolution only: new optional fields, new endpoints, new enum values, new `code`s. Never rename/remove/retype within this programme (mirrors ADR-023 for the DB). |
| Breaking change | new path (`…/v2/…` suffix on the resource, not the prefix) + `Deprecation`/`Sunset` headers on the old one for ≥ 90 days; recorded in `docs/enterprise-v2/progress-tracker.md`. |
| Extension-facing freeze | `/api/extension/session`, `/api/profile/version`, `/api/profile/**`, `/api/billing/me`, field-cache endpoints: response shapes are frozen except additive fields; a unit test feeds the new payloads to the current `tracking.js` parser (29 §3). |
| Web BFF | the web app deploys together with the API (one release); BFF routes may change freely, API may not break the previous web build for one release (rolling deploy window). |
| Feature flags | a flagged-off endpoint returns the **same 404** as an unknown route (`EnterpriseEnabledFilter`, per-module filters) — flags are not discoverable. |

## 12. Endpoint catalogue

Columns: **perm / scope / feat** · **body → response** · **notable errors** · **I** = `Idempotency-Key` required, **M** = `If-Match` required · **Ph** = phase. Paths are relative to the family prefix of the section; `{o}` = `/api/orgs/{orgId}`, `{m}` = `/api/me/orgs/{orgId}`. DTO shapes in §13. "defined here" = path chosen by this doc (the domain doc owns semantics).

### 12.1 Tenancy: public + internal (flag `flag.enterprise`)
| Method · path | Auth | Notes | Ph |
|---|---|---|---|
| GET `/api/public/tenant` | public, rate-limited | `PublicTenantDTO`; `Cache-Control: public,max-age=60`; 404 UNKNOWN | 1 |
| GET `/api/public/tenant/assets/{logo\|favicon\|banner}` | public | resolved by host; `ETag`, 304; ACTIVE/PAST_DUE only | 2 |
| GET `/api/internal/tenant-hosts/check?domain=&t=` | internal token (header **or** `t`) | 200 empty / 404; ≤ 50 ms; `t` masked in logs | 1 |
| GET `/api/internal/health/ent` | internal token | resolver cache stats, job last-run (feeds 44 §10) — defined here | 1 |

### 12.2 Identity, sessions, join (Phase 1–2)
| Method · path | perm/scope | body → response | Errors | Ph |
|---|---|---|---|---|
| POST `/api/auth/login` (BFF) → `/api/authenticate` | public | creds + host → token pair (`tid,hid` on tenant host) | 401, 404 UNKNOWN host, 429 | 1 |
| POST `/api/auth/google` | public | tenant host: only if `login.google` | 401, 404 | 3 |
| POST `/api/refresh`, `/api/logout` | cookie | refresh keeps `tid/hid` | 401 `TOKEN_HOST_REVOKED` | 1 |
| GET `/api/me/tenant` | self | `MeTenantDTO` (09 row 2), `ETag` | 403 `MEMBER_SUSPENDED`, 404 | 2 |
| GET `/api/me/orgs` | self | memberships + hosts (primary) for the switcher | | 2 |
| GET `/api/account/sessions` · POST `…/sessions/{fam}/revoke` · POST `…/sessions/revoke-all` | self | refresh families | | 2 |
| GET `/api/join/{token}` · GET `/api/join/code/{code}` | public preview | org name/logo, invited roles, what org sees | 404, 409 `INVITE_EXPIRED`, 429 | 1 |
| POST `/api/join/{token}/accept` · POST `/api/join/code/{code}` | signed-in | `{shareScope}` → fresh token pair with `tid` | 409 `SEAT_STATE`/`ALREADY_MEMBER`, 429 | 1 |
| POST `/api/join/resend-for-me` | public | generic 202 (no enumeration) | 429 | 2 |
| POST `/api/me/orgs/{orgId}/leave` | self | `{confirm}`; license ENDED now (09 row 4) **I** | 409 `LAST_ADMIN` | 1 |
| PUT `/api/me/orgs/{orgId}/share` | self | `{scope, fullToMemberId?}` consent write | | 1 |
| PATCH `/api/account/profile` · POST `/api/account/photo` · POST `/api/account/change-password` | self | basic profile (13) | 422 `SENSITIVE_CONTENT` n/a | 2 |

### 12.3 Branding, domains, org settings (Phase 2–3)
| Method · path | perm (scope) | body → response | Errors | I/M | Ph |
|---|---|---|---|---|---|
| GET `{o}/branding` | `branding.manage` (ORG) | `{published, draft, draftVersion, versions[]}` | | | 2 |
| PATCH `{o}/branding/draft` | `branding.manage` | partial → `BrandingDraftDTO` | 422 `CONTRAST_TOO_LOW`, `RESERVED_VALUE` | M | 2 |
| POST `{o}/branding/publish` · `…/revert` | `branding.manage` | → published; `config_version++` | 409 `INVALID_TRANSITION` | I | 2 |
| GET `{o}/branding/preview-theme?primary=&secondary=&accent=` | `branding.manage` | derived tokens + contrast report | | | 2 |
| POST `{o}/branding/assets/{logo\|favicon\|banner}` | `branding.manage` | multipart PNG/JPEG/WebP only (no SVG, 42 §3.8) ≤ 1 MB → key under `org/{id}/` | 413, 415 | | 2 |
| GET `{o}/settings` · PUT `{o}/settings/{key}` | `org.settings.manage` | `OrgSettingDTO[]` · `{value, reason?}` | 422 allow-list | M | 2 |
| PATCH `{o}` | `org.settings.manage` | identity fields (`displayName`…) | | M | 2 |
| GET `{o}/dashboard` | `dashboard.view_org` (ORG) | widgets via `DashboardWidgetProvider` | | | 2 |
| GET `{o}/onboarding` | ORG_ADMIN | activation checklist | | | 2 |
| GET `{o}/hostnames` · POST `{o}/hostnames` | `domains.manage` | `{hostname}` → `HostnameDTO` (PENDING) | 422 `HOSTNAME_INVALID`, 409 limit, 404 flag off | I | 3 |
| GET `{o}/hostnames/{hid}/instructions` | `domains.manage` | TXT/CNAME values | | | 3 |
| POST `{o}/hostnames/{hid}/verify` | `domains.manage` | sync ≤ 10 s → `HostnameDTO` | 429 (1/min) | | 3 |
| POST `{o}/hostnames/{hid}/activate` · `/suspend {reason}` · `/resume` · `/remove {typed}` | `domains.manage` | lifecycle (10 §2) | 409 `PRIMARY_REQUIRED`, `SUBDOMAIN_MANAGED`, `HOST_NOT_LIVE` | I | 3 |
| PUT `{o}/hostnames/{hid}/primary` | `domains.manage` | | 409 `HOST_NOT_LIVE` | I | 3 |
| GET `{o}/audit?target=&id=&action=&risk=&actor=&from=&to=&after=` | `audit.view` (ORG) | keyset `AuditEventDTO` | | | 1 |
| GET `{o}/audit/export` | `reports.export` | CSV, audited | 429 | I | 4 |

### 12.4 Members, roles, groups, assignments (Phase 1, 4)
| Method · path | perm (scope) | body → response | Errors | I/M | Ph |
|---|---|---|---|---|---|
| GET `{o}/members?q&status&roleId&departmentId&teamId&managerId&licenseStatus&sort&page&size` | `members.view` (ORG) | `PageDTO<MemberDTO>` | | | 4 |
| POST `{o}/members/invite` | `members.invite` | `{emails[], roleIds[], departmentGroupId?, teamGroupId?, managerMemberId?}` → batch (never the token) | 422 `ROLE_CEILING`, 429 | I | 1 |
| POST `{o}/members/{id}/resend` · `/suspend` · `/reinstate` · `/sessions/revoke` | `members.invite` / `members.suspend` | | 409 `SEAT_STATE`, `LAST_ADMIN` | | 1/4 |
| GET `{o}/members/{id}/offboard-preview` · POST `…/offboard` | `members.remove` | hook previews (09 row 4) → apply | 409 | I | 4 |
| PATCH `{o}/members/{id}` | `members.edit` | title, manager, groups (`members.group.set`, `members.manager.set`) | | M | 4 |
| POST `{o}/members/bulk/roles` · `/bulk/move` · `/bulk/suspend` | `roles.manage` / `members.group.set` | `{memberIds[], …}` → per-row result | 207-style `results[]` in 200 body | I | 4 |
| GET/POST `{o}/roles` · GET/PATCH/DELETE `{o}/roles/{id}` · PUT `{o}/roles/{id}/permissions` · GET `{o}/roles/{id}/diff` · GET `{o}/roles/{id}/history` | `roles.manage` | clone/edit within **ceiling** | 422 `ROLE_CEILING`, 409 system row | M | 4 |
| GET `{o}/permissions` | `roles.manage` | registry metadata (family, dangerous, scope) | | | 4 |
| GET/POST `{o}/groups` · PATCH/DELETE `{o}/groups/{id}` · POST `…/groups/{id}/members` | `groups.manage` | `parentGroupId`, `leadMemberId` | 409 non-empty | M | 4 |
| GET `{o}/assignments?consultant=&assignee=&kind=&open=` · `/history` · `/mine` · `/workload` | `assignments.manage`/`consultants.view`/`workload.view` | 17 §6 | | | 4 |
| POST `{o}/assignments` · `/reassign` · `/{id}/end` | `assignments.manage` (TEAM) | | 409 `ASSIGNMENT_CAP`, `PRIMARY_EXISTS` | I | 4 |

### 12.5 Catalog, contracts, platform billing (admin; `ROLE_ADMIN`, PLATFORM host only)
| Method · path | Notes | Errors | Ph |
|---|---|---|---|
| GET `/api/admin/catalog` · `/margin` · `/versions` | read model + worst-case margin | | 5 |
| POST `/api/admin/catalog/features` · PUT `…/features/{key}/dependencies` · PUT `…/presets` · PUT `…/volume-tiers` | definitions separate from prices | 422 | 5 |
| POST `/api/admin/catalog/prices` · `/prices/{id}/publish` · `/prices/{id}/retire` | immutable rows; publish needs typed reason if below margin floor | 422 `MARGIN_BELOW_FLOOR` | 5 |
| GET/POST/PUT `/api/admin/contracts[/{id}]` · POST `/{id}/approve` · GET `/{id}/events` · PUT `/api/admin/org-discounts` · GET `/api/admin/orgs/{id}/pricing-preview` | 23 | | 5 |
| GET `/api/admin/orgs` · `/{id}` · POST `/{id}/hostnames/subdomain` · `/{id}/enterprise` · `/{id}/hostnames/{hid}/suspend` · `/resume` | tenant list/detail, flag allow-list toggle (reason sheet) | 422 `RESERVED_VALUE`, 409 `SLUG_TAKEN` | 1 |
| PUT `/api/admin/orgs/{id}/billing/mode` · GET `/{id}/usage` · POST `/{id}/usage/credits` · GET `/api/admin/billing/drift` · POST `…/drift/{id}/resolve` | 26/25 | | 6 |
| POST `/api/admin/orgs/{id}/break-glass` `{reason, mfa}` → 15-min read grant (E8 → story **X6.17**; 42 §3.9) | step-up MFA, writes HIGH audit **in the tenant's log**; grants read of an allow-listed projection only | 401 `STEP_UP_REQUIRED` | 5 |
| GET `/api/admin/domains` · POST `/{hid}/recheck` | cross-org hostname health (10 §7) | | 3 |

### 12.6 Licenses, usage, billing (org; flag `flag.enterprise.billing`)
| Method · path | perm (scope) | body → response | Errors | I/M | Ph |
|---|---|---|---|---|---|
| GET `{o}/licenses/catalog` | `licenses.view` | org-priced catalog (contract applied) | | | 5 |
| GET `{o}/licenses?status=&featureKey=&teamId=&q=&sort=&page=` · GET `{o}/licenses/{id}` · `/history` | `licenses.view` | `PageDTO<LicenseDTO>` | | | 5 |
| POST `{o}/licenses/quotes` | `licenses.manage` | `{lines[], confirmedCommercialDeps[], effectiveAt?}` → `LicenseQuoteDTO` (22 §8) | 422, 429 | | 5 |
| POST `{o}/licenses/quotes/{id}/confirm` | `licenses.manage` | → `ChangeBatchDTO` | 409 `QUOTE_STALE`, 410 `QUOTE_EXPIRED`, 402 `SUBSCRIPTION_STATE` | I | 5 |
| POST `{o}/licenses/{id}/suspend` · `/reactivate` · `/cancel` | `licenses.manage` | direct actions (quote-less where no money moves) | 409 | I | 5 |
| DELETE `{o}/licenses/changes/{changeId}` | `licenses.manage` | cancel a scheduled change | 409 | | 5 |
| GET `{o}/members/{memberId}/entitlements` | self or `licenses.view` | `EntitlementsDTO` | | | 5 |
| GET `{o}/modules` · POST `{o}/modules/quotes` (+`/{id}/confirm`) | `billing.manage` | org modules (`module.talent_marketing`) | | I | 5 |
| GET `{o}/usage?by=consultant\|feature\|team&period=&featureKey=&memberId=&teamId=` · `/usage/history?months=` · `/usage/events?…&after=` · GET `{o}/members/{id}/usage` | `usage.view` (self OWN) | 25 §8 | | | 5 |
| GET `{o}/billing` | `billing.view` | `OrgBillingDTO` (`billingEnabled=false` when off) | | | 5 |
| POST `{o}/billing/setup-checkout` · `/portal` | `billing.manage` | Stripe Checkout/Portal URL | 503 `BILLING_DISABLED` | I | 6 |
| GET `{o}/billing/invoices[?after]` · `/invoices/{id}` · `/payments` | `billing.view` / `finance.view` | mirror rows | | | 6 |
| POST `{o}/billing/contacts` | `billing.manage` | billing contacts | | M | 6 |
| **Beneficiary entitlement hooks** (`@RequiresFeature`) | listed per feature in 37 §4; no separate paths | 402 codes §4 | | | 7–9 |

### 12.7 Talent: consultants, resumes, consent (flag `flag.enterprise.marketing`)
| Method · path | perm (scope) / feat | Errors | I/M | Ph |
|---|---|---|---|---|
| GET `{o}/consultants?q&availability&marketing&marketer&license&readiness&page` · `/consultants/{memberId}` | `consultants.view` (ASSIGNED+); consent projection | | | 7 |
| PATCH `{o}/consultants/{memberId}/profile` | OWN `self.*`; marketer → creates **proposal** (`member.act_for`) | 422 `SENSITIVE_CONTENT` | M | 7 |
| POST `{o}/consultants/{memberId}/profile/proposals/{id}/accept\|reject` · GET `{m}/profile/proposals` | OWN | | | 7 |
| GET `{o}/resumes?member&status&visibility` · GET `{o}/consultants/{memberId}/resumes` | `resumes.view_for` | | | 7 |
| POST `{o}/consultants/{memberId}/resumes` `{label, from}` | `resumes.edit_for` +FULL (`consent.resume_edit`) | 403 `CONSENT_REQUIRED` | I | 7 |
| GET `…/resumes/{rid}/doc\|pdf\|versions\|versions/{n}/text` | `resumes.view_for` +FULL (`consent.resume_view_org`); audited reads | 409 `PDF_NOT_READY` | | 7 |
| PUT `…/resumes/{rid}/doc` | `resumes.edit_for` + edit consent | 412 | M (`doc_version`) | 7 |
| POST `…/resumes/{rid}/ai/{rewrite\|summary\|suggest\|tailor}` | `resumes.edit_for` + `feat: ai.resume_tailoring` (beneficiary PATH_MEMBER) | 402 ×3, 403 | I | 7 |
| POST `…/resumes/{rid}/request-approval` | `resumes.approve_request` | 409 | | 7 |
| GET `{m}/resumes` · POST `{m}/resumes/{orgResumeId}/approve\|reject` · POST `…/primary` · PATCH `…/visibility` | self | 409 `RESUME_STALE` | | 7 |
| GET/PUT `{m}/feature-consents` · POST `{m}/consent-requests/{id}/…` | self; request cooldown | 429 | | 7 |
| POST `{o}/consultants/{memberId}/consent-requests` `{consentKind}` | `member.act_for` (ASSIGNED) → notifies consultant | 429 | | 7 |

### 12.8 Pipeline: opportunities, matches, submissions (Phase 8; paths defined here, semantics 31)
| Method · path | perm (scope) / feat | Notes / errors | I/M | Ph |
|---|---|---|---|---|
| GET/POST `{o}/opportunities` · GET/PATCH `{o}/opportunities/{id}` · POST `{o}/opportunities/from-extension` | `opportunities.manage` (ASSIGNED) | `from-extension` uses `X-Kiwiply-Workspace`; dedupe on URL | | 8 |
| GET `{o}/job-discovery?for={memberId}&q&…` | `matches.run`; `beneficiary = QUERY_MEMBER` | global `job_posting` search, `org_id`-scoped saved filters | | 8 |
| POST `{o}/matches/run` `{consultantMemberId, opportunityIds?}` | `matches.run` + `feat: ai.job_matching` (reserves `enterprise.matching.batch_size`) | 202 `{jobId}` async; 402 | I | 8 |
| GET `{o}/matches?consultant&status&…` · GET `{o}/matches/{id}` | `pipeline.view` (ASSIGNED+) | | | 8 |
| POST `{o}/matches/{id}/assign` · `/dismiss` · `/withdraw` · `/approve` · `/reject` | `opportunities.manage` / `approvals.decide` (TEAM) | 409 `ASSIGNMENT_CAP`, `DUPLICATE_WARNING`, `INVALID_TRANSITION`; **no `authorize`/`submit` verb in org routes** | I | 8 |
| GET `{m}/opportunities?status=` · `/{matchId}` | self | | | 8 |
| POST `{m}/opportunities/{matchId}/accept\|decline\|authorize\|withdraw\|link\|unlink` | `opportunities.respond`, `submissions.authorize` (OWN) | `authorize {scope}`; `link {applicationId}` must be caller's own | 409 `RESUME_STALE` | | 8–9 |
| GET/POST `{o}/submissions` · POST `{o}/submissions/{id}/record` · `/withdraw` · PATCH `{o}/submissions/{id}` | `submissions.prepare\|record` (ASSIGNED) | **record only**; needs `authorization ⊇ SUBMIT_RECORD`; duplicate guard 409 | I (`record`) | 8/10 |
| GET `{o}/pipeline/board?view=` · `/tasks` · `/followups` · `/activities` · `/performance` | `pipeline.view` / `followups.manage` | `KanbanBoard` model | | 8 |
| GET `{m}/timeline` | self | "What Acme did" | | 9 |

### 12.9 Applications and interviews (Phase 9)
| Method · path | perm / feat | Notes | Ph |
|---|---|---|---|
| GET `{o}/applications?consultant&status&period` · GET `{o}/consultants/{memberId}/applications/{applicationId}` | `pipeline.view` + `member.view_summary` (SUMMARY=counts) / FULL | consent projection; ghost rule | 9 |
| PATCH `/api/profile/applications/{id}/notes/{nid}` `{sharedWithOrg}` | owner (person route, additive) | | 9 |
| GET/POST `{o}/interviews` · PATCH `{o}/interviews/{slotId}` · POST `…/{slotId}/propose\|cancel` · GET `…/{slotId}/ics` | `interviews.coordinate` | `.ics` token feed rate-limited | 9 |
| GET `{m}/interviews` · POST `{m}/interviews/{slotId}/confirm\|decline` | `interviews.manage` OWN | creates the consultant's own `interview` row | 9 |
| POST `/api/profile/interviews/{id}/prep` | `feat: interview.ai_prep` (self or `QUERY_MEMBER`) | | 9 |
| GET `/api/autopilot/next` | `feat: automation.approved_apply` (**prepares** only; never submits) | | 12 |

### 12.10 Clients, offers, placements (Phase 10)
| Method · path | perm | Notes | Ph |
|---|---|---|---|
| GET/POST `{o}/clients` · GET/PATCH `{o}/clients/{id}` · POST `…/archive` | `clients.view\|manage` | PII scanner on notes; M on PATCH | 10 |
| GET/POST/PATCH `{o}/clients/{id}/contacts[/{cid}]` · GET/POST/DELETE `…/relationships[/{rid}]` | `clients.manage` | work email only | 10 |
| GET/POST `{o}/requirements` · GET/PATCH `{id}` · POST `{id}/hold\|reopen\|fill\|close` · POST `/requirements/parse` · `/import` (CSV) · GET `{id}/submissions` | `requirements.manage` (`pipeline.view` GET) | CSV per-cell scan | 10 |
| GET/POST `{o}/offers` · GET/PATCH `{id}` · POST `{id}/extend\|withdraw` | `offers.manage` | rate **bands**; amounts only for `finance.view` | 10 |
| POST `{m}/offers/{id}/accept\|decline` | `offers.respond` OWN | I | 10 |
| GET `{o}/placements?status&consultant&client` · `/{id}` · POST `{id}/start\|hold\|resume\|extend\|end\|terminate` · POST `{id}/redeploy` · GET `{id}/timesheets` | `placements.view\|manage` | `ops.*` rows via bridge | 10 |
| GET `{m}/placements` · POST `{m}/placements/{id}/started` · POST `{m}/placements/declare` | self | declare = consultant-reported, unverified flag | 10 |
| GET `{o}/pipeline/reports?kind=fill_rate\|time_to_place\|submissions_per_consultant\|vendor_performance&from&to` · `/export` | `reports.view\|export` | | 10 |

### 12.11 HR and Finance (record-only; flag `flag.enterprise.hr_finance`)
| Method · path | perm | Notes | Ph |
|---|---|---|---|
| GET/POST `{o}/hr/employment` · POST `{o}/hr/employment/{memberId}/onboard\|activate\|leave\|return\|offboard\|end` | `hr.view` / `lifecycle.manage` | effective-dated; `@NoSensitiveText` | 11 |
| GET/POST/PATCH `{o}/hr/checklists[/{id}]` · GET/POST `{o}/hr/tasks` · POST `…/tasks/{id}/done\|waive\|reopen` | `hr.manage` (assignee may `done`) | | 11 |
| GET/POST/PATCH `{o}/hr/policies[/{id}]` · POST `…/publish\|retire\|file` · GET `…/{id}/acks` | `hr.manage` / `hr.view` | PDF text-layer scanned; no image upload | 11 |
| GET `{m}/policies` · POST `{m}/policies/{id}/ack` · GET `{m}/hr/tasks` · POST `{m}/tasks/{id}/done` | self | ack pinned to version | 11 |
| GET `{o}/finance/overview` · `/finance/placements` · `/finance/placements/{id}/rates` | `finance.view` | `finance.view ⇒ ops.finance` read | 11 |
| GET `{o}/{hr\|finance}/reports?kind=` · `/export` | `reports.view\|export` | redaction pass; audited | 11 |
| `/ops/**` (product H, unchanged) | `ops.*` | | 11 |

### 12.12 Analytics, integrations, SSO (Phase 12; shapes defined in X12.* stories)
`GET {o}/analytics/…` (`flag.enterprise.analytics`, k-anonymity floor `org.analytics.k_min`=5) · `GET/POST/PATCH/DELETE {o}/integrations/webhooks[/{id}]` + `POST …/{id}/test|redeliver` (`integrations.manage`, §9.2) · `GET/PUT {o}/sso` + `POST {o}/sso/test` + `GET/PUT {o}/sso/jit-mapping` (SAML/OIDC metadata, domain claim; `flag.enterprise.sso`; **story X12.4** connection + login, **X12.10** JIT mapping with the `org.sso.max_jit_role` ceiling, 42 T34/T63 — design review done, Task 4) · `POST {o}/security/mfa-policy` (`org.security.mfa_required`) · `GET {o}/extension/assigned-items`.

## 13. DTO appendix (key shapes; full classes in code, snapshot-tested by `DtoSnapshotTest`)

```jsonc
// PublicTenantDTO  (04 §2.4 + 10 §6) — no ids, no counts
{ "displayName":"Acme Staffing", "status":"ACTIVE",
  "branding":{"logoUrl","faviconUrl","bannerUrl","primary","secondary","accent","theme","welcomeTitle","welcomeMessage","terminology":{}},
  "login":{"password":true,"google":false,"mfaRequired":false}, "primaryHost":"careers.acme.com", "redirect":false }
// MeTenantDTO  (09 row 2) — ETag = hash(roles, permissions, modules)
{ "org":{"id","name","displayName"}, "member":{"id","title","status"}, "roles":[{"key","name","primary"}],
  "permissions":{"licenses.view":"ORG","member.act_for":"ASSIGNED"},
  "modules":{"domains":true,"roles":true,"billing":false,"marketing":true,"hrFinance":false,"extensionWorkspaces":false,"integrations":false,"analytics":false},
  "features":{"licensed":["ai.job_matching"],"pending":false}, "workspaces":[{"key":"ADMIN","landing":true}], "landing":"ADMIN", "consent":{"scope":"SUMMARY"} }
// ProblemDTO — §4;  PageDTO<T> {"items":[],"page":0,"size":25,"total":132,"hasNext":true}
// Money {"amountMinor":1299,"currency":"USD"}    Actor/Beneficiary ref {"memberId","name","avatarUrl"}   (never email unless members.view)
// HostnameDTO {"id","hostname","kind","status","isPrimary","certState","lastCheckAt","lastCheckResult","timeline":[…]}   (verification token only in /instructions)
// MemberDTO {"id","name","workEmail","title","status","roles":[…],"departmentId","teamId","managerId","licenseStatus","lastActiveAt","consentScope"}
// LicenseDTO {"id","member":{…},"status","base":{priceId,effective:Money},"features":[{"featureKey","name","effective":Money,"endsAt?","allowance":{"limit","used","resetsAt"}}],"recurring":Money,"nextChange?":{…}}
// LicenseQuoteDTO — 22 §8 (every field);  ChangeBatchDTO {"batchId","changes":[],"applied":0,"failed":0}
// EntitlementsDTO {"member","licenseStatus","features":[{"featureKey","name","licensed","allowance","reason?":"FEATURE_NOT_LICENSED"}]}   // consultant-visible: no prices
// UsageRowDTO {"key","label","allowance","used","remaining","overage","aiBudgetPct?"}
// MatchDTO {"id","opportunity":{id,title,company,url},"consultant":{…},"score?","reason?","status","authorization","resume":{orgResumeId,displayName,versionNo}}   // no cover text
// SubmissionDTO {"id","matchId","requirement?","channelLabel","externalReference?","status","recordedBy","submittedAt?"}                 // record only
// OfferDTO {"id","client","rateBandLabel","billRate?":Money,"payRate?":Money,"status"}                                                     // amounts only with finance.view
// AuditEventDTO {"id","at","actor","action","risk","target":{type,id,label},"beneficiary?","host?","reason?"}
```
Sort allow-lists live next to each repository query (`SortAllowList` constants) and are emitted into OpenAPI as `x-sort`.

## 14. Per-phase API delta (what each phase must add to `openapi.json` and the registry)

| Phase | New route groups | Registry lines added to `OrgIsolationIT` |
|---|---|---|
| 1 | §12.1, §12.2 (join/leave/share), audit, admin orgs | audit, leave/share, join-related org routes |
| 2 | branding, settings, dashboard, onboarding, `me/tenant`, sessions | each route above |
| 3 | hostnames (7), admin domains | each |
| 4 | members/bulk/offboard, roles, groups, assignments | each (+ ceiling and last-admin negatives) |
| 5 | licenses, quotes, modules, usage, billing (read), admin catalog/contracts | each (+ `QUOTE_STALE` cross-org: acme quote id on beta → 404) |
| 6 | billing write, invoices, admin drift/mode | each |
| 7–11 | §12.7–12.11 | each (consent/scope negatives per 43 §3) |
| 12 | §12.12 | each |

*Open items:* none blocking; paths marked "defined here" in §12.8 need the Phase-8 builder to confirm against 31 when X8.* are specced (E-ticket in `progress-tracker.md`).
