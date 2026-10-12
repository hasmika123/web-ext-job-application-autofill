# Security hardening: headers, actuator, rate limits, host, supply chain, secrets, disclosure

Area `plat`. Stories: P4.1–P4.8 (+ P2.5/P2.6 for deploy/CI). Existing: non-root containers; JWT secret
required in prod; CORS limited to the extension origin pattern; Next BFF per-IP rate limit on auth routes
(trusts the last `X-Forwarded-For` hop); API `RateLimitFilter` **off by default** and trusting the first
hop; `/management/health|info|prometheus` public, the rest `ROLE_ADMIN`; `info.git.mode: full`; no
security headers set in `web/next.config.ts` or `SecurityConfiguration.java` (the edge Caddy's `import
common` is outside the repo and unverified); fail2ban on the box; root SSH deploy; no Dependabot, no
scanning, no `security.txt`. Admin A0.2 lists the rate-limit/`/info` gaps from the admin side; trust area
owns the policy pages; this doc owns the controls.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Headers are set by the app, not the proxy**, so they are tested and survive the own-server move. Web (`next.config.ts` `headers()` + `proxy.ts` for the per-request CSP nonce): `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Content-Security-Policy` (nonce-based `script-src 'self' 'nonce-…' https://accounts.google.com`, `connect-src 'self' https://api.kiwiply.com https://accounts.google.com`, `frame-src https://accounts.google.com https://checkout.stripe.com`, `img-src 'self' data: https:`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`) rolled out **report-only for two weeks** (`report-to` → `POST /api/csp-report`, rate-limited, logged as WARN kinds for the digest) then enforced; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com")`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY` (legacy). API: Spring Security `headers()` with HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/api/**`; CORS unchanged. |
| D2 | **Actuator diet.** Prod exposure list shrinks to `health, info, loggers, jhimetrics, liquibase, caches` (`env`, `configprops`, `threaddump`, `logfile`, `prometheus` removed — the diagnostics bundle A10.6 covers what admins need, redacted). `info.git.mode: simple` and `/management/info` moves behind `ROLE_ADMIN`; the deploy marker (A10.4) and the canary carry the version instead. `/management/prometheus` permitAll removed (export is off anyway). `health` stays public but `show-details: when_authorized` (exists) so anonymous sees only `{"status":"UP"}`. |
| D3 | **Rate limiting that matches the topology.** (a) `server.forward-headers-strategy: framework` in prod with `server.tomcat.remoteip.trusted-proxies` = the Docker `web_edge` subnet (the edge Caddy) so `request.getRemoteAddr()` is the client IP and the first-hop trust bug disappears; (b) `RateLimitFilter` **on** in prod (`RATE_LIMIT_ENABLED=true` default), keyed on the resolved remote IP, rules extended: `POST /api/authenticate` 10/5 min, `/api/register` 5/h, reset 5/h, `POST /api/extension/session` 20/h, `POST /api/ai/**` 60/min per user (keyed on JWT subject, not IP), `GET /api/ops/canary` 2/s global; (c) web BFF keeps its own limits (they see the same IP now, so the two layers agree); (d) 429 responses carry `Retry-After` (exists) and are counted in `request_metric_minute` (A10.3) so abuse is visible. Per-instance state is fine with one replica; during a `docker rollout` the limit briefly doubles (accepted). |
| D4 | **Host hardening checklist, scripted** (`scripts/ops/host-harden.sh`, idempotent, run at P2.5 and in the own-server bootstrap): sshd `PasswordAuthentication no`, `PermitRootLogin no` (after the deploy user exists), `AllowUsers kiwiply deploy`; `ufw` default deny in + allow 22/80/443 (coordinate with BeeCompete — on the shared box this is **their** firewall, we only *verify*); `unattended-upgrades` security-only with reboot window 05:00 UTC Sundays (after the drill); Docker daemon `log-opts` defaults (`max-size 20m`); `fail2ban` sshd jail (exists); `.env` files `0600` owned by the deploy user; `/srv/kiwiply` `0750`. On the shared box, anything that touches the host globally (ufw, sshd, unattended-upgrades) is a *request to the box owner*, recorded in the runbook, not an action. |
| D5 | **Container hardening** in compose: `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]` (+ `cap_add: [NET_BIND_SERVICE]` only for Caddy on a standalone host), `read_only: true` for web (with `tmpfs: /tmp`) and api (`tmpfs: /tmp`, the uploads volume `rw`), `pids_limit: 512`, base images pinned by **digest** (`eclipse-temurin:17-jre@sha256:…`, `node:22-alpine@sha256:…`) and bumped by Dependabot. |
| D6 | **Supply chain in CI** (all PR-blocking after a two-week warn period): Dependabot (`github-actions`, `npm` root workspace weekly, `gradle` weekly, `docker` for the two Dockerfiles); `npm audit --audit-level=high --omit=dev` for `web` and `job-autofill` production deps; OWASP Dependency-Check or `gradle dependencyCheckAnalyze` for the API with a suppression file; **Trivy** on both built images (`CRITICAL,HIGH`, ignore-unfixed) in `ci.yml` `web-docker` and a new `api-docker` job; `provenance: true, sbom: true` on `build-push-action` so GHCR holds the SBOM; `gitleaks` on every PR and a `pre-commit` hook config in the repo; CodeQL for JavaScript/TypeScript and Java (free for public repos; if the repo is private, GitHub Advanced Security is a cost → open question; fallback is Semgrep OSS). |
| D7 | **Secrets hygiene.** `secrets-fingerprint.sh` (backup doc D8) + a **rotation calendar** in `docs/runbooks/rotate-secrets.md`: CI deploy key quarterly; `DOSSIER_STORAGE_*` and backup IAM yearly; Brevo SMTP key yearly; `JWT_BASE64_SECRET` yearly **with a dual-key grace** — new property `jhipster.security.authentication.jwt.previous-base64-secret` verified for 24 h so refresh tokens roll over without a mass sign-out (needs `TokenProvider` change: try current, then previous); inbox key per `DEPLOY.md` §12 (exists); Stripe keys only on compromise. Every rotation = a `system_event` (A10.4) + a password-manager edit the same minute. Compose `$$` escaping gotcha documented once (exists) and asserted by `EnvSchemaCheck` (bcrypt hash must be 60 chars and start with `$2`). |
| D8 | **Disclosure.** `/.well-known/security.txt` (RFC 9116: `Contact: mailto:security@kiwiply.com`, `Expires`, `Preferred-Languages: en`, `Canonical`, `Policy: https://kiwiply.com/security-policy`) served by web with a one-year expiry bumped by a CI check; `security@kiwiply.com` routed like `support@` (Cloudflare Email Routing); a short disclosure policy page (trust area writes the words: safe harbour for good-faith research, no bounty yet, 90-day coordinated disclosure, acknowledgements). Triage = SEV2 in the alert matrix. |
| D9 | **DNS/TLS posture**: CAA record `0 issue "letsencrypt.org"`; DNSSEC on at Cloudflare; HSTS preload submission after a month enforced; TLS 1.2+ only (edge Caddy default); orange-cloud **evaluated** with BeeCompete's owner because the edge's ACME and their sites share it — if adopted, DNS-01 via a Cloudflare API token scoped to `kiwiply.com` only, `Full (strict)` mode, origin IP hidden, WAF managed rules free tier; until then grey. |
| D10 | **What we do not do yet**: SOC 2, pen test, bug bounty, WAF on the box, SIEM. Each is listed on `/trust` under "not yet, and why" — honesty is the competitive move (AUDIT §3 #5). A third-party pen test (~$5–10k) is the first of these to buy, after Launch 1, before the first Organization customer. |

## 2. Threat model (what these controls are for)

| Asset | Threat | Control |
|---|---|---|
| resume/profile PII, inbox app passwords (encrypted) | box compromise via SSH or a vulnerable dependency | D4, D5, D6, D7, backup no-delete key, inbox key separate from DB |
| user sessions | XSS on the web app, clickjacking of `/connect` or checkout | D1 (CSP, frame-ancestors), httpOnly cookies (exist) |
| accounts | credential stuffing against `api.kiwiply.com` directly | D3 (API limiter on, real IP), U1.1 per-account backoff |
| the API origin | DDoS, scanner noise | D9 (orange-cloud, evaluated), D3 global limits, edge Caddy |
| CI → prod path | leaked deploy key | deploy doc D8 forced command, D7 rotation |
| images | malicious/outdated base layer | D5 digests, D6 Trivy + Dependabot |
| secrets | lost again (2026-09-17) | D7 fingerprints + password manager parity in the drill |
| admins | stale roles, Google MFA bypass | A0.2 (admin area) |

## 3. CSP rollout state machine

```
none ──P4.1──> report-only (2 weeks, violations → /api/csp-report → digest kinds)
         └─ violations triaged: own code fixed / third-party allow-listed by exact origin
report-only ──zero unexpected reports for 7 days──> enforce
enforce ──a release breaks something──> report-only (one env var: CSP_MODE=report) → fix → enforce
```

Known allow-list on day one: Google Identity (`accounts.google.com`, `*.gstatic.com` for the button),
Stripe (`js.stripe.com`, `checkout.stripe.com`), GA4 (`www.googletagmanager.com`, only when
`NEXT_PUBLIC_ANALYTICS_ENABLED`), fonts if self-hosted → none.

## 4. Failure modes

- CSP enforce breaks Google sign-in on a new browser → `CSP_MODE=report` rollback without a deploy
  (runtime env read by `proxy.ts` at request time), SEV2.
- Trusted-proxy subnet wrong → every request appears to come from the edge → limiter throttles everyone
  (this already happened once at the API; it is why the filter is off). Guard: `RateLimitFilter` logs
  the resolved IP distribution at INFO for the first 100 requests after boot, and the canary asserts
  its own IP ≠ the proxy's. Staging first.
- Dependabot PR storm → grouped updates (`groups:` in `dependabot.yml`), weekly, minor+patch together.
- Trivy flags an unfixable CVE in the base image → `ignore-unfixed: true` + a suppression file with an
  expiry date; expired suppressions fail CI.
- `read_only: true` breaks Next's image cache or Spring temp → `tmpfs` entries; validated in the
  `web-docker` smoke (exists) and a new `api-docker` smoke.
- JWT dual-key window: a token signed with the previous key after the window → 401 → normal re-login.

## 5. Tests

`SecurityHeadersIT` (every header on `/api/account`, `no-store`, HSTS), `ActuatorExposureIT` (`/management/env`
404, `/info` 401 anonymous, `health` anonymous = status only), `RateLimitFilterIT` with `X-Forwarded-For` from
trusted vs untrusted peers (untrusted header ignored; per-user AI bucket), `TokenProviderDualKeyTest`,
web: `headers.test.ts` (nonce present, CSP mode switch), `security.txt` served with a future `Expires`,
`scripts/ops/test`: `host-harden.sh --check` reports drift without changing anything, CI: Trivy/gitleaks/
audit jobs each have a fixture that must fail (a known-bad lockfile in `scripts/ci/fixtures/`) so the gate
is proven to gate.

## 6. Rollout

P4.2 actuator diet (one session, no user-visible change) → P4.1 headers (report-only → enforce) → P4.3
trusted proxies + limiter on (staging first) → P4.5 supply chain (warn → block) → P4.4/P2.5 host +
container hardening with the user on the box → P4.6 secrets calendar + JWT dual-key → P4.7 security.txt +
policy → P4.8 DNS/TLS (+ orange-cloud decision with BeeCompete).
