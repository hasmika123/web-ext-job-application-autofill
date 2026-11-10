# Custom domains (E5) — build-ready delta over `10-domain-routing.md`

> Status: design, 2026-10-17 (Fable, branch `ent-deferred-design`). Stories `DOM-01…DOM-10` in `stories.md`.
> `10-domain-routing.md` is the full design (lifecycle §2, DNS instructions §3, verification §4, on-demand TLS §5, sessions
> and redirects §6, runbook §8, settings §10) and **stays authoritative**. This file records what exists, what is built in which
> story, the decisions taken so nobody waits, and the exact artefacts the user applies. Nothing here touches a Caddy file.

## 0. What exists today

| Piece | State |
|---|---|
| `org_hostname` table + `OrgHostname` entity (`kind` SUBDOMAIN\|CUSTOM, `status` PENDING\|VERIFYING\|VERIFIED\|ACTIVE\|SUSPENDED\|REMOVED, `is_primary`, `verification_method`, `verification_token CHAR(32)`, `verified_at`, `activated_at`, `suspended_at`, `removed_at`, `last_check_at`, `last_check_result`, `cert_state`) | built (X1.2) |
| `TenantResolver.resolve(host)` → `TenantContext` (UNKNOWN for anything not an ACTIVE row / enabled subdomain; `TenantResolverFilter` answers 404 before auth on org paths) | built (X1.3) — **"the API resolves the tenant from the host alone; unknown hosts 404" holds** |
| Ask endpoint `GET /api/internal/tenant-hosts/check?domain=` (`InternalTenantHostResource`, 200/404, cached resolver), guarded by the shared `X-Internal-Token` chain | built (X1.3) — **no `t` query token, no dedicated `DOSSIER_ASK_TOKEN`** |
| Platform-admin subdomain provisioning, suspend/resume (`AdminOrgResource`, `OrgTenancyService`) | built (X1.11) |
| `hid` claim in tokens | built (X1.5); the 60 s revocation cache (`HostnameStatusCache`) is **not** |
| Legacy `org_domain` table (`OrgDomain`, auto-join) | unused — **not** reused; stays as is |
| Org Domains page, instructions endpoint, `HostnameVerifier`, dnsjava, `HostnameCheckJob`, `HostnameProbeJob`, primary/redirect, removal, `AskEndpointIT`, dev-edge compose | not built |

## 1. Decisions taken now (recorded in `08-decisions-for-user.md` as DD-10…DD-12)

| # | Decision | Why |
|---|---|---|
| DD-10 | **Ask token = query parameter `t`, dedicated secret `DOSSIER_ASK_TOKEN`** (B1 (a), 10 §5.2). `InternalTenantHostResource.check` accepts `X-Internal-Token` **or** `t`; `t` is compared constant-time against `DOSSIER_ASK_TOKEN` only (never `DOSSIER_INTERNAL_TOKEN`); the access-log pattern masks `t=`. | Caddy's `ask` is a bare GET. |
| DD-11 | **dnsjava is added** to `api/build.gradle` (`dnsjava:dnsjava:3.6.x`, Apache-2.0) — B7 (a). | The JDK resolver cannot read TXT/CNAME/CAA. API-side only; CLAUDE.md's no-new-deps rule is about the extension engine. |
| DD-12 | **Sell custom domains at launch: yes, behind `flag.enterprise.domains` per org** (REAL-GAPS-A open question). The flag is already live; the platform admin allows an org after the setup fee is paid (E19). Apex names are supported with the A-record instruction and a visible "we recommend a subdomain" (B4). Auto-activate on verification (10 §2, `enterprise.domains.auto_activate` = true). Google sign-in per tenant host (X3.7) stays **out of scope** (E14 default: password + e-mail code). | Keeps the user's go/no-go to a flag flip, not a build. |

## 2. Build order (what each story delivers; details in 10 §2–§6)

1. **DOM-01 API: add + list + instructions.** `OrgHostnameResource` at `/api/orgs/{orgId}/hostnames`: `GET` (list with `status`, `certState`, `isPrimary`, `lastCheckResult`, `live: boolean`), `POST {hostname}` → PENDING (`domains.manage`; `HostNames.canonical` validation; 422 `HOSTNAME_INVALID {reason}`; 409 `HOSTNAME_TAKEN`; cap `org.domains.max_custom` (5) → 409 `DOMAIN_CAP`; token minted 32-char base62), `GET /{hid}/instructions` (10 §3 JSON: TXT `_kiwiply-verify.{host}` = `kiwiply-verify={token}`, CNAME → `enterprise.domains.edge_cname` (`edge.kiwiply.com`) or apex A → `enterprise.domains.edge_ipv4` (`74.208.212.158`) [+ AAAA], `proxyWarning`, `caaNote`, `ttlHint`, provider hints). Audit `DOMAIN_ADD`. Settings keys from 10 §10 registered in `EnterpriseSettingKeys` (those missing: `enterprise.domains.auto_activate`, `edge_cname`, `edge_ipv4`, `edge_ipv6`, `resolvers`, `proxy_ranges`, `checks_per_run`, `probe_via_edge_ip`, `activations_per_day`, `org.domains.max_custom`, `org.domains.redirect_non_primary`, `org.domains.subdomain_mode`).
2. **DOM-02 API: verification.** `HostnameVerifier.verify(hostname, token, kind) → VerificationResult{owned, routed, code, detail}` over dnsjava (3 s timeout, 2 retries, resolvers from `enterprise.domains.resolvers` else system; CNAME chain ≤ 3 hops; PROXIED and CAA diagnostics), result codes exactly 10 §4.4; `POST /{hid}/verify` (rate 1/min per hostname → 429); `HostnameCheckJob` (10 min, ShedLock `hostname-check`, per org, PENDING > 5 min / VERIFYING / ACTIVE older than `recheck_hours`, ≤ `checks_per_run`, 200 ms spacing); new column `org_hostname.failing_since DATETIME(6) NULL` (`20261124020000_ent_domains_verify.xml`); VERIFIED → ACTIVE when `auto_activate`; `config_version++` + `TenantConfigChangedEvent` on every status change (cache evict); audits `DOMAIN_VERIFIED`, `DOMAIN_ACTIVATED`; notice `SYSTEM` to `domains.manage` holders.
3. **DOM-03 API: certificates.** `InternalTenantHostResource`: `t` token (DD-10), records `last_ask_at` (new column) and flips `cert_state NONE → REQUESTED`; `HostnameProbeJob` (5 min): `https://{host}/api/public/tenant` with SNI, from the API container or via the edge IP (`probe_via_edge_ip`), → `ISSUED` (`cert_issued_at`, new column) or `FAILED:{RATE_LIMIT|CAA|UNREACHABLE}` after 30 min; the Dashboard alerts `DOMAIN_FAILING` / `DOMAIN_SUSPENDED` (14 §2.3) get their provider. `AskEndpointIT`: 200 only for ACTIVE rows of ACTIVE/PAST_DUE orgs the flag allows (+ enabled subdomains), 404 for PENDING/VERIFIED/SUSPENDED/REMOVED, for a closed org, for a flag-off org, with the wrong token (401), with `DOSSIER_INTERNAL_TOKEN` as `t` (401).
4. **DOM-04 API: primary, redirects, sessions.** `PUT /{hid}/primary` (ACTIVE + `cert_state = ISSUED`, else 409 `HOST_NOT_LIVE`; generated `primary_key` keeps one); public DTO gains `primaryHost`, `redirect`; the web `(tenant)` layout answers 308 to the primary for GET/HEAD pages when `org.domains.redirect_non_primary` and the host ≠ primary (never `/api/*`, never join/verify/reset links); `org.domains.subdomain_mode REACHABLE|REDIRECT`; `TenantUrls` prefers the live primary; `HostnameStatusCache` (Caffeine, 60 s, evicted on `config_version`) in the JWT path → 401 `TOKEN_HOST_REVOKED` for a suspended/removed `hid`. `SuspendedHostnameIT`.
5. **DOM-05 API: suspend / resume / remove.** `POST /{hid}/suspend {reason}` (org admin, HIGH), auto-suspend after `grace_hours_before_suspend` (72 h) of `failing_since`, `POST /{hid}/resume` (re-verifies now), `POST /{hid}/remove {confirmHostname}` (must equal the hostname; `is_primary` with another ACTIVE host → 409 `PRIMARY_REQUIRED`; SUBDOMAIN → 409 `SUBDOMAIN_MANAGED`; clears the active key; sessions end within 60 s). Audits `DOMAIN_SUSPENDED` (MEDIUM auto / HIGH manual), `DOMAIN_RESUMED`, `DOMAIN_REMOVED` (HIGH).
6. **DOM-06 Web: Domains page.** `web/src/components/ent/domains/DomainsPage.tsx` (`{orgId, orgName, subdomainHost}`), route folder `w/[workspace]/domains/page.tsx` (admin, `domains.manage`, module `domains`), BFF `api/orgs/[orgId]/hostnames/[[...path]]/route.ts` + `lib/ent/domains-bff.ts`, `lib/ent/domains.ts`, mock `scripts/mock-domains.mjs`. Layout: top card = the Kiwiply subdomain (read-only, "Ask Kiwiply to change" → support mail), then one card per custom hostname: status pill (`StatePill` map DOMAIN: PENDING amber, VERIFYING amber-outline, VERIFIED blue, ACTIVE green, SUSPENDED red, REMOVED grey), the **three-step timeline DNS verified → Certificate → Live**, the instruction card (records table with Copy + `SavedTick`, provider accordions, apex warning), the troubleshooting line from `lastCheckResult` (copy table 10 §4.4), actions: Verify now (disabled 60 s after a click), Make primary (only when live), Suspend… (`ReasonSheet`), Resume, Remove… (`ConfirmTypedSheet`, type the hostname). `Add a domain` sheet: hostname input with live validation (`HostNames` TS twin: lower-case, punycode via `URL`, no `*.kiwiply.com`, no IP, no public suffix), apex detection → recommendation line. Empty state: "Your workspace is at {subdomain}. Add your own domain." (`encourage`). Polls `GET /hostnames` every 30 s while any row is PENDING/VERIFYING/REQUESTED so the timeline advances without a reload. 390: cards stack, records table scrolls horizontally inside the card only.
7. **DOM-07 Platform admin: Domains ops.** `/admin/domains` (admin kit): every hostname across orgs, states, re-check, suspend/resume, cert state, `last_ask_at`; `GET/POST /api/admin/hostnames…` (ROLE_ADMIN). Metrics `kiwiply_tenant_ask_total{result}`, `kiwiply_hostname_state{state}`.
8. **DOM-08 Dev edge rehearsal + runbook.** `docker-compose.dev-edge.yml` (dev only, `caddy:2`, `local_certs`, the exact §3 snippet with the ask URL on `host.docker.internal:8080`), `docs/enterprise-v2/deferred/runbooks/custom-domains-edge.md` = 10 §8 steps copied verbatim with the DD-10 token lines, the DNS checklist (`edge.kiwiply.com` A grey-cloud, `*.kiwiply.com` A), the spoof test (7b), rollback (remove the three blocks, `caddy reload`). **The user applies it.**
9. **DOM-09 Wiring.** `ADMIN_NOT_BUILT` minus `domains`; `shell.test.ts` owner expectation updated; dashboard alert links; `qa/stories/admin.md` ADM rows for Domains; openapi regen; `OrgIsolationIT` rows (`GET /api/orgs/{orgId}/hostnames` read, `POST …/hostnames` write 201 `DOMAIN_ADD`, …).
10. **DOM-10 E2E.** Playwright `web/e2e/ent-domains.spec.ts` over the mock (add → instructions → verify (mock flips) → live → primary → remove), 390 + 1440; `CrossTenantSweep` rows.

## 3. The exact edge artefacts (for the user; copied from 10 §5.3 with the DD-10 token)

```caddyfile
# ---- Kiwiply Enterprise: on-demand certificates for tenant hostnames (ADR-002) ----------------
# Global options: MERGE into the file's single global block; never add a second one.
{
	on_demand_tls {
		# Kiwiply's API answers 200 only for a hostname an organization verified and activated; everything else is 404.
		ask http://dossier-api:8080/api/internal/tenant-hosts/check?t={$KIWIPLY_ASK_TOKEN}
	}
}

# Catch-all HTTPS block: every explicitly named site (beecompete.com, kiwiply.com, api.kiwiply.com, ...) keeps winning.
https:// {
	import common   # minus HSTS includeSubDomains/preload if the snippet sets them (04 §7)
	tls {
		on_demand
	}
	@ops path /api/internal/* /management/prometheus /management/info /management/env /management/beans /management/loggers /management/threaddump /management/jhimetrics /management/caches /management/liquibase /management/configprops /management/logfile
	respond @ops 404
	reverse_proxy dossier-web:3000
}

# HTTP catch-all (skip if the edge already has one): a custom domain arriving on :80 before its certificate exists.
http:// {
	redir https://{host}{uri} permanent
}
# ---- end Kiwiply Enterprise ---------------------------------------------------------------------
```
Env: `KIWIPLY_ASK_TOKEN` in the edge compose `.env` = `DOSSIER_ASK_TOKEN` in ours (32+ chars, new secret, never `DOSSIER_INTERNAL_TOKEN`). Rotation = change both, `up -d api`, `up -d caddy`. Caddy ≥ 2.6. The ask URL stays on the `web_edge` network; `api.kiwiply.com`'s block already denies `/api/internal/*` (62b §1). Apply order (10 §8): DNS records → deploy DOM-01…DOM-05 → `AskEndpointIT` green and the dev-edge rehearsal passed → edge change → one user-owned domain through the whole lifecycle → partner domains.

## 4. Threat model deltas honoured (42 T16–T23)
Activation cap `enterprise.domains.activations_per_day` (30) → extra rows stay VERIFIED with `last_check_result = CAPACITY_QUEUED`; verification token is public (DNS) and never reused after REMOVED; the ask endpoint never echoes a body; hostnames are stored canonical; `__Host-` cookies per host (X2.6, exists); HSTS not inherited by custom hosts.

## 5. Tests (names the stories must produce)
`HostNamesTest` (canonicalisation, refusals), `HostnameVerifierTest` (stubbed dnsjava resolver: every code in 10 §4.4, chain hops, apex), `HostnameCheckJobTest` (selection rules, spacing, failing_since, auto-suspend), `HostnameProbeJobTest`, `HostnameLifecycleTest` (transitions ↔ 10 §2 table), `AskEndpointIT`, `SuspendedHostnameIT`, `OrgHostnameResourceIT` (A/B; a Beta hostname id is 404 on acme; `HOSTNAME_TAKEN` across tenants without naming the other org), `PrimaryRedirectIT`, `OrgIsolationIT` rows, `LiquibaseAdditiveTest` unchanged, vitest `DomainsPage.test.tsx` (every status renders its step, copy, verify cooldown, remove typed), `domains.test.ts` (TS hostname validation twin), Playwright `ent-domains.spec.ts`.
