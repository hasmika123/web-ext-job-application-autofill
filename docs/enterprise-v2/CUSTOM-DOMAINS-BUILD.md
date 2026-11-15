# Custom domains (A4): build plan

> 2026-11-12. Gap list item **A4** (`BUILD-OUT-GAPS.md`): an organization serves its workspace on its own domain, e.g. `careers.acme.com`. Design:
> `10-domain-routing.md` (lifecycle, DNS, checks, certificates, edge runbook). Where this plan and that doc differ, this plan describes what was built.
> **A5** (the shared edge Caddy change that issues the certificates) is the user's: until it is applied, a live custom domain resolves in Kiwiply but has
> no certificate in production. Development runs on `*.localhost`.

## Already there before A4
- `org_hostname`: kind, status, the verification token, `cert_state`, and global uniqueness of non-removed names.
- The resolver serves a CUSTOM row once it is ACTIVE and the organization's `flag.enterprise.domains` allows it.
- The edge's ask endpoint (`GET /api/internal/tenant-hosts/check`) allows a certificate for exactly those names.
- The platform admin provisions the organization's Kiwiply subdomain and can suspend or resume any hostname.

## A4a: the organization's Domains page and the DNS checks (this PR)

**API** (module `domains`, permission `domains.manage`; everything else is the generic 404):

| Method | Path | What |
|---|---|---|
| GET | `/api/orgs/{orgId}/hostnames` | the Kiwiply subdomain (read-only) and the organization's own domains, plus the cap and the edge targets |
| POST | `/api/orgs/{orgId}/hostnames` | add a domain, which starts PENDING with its ownership token. 422 `HOSTNAME_INVALID`, 409 `HOSTNAME_TAKEN`, 422 `ORG_LIMIT_REACHED`. Audit `DOMAIN_ADD` |
| GET | `…/{id}/instructions` | the two records, built by the server: TXT `_kiwiply-verify.{host}` = `kiwiply-verify={token}`, and CNAME `{host}` → `edge.kiwiply.com` (an A record to the edge IP for an apex) |
| POST | `…/{id}/verify` | check now (once a minute; 429 `CHECK_TOO_SOON`). Passing makes it VERIFIED, then ACTIVE when `enterprise.domains.auto_activate` is on (the default) |
| POST | `…/{id}/activate` | VERIFIED → ACTIVE when auto-activate is off; re-checks first |
| POST | `…/{id}/suspend` | ACTIVE → SUSPENDED, reason required; not the main address |
| POST | `…/{id}/resume` | SUSPENDED → ACTIVE, only if DNS passes now |
| POST | `…/{id}/remove` | type the domain to confirm. Never Kiwiply's subdomain or the main address. The name can be added again later |

**Rules:**
- A domain is never a Kiwiply or platform name, `localhost`, an IP or a bare suffix.
- The organization holds at most `enterprise.domains.max_custom` (5).
- A change that affects routing bumps `config_version` and evicts the tenant cache.

**Checks** (`HostnameVerifier` over `DnsLookup`):
- ownership is the TXT record;
- routing is the CNAME to the edge (following up to 3 hops), or the A record for an apex;
- result codes `OK`, `TXT_MISSING`, `TXT_MISMATCH`, `CNAME_MISSING`, `CNAME_WRONG_TARGET:x`, `A_WRONG_IP:x`, `DNS_NXDOMAIN`, `DNS_ERROR:x`, which the page turns into sentences.

Lookups go through **dnsjava 3.6.2** (approved in doc 10 §4.1): system resolvers, a 3-second timeout, 2 retries, no cache. With `dossier.ent.domains.dns=offline`, which tests use, no DNS is asked at all.

**Re-check job** (`HostnameCheckJob`, every 10 minutes, job lease, at most 50 per run, 200 ms apart):
- waiting domains are checked every 5 minutes for 14 days after they were added, so they go live without a click;
- live domains are re-checked every `enterprise.domains.recheck_hours` (24). A failing one gets `failing_since`, and is SUSPENDED once it has failed longer than `enterprise.domains.grace_hours_before_suspend` (72). The main address is never auto-suspended.

**Settings:**
- `enterprise.domains.edge_cname`, `edge_ipv4`, `auto_activate` and `max_custom` are new;
- `recheck_hours` and `grace_hours_before_suspend` move from deferred to live.

**Schema:** additive `20261202010000_ent_custom_domains.xml` adds `org_hostname.failing_since`.

**Web:**
- **Domains** in Org Admin (`/w/admin/domains`, module domains) shows:
  - the Kiwiply address, read-only;
  - the add form;
  - one card per domain, with its status, what the last check found in plain words, the DNS records with Copy buttons, and Verify now / Go live / Suspend / Resume / Remove (typed confirmation).
- BFF `api/orgs/[orgId]/hostnames/[[...path]]`.

## A4b: certificates, the main address, the admin's list (this PR)

**Certificates** (`HostnameCertService`, doc 10 §5.4):
- When the edge's ask endpoint answers 200, it records `last_ask_at`, and a live custom domain's `cert_state` goes NONE / FAILED → REQUESTED. Recording never changes the answer.
- `HostnameProbeJob` (every 5 minutes, job lease, at most 50) probes REQUESTED and FAILED domains with `HttpsHostnameProbe`: `https://{host}/api/public/tenant`, 10 seconds, the JDK's trusted roots, no redirects.
  - An answer below 500 after the TLS handshake is ISSUED (`cert_issued_at`, audit `DOMAIN_CERT_ISSUED`).
  - No answer 30 minutes after the ask is FAILED, with `CERT_FAILED:TLS` or `CERT_FAILED:UNREACHABLE`.
  - A later success still flips it to ISSUED.
- With `dossier.ent.domains.probe=offline` (tests) nothing is probed.

**Main address:** `POST /api/orgs/{orgId}/hostnames/{id}/primary` (`domains.manage`).
- A live address can be the main one: a custom domain once its certificate is ISSUED, the Kiwiply subdomain whenever it is live. 409 `HOST_NOT_LIVE` otherwise.
- The old main address is cleared first: one per organization, enforced by the database.
- Mail links already follow it (`TenantUrls`: the main address when it is live and certified).
- The main address can't be suspended or removed.
- Audit `DOMAIN_PRIMARY`.

**Platform admin → Domains** (`/admin/domains`; `GET /api/admin/domains?status&q&page`, `POST /api/admin/domains/{id}/recheck`; `ROLE_ADMIN`):
- every organization's addresses, the ones needing attention first: suspended, failing DNS, or certificate failed;
- each with its organization (linked), kind, main flag, status, certificate state and last check;
- **Re-check** runs the DNS check and the probe now (audit `DOMAIN_RECHECK`). Suspend and resume stay on the organization's page.

**Web:**
- A live domain's card shows **DNS verified → Certificate → Live**, and once the certificate is issued, **Make main address**.
- The Kiwiply address card offers it too.
- A **Main address** badge.
- The certificate failure is explained in plain words.

**Schema:** additive `20261203010000_ent_domain_certs.xml` adds `org_hostname.last_ask_at`, `cert_issued_at` and `cert_checked_at`.

**Not in A4b** (later, when needed):
- redirecting the other addresses to the main one (`org.domains.redirect_non_primary`, doc 10 §6), and `subdomain_mode`;
- the proxy (orange cloud) and CAA hints (doc 10 §4.2);
- notifications to `domains.manage` members when a domain fails;
- the Let's Encrypt weekly counter and the ask-rate alert (doc 10 §7).

## Then
- **A5 (yours):** apply the edge snippet and runbook in doc 10 §5.3 and §8 on the shared box.
- **A6:** the extension trusts a custom domain (connect, Prepare batch).
- **D8:** the branded extension build and publishing.

## Status
- **A4a built (2026-11-12).**
  - API: `OrgDomainService`, `HostnameVerifier`, `DnsjavaLookup` / `OfflineDnsLookup`, `HostnameCheckJob`, `OrgDomainResource`, and the settings.
  - Tests: `HostnameVerifierTest`, `OrgDomainsIT` (add → records → verify → live, resolved and certificate allowed → suspend → resume → remove → add again; refusals and the wall; the job's grace-period suspension), eight `OrgIsolationIT` rows, and the menu, settings and PII pins.
  - Web: `DomainsPage`, `lib/ent/domains.ts`, the BFF, and the menu item, with tests.
- **A4b built (2026-11-14).**
  - API: `HostnameCertService`, `HttpsHostnameProbe` / `OfflineHostnameProbe`, `HostnameProbeJob`, the ask endpoint recording, `OrgDomainService.makePrimary`, and `AdminDomainService` + `AdminDomainResource`.
  - Tests: `HostnameCertServiceTest`, `OrgDomainsIT` (ask → probe → issued → main address, which mail links use, and can't be suspended or removed; the admin list and re-check), and an `OrgIsolationIT` row.
  - Web: the certificate steps and Make main address on Domains, and the platform admin Domains page with its nav item and BFF.
- **Next:** A5 (yours: the edge change), then A6 (the extension on a custom domain).
