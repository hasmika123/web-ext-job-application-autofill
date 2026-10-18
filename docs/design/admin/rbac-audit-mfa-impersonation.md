# Admin RBAC, audit, MFA and support access ("view as")

Area `admin` (prefix `A`). Implementers: follow this, don't re-decide it. Stories: A0.*, A12.*, A1.5.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Staff roles are authorities, not a new permission engine.** Add `ROLE_SUPPORT`, `ROLE_FINANCE`, `ROLE_OPS`, `ROLE_EXPERT_MANAGER`; `ROLE_ADMIN` stays the super-admin. A staff member holds one or more. | Spring's `hasAnyAuthority` + JHipster's `jhi_authority`/`jhi_user_authority` already exist (`AuthoritiesConstants`, `SecurityConfiguration`). A permission matrix table would be a second truth. |
| D2 | **Permissions are a static map in code** (`AdminPermissions.java`): `area -> {VIEW, ACT}` per role. Admin UI reads it via `GET /api/admin/me`. | ADMIN-PLAN 9.B rule: security logic stays in code. The "Permission matrix" tile on board-17 becomes a read-only render of this map, not an editor. |
| D3 | **MFA for every staff role is TOTP, mandatory, enrolled on first admin sign-in**; the existing email OTP (`AdminMfaService`) stays as the **recovery** path and as the bridge until enrolment. | Email OTP is phishable and depends on Brevo being up. TOTP needs no provider. The existing `admin_mfa_challenge` flow is reused for the recovery code. |
| D4 | **Admin sessions are short**: access token 15 min, refresh family idle timeout 8 h, absolute 24 h; **re-auth (fresh TOTP within 5 min) before HIGH-risk actions**. | Board-17 "Sessions"; ADMIN-PLAN "short sessions, re-auth for sensitive actions". |
| D5 | **No log-in-as, ever.** Support access = user-granted, 24 h, read-only "view as" under a banner, every page view audited with a reason. | ADMIN-PLAN 9.C decision 2026-10-05. |
| D6 | **Every admin mutation and every PII read writes `admin_audit_event` in the same transaction** (already true: `AdminAuditService.record` has no REQUIRES_NEW). Add `risk`, `ip`, `user_agent`, `area` columns additively. | Board-10 wants risk breakdown, IP/device, area filters. |
| D7 | **Break-glass** = a single env-provisioned `ROLE_ADMIN` account (`AdminBootstrap`) with TOTP enrolled offline, listed on the Security page, every use emails all admins. No new mechanism. | Simplicity; one documented emergency path. |
| D8 | **Access reviews** quarterly: Security page lists all staff with roles, last sign-in, MFA status; an admin ticks "reviewed", written to audit (`ACCESS_REVIEW`). | Board-10 "Access reviews" tile; GDPR Art. 32 evidence. |

## 2. Roles and permission map

```
Area           ADMIN  SUPPORT  FINANCE  OPS  EXPERT_MGR
overview       V      V        V        V    V
users          V/A    V/A*     V        -    -
customers      V/A    V        V/A      -    -
catalog        V/A    -        V/A      -    -
ai             V/A    V        V        V/A  -
job-sources    V/A    -        -        V/A  -
security       V/A    -        -        V    -
analytics      V      V        V        V    -
email          V/A    V        -        V    -
bug-reports    V/A    V/A      -        V/A  -
inquiries      V/A    V/A      V        -    -
services       V/A    V        V        -    V/A
organizations  V/A    V        V/A      -    -
system         V/A    -        -        V/A  -
audit          V      V(own)   V        V    V(own)
settings/flags V/A    -        -        V/A  -
```
`*` SUPPORT may: resend emails, change email (verified), force-logout, comp ≤ 30 days, clear rate-limit lock. SUPPORT may **not**: delete, grant roles, view PII contents without reason, export CSV.

Risk levels (stored on each audit row): `LOW` (reads, notes), `MEDIUM` (user status, triage, settings within bounds), `HIGH` (delete, role grant/revoke, exports, catalog publish, margin override, flag kill switch, break-glass use, support-access view). HIGH requires fresh re-auth (D4).

## 3. Data model (additive Liquibase)

```sql
-- new authorities (data changeset)
INSERT INTO jhi_authority(name) VALUES ('ROLE_SUPPORT'),('ROLE_FINANCE'),('ROLE_OPS'),('ROLE_EXPERT_MANAGER');

CREATE TABLE admin_totp (
  user_id        BIGINT PRIMARY KEY,                -- FK jhi_user.id ON DELETE CASCADE
  secret_enc     VARCHAR(255) NOT NULL,             -- AES-GCM with the existing inbox credential key (InboxCrypto)
  enrolled_at    DATETIME NOT NULL,
  last_used_step BIGINT,                            -- replay guard: a TOTP step is accepted once
  recovery_hash  VARCHAR(255)                       -- bcrypt of ONE 10-char recovery code; regenerated on use
);

ALTER TABLE admin_audit_event
  ADD COLUMN area        VARCHAR(30),               -- users|customers|catalog|...
  ADD COLUMN risk        VARCHAR(10),               -- LOW|MEDIUM|HIGH
  ADD COLUMN ip          VARCHAR(45),
  ADD COLUMN user_agent  VARCHAR(255),
  ADD COLUMN actor_roles VARCHAR(200);
CREATE INDEX idx_admin_audit_area_risk ON admin_audit_event(area, risk, created_date);
-- the table stays append-only: no UPDATE/DELETE path in code; a DB user grant later.

CREATE TABLE support_access_grant (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT NOT NULL,                   -- the job seeker granting access (FK, CASCADE)
  granted_at     DATETIME NOT NULL,
  expires_at     DATETIME NOT NULL,                 -- granted_at + 24h, fixed
  revoked_at     DATETIME,
  reason_user    VARCHAR(500),                      -- optional "what's wrong" from the user
  INDEX idx_support_access_user (user_id, expires_at)
);

CREATE TABLE admin_session_view (                   -- one row per page the admin viewed in view-as
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  grant_id       BIGINT NOT NULL,
  actor_login    VARCHAR(50) NOT NULL,
  route          VARCHAR(200) NOT NULL,
  viewed_at      DATETIME NOT NULL
);

CREATE TABLE access_review (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  reviewer_login VARCHAR(50) NOT NULL,
  reviewed_at    DATETIME NOT NULL,
  staff_count    INT NOT NULL,
  notes          VARCHAR(2000)
);
```
Existing, reused as-is: `admin_audit_event` (20260629000000), `admin_mfa_challenge` (20260629000400, email OTP), `refresh_token` (20260622120000, families + revoke via `RefreshTokenService`), `jhi_user_authority`.

## 4. API shapes

```
GET  /api/admin/me                      -> { login, roles[], permissions: {area: ["VIEW","ACT"]}, mfa: {totpEnrolled, reauthUntil} }
POST /api/admin/mfa/totp/enroll         -> { otpauthUri, secretMasked }       (step 1; not active until confirmed)
POST /api/admin/mfa/totp/confirm {code} -> { recoveryCode }                   (shown once)
POST /api/admin/mfa/totp/verify {code}  -> { reauthUntil }                    (also used for re-auth; sets a short-lived
                                                                              `amr=totp` claim or server-side flag)
POST /api/admin/mfa/recovery {code}     -> same as verify, burns the code, emails all admins
GET  /api/admin/staff                   -> [{login,email,roles,lastLogin,totpEnrolled,activeSessions}]
PUT  /api/admin/staff/{login}/roles     -> HIGH; body {roles[]}; cannot remove your own ROLE_ADMIN; audited
POST /api/admin/access-reviews          -> HIGH; {notes}
GET  /api/admin/sessions?login=         -> families (exists: AdminSessionResource) + admin filter
DELETE /api/admin/sessions/{familyId}   -> exists; audit SESSION_REVOKE
-- support access
POST /api/support-access   (USER)       -> grant 24h   {reason?}
DELETE /api/support-access (USER)       -> revoke
GET  /api/admin/users/{login}/support-access -> active grant or 404
GET  /api/admin/view-as/{login}/*        -> read-only proxies of the user's own GET endpoints
                                            (profile, resumes METADATA, applications, matches, settings)
                                            every call: requires active grant, X-Admin-Reason header,
                                            writes admin_session_view + audit USER_PII_VIEW (HIGH)
GET  /api/admin/audit?area=&risk=&actor=&action=&target=&from=&to=&q=   (extend AdminAuditResource)
GET  /api/admin/audit/export.csv        -> HIGH; itself audited (AUDIT_EXPORT)
```
Login flow change (`UserJWTController` / `AuthenticateController` + `AdminMfaService`): after password OK and `shouldChallenge`, if `admin_totp` exists → respond `{mfaRequired:"totp", mfaToken}`; else → existing email-OTP challenge and the web forces enrolment after sign-in (`/admin/security/enrol`, blocking every other admin route).

## 5. State machines

Support access grant: `NONE -> ACTIVE (user grants) -> EXPIRED (24h) | REVOKED (user) `. Admin reads allowed only in `ACTIVE`. A new grant while one is active extends nothing — it is refused (409) to keep the window honest.

Admin session: `PASSWORD_OK -> MFA_PENDING -> SIGNED_IN -> (REAUTH_FRESH for 5 min after a verify) -> EXPIRED/REVOKED`.

## 6. Failure modes

- Brevo down → TOTP unaffected; email-OTP recovery unavailable; break-glass account (D7) still works because its TOTP is enrolled.
- Lost authenticator → recovery code (one), then re-enrol; if both lost → another ADMIN resets TOTP (`DELETE /api/admin/staff/{login}/totp`, HIGH, audited) — never self-service.
- Clock skew → accept ±1 step (30 s).
- A staff member with no roles left after an edit → the edit is refused (400), never a silent lockout.
- View-as after the user revokes mid-session → next call 403 with `SUPPORT_ACCESS_ENDED`; the banner tells the admin.

## 7. Security and privacy analysis

- PII minimisation holds: view-as returns what the user's own endpoints return, **minus** raw resume files and inbox bodies (metadata only, as ADMIN-PLAN locks). Downloading a resume in view-as is impossible by construction (no proxy route).
- Audit immutability: no update/delete endpoints; CSV export of the audit log is itself a HIGH audit event.
- Privacy policy text to add (A9 story): "Kiwiply staff can see your account only when you grant 24-hour support access; every view is logged and you can revoke it any time."
- Role changes always email the affected staff member and all ROLE_ADMIN.
- TOTP secret encrypted with the same key path as inbox credentials (`dossier.inbox.crypto-key` or equivalent in `InboxCrypto`); rotating that key rotates both.

## 8. Test strategy

- Unit: `AdminPermissionsTest` (every area has a row for every role; SUPPORT never has ACT on `users.delete`), `TotpServiceTest` (RFC 6238 vectors, replay of the same step refused, ±1 step accepted).
- Web-layer IT: SUPPORT calling `DELETE /api/admin/users/x` → 403; ADMIN without fresh re-auth calling a HIGH action → 428 `REAUTH_REQUIRED`; view-as without grant → 403; audit row count +1 per mutation (assert in the same test as the action).
- Web: `tsc`/eslint + a Playwright-free render test that the sidebar hides areas the role can't VIEW and the enrolment wall blocks routes.

## 9. Rollout / migration

1. Ship authorities + `admin_totp` + audit columns (additive). Nothing changes for the existing single admin.
2. `dossier.admin.mfa-enabled=true` in prod (currently `false`, `AdminMfaService`), email OTP becomes the bridge.
3. Enrolment wall goes live; the user enrols the break-glass account offline and records the recovery code in the password manager (see CLAUDE.md "`.env` in a password manager").
4. Create the first SUPPORT user only after A0.3 tests are green.

## 10. Mobile wireframe (390px) — admin sign-in with TOTP and the view-as banner

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ kiwiply ADMIN                │   │ ▲ Viewing as liam.chen  23:14 │  <- sticky amber banner,
│                              │   │   read-only · reason logged ✕ │     ✕ ends the session
│  Enter your 6-digit code     │   ├──────────────────────────────┤
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │   │  Liam's dashboard (as he     │
│  │  ││  ││  ││  ││  ││  │    │   │  sees it, every control      │
│  └──┘└──┘└──┘└──┘└──┘└──┘    │   │  disabled)                   │
│  [ Verify ]  44px            │   │                              │
│  Use a recovery code →       │   │ [Board] [Resumes] [Matches]  │
│  Lost your phone? ask        │   │ bottom tabs, 44px            │
│  another admin to reset      │   └──────────────────────────────┘
└──────────────────────────────┘
```
Re-auth sheet (bottom sheet) appears over any HIGH action on phone: "Confirm with your authenticator" + the same 6 boxes.
