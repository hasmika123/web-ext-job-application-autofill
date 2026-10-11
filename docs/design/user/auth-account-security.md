# Design — Auth (passkeys, OAuth) and account security (area `user`, epics U1, U14)

Status: decided 2026-10-11 (Fable). Existing: JHipster-style password auth + JWT access (15 min) +
rotating refresh families (90 d) in httpOnly cookies (`web/src/lib/cookies.ts`, `proxy.ts`),
Google GIS sign-in (`GoogleAuthController`), admin email-OTP MFA (`AdminMfaService`, `/authenticate/mfa`),
password reset, email activation, GDPR delete, DSAR export, per-IP BFF rate limits, extension token
pair (`POST /api/extension/session`), admin session revoke (`AdminSessionService`).

## 0. Decisions

1. **Passkeys are the headline low-friction auth** (WebAuthn, discoverable credentials, platform
   authenticators: Face ID / Touch ID / Windows Hello / Android). Library: **Yubico
   `webauthn-server-core`** (API dependency — confirm). Passkey sign-in and sign-up on `/login` and
   `/signup` ("Continue with passkey"); password stays as the fallback and for existing accounts.
2. **Sign in with Apple: P1** after passkeys (needs the Apple Developer account, a Services ID and
   the `response_mode=form_post` callback through a Next route handler). **LinkedIn: dropped** —
   remove the button (OIDC "Sign In with LinkedIn" needs app review for little gain; the resume
   paste path covers "import from LinkedIn").
3. **Passkey or Google sign-up skips email verification** (the provider verified the email; for a
   passkey sign-up we still collect an email and send a verification, but the account is usable —
   verification is required only before *email-dependent* features: inbox connect, digests, billing
   receipts). Password sign-up keeps the activation gate (locked decision), made instant by U2.1.
4. **Step-up, not blanket MFA, for users**: sensitive actions (change email, change password,
   delete account, add/remove passkey, revoke all sessions, connect inbox) require a **fresh
   authentication ≤ 5 min** — a passkey assertion if one exists, else the password, else an email OTP
   (reuse the admin OTP code path, generalized). Optional TOTP for users is **P2** (U1.9).
5. **Devices & sessions page** for users (`/settings/security`): refresh-token families with UA,
   first/last seen, approximate location (from IP via a tiny offline GeoIP — or just the country from
   Cloudflare's header when present), "This device", revoke one / all others. New-device sign-in →
   `SECURITY` notification (email + push).
6. **Email change with verification**: new address gets a confirm link; old address gets a notice
   with a 7-day "this wasn't me" revert link; the change applies only after confirm.
7. **Password hygiene**: minimum 10 chars, zxcvbn-style strength meter in the UI, **HIBP range check
   (k-anonymity)** on sign-up/reset (first 5 chars of SHA-1 only; fail open on network error),
   disposable-email blocklist at sign-up (ADMIN 9.B8 shares the list).
8. **Cookies/CSRF**: keep httpOnly + `SameSite=Lax` + Secure; add an **Origin/Referer check** on
   every state-changing Next route handler (`web/src/lib/csrf.ts`) because cookie-auth + same-site
   `Lax` still allows top-level POST navigations from other sites in some flows; the extension never
   uses cookies (token pair) so nothing changes there.
9. **Abuse**: per-IP + per-account counters on login/passkey/OTP (exists per IP; add per-account
   with exponential backoff: 5 → 1 min, 10 → 15 min, 20 → 24 h + email); sign-up CAPTCHA is **not**
   used (we don't do CAPTCHAs; rely on email verification + disposable blocklist + rate limits).
10. **Account recovery without email access**: none beyond passkey/password (no SMS). Documented.

## 1. Data model (additive)

```
webauthn_credential  id PK, user_id FK, credential_id VARBINARY(255) UNIQUE, public_key_cose VARBINARY(1024), sign_count BIGINT,
                     aaguid BINARY(16) NULL, transports VARCHAR(64) NULL, name VARCHAR(60) ("iPhone", "MacBook"), backup_eligible BOOL, backup_state BOOL,
                     created_at, last_used_at NULL
webauthn_challenge   id PK, challenge VARBINARY(64) UNIQUE, user_id NULL (registration = set; discoverable login = NULL), kind (REGISTER|LOGIN),
                     expires_at (5 min), consumed_at NULL
user_step_up         user_id, method (PASSKEY|PASSWORD|OTP), verified_at   -- or a signed claim in the access token: decision = DB row, simpler to revoke
email_change_request id PK, user_id FK, new_email VARCHAR(254), confirm_token (hashed), revert_token (hashed), created_at, confirmed_at NULL, reverted_at NULL, expires_at
ALTER TABLE refresh_token ADD COLUMN user_agent VARCHAR(200), ADD COLUMN ip_country CHAR(2) NULL, ADD COLUMN first_seen_at, ADD COLUMN label VARCHAR(60) NULL   -- family metadata for the devices page
login_attempt        id PK, login VARCHAR(50), ip_hash CHAR(64), success BOOL, method, at   -- 30-day retention; feeds per-account backoff + admin security tile
```
Apple: reuse the `user.imageUrl/langKey`-style columns? No — add `external_identity (id, user_id, provider GOOGLE|APPLE, subject VARCHAR(120) UNIQUE(provider,subject), email_at_link, created_at)` and **migrate the Google mapping** (today Google maps by email in `GoogleAuthController`) to use it for both; email-match remains the first-time link rule.

## 2. API

```
POST /api/webauthn/register/options    (auth, step-up) → PublicKeyCredentialCreationOptions (rk=required, uv=preferred, excludeCredentials)
POST /api/webauthn/register            {credential, name}
POST /api/webauthn/login/options       (public) → request options (empty allowCredentials = discoverable)
POST /api/webauthn/login               {assertion} → token pair (same path as /authenticate; sets family metadata)
GET/DELETE /api/webauthn/credentials[/id]   (step-up for delete)
POST /api/auth/apple                   {id_token, code, user?} → link/create → token pair     (Next callback route handles form_post)
POST /api/account/step-up              {method, password?|otp?|assertion?} → 204 (records user_step_up, 5 min)
POST /api/account/step-up/otp          → sends the OTP email
POST /api/account/email-change         {newEmail} (step-up) · GET /api/account/email-change/confirm?token= · GET …/revert?token=
GET  /api/account/sessions             → [{familyId, label, userAgent, country, firstSeenAt, lastSeenAt, current}]
DELETE /api/account/sessions/{familyId} · POST /api/account/sessions/revoke-others   (step-up)
```
Web: `/settings/security` page; `@simplewebauthn/browser` on the client (**new web dep — confirm**;
alternatively raw `navigator.credentials` with ~60 lines of base64url helpers — default: raw, no
dep). Login page: "Continue with passkey" button first when `PublicKeyCredential.isConditionalMediationAvailable()`,
plus conditional UI autofill on the email field.

## 3. Flows (phone)

```
Sign up (passkey-first)                         Sign in
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ Create your account          │                │ Welcome back                 │
│ [ 🔑 Continue with passkey ] │                │ [ 🔑 Use a passkey ]         │
│ [ G  Continue with Google ]  │                │ [ G  Google ] [  Apple ]     │
│ [   Continue with Apple ]    │                │ ───── or ─────               │
│ ───── or email ─────         │                │ Email  [            ]  (autofill passkey chip)
│ Email  [                 ]   │                │ Password [         ] 👁       │
│ [ Continue → ]               │                │ [ Log in → ]  Forgot?        │
│ By continuing you agree …    │                │ New device? we'll email you. │
└──────────────────────────────┘                └──────────────────────────────┘
passkey path: email → Face ID sheet → account created → S1 of onboarding (verification mail sent in the background)
```
Step-up sheet (any sensitive action): "Confirm it's you" → Face ID → done; fallback password; fallback "Email me a code".

## 4. Security analysis

- WebAuthn RP ID = `kiwiply.com` (covers `app.`/`www.` if ever used); origin allow-list from config;
  `sign_count` monotonic check (log, don't block — some platforms always report 0); backup flags stored for the devices page.
- Discoverable login challenge not bound to a user → prevent enumeration; registration excludes existing credentials.
- Token pair issuance for passkey/Apple reuses `TokenIssuer` so refresh families, rotation and
  revocation behave identically; the extension's `/extension/session` is unchanged.
- Apple `id_token` verified against Apple's JWKS; `sub` is the stable key; Apple's private relay
  email is accepted and stored as the account email (users can change it).
- Step-up state is server-side (row), 5 minutes, cleared on password/passkey change and on revoke.
- Email-change revert token lets the old address undo a hijack for 7 days; both tokens hashed at rest.
- Per-account backoff is stored in DB so it survives restarts and multiple web instances; messages
  never reveal whether the account exists ("If that account exists…").
- Logging: `login_attempt` without the raw IP (SHA-256 with a server pepper); admin security tile (A-area) reads it.
- New-device detection = new refresh family whose UA+country pair was not seen in 90 d → SECURITY notification; first sign-in ever is exempt.
- Session cookie `Secure` is already env-gated; `__Host-` prefix for the access cookie (U1.7) when the domain allows.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Browser without WebAuthn | button hidden (feature-detected); password/Google path |
| Passkey lost, no password set | "Email me a sign-in link" (one-time magic link, 15 min, reuses the reset-key mechanism) — U1.6 |
| Apple returns no email (second login) | map by `sub` via `external_identity` |
| HIBP unreachable | allow the password, log a warning |
| OTP mail delayed | resend after 30 s; code valid 10 min; 5 attempts |
| Step-up expired mid-action | 401 `STEP_UP_REQUIRED` → sheet reopens, action retried |

## 6. Tests

- `WebAuthnServiceTest` with the library's test vectors: registration, assertion, counter, RP ID/origin mismatch rejected, challenge single-use/expiry.
- `WebAuthnResourceIT`: options shape, excludeCredentials, discoverable login issues a token pair, delete needs step-up.
- `AppleAuthIT` (JWKS stubbed): verify, link by email first time, by sub afterwards, relay email accepted.
- `StepUpIT`: each sensitive endpoint 401 without, 2xx within 5 min, cleared after password change.
- `EmailChangeIT`: confirm, revert, expiry, old/new notices on a `MailService` spy.
- `LoginBackoffIT`: thresholds, no enumeration in messages, reset on success.
- Web Playwright: virtual authenticator (Chromium CDP) for passkey sign-up/sign-in on 390 px; devices page revoke; CSRF test (cross-origin POST to a route handler → 403).

## 7. Rollout

U1.1 CSRF origin check + per-account backoff + login_attempt → U1.2 passkeys (API) → U1.3 passkeys
(web login/signup/settings) → U1.4 devices & sessions page + new-device alert → U1.5 step-up →
U1.6 email change + magic sign-in link → U1.7 cookie hardening + HIBP + disposable list → U1.8
Apple sign-in → (P2) U1.9 TOTP. Remove the LinkedIn button in U1.3.
