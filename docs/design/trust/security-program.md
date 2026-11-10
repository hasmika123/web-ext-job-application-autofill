# Design — Security program: disclosure, headers, supply chain, incidents, pen test, SOC 2 path (area `trust`, epic T5)

Status: design 2026-10-11. Admin-side controls (staff TOTP, sessions, rate limiter fixes, security
events) are A0.*/A9.* (`rbac-audit-mfa-impersonation.md`, `security-compliance-operations.md`); user
auth is U1.* (`auth-account-security.md`); backups/monitoring are A10.1 and the `plat` area. This
area owns what is **public, cross-cutting, or procedural**: the disclosure route, HTTP hardening,
supply-chain scanning, the incident/breach process, external testing, secrets custody, the SOC 2
decision, and the extension's own hardening. Today: no security headers on web/edge (API = Spring
defaults), no `security.txt`, no scanning, rate limiter off, `/management/info` public.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **`/.well-known/security.txt` (RFC 9116)** on `kiwiply.com` and `api.kiwiply.com`: `Contact: mailto:security@kiwiply.com`, `Policy: https://kiwiply.com/security/disclosure`, `Expires` (12 months, calendar reminder), `Preferred-Languages: en`, `Canonical`. `security@` is a Google Group → support queue (A8) with a `SECURITY` category that pages the admin. |
| D2 | **Vulnerability disclosure policy** (`/security/disclosure`): scope (kiwiply.com, api.kiwiply.com, the published extension), rules (no data access beyond proof, no DoS, no social engineering, stop and report on personal data), timelines (ack 2 business days, triage 7, fix target 90), **safe harbour** wording (counsel, L7), **no bounty** stated plainly, credit opt-in. CISA/disclose.io template as the starting point. |
| D3 | **HTTP hardening, three layers.** Web (`next.config.ts` `headers()` + nonce CSP in `proxy.ts`): `Content-Security-Policy` (`default-src 'self'; script-src 'self' 'nonce-…' https://accounts.google.com https://www.googletagmanager.com; connect-src 'self' https://www.google-analytics.com https://accounts.google.com; frame-src https://accounts.google.com https://js.stripe.com; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(self "https://js.stripe.com")`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google sign-in). API (`SecurityConfiguration.headers()`): HSTS, nosniff, `frame-ancestors 'none'`, `Cache-Control: no-store` on `/api/**`, CORS allow-list = `kiwiply.com` + the extension origin only. Edge: ask the BeeCompete edge Caddyfile owner (outside this repo) to add HSTS only if the app doesn't — we don't run our own Caddy (locked). Report-only CSP for one week, then enforce; `report-to` → `POST /api/csp-report` (rate-limited, 7-day retention). |
| D4 | **Supply chain**: Dependabot (npm root workspace, Gradle, GitHub Actions; weekly, grouped), `npm audit --audit-level=high` + OWASP `dependency-check` (Gradle) as CI gates with a dated allow-list, `gitleaks` on push + pre-commit hint, CodeQL (JS/TS + Java) weekly, lockfile required (`npm ci`), pinned action SHAs. Extension: `web-ext lint` + `check-manifest-limits.mjs` already run; add a built-zip diff review step listing every host permission and remote URL in the bundle. |
| D5 | **Incident response**: a runbook (`docs/design/trust/security-program.md` §4 is the outline; `DEPLOY.md` gets the operational copy) with roles (incident lead = the user; comms = same; counsel on call), severity levels, the breach-notification matrix (GDPR 72 h to the lead DPA + individuals when high risk; UK ICO 72 h; US state laws by residency; CCPA; contractual: orgs within 48 h; store policies: CWS/AMO as required), evidence preservation, the public status note (`/trust` → incidents), post-mortem template. A10.5 (admin incidents) is the tool; this is the process. One tabletop per half-year. |
| D6 | **External penetration test** before Launch 1 ends its first quarter: scoped to web (auth, BFF, billing, DSAR, org isolation once O1.5 exists), API (JWT/refresh, 402 gates, IMAP secret handling, admin), extension (message passing, `externally_connectable`, content-script injection on hostile ATS pages, token storage). Findings → stories with severity SLAs (critical 7 d, high 30 d, medium 90 d). Re-test on fix. Budget-sized boutique, not a platform. |
| D7 | **Secrets custody & rotation**: `.env` in the password manager (locked), GitHub secrets write-only; rotation calendar — JWT signing key (yearly, dual-key window), `SecretBox` key (yearly, re-encrypt job), Stripe webhook secret (yearly), Brevo SMTP (yearly), DB password (yearly), S3 IAM keys (quarterly, least-privilege: app RW on its prefix only, backup user no-Delete — exists), extension `MANIFEST_KEY` never rotates (store identity). Break-glass: one offline admin recovery code set (A0.4). |
| D8 | **SOC 2: readiness, not audit, in year one.** Write the policy set (access control, change management, vendor management, incident response, BCP/backup, data classification, acceptable use) as short markdown in `docs/security/`, collect evidence as we go (CI logs, access reviews A0.6, backup drills A10.1). Decide on a Type I when an org deal asks for it; the `/security` page says "SOC 2 readiness in progress — report on request" only once the policies exist. |
| D9 | **Extension hardening**: MV3 default CSP kept (no `unsafe-eval`, no remote code), `externally_connectable` accept-list derived from the manifest (exists) with a test that a dev origin never ships, runtime message origin checks for the drawer iframe (`event.origin === chrome.runtime.getURL('')` origin), tokens in `chrome.storage.local` only (never `localStorage` of the ATS page), no `<all_urls>` content scripts, `web_accessible_resources` minimal (exists), store accounts with 2FA + two owners, release signing via the existing publish workflow with the built zip's SHA-256 recorded in the release notes. |
| D10 | **Public `/security` page**: controls we actually have (TLS, encryption at rest for files and mail secrets, bcrypt, short-lived tokens, MFA for staff, no log-in-as, audited access, backups + drills, disclosure policy, pen test date), what we don't claim (no SOC 2 report yet), how to report. Reviewed with each pen test. |

## 1. Known gaps this area tracks but does not own (links)

A0.2 (Google bypass of admin MFA, stale authorities on refresh, rate limiter off + spoofable key),
`/management/info` exposure (A0.2/A10), subscriber CSV export unaudited (A12.3), `UserResource`
unaudited mutations (A12.3), `ai_quota_override` surviving deletion (T1.3), U1.1 CSRF origin check,
U1.7 `__Host-` cookies + HIBP. The pen test (D6) is scheduled **after** A0.2 and U1.1 land.

## 2. Disclosure policy outline (`/security/disclosure`)

1. We welcome reports; email `security@kiwiply.com` (PGP key optional, published on the page).
2. Scope / out of scope (third-party services, BeeCompete's edge, social engineering, physical, DoS).
3. Rules of engagement (test with your own account; if you reach another user's data, stop and report;
   no persistence; no automated scanning beyond rate limits).
4. What we commit to: acknowledgement 2 business days, triage 7, status every 14, fix targets by
   severity, credit on `/security/thanks` if wanted.
5. Safe harbour (counsel wording): good-faith research under this policy is authorised; we will not
   pursue legal action; we will not support third-party claims against you.
6. No bug bounty at this time.

## 3. Breach-notification matrix (counsel confirms, L12)

| Who | Trigger | Deadline | Channel |
|---|---|---|---|
| EU/EEA lead DPA (if applicable) + UK ICO | personal-data breach, risk to individuals | 72 h from awareness | regulator portals |
| Affected users | high risk (resume/profile/inbox exposure) | without undue delay | email + in-app banner (A5.4) |
| US state AGs / residents | per state thresholds | state-specific (30–60 d typical) | counsel-drafted letters |
| Org customers | any incident touching their members | 48 h (contract) | org admin email + org banner |
| Stripe / Brevo / AWS | credential or integration compromise | immediately | provider security contacts |
| Chrome Web Store / AMO | extension compromise | immediately; pull the version | developer dashboards |

## 4. Incident runbook (outline)

Detect (alerts A10.3, reports via security@, CSP reports, anomaly A4.4) → Declare (A10.5 incident,
severity, lead) → Contain (revoke token families, rotate the secret, disable the feature flag A5.3,
pull the extension version) → Preserve (logs export, DB snapshot) → Assess (data classes, user count
from the data map T1.1) → Notify (matrix) → Recover → Post-mortem within 5 business days (blameless,
actions as stories) → Update `/trust` incidents list.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| CSP breaks Google sign-in / Stripe | report-only week catches it; nonce path for inline bootstrap; allow-list per third party documented in `web/src/lib/csp.ts` |
| HSTS preload submitted too early | submit only after a month with no mixed-content reports |
| Dependabot noise | weekly grouped PRs; CI gate only on high/critical; security-only auto-merge for patch versions after tests |
| Pen test finds a critical in a locked design | fix the implementation, not the decision; if the decision itself is unsafe, stop and ask the user |
| security@ unmonitored | the Google Group has two members and the support queue SLA alarm (A8.4) covers the SECURITY category |

## 6. Tests

`SecurityHeadersIT` (API) and a Playwright request check (web) assert every header in D3; `CspReportIT`
(rate limit, retention); CI jobs exist and fail on a seeded vulnerable dep (fixture branch);
`ExternallyConnectableTest` (production manifest has no localhost origins — extend the existing
check script); `DrawerOriginTest` (message from a foreign origin ignored); `SecurityTxtTest` (file
served, `Expires` in the future — fails 30 days before expiry).

## 7. Rollout

T5.1 security.txt + VDP (counsel for safe harbour wording, publish with interim wording) → T5.2
headers (report-only → enforce) → T5.3 scanning → T5.9 extension checks → T5.4 `/security` page →
T5.5 IR runbook + first tabletop → T5.7 rotation calendar → T5.6 pen test (after A0.2/U1.1) → T5.8
SOC 2 readiness (P2).
