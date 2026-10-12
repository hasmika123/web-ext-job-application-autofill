# Organization / tenant model — the foundation (area `org`, stories O1.*)

> Status: design, 2026-10-11. Everything the other org docs (billing, consent, services, marketer,
> ops, analytics) sits on. Implementers: read this first, then the doc your story names.
> Locked inputs: `CLAUDE.md` → Expansion; `ROADMAP.md` Phase 21.0–21.4, 22.1, 23 (roles), "Coach later".

## 1. Decisions (not options)

1. **An organization is a tenant that *buys* for people; it never *owns* their data.** A member's
   resumes, applications, answers and inbox stay rows under their `jhi_user` exactly as today
   (`resume.user_id`, `application.user_id`, …). The org gets a *view* through `data_share`
   (see `consent-data-sharing.md`), never a copy and never a foreign key from member data to the org.
   Leaving the org therefore deletes nothing — it only ends grants and the view.
2. **Every org API lives under `/api/orgs/{orgId}/...`.** The org id is in the path, never in a
   header or body, so caching, logging, tests and the audit trail all see it. The web proxies
   `/org/*` pages to these routes server-side as it does for `/api/account` today
   (`web/src/app/(org)/layout.tsx` → `serverApiFetch`).
3. **Membership is the only key.** `OrgAccessService.require(orgId, permission)` resolves the
   current principal's `org_member` row for that org and checks the role's permission set. No
   `ROLE_*` Spring authority is added for orgs (`AuthoritiesConstants` stays `ROLE_USER`/`ROLE_ADMIN`);
   platform admins (`ROLE_ADMIN`) reach org data only through the admin console with an audited
   reason, never through `/api/orgs/*`.
4. **Cross-tenant reads answer 404, not 403.** A row id from another org must look like it does not
   exist. Every repository method used by an org endpoint takes `orgId` as its first parameter
   (`findByIdAndOrganizationId`); there is no `findById` on org-scoped repositories.
5. **Roles are a fixed enum with a fixed permission matrix (section 4)**, not custom roles. The
   sample page's "Super Admin / Hiring Manager / Recruiter / Viewer" and "Approval Rules" are not
   built. Custom roles are a Phase 8 (enterprise) item if a school deal needs them.
6. **An org cannot exist without an OWNER and cannot be ACTIVE without the setup fee paid**
   (`billing.md` §2). Before that it is `DRAFT`: configurable, up to 3 admins invited, no member
   seats.
7. **Soft lifecycle, hard privacy.** Orgs are never hard-deleted (`CLOSED` keeps billing history
   for 7 years, see `docs/TIMESHEETS-DESIGN.md` §12 for the retention rule that also covers invoices).
   Members *are* hard-deletable via the existing `DELETE /api/account`
   (`AccountDeletionResource`): their `org_member` row is anonymised (section 6).
8. **Audit everything an org actor does to a person.** `org_audit_event` mirrors
   `AdminAuditEvent` (append-only, keyed by login strings so it survives erasure).
9. **SSO-ready, not SSO-built.** `org_domain` (verified email domains) ships now and powers
   domain auto-join for universities; SAML/OIDC (`org_sso_config`) is Phase 8.1 and only when a
   school deal needs it.
10. **The Coach hook stays a hook:** `organization.type = COACH` and `org_member.role = COACH` are
    reserved enum values that validation rejects until a flag enables them. No table, no code path.

## 2. Data model (MySQL 8, additive Liquibase: `2026101101xxxx_org_*.xml`)

Conventions: `BIGINT` ids (IDENTITY), `utf8mb4`, `created_at`/`updated_at` `DATETIME(6)` UTC,
status columns `VARCHAR(20)` holding enum names (as `Subscription.status` and `InboxConnection`
do), JSON columns only for settings bags. Money is never here — see `billing.md`.

### 2.1 `organization`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| slug | VARCHAR(60) UNIQUE | URL-safe, chosen at creation, editable once by OWNER; used in invite links `kiwiply.com/join/{slug}/{code}` |
| name | VARCHAR(120) NOT NULL | |
| type | VARCHAR(20) NOT NULL | `COMPANY` `SCHOOL` `BOOTCAMP` `OUTPLACEMENT` `CONSULTANCY` (`COACH` reserved, rejected) |
| status | VARCHAR(20) NOT NULL | `DRAFT` `PENDING_SETUP_FEE` `ACTIVE` `PAST_DUE` `SUSPENDED` `CLOSED` (state machine §3) |
| stripe_customer_id | VARCHAR(64) UNIQUE NULL | created at setup-fee checkout; Stripe customer metadata `kiwiply_scope=org`, `org_id` |
| setup_fee_paid_at | DATETIME(6) NULL | written only by the webhook (`billing.md` §2) |
| billing_email | VARCHAR(254) NULL | invoices go here; defaults to the OWNER's email |
| logo_key | VARCHAR(255) NULL | S3 key under `org/{id}/logo`; ≤2 MB, PNG/JPG/SVG sanitised |
| website | VARCHAR(255) NULL | |
| size_band | VARCHAR(20) NULL | `1_50` `51_200` `201_500` `501_1000` `1001_PLUS` (sales data only) |
| country | CHAR(2) NULL | ISO; drives Stripe Tax |
| timezone | VARCHAR(50) NOT NULL DEFAULT 'UTC' | digests, quiet hours, week boundaries for timesheets |
| settings_json | JSON NULL | `{defaultRole, defaultShareScope, allowSelfLeave, digestDay, quietHours, showPayToConsultant}` — validated by `OrgSettings` record, never free-form |
| created_by_user_id | BIGINT FK jhi_user | |
| created_at / updated_at / closed_at | DATETIME(6) | |

Indexes: `uk_org_slug`, `uk_org_stripe_customer`, `ix_org_status`.

### 2.2 `org_member`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | BIGINT FK organization NOT NULL | |
| user_id | BIGINT FK jhi_user NULL | NULL while `INVITED`; set on accept; set NULL again on account erasure (§6) |
| role | VARCHAR(20) NOT NULL | `OWNER` `ADMIN` `STAFF` `MEMBER`; Phase 22 adds `MARKETER`; Phase 23 adds `FINANCE`; `COACH` reserved |
| status | VARCHAR(20) NOT NULL | `INVITED` `ACTIVE` `SUSPENDED` `LEFT` `REMOVED` `ERASED` |
| invite_email | VARCHAR(254) NULL | lower-cased; required while `INVITED` |
| invite_token_hash | CHAR(64) UNIQUE NULL | SHA-256 of the one-time token; token itself only in the email/link |
| invite_expires_at | DATETIME(6) NULL | 14 days; re-send rotates the token |
| invited_by_member_id | BIGINT FK org_member NULL | |
| display_label | VARCHAR(80) NULL | "Cohort 2026-B", "Engineering" — free text shown to staff |
| group_id | BIGINT FK org_group NULL | department / cohort |
| support_owner_member_id | BIGINT FK org_member NULL | the STAFF member who looks after this person (the board's "Support Owner") |
| joined_at / left_at | DATETIME(6) NULL | |
| active_key | VARCHAR(300) GENERATED ALWAYS AS (IF(status IN ('INVITED','ACTIVE','SUSPENDED'), CONCAT(org_id,':',invite_email), NULL)) STORED | **unique** — one live row per email per org; NULLs don't collide |
| active_user_key | VARCHAR(60) GENERATED ALWAYS AS (IF(status IN ('ACTIVE','SUSPENDED') AND user_id IS NOT NULL, CONCAT(org_id,':',user_id), NULL)) STORED | **unique** — one live membership per user per org |
| created_at / updated_at | | |

Indexes: `uk_member_active_key`, `uk_member_active_user_key`, `ix_member_org_status`,
`ix_member_user` (user_id), `ix_member_support_owner`.
A user may belong to several orgs (a bootcamp *and* a consultancy); the web shell shows an org
switcher when `count > 1` (`OrgChip` becomes real).

### 2.3 `org_group`
`id, org_id, name VARCHAR(80), kind VARCHAR(20) (DEPARTMENT|COHORT|TEAM), sort_order INT, created_at`,
unique `(org_id, name)`. Powers the "Departments" donut and the analytics group filter.

### 2.4 `org_invite_batch`
`id, org_id, created_by_member_id, source VARCHAR(20) (CSV|PASTE|LINK), file_name, row_count,
invalid_count, accepted_count, created_at`. One row per CSV/paste import so admins see
"38 of 60 joined" on the onboarding checklist. Invalid rows are returned in the response, never stored.

### 2.5 `org_join_code`
`id, org_id, code CHAR(8) UNIQUE (Crockford base32, e.g. KIWI7F3A), role VARCHAR(20) (MEMBER only),
group_id NULL, max_uses INT NULL, uses INT, expires_at, created_by_member_id, revoked_at`.
The shareable link/QR for a cohort kickoff (`onboarding-invites.md` §3). A code creates an
`org_member` on redemption; the admin can cap uses and revoke.

### 2.6 `org_domain`
`id, org_id, domain VARCHAR(253), verification_token CHAR(32), verified_at NULL, auto_join BOOLEAN
DEFAULT false, auto_join_group_id NULL, created_at`, unique `(domain)` — a domain belongs to one
org. Verified by a DNS TXT record `_kiwiply-verify.{domain}` or by an email to
`postmaster@`/`admin@`. With `auto_join`, a signed-in user whose **verified** email ends in the
domain sees "Join {org}" and joins as MEMBER with the consent screen (no invite needed).
SSO (Phase 8.1) will hang `org_sso_config` off this table.

### 2.7 `org_audit_event`
Same shape as `admin_audit_event` plus `org_id`:
`id, org_id, actor_login VARCHAR(50), actor_role VARCHAR(20), action VARCHAR(100), target_type
VARCHAR(50), target_login VARCHAR(50) NULL, target_id VARCHAR(191) NULL, details VARCHAR(2000),
ip_hash CHAR(64) NULL, created_at`. Index `(org_id, created_at)`. Append-only (no update/delete
paths in the repository; a DB trigger is not used — tests assert the repository has no delete).
Action keys live in `OrgAuditService` constants: `ORG_CREATE`, `ORG_SETTINGS`, `MEMBER_INVITE`,
`MEMBER_INVITE_RESEND`, `MEMBER_ROLE`, `MEMBER_SUSPEND`, `MEMBER_REMOVE`, `MEMBER_LEFT`,
`MEMBER_ERASED`, `ASSIGNMENT_CREATE`, `ASSIGNMENT_END`, `SHARE_READ_FULL`, `SHARE_SCOPE_CHANGED`,
`EXPORT`, `BILLING_*`, `MARKETER_*`, `OPS_*`.

### 2.8 Everything else is in its own doc
`org_assignment`, `org_subscription*`, `org_invoice` → `billing.md`; `data_share*` →
`consent-data-sharing.md`; `marketer_assignment`, `job_assignment` → `marketer-workspace.md`;
`ops_*` → `docs/TIMESHEETS-DESIGN.md` §5 (product area H); `org_metric_daily` → `analytics.md`; `org_webhook`, `org_api_key`
→ `integrations.md`.

## 3. Organization state machine

```
 DRAFT ──(owner starts setup-fee checkout)──► PENDING_SETUP_FEE ──(invoice.paid / checkout.session.completed)──► ACTIVE
   │                                               │ (payment abandoned 14 d)                                     │
   └──────────────────────────◄────────────────────┘                                      invoice.payment_failed  │
                                                                                                                  ▼
                               grants end at period end ◄── SUSPENDED ◄──(subscription unpaid/canceled)── PAST_DUE
                                                              │  ▲                                           │
                                               (pays)         ▼  │                                 (invoice.paid)
                                                            ACTIVE ◄─────────────────────────────────────────┘
 any state ──(OWNER closes, or admin console)──► CLOSED   (grants end now; members keep accounts; billing history kept)
```
Only `BillingWebhookService` (extended, `billing.md` §5) moves `PENDING_SETUP_FEE → ACTIVE`,
`ACTIVE ↔ PAST_DUE`, `→ SUSPENDED`. `OrgService` moves `DRAFT → PENDING_SETUP_FEE`, `→ CLOSED`.
What each state allows:

| state | configure | invite admins | invite members / assign items | members use grants |
|---|---|---|---|---|
| DRAFT, PENDING_SETUP_FEE | yes | up to 3 | **no** | — |
| ACTIVE | yes | yes | yes | yes |
| PAST_DUE | yes | yes | yes (warned) | yes, until `current_period_end` |
| SUSPENDED | read-only billing | no | no | no (grants ended) |
| CLOSED | read-only | no | no | no |

## 4. Roles and permissions matrix

| permission key | OWNER | ADMIN | STAFF | MEMBER | MARKETER (22) | FINANCE (23) |
|---|---|---|---|---|---|---|
| `org.settings.manage` (profile, domains, defaults) | ✓ | ✓ | | | | |
| `org.close`, `org.transfer_ownership` | ✓ | | | | | |
| `members.invite`, `members.import` | ✓ | ✓ | ✓ (MEMBER only) | | | |
| `members.role.set` | ✓ | ✓ (not OWNER/ADMIN↔) | | | | |
| `members.remove`, `members.suspend` | ✓ | ✓ | | | | |
| `members.support_owner.set`, `groups.manage` | ✓ | ✓ | | | | |
| `assignments.manage` (give/take items) | ✓ | ✓ | | | | |
| `billing.view` | ✓ | ✓ | | | | ✓ |
| `billing.manage` (card, billing email, tax id) | ✓ | ✓ | | | | ✓ |
| `reports.view` (org-level, consent-scoped) | ✓ | ✓ | ✓ (own members) | | ✓ (own consultants) | ✓ |
| `reports.export` | ✓ | ✓ | | | | ✓ |
| `member.view_summary` (per person, scope ≥ SUMMARY) | ✓ | ✓ | ✓ (own members) | | ✓ (own consultants) | |
| `member.view_full` (scope FULL **and** paired) | | | | | ✓ (paired) | |
| `member.act_for` (create resumes / job bank for) | | | | | ✓ (paired) | |
| `services.order_for_member` | ✓ | ✓ | | | | |
| `audit.view` | ✓ | ✓ | | | | ✓ (billing/ops rows) |
| `integrations.manage` | ✓ | ✓ | | | | |
| `ops.*` (timesheets approve, finances) | ✓ | ✓ | | own hours | | ✓ |
| `self.share_scope.set`, `self.leave` | ✓* | ✓ | ✓ | ✓ | ✓ | ✓ |

`*` an OWNER must transfer ownership before leaving; the last ADMIN cannot be demoted.
There is **no** permission anywhere that submits an application, ticks an attestation box, signs
in as a member, reads a member's answers cache or inbox. These are not "denied"; they do not exist
as endpoints (`marketer-workspace.md` §6).

Implementation: `enum OrgRole { OWNER, ADMIN, STAFF, MEMBER, MARKETER, FINANCE, COACH }` with
`Set<OrgPermission> permissions()`; `OrgAccessService.require(orgId, OrgPermission)` →
`OrgMembership` (member row + role) or throws 404 (`OrgNotFoundException`, message never says
"forbidden"). STAFF's "own members" = rows whose `support_owner_member_id` is theirs. Controllers
call it on the first line; a `@WebMvcTest` asserts every `/api/orgs/**` handler does (reflection
over `OrgResource*` classes, failing on any method without `@OrgPermissionRequired`).

## 5. API shapes (v1)

```
POST   /api/orgs                              create DRAFT org {name, type, slug?, sizeBand?, country?} → caller becomes OWNER
GET    /api/orgs/mine                         [{orgId, slug, name, role, status, memberCount}]  (drives OrgChip / switcher)
GET    /api/orgs/{orgId}                      org summary + my role + permissions[] (the web gates UI on this list)
PATCH  /api/orgs/{orgId}                      settings (OWNER/ADMIN)
POST   /api/orgs/{orgId}/close                OWNER
GET    /api/orgs/{orgId}/members?status&role&groupId&q&page   consent-scoped rows (see consent doc §4 for the DTO)
POST   /api/orgs/{orgId}/members/invite       {emails[], role, groupId?, supportOwnerMemberId?} → {invited[], invalid[], alreadyMember[]}
POST   /api/orgs/{orgId}/members/import       multipart CSV (email, name?, group?, supportOwnerEmail?) ≤ 2,000 rows → org_invite_batch
POST   /api/orgs/{orgId}/members/{id}/resend  rotates token
PATCH  /api/orgs/{orgId}/members/{id}         {role?, groupId?, supportOwnerMemberId?, displayLabel?, status: SUSPENDED|ACTIVE}
DELETE /api/orgs/{orgId}/members/{id}         REMOVED (ends assignments at period end; see billing)
POST   /api/orgs/{orgId}/leave                self → LEFT
GET    /api/orgs/{orgId}/groups  POST/PATCH/DELETE
POST   /api/orgs/{orgId}/join-codes  GET  DELETE(revoke)
GET    /api/orgs/{orgId}/domains POST (starts verification) POST /{id}/verify DELETE
GET    /api/orgs/{orgId}/audit?from&to&action&page   (OWNER/ADMIN/FINANCE)
--- public / member side ---
GET    /api/join/{token}                      invite preview {orgName, logo, role, inviterName, consentDefaults} (no auth)
POST   /api/join/{token}/accept               auth required; body {shareScope} → creates/activates membership + data_share
POST   /api/join/code/{code}                  auth; same body
GET    /api/me/orgs                           memberships + what each org can see (the "Your organizations" page)
```
Errors: 404 for anything not in the caller's org; 409 `ALREADY_MEMBER`, `INVITE_EXPIRED`,
`SEAT_STATE` (org not ACTIVE); 422 for CSV problems with row numbers.

## 6. Account erasure and departures

- `DELETE /api/account` (existing `AccountDeletionService`) additionally: ends every active
  `org_assignment` of the user now (webhook-free local write + Stripe quantity decrement, see
  billing §4), sets `org_member.user_id = NULL, status = ERASED, invite_email = NULL,
  display_label = NULL`, deletes `data_share` rows, and writes `MEMBER_ERASED` to `org_audit_event`
  with `target_login` = the login (which survives as a string, like `AdminAuditEvent`). Aggregate
  metrics already rolled up (`org_metric_daily`) keep their counts; nothing identifies the person.
- If the erased user is the sole OWNER, the org moves to `SUSPENDED` with a notice to the platform
  admin queue (`SalesInquiry`-style row, admin area) — an org with no owner cannot stay ACTIVE and
  billable.
- `LEFT`/`REMOVED` keep `user_id` (so re-invite is recognised) but drop `support_owner_member_id`
  and end `data_share` (scope → NONE, event logged).

## 7. Multi-tenancy enforcement — test strategy (21.0 is a gate)

1. `OrgIsolationIT` (Testcontainers MySQL): seeds org A (owner a1, member a2) and org B (owner
   b1, member b2); for **every** `/api/orgs/{orgId}/**` route discovered via
   `RequestMappingHandlerMapping`, calls it as `b1` with org A's id and each of org A's row ids → asserts
   404 and that no `org_audit_event` for org A has actor `b1`. New routes fail the test until they
   pass (the route list is discovered, not hand-written).
2. `OrgPermissionMatrixTest`: table-driven over §4; every (role, permission) cell.
3. `OrgRepositoryContractTest`: reflection asserts every repository in `repository.org.*` has no
   method without an `orgId`/`organizationId` parameter except `findMine(userId)`.
4. Web: `(org)/layout.tsx` gate test — a signed-in user with zero memberships is redirected to
   `/org/new`; a MEMBER-only user is redirected to `/dashboard` with a toast; admins render.
5. Audit: every mutating `OrgResource` test asserts one `org_audit_event` row.

## 8. Web shell changes (replacing the sample gate)

- `(org)/layout.tsx`: after the `/api/account` probe, call `/api/orgs/mine`. No orgs → `/org/new`
  (onboarding). One org → render. Several → remember the last one in a cookie `kiwiply_org`,
  switcher in `OrgChip`. MEMBER role → `/dashboard` (members never see the admin shell; their org
  surface is `/settings/organizations` in the user app, see consent doc §5).
- `OrgShell` nav is **role-aware** from `permissions[]`: STAFF sees Dashboard, Team (own), Applications
  (own, summary), Interviews, Resumes; FINANCE sees Dashboard, Billing, Ops; MARKETER gets the
  marketer workspace nav (`marketer-workspace.md` §4).
- Mobile (390 px): the sidebar becomes a bottom tab bar with 5 items (Home, Team, Reports, Billing,
  More), 56 px tall, 44 px+ targets; page heroes collapse to a 72 px band; tables become cards.
  Wireframe:

```
┌──────────────────────────────┐
│ ◉ Acme Bootcamp   🔔  ☰      │  top bar 56px (org chip tap → switcher sheet)
├──────────────────────────────┤
│ Hi Priya 👋  ·  Cohort 26-B  │
│ ┌────────┐ ┌────────┐        │
│ │ 38/60  │ │ 124    │  stat  │
│ │ joined │ │ applied│  tiles │
│ └────────┘ └────────┘        │
│ Activation checklist  ▸ 4/6  │
│ ┌──────────────────────────┐ │
│ │ ✓ Setup fee paid         │ │
│ │ ✓ 3 admins               │ │
│ │ ◻ 60 invites · 38 joined │ │
│ │ ◻ Assign plans (12 left) │ │
│ └──────────────────────────┘ │
│ Needs attention (3)   ▸      │
├──────────────────────────────┤
│  ⌂     👥     📊     💳    ⋯  │  bottom tabs 56px
└──────────────────────────────┘
```

## 9. Rollout / migration

- Changelog files: `20261011010000_org_core.xml` (organization, org_member, org_group,
  org_invite_batch, org_join_code, org_domain, org_audit_event). No data migration: there are no
  orgs today (the `/org` pages are sample data, `web/src/components/org-v2/sample-data.ts`).
- Feature flag `dossier.orgs.enabled=false` in prod until O1–O4 are green; with the flag off,
  `/api/orgs/**` returns 404 and `/org/*` keeps the current `noindex` and redirects to `/dashboard`.
- Demo accounts (`DemoAccountService`, `isDemoLogin`) get a seeded demo org `demo-bootcamp` with
  12 synthetic members so the sales demo keeps working **and** is labelled "Demo data" by the
  existing `DemoBadge`. The sample data file is deleted when the last page is wired (O5/O7/O8).
