package com.dossier.api.web.rest.ent;

import com.dossier.api.service.ent.TenantResolver;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The certificate gate for the shared edge (X1.3, ADR-002): Caddy's on-demand TLS {@code ask} URL. 200 only for a hostname
 * that would resolve to a tenant right now (an ACTIVE hostname row of an ACTIVE / PAST_DUE organization the flags allow, or an
 * enabled {@code {label}.kiwiply.com}); 404 for everything else, so a stranger can never make the edge request a
 * certificate. Service-to-service only: the {@code /api/internal/**} chain admits the shared {@code X-Internal-Token}
 * and nothing else (401 without it), the edge never exposes the path, and it is left out of the published OpenAPI contract.
 * It uses the same cached resolver as every request, so it answers in microseconds from cache.
 */
@Hidden
@RestController
@RequestMapping("/api/internal")
public class InternalTenantHostResource {

    private final TenantResolver resolver;
    private final com.dossier.api.service.ent.domains.HostnameCertService certs;

    public InternalTenantHostResource(TenantResolver resolver, com.dossier.api.service.ent.domains.HostnameCertService certs) {
        this.resolver = resolver;
        this.certs = certs;
    }

    /** A 200 is also recorded on the hostname (CUSTOM-DOMAINS-BUILD.md A4b): a custom domain's certificate is then REQUESTED until the probe sees it live. */
    @GetMapping("/tenant-hosts/check")
    public ResponseEntity<Void> check(@RequestParam(value = "domain", required = false) String domain) {
        if (!resolver.certificateAllowed(domain)) return ResponseEntity.notFound().build();
        try {
            certs.recordAsk(domain, java.time.Instant.now());
        } catch (RuntimeException ignored) {
            // the answer comes from the resolver; recording the ask must never change it
        }
        return ResponseEntity.ok().build();
    }
}
