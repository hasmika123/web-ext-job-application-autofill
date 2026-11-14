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

## A4b: certificates, the main address, the admin's list (next PR)
- Certificate tracking (doc 10 §5.4):
  - the ask endpoint records `last_ask_at` and moves `cert_state` NONE → REQUESTED;
  - `HostnameProbeJob` probes HTTPS, giving ISSUED or FAILED with a hint;
  - the card shows the timeline DNS verified → Certificate → Live.
- The proxy (orange cloud) and CAA diagnostics (doc 10 §4.2).
- Making a live, certified domain the main address (`PUT …/{id}/primary`), redirects to it, and mail links built on it (doc 10 §6).
- Platform admin `/admin/domains`: every hostname across organizations, re-check, suspend or resume (doc 10 §7).
- Domain-failing notifications to `domains.manage` members.

## Then
- **A5 (yours):** apply the edge snippet and runbook in doc 10 §5.3 and §8 on the shared box.
- **A6:** the extension trusts a custom domain (connect, Prepare batch).
- **D8:** the branded extension build and publishing.

## Status
- **A4a built (2026-11-12).**
  - API: `OrgDomainService`, `HostnameVerifier`, `DnsjavaLookup` / `OfflineDnsLookup`, `HostnameCheckJob`, `OrgDomainResource`, and the settings.
  - Tests: `HostnameVerifierTest`, `OrgDomainsIT` (add → records → verify → live, resolved and certificate allowed → suspend → resume → remove → add again; refusals and the wall; the job's grace-period suspension), eight `OrgIsolationIT` rows, and the menu, settings and PII pins.
  - Web: `DomainsPage`, `lib/ent/domains.ts`, the BFF, and the menu item, with tests.
- **Next: A4b.**
