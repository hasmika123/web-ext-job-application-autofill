# 10 — Domain routing: the hostname lifecycle, DNS, verification, on-demand TLS, edge runbook

> Status: design (Session B), 2026-10-12. Implements ADR-002 (Caddy on-demand TLS at the shared
> edge), ADR-003 (API-authoritative resolution), ADR-004 (host-bound sessions). Builds on
> `04-tenancy-and-security.md` §2 (resolution algorithm, public DTO) and `03-domain-model.md` §2.1
> (`org_hostname`). Build-ready for X1.11 (subdomain provisioning, already specified), X3.1–X3.8.
> Everything that touches the shared edge is a **hand-applied change by the user** (E5, **answered
> 2026-10-12**: Session B writes the exact snippet and runbook, the user applies it on the BeeCompete
> edge; development runs on `*.localhost` until then); nothing in CI ever edits
> `~/beecompete-edge/Caddyfile`.

## 1. The two kinds of hostname

| Kind | Example | Who creates it | DNS | Certificate | Where it is managed |
|---|---|---|---|---|---|
| `SUBDOMAIN` | `acme.kiwiply.com` | platform admin (X1.11), or self-serve once E10's approval rule passes | one wildcard `*.kiwiply.com` A record (grey-cloud) — created once by the user | on-demand per host at the edge | Platform admin → Organizations → hostnames; the org sees it read-only on Domains |
| `CUSTOM` | `careers.acme.com`, `jobs.beta.com` | the org (`domains.manage`) | customer adds TXT (ownership) + CNAME to `edge.kiwiply.com` (or A to the edge IP for an apex) | on-demand per host at the edge, only after ACTIVE | Org → Domains page (X3.1) |

Rules that hold for both kinds:
- Hostnames are stored lower-case, punycoded (`java.net.IDN.toASCII`), port stripped, max 253 chars,
  labels `[a-z0-9-]{1,63}` not starting/ending with `-`.
- **Global uniqueness**: one `org_hostname` row per hostname in a non-terminal status
  (`status <> REMOVED`), enforced by a generated active key `active_hostname_key`
  (= hostname when status ≠ REMOVED, else NULL) with a unique index. A hostname removed by org A can
  later be registered by org B (ownership is re-proven from scratch).
- A CUSTOM hostname may never be a platform host, a `*.kiwiply.com` name, `localhost`, an IP literal,
  or a name on the public-suffix list itself (`com`, `co.uk`): service rejects with
  `422 HOSTNAME_INVALID {reason}`.
- Exactly one `is_primary` per org (generated `primary_key`). The provisioning of the first
  SUBDOMAIN row makes it primary; activating the first CUSTOM row offers to make it primary.

## 2. Lifecycle (state machine, `org_hostname.status`)

```
                add (CUSTOM)                verify ok
   ┌──────────┐  ───────►  ┌──────────┐ ─────────────► ┌──────────┐  activate  ┌──────────┐
   │ (none)   │            │ PENDING  │                │ VERIFIED │ ─────────► │  ACTIVE  │ ◄──┐
   └──────────┘            └──────────┘ ◄───────────── └──────────┘            └──────────┘    │ resume
                                ▲   │ verify now /         │ check fails            │ suspend  │ (re-verify)
                                │   ▼ job                  │ (grace elapsed)        ▼          │
                                │ ┌──────────┐             │                   ┌───────────┐  │
                                └─│VERIFYING │             └──────────────────►│ SUSPENDED │──┘
                                  └──────────┘                                 └───────────┘
                                                                                     │ remove
                any non-terminal ── remove (typed confirmation) ──► ┌─────────┐ ◄────┘
                                                                    │ REMOVED │ (terminal)
                                                                    └─────────┘
```

| Transition | Trigger | Guard | Side effects |
|---|---|---|---|
| → PENDING | `POST /api/orgs/{orgId}/hostnames` | `domains.manage`; `flag.enterprise.domains` allows the org; org ACTIVE/PAST_DUE; ≤ `org.domains.max_custom` (setting, default 5); hostname valid + unique | token minted (32 chars base62, stored as-is — it is not a secret, it is published in DNS); audit `DOMAIN_ADD`; notification none |
| PENDING/VERIFIED/SUSPENDED → VERIFYING | "Verify now" (`POST …/verify`, rate-limited 1/min per hostname) or `HostnameCheckJob` | — | `last_check_at`; the check runs synchronously ≤ 10 s with DNS timeouts of 3 s per query |
| VERIFYING → VERIFIED | both checks pass (§4) | — | `verified_at`; audit `DOMAIN_VERIFIED`; notification `DOMAIN_VERIFIED` to members with `domains.manage`; if `enterprise.domains.auto_activate` (default **true**) → immediately ACTIVE (next row) |
| VERIFIED → ACTIVE | auto (setting) or `POST …/activate` | org ACTIVE/PAST_DUE; flag allows; hostname still verified within `recheck_hours` | `activated_at`; `config_version++` (cache evict); audit `DOMAIN_ACTIVATED`; the `ask` endpoint now answers 200 for it; `cert_state = NONE` |
| VERIFYING → PENDING / VERIFIED (unchanged) | a check fails | — | `last_check_result = <code>` (§4.4); PENDING rows stay PENDING; a VERIFIED-but-not-ACTIVE row stays VERIFIED (nothing to protect yet) |
| ACTIVE → SUSPENDED (auto) | re-check fails continuously for `enterprise.domains.grace_hours_before_suspend` (72 h) | — | `suspended_at`, `last_check_result`; `config_version++`; resolver → UNKNOWN; sessions with this `hid` → 401 (§6); audit `DOMAIN_SUSPENDED` (risk MEDIUM); notification `DOMAIN_SUSPENDED` + email to `domains.manage` members |
| ACTIVE → SUSPENDED (manual) | org admin `POST …/suspend {reason}` (ReasonSheet) or platform admin (X1.11) | `domains.manage` | same as above, actor recorded, risk HIGH |
| SUSPENDED → ACTIVE | `POST …/resume` | re-verification passes **now** (a resume always re-checks) | `config_version++`; audit `DOMAIN_RESUMED` |
| any → REMOVED | `POST …/remove` with `ConfirmTypedSheet` (type the hostname) | not the last ACTIVE host if `is_primary` (make another primary first → `409 PRIMARY_REQUIRED`); SUBDOMAIN rows removable by platform admin only (`409 SUBDOMAIN_MANAGED`) | `removed_at`; active key cleared (name reusable); `config_version++`; sessions with this `hid` → 401; audit `DOMAIN_REMOVED` (HIGH); the edge keeps its certificate on disk until expiry but never answers for the name again (the `ask` 404s and Caddy then refuses the handshake on next renewal; existing certs serve until Caddy's next ask check — see §5.3) |

The org's **SUBDOMAIN** row follows the same states but skips PENDING/VERIFYING: provisioning
creates it directly ACTIVE (platform-owned DNS). Suspend/resume/remove are platform-admin
actions (X1.11); the org can request them from Domains ("Ask Kiwiply to pause this address" →
support mail, no API).

## 3. DNS instructions shown to the customer (X3.1)

The Domains page renders one instruction card per PENDING/VERIFYING/SUSPENDED hostname. The
values come from the API (`GET /api/orgs/{orgId}/hostnames/{hid}/instructions`) so copy and
targets are never built client-side:

```
{
  "hostname": "careers.acme.com",
  "apex": false,
  "records": [
    { "type": "TXT",   "name": "_kiwiply-verify.careers.acme.com", "value": "kiwiply-verify=7f3a…", "purpose": "OWNERSHIP" },
    { "type": "CNAME", "name": "careers.acme.com", "value": "edge.kiwiply.com", "purpose": "TRAFFIC" }
  ],
  "proxyWarning": "Keep the record DNS-only (grey cloud). A proxied record breaks certificate issuance.",
  "caaNote": "If your zone has CAA records, add: careers.acme.com CAA 0 issue \"letsencrypt.org\"",
  "ttlHint": "Changes usually propagate within minutes; some providers take up to 24 hours."
}
```
- **Apex** names (`acme.com`) cannot be CNAMEd; the TRAFFIC record becomes
  `A acme.com → {enterprise.domains.edge_ipv4}` (setting, default `74.208.212.158`), plus an optional
  `AAAA` when `enterprise.domains.edge_ipv6` is set. The card says so explicitly and recommends a
  subdomain instead.
- The TXT **name** is `_kiwiply-verify.{hostname}`; the **value** is `kiwiply-verify={token}`.
  Keeping the token in a child label (not on the hostname itself) means it coexists with the
  CNAME (RFC 1912: no other records at a CNAME name).
- Instructions include provider-specific hints for Cloudflare, GoDaddy, Route 53, Namecheap,
  Google Domains (copy only; one accordion each; no screenshots).
- Every value has a "Copy" affordance (SavedTick on copy); the card ends with "Verify now".

## 4. Ownership verification (X3.2)

### 4.1 Checks
`HostnameVerifier.verify(hostname, token, kind)` runs two independent checks and returns a
`VerificationResult { owned: boolean, routed: boolean, code, detail }`:

1. **Ownership (`owned`)** — resolve `TXT _kiwiply-verify.{hostname}`; pass when any record equals
   `kiwiply-verify={token}` (exact, case-sensitive, quotes stripped).
2. **Routing (`routed`)** — for a non-apex name: resolve `CNAME {hostname}`; pass when the canonical
   target equals `edge.kiwiply.com.` (setting `enterprise.domains.edge_cname`). For an apex: resolve
   `A`/`AAAA`; pass when the set contains the edge IP(s). A CNAME chain is followed up to 3 hops.

Both must pass for VERIFIED. Resolution uses the JDK resolver (`InetAddress` is not enough for
TXT/CNAME) — use **dnsjava** (`org.xbill.dns`, Apache-2.0, pure Java) against the system
resolvers with a 3 s timeout and 2 retries; the dependency is approved by this doc (engine rule in
CLAUDE.md concerns the extension only). Queries go to public resolvers `1.1.1.1` and `8.8.8.8`
when `enterprise.domains.resolvers` is set (default: system), so a stale box cache never blocks a
customer.

### 4.2 Extra diagnostics (do not gate, only explain)
- **Proxied detection**: an `A` lookup of the hostname returning an address in Cloudflare's
  published ranges (list in `enterprise.domains.proxy_ranges`, defaults to Cloudflare's IPv4 list)
  while the CNAME target is right → `code = PROXIED`.
- **CAA**: walk up from the hostname to the apex; if any CAA `issue`/`issuewild` set exists and
  excludes `letsencrypt.org` → `code = CAA_BLOCKS_LE`.
- **NXDOMAIN / SERVFAIL** → `DNS_NXDOMAIN` / `DNS_ERROR`.

### 4.3 The job
`HostnameCheckJob` (`@Scheduled(fixedDelayString = "${dossier.ent.domains.check-delay-ms:600000}")`,
10 min) iterates **per org** (`TenantScoped.run`) over rows in VERIFYING (always), PENDING older
than 5 min (so a customer who just added the record sees it flip without clicking), and ACTIVE
whose `last_check_at` is older than `enterprise.domains.recheck_hours` (24 h). It never re-checks
more than `enterprise.domains.checks_per_run` (default 50) hostnames per run and spaces queries by
200 ms. Results update `last_check_at`, `last_check_result`, and drive the transitions in §2.
Grace: an ACTIVE row whose checks have failed on **every** run for `grace_hours_before_suspend`
(tracked via `failing_since` — new nullable column, additive, X3.2) is suspended; one passing check
clears `failing_since`.

### 4.4 Result codes (`last_check_result`, VARCHAR 200 = `CODE[:detail]`)

| Code | Meaning | What the troubleshooting panel says |
|---|---|---|
| `OK` | both checks pass | "Verified {relative time}" |
| `TXT_MISSING` | no TXT at `_kiwiply-verify.{host}` | "We can't find the ownership record yet. DNS changes can take a while — try again in a few minutes." |
| `TXT_MISMATCH` | TXT exists, value differs | "The ownership record has a different value. Copy it again from above." |
| `CNAME_MISSING` | no CNAME on the host | "Point `{host}` at `edge.kiwiply.com` with a CNAME record." |
| `CNAME_WRONG_TARGET:{target}` | CNAME points elsewhere | "`{host}` currently points at `{target}`. Change it to `edge.kiwiply.com`." |
| `A_WRONG_IP:{ip}` | apex A record elsewhere | "`{host}` resolves to `{ip}`. It needs to point at `{edge ip}`." |
| `PROXIED` | routed through a proxy (orange cloud) | "The record is proxied. Switch it to DNS-only so we can issue the certificate." |
| `CAA_BLOCKS_LE` | CAA excludes Let's Encrypt | "Your domain's CAA records don't allow Let's Encrypt. Add `issue \"letsencrypt.org\"`." |
| `DNS_NXDOMAIN` | name does not exist | "This name doesn't exist in DNS yet." |
| `DNS_ERROR:{msg}` | resolver failure | "We couldn't reach your DNS provider. We'll keep trying." |
| `CERT_PENDING` | ACTIVE, ask seen, no HTTPS yet (§5.4) | "Certificate is being issued — usually under a minute." |
| `CERT_FAILED:{hint}` | probe failed for 30 min | "The certificate couldn't be issued. {hint}" (hint: `RATE_LIMIT` → "Let's Encrypt limits certificates per domain per week; try again after {date}", `CAA`, `UNREACHABLE`) |

## 5. Certificates: on-demand TLS at the shared edge (X3.3, X3.6)

### 5.1 How a certificate comes to exist
1. The customer's DNS points `careers.acme.com` at the box.
2. A browser connects; the edge Caddy has no certificate for the name and `on_demand_tls` is
   configured, so it calls the **ask** URL with `?domain=careers.acme.com`.
3. `GET /api/internal/tenant-hosts/check` (X1.3) answers **200** only if an `org_hostname` row is
   ACTIVE for an org in ACTIVE/PAST_DUE (CUSTOM rows additionally require `flag.enterprise.domains`
   to allow the org), or the name is `{label}.kiwiply.com` of an org with `subdomain_enabled`.
   Everything else is **404**. The response body is empty; latency ≤ 50 ms from the resolver cache.
4. Caddy obtains the certificate from Let's Encrypt (HTTP-01 or TLS-ALPN-01, both terminate on the
   edge, which already owns :80/:443), stores it, and serves the request to `dossier-web:3000`.
5. Renewals are Caddy's; it re-asks before renewing, so a REMOVED/SUSPENDED name is not renewed.

### 5.2 Passing the internal token to the ask endpoint
Caddy's `ask` is a bare GET: it cannot add headers. `InternalTenantHostResource` therefore
accepts the internal token **either** as `X-Internal-Token` **or** as the query parameter `t`
(this endpoint only; constant-time compare; the token never appears in logs — the access-log
pattern masks `t=`). The Caddyfile carries it as an environment variable (`{$KIWIPLY_ASK_TOKEN}`)
set in the edge compose file. The ask endpoint is additionally reachable only on the `web_edge`
network (the API never publishes `/api/internal/**` through `api.kiwiply.com`; E12 asks the edge
to deny that path publicly).

### 5.3 The exact edge snippet (for `~/beecompete-edge/Caddyfile`, applied by the user)
```caddyfile
# ---- Kiwiply Enterprise: on-demand certificates for tenant hostnames (ADR-002) ----------------
# 1) Global options. There is exactly ONE global block per Caddyfile and it must be the first block.
#    If the file already has one, MERGE the on_demand_tls directive into it; do not add a second block.
{
	on_demand_tls {
		# Kiwiply's API says yes (200) only for hostnames an organization verified and activated.
		# Anything else is 404, so no stranger can make this edge request a certificate.
		ask http://dossier-api:8080/api/internal/tenant-hosts/check?t={$KIWIPLY_ASK_TOKEN}
	}
}

# 2) Catch-all HTTPS block. Caddy prefers a site block with an explicit host, so every existing
#    BeeCompete / Kiwiply block (beecompete.com, staging.beecompete.com, kiwiply.com, api.kiwiply.com, ...)
#    keeps winning; only hostnames nobody else declares reach this block.
https:// {
	import common
	tls {
		on_demand
	}
	# The tenant hostname travels to the app as X-Forwarded-Host (reverse_proxy sets it); the BFF
	# forwards it as X-Kiwiply-Host and the API resolves the tenant from it (ADR-003).
	reverse_proxy dossier-web:3000
}
# ---- end Kiwiply Enterprise ---------------------------------------------------------------------
```
Notes for the runbook: `import common` is the edge's existing snippet (compression, headers); if it
sets HSTS with `includeSubDomains`/`preload`, **do not** inherit it here (04 §7) — replace the
import with the individual directives minus HSTS. Caddy ≥ 2.6 required (`on_demand_tls` with `ask`;
`interval`/`burst` are deprecated and omitted on purpose). Caddy's own on-demand safeguards
(per-second issuance limits) stay at defaults.

### 5.4 Certificate state tracking (`cert_state`)
- `NONE` → `REQUESTED` when the ask endpoint answers 200 for the host (the resource records the
  hit: `last_ask_at`, additive column, X3.3).
- `HostnameProbeJob` (5 min) probes `https://{host}/api/public/tenant` for REQUESTED hosts with a
  10 s timeout and SNI = host, **from the API container** (outbound through the box's public IP;
  if the box blocks hairpin traffic, set `enterprise.domains.probe_via_edge_ip` to connect to the
  edge IP with SNI — the probe code supports both). HTTP 200 with the org's display name →
  `ISSUED` (`cert_issued_at`), result `OK`. TLS handshake failure after 30 min since `last_ask_at`
  → `FAILED` with hint (`RATE_LIMIT` when the LE weekly counter in §7 is exhausted, `CAA` when the
  CAA check fails, else `UNREACHABLE`). A later successful probe flips FAILED → ISSUED.
- The Domains page shows the three-step timeline **DNS verified → Certificate → Live** from these
  fields; "Live" is `ISSUED` + ACTIVE.

### 5.5 Dev path (`*.localhost`)
- **No TLS needed for development**: Chromium resolves `*.localhost` to loopback; `next dev -p 3100`
  serves `http://acme.localhost:3100` and `http://beta.localhost:3100`; the mock API (X1.12) answers
  `/api/public/tenant` by `X-Kiwiply-Host`. Playwright sets `extraHTTPHeaders: { Host, X-Forwarded-Host }`.
- **Edge rehearsal** (X3.6): `docker-compose.dev-edge.yml` (new, dev only) runs `caddy:2` with
  `local_certs` and the exact snippet from §5.3 (ask URL pointing at `host.docker.internal:8080`),
  so `https://acme.localhost` and `https://careers.acme.localhost` exercise on-demand issuance with
  Caddy's internal CA. The `AskEndpointIT` + this rehearsal are the proof that the snippet is right
  before the user touches the shared edge.

## 6. Sessions and redirects on hostnames

- **Tokens carry `hid`** (ADR-004). `JwtDecoder` validation (X1.5) adds: if `hid` is present, the
  hostname must still be ACTIVE (`HostnameStatusCache`, Caffeine, TTL 60 s, evicted on
  `config_version`) — else `401 TOKEN_HOST_REVOKED`. Suspending or removing a host therefore ends
  its sessions within one minute without touching refresh families.
- **Primary and redirects** (X3.4): `PUT /api/orgs/{orgId}/hostnames/{hid}/primary` (`domains.manage`;
  target must be ACTIVE with `cert_state = ISSUED`, else `409 HOST_NOT_LIVE`). Org setting
  `org.domains.redirect_non_primary` (BOOL, default **true**): the web `(tenant)` layout, when the
  resolved `hostnameId` ≠ primary and the primary is live, answers `308` to
  `https://{primary}{path}{query}` for GET/HEAD page requests only (never for `/api/*`, never for the
  join/verify/reset links, which are always built on the primary anyway — `TenantUrls`). Setting
  `org.domains.subdomain_mode` (`REACHABLE` | `REDIRECT`, default `REACHABLE`) decides whether
  `acme.kiwiply.com` keeps serving once a custom primary is live. The public DTO gains
  `primaryHost` and `redirect: boolean` so the redirect happens in the web layout with no extra call.
- **Links in mail and notifications** use the primary ACTIVE hostname when `cert_state = ISSUED`,
  else the subdomain, else `kiwiply.com` (`TenantUrls`, X2.10).

## 7. Monitoring, metrics and alerts (X3.3, X3.6)

| Signal | Where | Threshold / action |
|---|---|---|
| `kiwiply_tenant_ask_total{result="200"\|"404"\|"401"}` | Micrometer counter in `InternalTenantHostResource` | 404 rate > 50 / 5 min → alert "possible certificate probing"; shown on admin Tenant Health |
| `kiwiply_hostname_state{state}` gauge per state | `HostnameMetrics` refreshed each check run | SUSPENDED > 0 for an org → row in platform admin Domains page "needs attention" |
| LE weekly counter | `le_issuance` rows: registered domain (`kiwiply.com` or the customer's), `issued_at`; written when `cert_state` → ISSUED | ≥ 45 in 7 days for `kiwiply.com` → stop auto-provisioning subdomains (`SUBDOMAIN_THROTTLED`, admin sees why); customers' own domains are their own budget but the hint `RATE_LIMIT` uses the same table |
| Check-job health | `HostnameCheckJob` writes `last_run_at` to `app_setting` key `enterprise.domains.last_check_run` | Tenant Health shows "domain checks last ran {ago}"; > 60 min → warning |
| Probe failures | `cert_state = FAILED` | notification `DOMAIN_CERT_FAILED` to `domains.manage` members, once per 24 h |
| Audit | every transition is an `org_audit_event` with `hostname_id` (X1.10 columns) | the Domains page "History" drawer reads `GET /api/orgs/{orgId}/audit?target=HOSTNAME&id=` |

Platform admin: `/admin/domains` (X1.11 extended in X3.3) lists every hostname across orgs with
state, cert state, last check, last ask; filters; "re-check", "suspend/resume" with ReasonSheet;
links to the org. No tenant data beyond hostname/org name.

## 8. Runbook — applying the edge change (E5, answered 2026-10-12; owner: the user)

Pre-conditions: Phase 3 code deployed (ask endpoint live on `dossier-api`), `KIWIPLY_ASK_TOKEN`
= the API's `DOSSIER_INTERNAL_TOKEN` value, DNS records created in Cloudflare (grey-cloud):
`*.kiwiply.com A 74.208.212.158` and `edge.kiwiply.com A 74.208.212.158`.

1. On the box: `cd ~/beecompete-edge && cp Caddyfile Caddyfile.bak-$(date +%F)`.
2. Add `KIWIPLY_ASK_TOKEN=<value>` to the edge compose `environment:` of the `caddy` service
   (or its `.env`), `docker compose -f docker-compose.edge.yml up -d caddy` only if the env is new
   (a plain reload does not pick up new env vars).
3. Edit `Caddyfile`: merge the global `on_demand_tls` block into the existing global options block
   (first block in the file); append the `https://` catch-all from §5.3 at the end.
4. Validate without applying: `docker compose -f docker-compose.edge.yml exec caddy caddy validate --config /etc/caddy/Caddyfile`.
5. Reload (zero downtime): `docker compose -f docker-compose.edge.yml exec caddy caddy reload --config /etc/caddy/Caddyfile`.
6. Verify neighbours untouched: `curl -sI https://beecompete.com | head -1`, `curl -sI https://staging.beecompete.com | head -1`, `curl -sI https://kiwiply.com | head -1`.
7. Verify the gate: `curl -s -o /dev/null -w '%{http_code}\n' "http://dossier-api:8080/api/internal/tenant-hosts/check?t=$KIWIPLY_ASK_TOKEN&domain=nobody.example"` from inside the edge container → `404`; the demo org's subdomain → `200`.
8. First issuance: open `https://acme.kiwiply.com` (provisioned, ACTIVE). Expect the branded login
   within ~5 s; `docker compose … logs caddy | grep acme.kiwiply.com` shows the ask + obtain lines.
9. Rollback: `cp Caddyfile.bak-<date> Caddyfile && caddy reload` (certificates already obtained
   stay on disk and are harmless).

Troubleshooting (edge side): `caddy` log `"on-demand TLS: ask endpoint returned 404"` means the
host is not ACTIVE (check Domains page / admin); `"too many certificates already issued"` is the
LE weekly limit (wait, or move to Cloudflare for SaaS — X12.6); handshake OK but Next renders
tenant-404 → `X-Forwarded-Host` missing (the `reverse_proxy` in §5.3 sets it; a custom
`header_up Host` elsewhere would strip it).

## 9. Threats this doc closes (from 04 §6)
T3 (certificate minting abuse) — ask answers 200 only for ACTIVE rows; LE counter; subdomain
throttle. T4 (domain takeover) — TXT ownership **and** routing checks, 24 h re-checks, grace then
suspend, resume re-verifies. T12 (host-header injection) — `TenantUrls` builds only from
`org_hostname` rows. T13 (enumeration) — identical 404 timing for PENDING/unknown, per-IP rate limit
on `/api/public/tenant`.

## 10. Settings this doc introduces (all in `EnterpriseSettingKeys`, admin-editable)

| Key | Type | Default | Risk |
|---|---|---|---|
| `enterprise.domains.auto_activate` | BOOL | true | MEDIUM |
| `enterprise.domains.edge_cname` | STRING | `edge.kiwiply.com` | HIGH |
| `enterprise.domains.edge_ipv4` / `edge_ipv6` | STRING | `74.208.212.158` / `` | HIGH |
| `enterprise.domains.resolvers` | JSON list | `[]` (system) | LOW |
| `enterprise.domains.proxy_ranges` | JSON list | Cloudflare IPv4 ranges | LOW |
| `enterprise.domains.checks_per_run` | INT | 50 | LOW |
| `enterprise.domains.probe_via_edge_ip` | BOOL | false | LOW |
| `org.domains.max_custom` (org-overridable) | INT | 5 | LOW |
| `org.domains.redirect_non_primary` (org-overridable) | BOOL | true | LOW |
| `org.domains.subdomain_mode` (org-overridable) | STRING | `REACHABLE` | LOW |
(plus the Phase-0 keys `subdomains_per_day`, `recheck_hours`, `grace_hours_before_suspend`.)
