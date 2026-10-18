package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.PublicTenantDTO;
import com.dossier.api.service.ent.PublicTenantService;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.filter.TenantRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What a visitor of a host is allowed to see before signing in (X1.3, ADR-003): the organization's name, published
 * branding and sign-in options. No authentication. The tenant is the one {@code TenantResolverFilter} derived from the
 * forwarded host; the request itself can not name one. A host that is not served, a request with no forwarded host, and a
 * request while enterprise is off are all the same generic 404 and set no cookie; a platform host answers
 * {@code {kind:"PLATFORM"}} and nothing else. Rate-limited per host and visitor.
 */
@RestController
@Tag(name = "tenant", description = "Public tenant branding for the host a visitor arrived on.")
public class PublicTenantResource {

    static final Duration MAX_AGE = Duration.ofSeconds(60);

    private final PublicTenantService service;
    private final TenantRateLimiter limiter;

    public PublicTenantResource(PublicTenantService service, TenantRateLimiter limiter) {
        this.service = service;
        this.limiter = limiter;
    }

    @Operation(
        summary = "Public view of the tenant for the forwarded host",
        description = "No authentication. The tenant is derived from X-Kiwiply-Host (set by the web BFF), never from a parameter. "
            + "TENANT: {kind, displayName, branding, login}; PLATFORM: {kind:\"PLATFORM\"}; an unserved host, a missing header or enterprise being off: 404. "
            + "Cache-Control: public, max-age=60, Vary: X-Kiwiply-Host. 429 over the per-host-and-IP rate limit."
    )
    @GetMapping("/api/public/tenant")
    public ResponseEntity<PublicTenantDTO> tenant(HttpServletRequest request) {
        Object attr = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE);
        TenantContext context = attr instanceof TenantContext c ? c : null;
        long retry = limiter.hit(request, context == null ? null : context.host());
        if (retry > 0) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retry)).build();
        }
        if (context == null || context.isPlatform()) {
            if (context != null) return ok(PublicTenantDTO.platform());
            throw new OrgNotFoundException(); // no resolution ran: enterprise is off or this is not a tenant-aware request
        }
        PublicTenantDTO dto = service.forContext(context).orElseThrow(OrgNotFoundException::new); // UNKNOWN, and a tenant that vanished
        return ok(dto);
    }

    private static ResponseEntity<PublicTenantDTO> ok(PublicTenantDTO body) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(MAX_AGE).cachePublic()).varyBy("X-Kiwiply-Host").body(body);
    }
}
