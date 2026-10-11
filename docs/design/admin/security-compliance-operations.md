# Security and compliance operations: sessions, abuse controls, privacy requests, retention, legal versions, subprocessors

Area `admin`. Stories: A9.*, plus A0.* (staff MFA/RBAC in the rbac doc). The `/admin/security` page is 100 % SAMPLE today (`SecurityPage.tsx`, nav says "Soon"). Existing building blocks: `refresh_token` families + `RefreshTokenService`/`AdminSessionResource`, `RateLimitFilter` (**off by default**, `RATE_LIMIT_ENABLED=false`, keys on a spoofable first `X-Forwarded-For`), `AccountDeletionService` (GDPR erase, self + admin), `AccountExportResource` (`GET /api/account/export`, self only), `InboxRetention` (365 d), `UserService.removeNotActivatedUsers` (daily), the Phase 15.2 legal review, DPAs with Brevo + AWS still open.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **A first-party `security_event` table** is the source for the Security page (board-17): login OK/failed (with method: password, google, mfa, refresh), MFA enrolled/verified/failed, password reset requested/completed, role change, session revoke, rate-limit hit, admin break-glass. Written from `AuthenticateController`, `GoogleAuthController`, the refresh path, `AdminMfaService`, `AdminUserActionService`. Identity data only (login or email-hash, ip, user-agent); no bodies. |
| D2 | **Fix the three auth gaps found in the audit before any new security UI**: (a) Google sign-in bypasses admin MFA (`GoogleAuthController` issues tokens directly) → route through `AdminMfaService.shouldChallenge`; (b) `/api/refresh` copies `authorities` from the old token → reload roles from DB on refresh, and `revoke-admin` revokes families; (c) rate limiting is off and keyed on a spoofable header → turn it on at the API too, key on the Caddy-provided `X-Real-IP`/last proxy hop, and add rules for `/api/authenticate/mfa`, `/api/auth/google`, `/api/refresh`, `/api/inquiries`, `/api/bug-reports`, `/api/newsletter/*`. |
| D3 | **Blocked IPs are temporary, automatic, and visible**: `ip_block` rows created by the limiter after N failed logins (default 20 in 15 min, runtime setting), expire after 1 h, admin can lift early or extend to 24 h. No permanent IP bans from the UI (shared NAT = collateral). |
| D4 | **Abuse controls on accounts**: `user_flag` (`SUSPECTED_BOT`, `DISPOSABLE_EMAIL`, `AUTOPILOT_CAP_DAILY`, `CHARGEBACK`, `MANUAL`) with a note; **block** = `activated=false` + sessions revoked + flag `BLOCKED` with reason (HIGH); a disposable-email domain blocklist (runtime setting `signup.disposable_domains`, seeded list) refuses signup with a plain message. |
| D5 | **Privacy requests become a queue**, not a button: `privacy_request` (`EXPORT|DELETE|RECTIFY|RESTRICT`, source `SELF|EMAIL|ADMIN`, deadline = received + 30 days GDPR / 45 days CCPA by region hint). Self-service export/delete still execute instantly *and* write a completed row, so the register is complete. Admin-initiated delete requires a ticket reference and a reason; identity verification note required for email-sourced requests. |
| D6 | **Retention is a table of policies that the retention job reads** (`retention_policy`: data class, days, basis, runtime-editable within bounds) and a report of what it purged (`retention_run`). Classes: inbox mail 365 d, job postings 7 d, ingest runs 90 d, security events 400 d, audit events **never** (legal hold, exportable), bug reports 365 d after RESOLVED, inquiries 730 d after LOST/WON, unactivated accounts 3 d (existing), AI ledger rows with `login=NULL` kept, `fill_event` 400 d, support-access views 400 d, mail_log 90 d. |
| D7 | **Legal versions**: `legal_document` (kind TERMS/PRIVACY/SERVICE_TERMS, version, effective_at, body_url, material BOOLEAN) + `legal_acceptance` (user, document, version, accepted_at, ip). A *material* new version prompts re-acceptance on next sign-in (web + extension drawer). Admin publishes a version; the web page reads the current one. |
| D8 | **Subprocessor list is data on the admin side and a public page** (`/legal/subprocessors`): AWS (S3, us-east), Brevo (SMTP), Stripe, Google (Gemini AI, Sign-in), Cloudflare DNS, the hosting provider, the licensed job aggregator when chosen. Each row: purpose, data categories, region, DPA status (date signed / OPEN). Admin edits; changes are HIGH and dated; the public page shows "last updated". |
| D9 | **Account-level privacy summary** on the user page: what we store for this user (classes + counts), where it is (DB / S3 / Stripe / Brevo), when it expires. Metadata only. |

## 2. Data model (additive)

```sql
CREATE TABLE security_event (id BIGINT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(40) NOT NULL, login VARCHAR(50), email_hash CHAR(64),
  ip VARCHAR(45), user_agent VARCHAR(255), method VARCHAR(20), severity VARCHAR(10) NOT NULL, details VARCHAR(500), created_at DATETIME NOT NULL,
  INDEX (created_at), INDEX (login, created_at), INDEX (kind, created_at), INDEX (ip, created_at));
CREATE TABLE ip_block (ip VARCHAR(45) PRIMARY KEY, reason VARCHAR(100), failed_attempts INT, blocked_at DATETIME, expires_at DATETIME, lifted_by VARCHAR(50), lifted_at DATETIME);
CREATE TABLE user_flag (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, kind VARCHAR(30) NOT NULL, note VARCHAR(500),
  set_by VARCHAR(50), set_at DATETIME NOT NULL, cleared_by VARCHAR(50), cleared_at DATETIME, INDEX (user_id), INDEX (kind, cleared_at));
CREATE TABLE privacy_request (id BIGINT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(10) NOT NULL, source VARCHAR(10) NOT NULL,
  user_id BIGINT, email VARCHAR(254), region VARCHAR(10), received_at DATETIME NOT NULL, due_at DATETIME NOT NULL,
  status VARCHAR(12) NOT NULL,                      -- RECEIVED|VERIFYING|IN_PROGRESS|COMPLETED|REJECTED
  verified_by VARCHAR(50), verified_note VARCHAR(500), completed_at DATETIME, completed_by VARCHAR(50), ticket_ref VARCHAR(100),
  export_object_key VARCHAR(300), export_expires_at DATETIME, INDEX (status, due_at));
CREATE TABLE retention_policy (data_class VARCHAR(40) PRIMARY KEY, days INT, min_days INT NOT NULL, max_days INT, basis VARCHAR(200), updated_by VARCHAR(50), updated_at DATETIME);
CREATE TABLE retention_run (id BIGINT AUTO_INCREMENT PRIMARY KEY, data_class VARCHAR(40), ran_at DATETIME, deleted_rows BIGINT, status VARCHAR(10), error VARCHAR(500));
CREATE TABLE legal_document (id BIGINT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(20) NOT NULL, version VARCHAR(20) NOT NULL, effective_at DATETIME NOT NULL,
  body_url VARCHAR(300) NOT NULL, summary VARCHAR(1000), material BOOLEAN NOT NULL, published_by VARCHAR(50), published_at DATETIME, UNIQUE (kind, version));
CREATE TABLE legal_acceptance (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, document_id BIGINT NOT NULL, accepted_at DATETIME NOT NULL, ip VARCHAR(45), surface VARCHAR(10), UNIQUE (user_id, document_id));
CREATE TABLE subprocessor (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), purpose VARCHAR(300), data_categories VARCHAR(300), region VARCHAR(60),
  dpa_status VARCHAR(20), dpa_signed_at DATE, url VARCHAR(300), active BOOLEAN, updated_by VARCHAR(50), updated_at DATETIME);
```

## 3. API

```
GET  /api/admin/security/overview            -> tiles {activeSessions (refresh families active), failedLogins24h, mfaAdoptionPct (staff with TOTP), blockedIps, openPrivacyRequests}
GET  /api/admin/security/events?kind=&login=&ip=&from=&to=&page=
GET  /api/admin/security/sessions?login=&page=  -> all active families (admin filter: staff only)
DELETE /api/admin/security/sessions/{familyId}  -> exists per user today; this is the global one; audited
GET  /api/admin/security/ip-blocks ; DELETE /{ip} (lift, MEDIUM) ; PUT /{ip} {extendHours} (HIGH)
POST /api/admin/users/{login}/flags {kind, note} ; DELETE /api/admin/users/{login}/flags/{id}
POST /api/admin/users/{login}/block {reason}   -> HIGH; deactivate + revoke + flag BLOCKED; emails admins
GET/POST /api/admin/privacy-requests ; PUT /{id} {status, verifiedNote, ticketRef} ; POST /{id}/execute  (EXPORT: runs AccountExportService for the user, stores to S3 with a 7-day presigned link emailed to the verified address; DELETE: AccountDeletionService; both HIGH)
GET/PUT /api/admin/retention                 -> policies with bounds ; GET /api/admin/retention/runs
GET/POST /api/admin/legal ; POST /api/admin/legal/{id}/publish (HIGH)   ; GET /api/legal/current (public) ; POST /api/account/accept-terms {documentId}
GET/PUT /api/admin/subprocessors ; GET /api/legal/subprocessors (public)
GET  /api/admin/users/{login}/privacy-summary -> {classes:[{name,count,location,expiresAt}]}
```

## 4. State machines

Privacy request: `RECEIVED -> VERIFYING (email source) -> IN_PROGRESS -> COMPLETED | REJECTED`. Due-date breach → red on the page and a digest email at T-5 days and T-0.
IP block: `BLOCKED (auto) -> EXPIRED | LIFTED | EXTENDED`.
Legal: `DRAFT -> PUBLISHED (effective_at ≤ now)`; `material=true` → every user whose latest acceptance is older than `effective_at` is prompted; non-material = silent.

## 5. Failure modes

- Export generation fails midway → request stays IN_PROGRESS with `error`, retry button; never a partial file emailed.
- Delete requested for a user with an active Stripe subscription → execute refuses (409 `CANCEL_SUBSCRIPTION_FIRST`); admin cancels in Stripe (money moves in Stripe, not admin), then re-runs. Existing `AccountDeletionService` already detaches Stripe events.
- Rate limiter behind the shared Caddy → `X-Real-IP` from `beecompete-edge-caddy`; a test asserts a spoofed `X-Forwarded-For` does not change the key.
- Re-acceptance prompt during an autofill → the extension drawer shows a one-line "Terms updated — review" link, never a blocking modal on the ATS page.

## 6. Security / privacy

`security_event` stores `email_hash` for unknown logins (failed attempts for non-existent accounts) so the page can show patterns without storing typed emails. IPs are personal data under GDPR: retention 400 d, purpose = security, listed in the privacy policy. Privacy queue viewing is SUPPORT+; execute is ADMIN (HIGH). The subprocessor page is public by design (Art. 28 transparency).

## 7. Tests

`SecurityEventRecorderTest` (every auth path writes the right kind), `GoogleAdminMfaIT` (admin via Google gets a challenge), `RefreshReloadsRolesIT` (revoke-admin then refresh → no ROLE_ADMIN), `RateLimitFilterIT` (on in prod profile; spoofed XFF ignored; MFA/google/refresh/intake limited), `IpBlockTest` (auto-block at threshold, expiry), `PrivacyRequestIT` (export produces a presigned key and emails; delete with active subscription → 409; completed row for self-service export), `RetentionJobTest` (per class, bounds enforced), `LegalAcceptanceIT` (material version prompts; non-material doesn't), `SubprocessorsPublicIT` (schema, no admin fields leak).

## 8. Rollout

1. D2 fixes + security_event (no UI). 2. Security page: Overview + Sessions + Blocked IPs real; "Roles & Permissions" renders the static map; "Policies" lists the retention and legal tables. 3. Privacy queue. 4. Retention policies + runs. 5. Legal versions + subprocessors (needs 15.2 lawyer text).

## 9. Mobile wireframe (390px) — privacy request triage

```
┌──────────────────────────────┐
│ Privacy requests    3 open   │
│ ● DELETE · j.doe@…  due 4d   │
│   via email · unverified     │
│   [Verify identity] [Reject] │
│ ● EXPORT · liam.chen  due 22d│
│   self-service · completed ✓ │
│ ● DELETE · mateo.g   due 1d ⚠│
│   verified · active Pro sub  │
│   ⚠ cancel in Stripe first   │
│   [Open Stripe] [Execute]    │  <- Execute = HIGH, re-auth sheet, type-to-confirm login
└──────────────────────────────┘
```
