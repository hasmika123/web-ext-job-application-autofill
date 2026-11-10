package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.PolicyDTOs;
import com.dossier.api.service.ent.OrgPolicyService;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.filter.TenantRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The policy pages a visitor of a tenant host may read before signing in (docs/enterprise-v2/62): the organization's PUBLISHED
 * text, else the neutral template. Same wall as {@link PublicTenantResource}: the organization is the one the forwarded host
 * resolved to, never a parameter; an unserved host, a platform host, a missing header, enterprise being off and a kind that is not
 * configured are all the same generic 404. No draft, state or reviewer comment ever appears here. Rate-limited per host and visitor.
 */
@RestController
@Tag(name = "tenant", description = "Public tenant policy pages for the host a visitor arrived on.")
public class PublicTenantPolicyResource {

    static final Duration MAX_AGE = Duration.ofSeconds(60);

    private final OrgPolicyService service;
    private final TenantRateLimiter limiter;

    public PublicTenantPolicyResource(OrgPolicyService service, TenantRateLimiter limiter) {
        this.service = service;
        this.limiter = limiter;
    }

    @Operation(summary = "The policy kinds this host offers (key, title, page path)")
    @GetMapping("/api/public/tenant/policies")
    public ResponseEntity<List<PolicyDTOs.KindLink>> kinds(HttpServletRequest request) {
        ResponseEntity<List<PolicyDTOs.KindLink>> limited = limited(request);
        if (limited != null) return limited;
        return ok(service.publicKinds(context(request)).orElseThrow(OrgNotFoundException::new));
    }

    @Operation(
        summary = "One policy of the host's organization",
        description = "No authentication. {kind} is PRIVACY, TERMS, ACCEPTABLE_USE, SUPPORT_CONTACT (or a configured kind; privacy / acceptable-use / support also work). "
            + "source=PUBLISHED is the approved text, source=TEMPLATE the neutral text shown until one is published. Cache-Control: public, max-age=60, Vary: X-Kiwiply-Host."
    )
    @GetMapping("/api/public/tenant/policies/{kind}")
    public ResponseEntity<PolicyDTOs.PublicPolicy> policy(HttpServletRequest request, @PathVariable String kind) {
        ResponseEntity<PolicyDTOs.PublicPolicy> limited = limited(request);
        if (limited != null) return limited;
        return ok(service.publicPolicy(context(request), kind).orElseThrow(OrgNotFoundException::new));
    }

    private static TenantContext context(HttpServletRequest request) {
        Object attr = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE);
        return attr instanceof TenantContext c ? c : null;
    }

    private <T> ResponseEntity<T> limited(HttpServletRequest request) {
        TenantContext context = context(request);
        long retry = limiter.hit(request, context == null ? null : context.host());
        if (retry > 0) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retry)).build();
        return null;
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(MAX_AGE).cachePublic()).varyBy("X-Kiwiply-Host").body(body);
    }
}
