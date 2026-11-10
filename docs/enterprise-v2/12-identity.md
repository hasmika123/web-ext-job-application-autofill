# 12 — Identity: two kinds of account, tenant-bound tokens, invite acceptance on a tenant host, session-per-host

> **Two-world model (user decision 2026-10-14, O4; design `19-separate-enterprise-accounts.md`).** This file was
> rewritten to it on 2026-10-15 (S11). There are two kinds of account and they are never connected: a **personal**
> account (kiwiply.com) and an **enterprise account per organization** (that organization's tenant host). The same
> email may hold both; creating an enterprise account never reads, attaches, links or reveals a personal one. The
> host decides the world: a tenant host authenticates that organization's enterprise accounts only, kiwiply.com
> authenticates personal accounts only, and the extension connects with one account at a time. What did not change:
> tenant-bound `tid`/`hid` tokens, host resolution, session-per-host cookies and the temporary-password flow.
> `SHARED` organizations (legacy, `organization.account_mode`) keep the old behaviour where members are personal
> accounts; every statement below is about `SEPARATE` organizations (the enterprise default) unless it says otherwise.

> Status: design (Session B), 2026-10-12; identity sections rewritten 2026-10-15. Implements ADR-004 (tid/hid),
> ADR-003 (host resolution), ADR-018 (personal and enterprise entitlements never mix; now structural), E7 (invite
> email match, default (a)), E14 (Google per host, default (a)). Build-ready for X1.5/X1.8 (already specified),
> X2.6, X2.7, X2.10, X2.14, X3.7.

## 1. Two kinds of account, one enterprise account per organization, one session per host

| Thing | Where | Rule |
|---|---|---|
| Identity | `jhi_user` (login, email, names, imageUrl, langKey, activated, authorities) + additive `phone`, `title` (ADR-006) + `org_id` (`NULL` = personal account, otherwise the organization the enterprise account belongs to) | A **personal** account lives on kiwiply.com. An **enterprise** account belongs to exactly one organization and lives on that organization's tenant host. The same email may exist once as a personal account and once per organization; they are separate rows with separate passwords and data (unique on scope + email). Login stays globally unique (it is the JWT subject). |
| Membership | `org_member` (one live row per org + enterprise account; `active_user_key`) + `org_member_role` | An enterprise account has one membership, in its own organization. A person in two organizations holds two enterprise accounts. Roles (N per account, e.g. Administration and Marketing), title, department, team, manager, consent and licenses are per membership. |
| Session | host-only cookies `kiwiply_access` / `kiwiply_refresh`; JWT claims `sub`, `uid`, `auth`, and for enterprise accounts `tid`, `hid` | One session per host. Signing in on `careers.acme.com` does not sign you in on `kiwiply.com` or on `jobs.beta.com`. |
| World | PERSONAL (kiwiply.com) or ORG(orgId) (that organization's tenant host) | Decided by the host. Entitlements, resumes, inbox, billing and settings never cross worlds (ADR-018): structural, not a rule code has to enforce. |

## 2. Token claims and validation (ADR-004, X1.5, O4 — the contract the UI relies on)

```
access  { sub: login, uid, auth, exp(15m), jti, tid?: orgId, hid?: hostnameId, ext?: 1 }
refresh { sub, uid, fam, exp(90d), jti, tid?, hid? }
```
`tid` is present if and only if the account is an enterprise account (`user.org_id != null`, `tid == org_id`,
set from the user row at issue time; the host is then checked against it). A personal token never has `tid`.
`ext=1` marks an extension token (19 §6.3).

| Token | Context | Route class | Result |
|---|---|---|---|
| has `tid` | TENANT, `tid == orgId` | any | allowed (membership + permissions still checked) |
| has `tid` | TENANT, `tid != orgId` | any | `401 TOKEN_TENANT_MISMATCH`, cookies cleared by the BFF, login page |
| has `tid` | PLATFORM (kiwiply.com) | any, except extension routes when `ext=1` | `401 TOKEN_WRONG_WORLD` (an enterprise session does not exist on kiwiply.com) |
| no `tid` | TENANT | any | `401 TOKEN_WRONG_WORLD`, the web treats it as signed-out on this host (a personal session is not valid on a tenant host) |
| has `hid` | any | any | the hostname must be ACTIVE (`HostnameStatusCache`), else `401 TOKEN_HOST_REVOKED` (10 §6) |
| extension token (`/api/extension/session`) | — | — | `ext=1`; personal accounts get no `tid`, enterprise accounts get theirs. The extension holds **one** account at a time (19 §6); there is no `X-Kiwiply-Workspace` switch (superseded). |

Refresh keeps `tid/hid`; `proxy.ts` refresh runs with the host header so the API re-resolves the
tenant and refuses a refresh whose `tid` does not match the host or the account's `org_id` (401 → cookies dropped).
`revokeAllForUser` revokes one account only: changing the password of one account never signs out the other.

## 3. `GET /api/me/tenant` — the one call the tenant shell makes (X2.2)

Tenant-host only (PLATFORM → 404). Requires a `tid` token for the resolved tenant.
```
{
  "org": { "id", "displayName", "status", "type", "primaryHost", "terminology": {...} },
  "member": { "id", "status", "title", "departmentGroupId", "teamGroupId", "managerMemberId", "joinedAt" },
  "roles": [ { "id", "key", "name", "isPrimary", "workspaceKey" } ],
  "permissions": { "members.invite": "ORG", "resumes.view_for": "ASSIGNED", ... },
  "modules": { "domains": true, "roles": true, "billing": false, "marketing": false, "hrFinance": false,
               "extensionWorkspaces": false, "integrations": false, "analytics": false },
  "workspaces": [ { "key": "admin", "label": "Administration", "home": "/w/admin" }, { "key": "marketing", ... } ],
  "landing": "/w/admin",
  "consent": { "scope": "SUMMARY", "fullTo": null },
  "features": { "licensed": [], "pending": true }   // see below
}
```
- `modules` (09 row 2): exactly these eight booleans, each = the org is in the `flag.enterprise.<module>`
  allow-list **∧** `ModuleGate.isOn(orgId, moduleKey)` (20 §6) where a module product exists
  (`marketing` ↔ `module.talent_marketing`); `extensionWorkspaces`, `integrations`, `analytics` read
  `flag.enterprise.extension_workspaces` / `flag.enterprise.integrations` / `flag.enterprise.analytics` only.
- `features` (09 row 2): `{ licensed: [featureKey…], pending: boolean }`. Until X5.6 lands the API returns
  `pending = true, licensed = []`; from X5.6 on, `licensed` = `EntitlementService.entitlementsOf(member)`
  for CONSULTANT members (other members: `[]`, `pending = false`). The shell never gates on `features`
  alone — the API is the gate (16 §2.4).
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
2. API `/api/authenticate` in TENANT context: the credentials are looked up **inside that organization's
   enterprise accounts only** (`findOneByOrgIdAndEmailIgnoreCase`, or by login when `user.org_id == tid`).
   A credential that belongs to the other world (a personal account with the same email) is
   indistinguishable from an unknown user: same refusal, same timing, so nothing reveals whether an email has a
   personal account (R7). Then the account's membership: ACTIVE → tokens with `tid/hid`; SUSPENDED / disabled
   (offboarded) → `403` with the "Your access is paused" panel (the person just proved the password, so the
   honest message is shown); INVITED → `403 NOT_A_MEMBER {pending: true}`. Every refusal: audit
   `LOGIN_DENIED_NOT_MEMBER` in the org's log with `hostname_id`, no cookies. A temporary password forces the
   change-password screen first (`pcr`; temporary passwords exist only on enterprise accounts).
3. MFA (11 §3.4) when required.
4. BFF sets cookies and answers `{ ok: true, landing }` (the landing comes from the API's
   `/api/me/tenant` the BFF calls right after login, so the page lands in one hop).
5. Google (`POST /api/auth/google`): same rule (the Google identity must match an enterprise account of this
   organization); available only when the tenant DTO says `login.google = true` (org opted in **and** the
   platform admin registered the origin — E14; the platform-admin hostname detail (X1.11) gets a "Google origin
   registered" checkbox, X3.7).
6. Password reset initiated on a tenant host resets **only the enterprise account of that organization**
   (`requestPasswordReset(scope, mail)`; the scope comes from the host) and answers the same body whether or not
   the account exists. The link is built with `TenantUrls.base(org)` (X2.10) so the person returns to the
   branded host; the mail takes the tenant's display name and logo (`MailBranding`) and uses the Enterprise theme.
   `/api/register` (self sign-up) is refused on a tenant host: enterprise accounts come only from admin creation
   or an invitation. Admin-created accounts stay activated without verification; an invitation proves the address
   by token possession.

## 5. Invite acceptance on a tenant host (X1.8 API + X2.6 web)

```
email link  https://careers.acme.com/join/t/{token}
   │
   ▼
GET /join/t/{token}  (tenant tree, branded)  →  BFF GET /api/join/{token} (public preview: org name, logo, invited-as roles, what the org will see)
   │
   ├─ signed in on this host (tid = acme), email matches ───────────────────► consent screen (SUMMARY recommended / NONE; FULL later via pairing)
   │                                                                              │  POST /api/join/{token}/accept {shareScope}
   ├─ signed in on this host, different email than the invite ──► "This invitation is for a different email" (E7, 409 INVITE_EMAIL_MISMATCH)
   │                                                                      [Sign out and use the invited address]  — no accept
   │
   └─ signed out (the normal case) ──────────────────────────────────────────► "Create your account" card: the invited email (read-only) + a new
                                                                   password for THIS organization. The invite never mentions a personal account,
                                                                   and the same email may have one elsewhere: the two are not connected.
                                                                   (tenant hosts allow account creation ONLY from a valid invite token: the BFF
                                                                   checks the token before rendering) → consent → accepted
   ▼
"You're in" screen (mascot celebrate) → [Go to my workspace] → /w/{landing}
```
- Accepting **creates the enterprise account** (`org_id` = this organization) with the chosen password and
  its membership in one step, and returns a fresh `tid` token pair. There is no login without a membership
  and no `tid`-less token on a tenant host at any time (the old invite-token login, `X-Kiwiply-Invite` and
  `LOGIN_FOR_INVITE`, is removed). If an enterprise account for this email already exists in this organization
  (a returning member), the page shows the sign-in card instead and acceptance needs the signed-in session.
- Join by code (`/join/{slug}/{code}`) works on tenant hosts only for the tenant's own slug and creates an
  enterprise account the same way; codes grant CONSULTANT/MEMBER-level roles only (branch B rule kept).
- On kiwiply.com the same pages exist (platform tree) **only for `SHARED` (legacy) organizations**, whose
  members are personal accounts, and for invites sent before a tenant host was live.

## 6. A person who already has a personal Kiwiply account (scenario E, requirements §22)
Superseded as "joining" (O4): nothing joins. The person keeps their personal account exactly as it is and
**also** gets a separate enterprise account for the organization.
1. Anika has a personal Kiwiply account (maybe Pro). Acme invites `anika@…` with role CONSULTANT. The invite is
   the same invite as for anyone: it does not mention her personal account.
2. She opens the link on `careers.acme.com`, creates a new password for Acme (§5), chooses the consent scope,
   accepts. A new enterprise account and an ACTIVE `org_member` are written; `data_share` row written. Her
   personal account, `subscription`, `resume`, `application` and `inbox_connection` rows are **not read or
   changed** (`PersonalSubscriptionUnchangedIT`).
3. On `careers.acme.com` she signs in with the Acme password and sees only Acme's consultant workspace (16 §5).
   Her personal dashboard, resumes and board stay on `kiwiply.com` under her personal login; her personal Pro
   applies there only. Inside Acme, features come from Acme's licenses (Phase 5), and Acme's resumes, inbox and
   settings exist only in the enterprise account. The "My Available Features" page says "Provided by Acme" per
   feature and never mentions a personal plan.
4. Acme's resumes are visible to the organization only through `org_resume` links the consultant or a marketer
   creates with consent (ADR-009); the career profile is read through `data_share` scope (ADR-006).
5. Leaving / offboarding: an organization action (`OrgOffboardingService`) sets the membership to LEFT and
   **disables the enterprise account** (login refused), removes the links, purges the inbox connection and revokes
   that account's refresh tokens (filtered by `tid`). Erasure of the enterprise account is an organization action
   (19 §3.8). The personal account is untouched and is never reachable from the enterprise side.
6. The **extension** connects with one account at a time: personal (on kiwiply.com) or enterprise (on the
   organization's host). To switch, the person connects the other; nothing is shared between the two (19 §6).

## 7. Basic profile per enterprise account
The basic profile (13) belongs to the account. A person with a personal account and an enterprise account has
**two profiles**; neither is copied from or synced to the other. On a tenant host the avatar menu shows the
enterprise account's profile and the **membership card** ("Acme · Marketing Specialist · joined Oct 2026").
Editing the name on Acme's host changes only the enterprise profile; the profile page says so once ("This profile
belongs to your {org} account and is not shared with any other Kiwiply account").

## 8. Sign-out and session management
- `POST /api/auth/logout` (BFF) → API `/api/logout` revokes the refresh family; cookies deleted
  for this host only. The avatar menu's "Sign out" never signs out other hosts; "Sign out
  everywhere" (`/me/security`, X2.7) calls `POST /api/account/sessions/revoke-all`
  (`RefreshTokenService.revokeAllForUser`) for **this account only**; it never touches the person's account in
  the other world. The extension drops its session only when it holds this account (the existing `signedOut`
  signal on the host that account belongs to).
- Session list (X2.7): `GET /api/account/sessions` → this account's refresh families with `created_at`,
  `last_used_at`, user agent family; "Revoke" per row. Every row belongs to the same account, so there is no
  "Acme workspace / Personal" distinction. Additive columns `refresh_token.org_id`, `user_agent` (80 chars),
  `last_used_at`.

## 9. SSO and the future (not built now)
SAML/OIDC per org with JIT membership → X12.4. It plugs into §4 step 2 (identity comes from the
IdP; the membership rule is unchanged). Central cross-host SSO (one login for all hosts) is **not**
planned: one session per host is explicit and acceptable (ADR-004).


## 10. Tests that pin this doc
`HostMismatchIT` (X1.9), `AuthenticateControllerIT` tenant cases (X1.5), `JoinResourceIT` tenant
cases (X1.8: account creation on accept, no `tid`-less token), `TenantLoginFlowIT` (X2.6: pending/suspended
refusals, a personal credential refused on a tenant host with the generic error, cookies set on accept),
`MeTenantResourceIT` (X2.2: workspaces ∩ permissions ∩ modules, ETag), `PersonalSubscriptionUnchangedIT` (X5.9:
a person with a personal account and an enterprise account for the same email; the personal rows are identical
before and after), Playwright `tenant-login.spec.ts` (every state in 11 §3.2 at 390 and 1440),
`tenant-join.spec.ts` (§5 branches over the mock).
