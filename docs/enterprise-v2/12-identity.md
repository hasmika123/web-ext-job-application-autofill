# 12 — Identity: tenant-bound tokens, memberships, invite acceptance on a tenant host, session-per-host, how a personal user joins

> Status: design (Session B), 2026-10-12. Implements ADR-004 (tid/hid), ADR-003 (host resolution),
> ADR-018 (personal workspace untouched), E7 (invite email match, default (a)), E14 (Google per
> host, default (a)). Build-ready for X1.5/X1.8 (already specified), X2.6, X2.7, X2.10, X2.14, X3.7.

## 1. One global identity, N memberships, one session per host

| Thing | Where | Rule |
|---|---|---|
| Identity | `jhi_user` (login, email, names, imageUrl, langKey, activated, authorities) + additive `phone`, `title` (ADR-006) | One account per person, used on kiwiply.com and on every tenant host. No per-org accounts, no per-org passwords. |
| Membership | `org_member` (one live row per org + user; `active_user_key`) + `org_member_role` | A person may be a member of many orgs. Roles, title, department, team, manager, consent and licenses are **per membership**. |
| Session | host-only cookies `kiwiply_access` / `kiwiply_refresh`; JWT claims `sub`, `uid`, `auth`, and on tenant hosts `tid`, `hid` | One session per host. Signing in on `careers.acme.com` does not sign you in on `kiwiply.com` or on `jobs.beta.com`. |
| Workspace | PERSONAL (kiwiply.com) or ORG(orgId) (tenant host, or the `/org` console on kiwiply.com for non-enterprise orgs) | Entitlements never cross workspaces (ADR-018). |

## 2. Token claims and validation (ADR-004, X1.5 — restated as the contract the UI relies on)

```
access  { sub: login, uid, auth, exp(15m), jti, tid?: orgId, hid?: hostnameId }
refresh { sub, uid, fam, exp(90d), jti, tid?, hid? }
```
| Token | Context | Route class | Result |
|---|---|---|---|
| has `tid` | TENANT, `tid == orgId` | any | allowed (membership + permissions still checked) |
| has `tid` | TENANT, `tid != orgId` | any | `401 TOKEN_TENANT_MISMATCH`, cookies cleared by the BFF, login page |
| has `tid` | PLATFORM (kiwiply.com) | user-scoped (`/api/account`, `/api/profile`, `/api/notifications`, `/api/me/**`) | allowed |
| has `tid` | PLATFORM | `/api/orgs/{any}` | `404` (the console on kiwiply.com needs a platform session) |
| no `tid` | TENANT | user-scoped `/api/account` | allowed (login-first hand-off: the page can tell "signed in somewhere, not here") |
| no `tid` | TENANT | tenant routes | `401` → the web treats it as signed-out on this host |
| has `hid` | any | any | the hostname must be ACTIVE (`HostnameStatusCache`), else `401 TOKEN_HOST_REVOKED` (10 §6) |
| extension token (`/api/extension/session`) | — | — | never has `tid`; Phase 9 adds `X-Kiwiply-Workspace` (E6) |

Refresh keeps `tid/hid`; `proxy.ts` refresh runs with the host header so the API re-resolves the
tenant and refuses a refresh whose `tid` does not match the host (401 → cookies dropped).

## 3. `GET /api/me/tenant` — the one call the tenant shell makes (X2.2)

Tenant-host only (PLATFORM → 404). Requires a `tid` token for the resolved tenant.
```
{
  "org": { "id", "displayName", "status", "type", "primaryHost", "terminology": {...} },
  "member": { "id", "status", "title", "departmentGroupId", "teamGroupId", "managerMemberId", "joinedAt" },
  "roles": [ { "id", "key", "name", "isPrimary", "workspaceKey" } ],
  "permissions": { "members.invite": "ORG", "resumes.view_for": "ASSIGNED", ... },
  "modules": { "domains": true, "roles": true, "billing": false, "marketing": false, "hrFinance": false },
  "workspaces": [ { "key": "admin", "label": "Administration", "home": "/w/admin" }, { "key": "marketing", ... } ],
  "landing": "/w/admin",
  "consent": { "scope": "SUMMARY", "fullTo": null },
  "features": { "pending": true }        // Phase 5 fills licensed feature keys for CONSULTANT members
}
```
- `workspaces` is computed server-side from the workspace definitions (16 §3) ∩ effective
  permissions ∩ enabled modules; `landing` = primary role's workspace home, overridden by the
  member's saved preference (`org_member.landing_workspace`, additive, X4.2) when still allowed.
- Cached per request on the web (`cache()`); re-fetched on navigation between workspaces and after
  any role change (the API bumps an `ETag` = hash of roles+permissions+modules; the shell revalidates
  on focus every 5 min and shows "Your access changed — reloading" when it differs).
- Suspended member (`status = SUSPENDED`) → `403 MEMBER_SUSPENDED` → the shell renders the
  "Your access is paused" panel (no data) with sign-out.

## 4. Login on a tenant host (step list the BFF implements, X2.6)
1. `POST /api/auth/login` (BFF) forwards `username`, `password`, `X-Kiwiply-Host`.
2. API `/api/authenticate` in TENANT context: credentials → user; then membership check
   `org_member(org = tid, user, status ∈ {ACTIVE, SUSPENDED, INVITED})`:
   ACTIVE → tokens with `tid/hid`; SUSPENDED → `403 NOT_A_MEMBER {suspended: true}` (same panel
   copy as not-a-member, to avoid confirming membership state to a third party? — no: the person
   just proved the password, so the honest "Your access is paused" is shown); INVITED →
   `403 NOT_A_MEMBER {pending: true}`; none → `403 NOT_A_MEMBER`. Every refusal: audit
   `LOGIN_DENIED_NOT_MEMBER` in the org's log with `hostname_id`, no cookies.
3. MFA (11 §3.4) when required.
4. BFF sets cookies and answers `{ ok: true, landing }` (the landing comes from the API's
   `/api/me/tenant` the BFF calls right after login, so the page lands in one hop).
5. Google (`POST /api/auth/google`): same membership rule; available only when the tenant DTO says
   `login.google = true` (org opted in **and** the platform admin registered the origin — E14; the
   platform-admin hostname detail (X1.11) gets a "Google origin registered" checkbox, X3.7).
6. Password reset / email verification initiated on a tenant host builds links with
   `TenantUrls.base(org)` (X2.10) so the person returns to the branded host; the API templates take
   the tenant's display name and logo URL (`MailBranding` parameter, placeholder-free).

## 5. Invite acceptance on a tenant host (X1.8 API + X2.6 web)

```
email link  https://careers.acme.com/join/t/{token}
   │
   ▼
GET /join/t/{token}  (tenant tree, branded)  →  BFF GET /api/join/{token} (public preview: org name, logo, invited-as roles, what the org will see)
   │
   ├─ signed in on this host (tid = acme)  ─────────────────────────────────► consent screen (SUMMARY recommended / NONE; FULL later via pairing)
   │                                                                              │  POST /api/join/{token}/accept {shareScope}
   ├─ signed in on this host, different email than the invite ──► "This invitation is for a different email" (E7, 409 INVITE_EMAIL_MISMATCH)
   │                                                                      [Sign in with that account]  — no accept
   ├─ signed out, account exists for the invited email ────────► login card prefilled (email read-only) → back to /join/t/{token}
   │
   └─ signed out, no account ───────────────────────────────────► signup card (tenant hosts allow signup ONLY from a valid invite token:
                                                                   the BFF checks the token before rendering) → email verification
                                                                   (link on this host) → back to /join/t/{token} → consent → accepted
   ▼
"You're in" screen (mascot celebrate) → [Go to my workspace] → /w/{landing}
```
- The login during acceptance is a **platform-style login without `tid`** (the person is not a
  member yet). The API allows `/api/authenticate` on a tenant host to return a `tid`-less token
  only when the request carries a valid pending invite token for that tenant
  (`X-Kiwiply-Invite: {token}`, checked server-side; audited `LOGIN_FOR_INVITE`); the cookies are
  replaced with `tid` tokens the moment the accept succeeds (`POST …/accept` returns a fresh pair).
  This keeps "no member → no tenant session" true at all times.
- Join by code (`/join/{slug}/{code}`) works on tenant hosts only for the tenant's own slug; codes
  grant CONSULTANT/MEMBER-level roles only (branch B rule kept).
- On kiwiply.com the same pages exist (platform tree, from branch `2672733`, re-verified) for
  non-enterprise orgs and for invites sent before a tenant host was live.

## 6. How an existing personal user joins (scenario E, requirements §22)
1. Anika has a personal Kiwiply account (maybe Pro). Acme invites `anika@…` with role CONSULTANT.
2. She opens the link on `careers.acme.com`, signs in with her existing password (§5), chooses the
   consent scope, accepts. `org_member` becomes ACTIVE; `data_share` row written. **Nothing in
   `subscription`, `resume`, `application`, `inbox_connection` changes** (`PersonalSubscriptionUnchangedIT`).
3. On `careers.acme.com` she sees only Acme's consultant workspace (16 §5). Her personal dashboard,
   resumes and board stay on `kiwiply.com`; her personal Pro applies there only (ADR-018). Inside
   Acme, features come from Acme's licenses (Phase 5) — the "My Available Features" page says
   "Provided by Acme" per feature and never mentions her personal plan.
4. Her resumes are visible to Acme only through `org_resume` links she or a marketer creates with
   her consent (ADR-009); her career profile is read through `data_share` scope (ADR-006).
5. Leaving (`POST /api/me/orgs/{orgId}/leave`, from `/me/memberships` on any host or from
   `/settings/organizations` on kiwiply.com): membership → LEFT, overlay deleted, links removed,
   sessions with `tid` revoked (refresh families for that user filtered by `tid` — additive
   `refresh_token.org_id` column, X2.7), personal data untouched.
6. The **extension** keeps connecting on kiwiply.com only; until Phase 9 (E6) it acts in the
   personal workspace regardless of memberships.

## 7. Basic profile across memberships
The basic profile (13) is one record. On a tenant host the avatar menu shows the same profile;
only the **membership card** differs ("Acme · Marketing Specialist · joined Oct 2026"). Editing
the name on Acme's host changes it everywhere — the profile page says so once ("Your name and
photo are the same in every workspace you belong to").

## 8. Sign-out and session management
- `POST /api/auth/logout` (BFF) → API `/api/logout` revokes the refresh family; cookies deleted
  for this host only. The avatar menu's "Sign out" never signs out other hosts; "Sign out
  everywhere" (`/me/security`, X2.7) calls `POST /api/account/sessions/revoke-all`
  (`RefreshTokenService.revokeAllForUser`, exists) and the extension drops its session via the
  existing `signedOut` signal on kiwiply.com.
- Session list (X2.7): `GET /api/account/sessions` → refresh families with `created_at`,
  `last_used_at`, `org_id` (→ "Acme workspace" / "Personal"), user agent family; "Revoke" per row.
  Additive columns `refresh_token.org_id`, `user_agent` (80 chars), `last_used_at`.

## 9. SSO and the future (not built now)
SAML/OIDC per org with JIT membership → X12.4. It plugs into §4 step 2 (identity comes from the
IdP; the membership rule is unchanged). Central cross-host SSO (one login for all hosts) is **not**
planned: one session per host is explicit and acceptable (ADR-004).

## 10. Tests that pin this doc
`HostMismatchIT` (X1.9), `AuthenticateControllerIT` tenant cases (X1.5), `JoinResourceIT` tenant
cases (X1.8), new `TenantLoginFlowIT` (X2.6: invite-token login, pending/suspended refusals,
cookie replacement on accept), `MeTenantResourceIT` (X2.2: workspaces ∩ permissions ∩ modules,
ETag), `PersonalSubscriptionUnchangedIT` (X5.9), Playwright `tenant-login.spec.ts` (every state in
11 §3.2 at 390 and 1440), `tenant-join.spec.ts` (§5 branches over the mock).
