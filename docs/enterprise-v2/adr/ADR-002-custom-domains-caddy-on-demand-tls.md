# ADR-002 — Custom domains: Caddy on-demand TLS at the shared edge; Cloudflare for SaaS reserved

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §2
- **Reversibility:** see Consequences

## Context
Port 80/443 belong to beecompete-edge-caddy outside this repo; Cloudflare DNS is grey-cloud (DNS only); certificates are issued per hostname on first request; nothing supports wildcard or on-demand TLS today (01 §3).

## Decision
- Custom domains (careers.acme.com) and Kiwiply subdomains (acme.kiwiply.com) are both served by Caddy on-demand TLS at the shared edge: global `on_demand_tls { ask http://dossier-api:8080/api/internal/tenant-hosts/check }` plus a catch-all `https://` site block with `tls { on_demand }` reverse-proxying to dossier-web:3000. This edge change is applied by the user (escalation E5); CI never touches the edge.
- The ask endpoint lives on the internal network only (/api/internal/**, X-Internal-Token) and answers 200 solely for hostnames whose org_hostname row is VERIFIED+ACTIVE (or a *.kiwiply.com subdomain of an ACTIVE org with subdomain enabled). Anything else is 404, so no stranger can make the edge request certificates.
- DNS: a wildcard A record *.kiwiply.com (grey-cloud) to the box; customers CNAME their host to edge.kiwiply.com (grey-cloud, or an A record). Instructions tell customers not to proxy (orange-cloud) the record because HTTP-01 must reach the box.
- No DNS-01/wildcard certificate: per-host certificates avoid the Cloudflare DNS plugin and API token. Let's Encrypt limits (50 new certs per registered domain per week) are monitored; subdomain provisioning is throttled by setting enterprise.domains.subdomains_per_day.
- Cloudflare for SaaS (custom hostnames) is the documented scale-up path; it requires orange-clouding the zone, which reverses a locked DNS decision and is therefore its own future escalation. CloudFront is rejected (moves the edge to AWS).

## Consequences
Until the edge change is applied, Phase 2/3 can be developed and tested against localhost hosts (acme.localhost) and the mock, but no public tenant host exists. HSTS includeSubDomains/preload must not be enabled until every subdomain has a certificate path.

## Security note
The ask endpoint is the certificate gate; it is covered by an IT that proves unknown, pending, suspended and removed hostnames answer 404.
